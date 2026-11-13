'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const G=require(root+'/PBZRouteGuides'),R=require(root+'/PBZRouteCore'),O=require(root+'/PBZRouteObstacles'),L=require(root+'/PBZRouteLocks');
const courses=require(root+'/PBZRouteGuideData').data.courses,p=a=>({x:a[0],y:a[1],z:a[2]});
function run(job){let row,count=0;do{row=job.next();assert.ok(++count<100000);}while(!row.done);return row.value;}
const dest=c=>({key:'bell:'+c.targetBell,bell:c.targetBell,world:c.world,p:p(c.target),item:true});
const world=()=>({floorAt:()=>null,step:(a,b)=>({p:b}),hit:()=>null});
function plan(c,start=p(c.points[0]),w=world()){return run(G.plan(w,c.world,dest(c),start));}
function audit(leg,w,feet=leg.points[0]){const a=new O.Auditor();a.begin(leg,w,feet,100);return {a,result:run(a.job)};}

test('fixed guide data retain continuous measured corners, heights and directed actions',()=>{
 for(const c of courses){
  assert.ok(c.points.length>800);for(let i=1;i<c.points.length;i++)assert.ok(R.dist(p(c.points[i-1]),p(c.points[i]))<56,'unreviewed straight shortcut');
  for(const a of c.actions){assert.ok(a.start<a.end&&a.end<c.points.length);if(a.kind==='fall')assert.ok(c.points[a.end][2]<c.points[a.start][2]);}
 }
 assert.deepEqual(courses[0].actions.slice(-3).map(m=>m.kind),['ascent','ascent','hook']);
});

test('fixed guides join midway on the current floor without replaying completed climbs',()=>{
 const c=courses[0],after=c.actions.filter(m=>m.kind==='ascent').at(-1).end+2;
 const trip=plan(c,p(c.points[after]));assert.ok(trip);assert.deepEqual(trip.legs[0].moves.map(m=>m.kind),['hook']);
 assert.ok(R.dist(trip.legs[0].points[0],p(c.points[after]))<1);
 assert.ok(trip.legs[0].points.every(q=>q.z> -2800),'joining upstairs backtracked into the lower cave');
});

test('fixed guides reject another floor and reverse destinations but allow checked item spurs',()=>{
 const c=courses[0],start=p(c.points[0]);assert.equal(plan(c,{...start,z:start.z+1000}),null);
 assert.equal(run(G.plan(world(),c.world,{...dest(c),bell:c.sourceBell,p:start},start)),null);
 const item={...dest(c),bell:undefined,key:'item:near-bell'};
 const trip=run(G.plan(world(),c.world,item,start));assert.ok(trip);
 assert.equal(trip.legs[0].guide.egress,'item');
 assert.ok(R.dist(trip.legs[0].points.at(-1),item.p)<1);
 assert.equal(run(G.plan({...world(),step:()=>({why:'terminal wall'})},c.world,item,start)),null);
});

test('joining a fixed course from elsewhere cannot cut through a wall or skip floor checks',()=>{
 const c=courses[1],start=p(c.points[0]);start.x-=500;
 let probes=0;const w={floorAt:()=>null,hit:()=>null,step:()=>{probes++;return {hit:start,why:'wall'};}};
 assert.equal(plan(c,start,w),null);assert.ok(probes>0);
});

test('reference guide auditing keeps measured uphill geometry but stops at a current body obstruction',()=>{
 const c=courses[1],leg=plan(c).legs[0],wall=R.lerp(leg.points[27],leg.points[28],.5);
 const w={floorAt(){throw Error('reference course must not re-use the failed floor query');},step(){throw Error('unexpected grid recheck');},
  hit:(a,b)=>R.nearestOnLine(wall,[a,b]).d<1?{point:wall,normal:{x:1,y:0,z:0}}:null};
 const {a,result}=audit(leg,w);assert.equal(result.mark.unknown,false);assert.match(result.mark.reason,/guide clearance/);
 assert.ok(R.dist(a.safe,wall)<60);assert.ok(R.dist(a.safe,leg.points[0])>100);
});

test('a newly locked door still stops a fixed guide after a previous audit',()=>{
 const c=courses[1],leg=plan(c).legs[0],w=world();audit(leg,w);
 const lock={id:'door',p:R.lerp(leg.points[27],leg.points[28],.5),world:c.world,label:'需钥匙 · 营地钥匙',source:'map-lock',locked:true};
 const result=audit(leg,L.constrain(w,[lock],c.world)).result;
 assert.equal(result.mark.locked,true);assert.match(result.mark.label,/营地钥匙/);
});

test('fixed cave actions honor a nearby resident hook requirement and release it only when ready',()=>{
 const leg=plan(courses[0]).legs[0],hook=leg.moves.at(-1),guid='resident-hook';
 const feature={kind:'hook',guid,path:[hook.p,hook.end].map(q=>[q.x,q.y,q.z])};
 const block={unknown:false,locked:true,label:'需影之武装',source:'live-mechanism'};
 const g={actors:[],observedPassages:new Map([[guid,feature]]),passageStates:new Map([[guid,{ready:false,block}]])};
 G.refreshActions(leg,g);assert.equal(hook.block,block);assert.equal(hook.stateGuid,guid);
 const feet=leg.points[hook.from],result=audit(leg,world(),feet).result;assert.equal(result.mark.locked,true);
 g.passageStates.set(guid,{ready:true});G.refreshActions(leg,g);assert.equal(hook.block,undefined);
});

test('the guide ribbon matches action indices against the raw course, not the smoothed ribbon',()=>{
 const leg=plan(courses[0]).legs[0],climb=leg.moves.find(m=>m.kind==='ascent'),feet=R.lerp(leg.points[climb.from+2],leg.points[climb.from+3],.5);
 const near={i:0,d:90,p:{...feet,x:feet.x+90}};
 assert.ok(G.attachment(leg,{step:()=>({why:'climbing has no walking floor'}),hit:()=>null},feet,near));
 assert.equal(G.attachment(leg,{blockAt:()=>({locked:true})},feet,near),null);
});

test('the unmeasured end of the cave course gets a checked short approach, never a blind target chord',()=>{
 const c=courses[0],start=p(c.points.at(-1));
 const trip=plan(c,start),leg=trip.legs[0];assert.equal(leg.endpointPending,false);assert.equal(leg.partial,false);
 assert.ok(R.xy(leg.points.at(-1),p(c.target))<120);
 const pending=plan(c,start,{...world(),step:()=>({why:'terminal wall'})}).legs[0];
 assert.equal(pending.endpointPending,true);assert.ok(R.xy(pending.points.at(-1),p(c.target))>170);
});
