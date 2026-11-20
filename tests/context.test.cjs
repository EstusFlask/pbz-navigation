'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {Planner}=require(root+'/PBZRouteJobs'),R=require(root+'/PBZRouteCore'),O=require(root+'/PBZRouteObstacles');
const request=start=>({key:'roof-currency',world:'test',level:'test',p:{x:1000,y:0,z:600},start,revision:'0/0'});
test('landing upstairs replaces an in-flight ground-floor plan for the same target',()=>{
 let now=0,closed=0,result;
 const planner=new Planner(()=>{},()=>now);
 planner.request(request({x:0,y:0,z:0}),function*(){try{while(true)yield;}finally{closed++;}},()=>{});
 planner.pump();
 assert.equal(planner.request(request({x:20,y:0,z:0}),function*(){return null;},()=>{}),false,'small movement should not restart every frame');
 assert.equal(planner.request(request({x:20,y:0,z:600}),function*(){return 'roof';},value=>result=value),true,'old ground-floor job was retained');
 assert.equal(closed,1);now=20;planner.pump();assert.equal(result,'roof');
});
test('a failed plan does not suppress another floor or a newly unlocked traversal',()=>{
 const planner=new Planner(()=>{},()=>0);planner.failed=request({x:0,y:0,z:0});
 assert.equal(planner.blocked(request({x:0,y:0,z:160})),false,'a 160 cm mantle was treated as unchanged context');
 planner.request(request({x:0,y:0,z:0}),function*(){while(true)yield;},()=>{},true);
 const opened={...request({x:0,y:0,z:0}),revision:'1/0'};
 assert.equal(planner.request(opened,function*(){return 'unlocked';},()=>{}),true);
});

test('a same-height landing or changed capsule releases a failed origin context',()=>{
 const planner=new Planner(()=>{},()=>0),before={...request({x:0,y:0,z:0}),originRevision:'0/90,35'};
 planner.failed=before;
 assert.equal(planner.blocked({...before,originRevision:'1/90,35'}),false,'landing at the same height remained suppressed');
 assert.equal(planner.blocked({...before,originRevision:'0/45,30'}),false,'crouch/climb dimensions remained suppressed');
 assert.equal(planner.blocked({...before,start:{x:10,y:0,z:5}}),true,'ordinary foot jitter should retain the failure cache');
});
test('moving audit failures replace one temporary marker while persistent locks stay intact',()=>{
 const leg={obstacles:[{id:'door',p:{x:800,y:0,z:0},icon:'locked'}]};
 for(let i=0;i<15;i++)O.obstacle(leg,{id:'route:-1:'+i,edge:-1,p:{x:100+i*20,y:0,z:i*15},unknown:true,transient:true});
 assert.equal(leg.obstacles.filter(x=>x.transient).length,1);assert.ok(leg.obstacles.some(x=>x.id==='door'));
});
test('display keeps only the next unknown X without deleting route constraints',()=>{
 const points=[{x:0,y:0,z:0},{x:1000,y:0,z:0}],unknown=Array.from({length:8},(_,i)=>({id:'route:'+i,p:{x:100+i*100,y:0,z:0},unknown:true}));
 const leg={world:'test',points,gates:[],checks:[],obstacles:[...unknown,{id:'door',p:{x:900,y:0,z:0},unknown:false}]};
 R.markLocks({legs:[leg]},[],{x:350,y:0,z:0});
 assert.equal(leg.locks.filter(x=>x.unknown).length,1);
 assert.equal(leg.locks.find(x=>x.unknown).p.x,400);
 assert.ok(leg.locks.some(x=>x.id==='door'));assert.equal(leg.obstacles.length,9);
});

test('equivalent failed candidates do not repeatedly rebuild the same diagnostic ribbon',()=>{
 const B=require(root+'/PBZRouteBlocked');let publishes=0;
 const start={x:0,y:0,z:0},safe={x:500,y:0,z:0},goal={x:3000,y:0,z:500};
 const context={onDiagnostic:()=>publishes++};
 for(let i=0;i<15;i++){
  const source={world:'test',points:[start,safe,{...goal,x:goal.x+i}],moves:[],walks:[],checks:[],gates:[]};
  B.offer(context,B.fromFailure(source,{prefix:[start,safe],p:safe,segment:1,why:'wall'},goal),start,goal);
 }
 assert.equal(publishes,1,'unchanged safe prefixes repeatedly reset all collision/mesh caches');
});

test('moving audit refresh retains only unexpired verified ribbon and clips a newly found wall',()=>{
 let now=0,blocked=false;const leg={world:'test',provider:'recast',physicalVerified:true,points:[{x:0,y:0,z:0},{x:4000,y:0,z:0}],checks:[],moves:[],walks:[]};
 const world={floorAt:p=>p,step:(a,b)=>blocked&&a.x<1000&&b.x>=1000?{hit:{x:1000,y:0,z:0},why:'new crate'}:{p:b}};
 const auditor=new O.Auditor();auditor.begin(leg,world,{x:0,y:0,z:0},now);auditor.pump(()=>now,500,100);
 assert.equal(auditor.safe.x,4000);
 now=1000;auditor.begin(leg,world,{x:200,y:0,z:0},now,true);auditor.pump(()=>now,1,100);
 assert.equal(auditor.visibleEnd(now).x,4000,'a refresh collapsed the still-verified ribbon to the player');
 assert.ok(auditor.visibleEnd(1801).x<4000,'expired geometry remained visible while revalidation waited');
 now=2000;auditor.pump(()=>now,500,100);assert.equal(auditor.safe.x,4000);
 now=2500;blocked=true;auditor.begin(leg,world,{x:400,y:0,z:0},now,true);auditor.pump(()=>now,500,100);
 assert.ok(auditor.result?.mark);assert.ok(auditor.visibleEnd(now).x<1000,'old verification exposed the rope beyond the newly detected obstacle');
});

test('Recast blocked prefixes resume after an obstacle clears without requiring player movement',()=>{
 const B=require(root+'/PBZRouteBlocked');let broken=false,checks=0;
 const a={x:400,y:0,z:0},b={x:430,y:0,z:0},leg={points:[{x:0,y:0,z:0},a],verifiedEndIndex:1,obstacles:[{id:'route:blocked',p:{x:420,y:0,z:20},probe:{a,b}}]};
 const world={step(){checks++;return broken?{p:b}:{hit:{x:420,y:0,z:20}};},Attack(){assert.fail('navigation attacked the obstacle');}};
 const foot={x:350,y:0,z:0};assert.equal(B.retryRecast(leg,world,foot,1000),false);
 assert.equal(B.retryRecast(leg,world,foot,1200),false);assert.equal(checks,1,'the unchanged collider was polled at render frequency');
 broken=true;assert.equal(B.retryRecast(leg,world,foot,2000),true);
 broken=false;assert.equal(B.retryRecast(leg,world,{x:650,y:300,z:0},3000),true,'walking past the old failure did not refresh the route origin');
});

test('walking-search budgets exclude the time spent waiting between game frames',()=>{
 const Local=require(root+'/PBZRouteLocalWalk');let now=0,result,metrics;
 const planner=new Planner(()=>{},()=>now),start={x:0,y:0,z:0},goal={x:2240,y:0,z:0};
 const world={floorAt:p=>({...p,z:0}),step:(a,b)=>{now+=.01;return {p:{...b,z:0}};}};
 planner.request(request(start),clock=>Local.search(world,start,goal,{clock:clock||(()=>now),maxMs:10}),
  (value,selected,stats)=>{result=value;metrics=stats;});
 for(let frame=0;frame<100&&planner.pending;frame++){planner.pump();now+=20;}
 assert.ok(result,'a few milliseconds of walking checks expired while the generator waited for frames');
 assert.ok(result.points.at(-1).x===2240);assert.ok(metrics.cpu<10);assert.ok(metrics.wall>10);
});

test('execution-time search budgets retain the overall wall-time timeout',()=>{
 let now=0,result,metrics;const planner=new Planner(()=>{},()=>now);
 planner.request(request({x:0,y:0,z:0}),function*(clock){while(true){assert.equal(clock(),0);yield;}},
  (value,selected,stats)=>{result=value;metrics=stats;});
 for(let frame=0;frame<40&&planner.pending;frame++){planner.pump();now+=1000;}
 assert.equal(planner.pending,false);assert.equal(result,null);assert.equal(metrics.timeout,true);
});


test('long ground proofs do not repeatedly scan a previously checked walking record',()=>{
 const F=require(root+'/PBZRouteFeasibility');
 const count=1000,points=Array.from({length:count+1},(_,i)=>({x:i*5,y:0,z:0}));
 let reads=0;
 const walks=points.slice(1).map((b,i)=>({a:points[i],b,get from(){reads++;return i;},to:i+1,edge:i}));
 const leg={world:'test',provider:'recast',points,walks,checks:[],moves:[]};
 const world={floorAt:p=>p,step:(a,b)=>({p:b})};
 const job=F.check(world,leg,points[0]);let row;
 do{row=job.next();}while(!row.done);
 assert.ok(row.value.ok);
 assert.deepEqual(row.value.leg.walks.map(w=>w.edge),walks.map(w=>w.edge));
 assert.ok(reads<count*4,`walking metadata was read ${reads} times for ${count} segments`);
 reads=0;
 const auditor=new O.Auditor();auditor.begin(leg,world,points[0],0);
 auditor.pump(()=>0,5000,100);
 assert.equal(auditor.result?.complete,true);
 assert.deepEqual(auditor.safe,points.at(-1));
 assert.ok(reads<count*5,`ribbon walked through ${reads} metadata records`);
});


test('indexed route spans keep first-match order, point checks and live state',()=>{
 const rows=[{from:10,to:16,edge:4},{from:2,to:14,edge:3},{from:9,to:12,edge:5},
  {from:16,edge:6},{from:18,to:22,edge:7}, {from:2,to:30,edge:8},
  {from:4,to:4,edge:9},{from:8,to:15,edge:10},{from:23,to:26,edge:11}];
 for(const implicitEnd of [false,true]){
  const job=R.segmentLookup(rows,30,implicitEnd,9);let row;
  do{row=job.next();}while(!row.done);
  const lookup=row.value;
  for(let i=9;i<30;i++)assert.equal(lookup(i),rows.find(r=>r.from<=i&&(implicitEnd?(r.to??r.from+1):r.to)>=i+1));
  rows[0].block={unknown:false};
  assert.equal(lookup(10).block,rows[0].block);
 }
});
