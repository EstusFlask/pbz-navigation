'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const root=process.env.PBZ_TEST_SOURCE||path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
function planner(world,options={}){
    const level=options.level||'test';
    const p={...(options.start||{x:0,y:0,z:0})},goal={x:100,y:0,z:600};
    const partial={IsValid:()=>true,IsPartial:()=>options.complete?false:true,PathPoints:{Num:()=>2,Get:i=>i?p:goal}};
    // The engine's incomplete path stops directly below the upstairs item.
    partial.PathPoints.Num=()=>options.detour?4:2;
    partial.PathPoints.Get=i=>{
        const ps=options.detour?[p,{x:0,y:700,z:0},{x:goal.x,y:700,z:goal.z},goal]:[p,{...goal,z:options.complete?goal.z:0}];
        const q=ps[i];return {X:q.x,Y:q.y,Z:q.z};
    };
    const UE={ESlateVisibility:{HitTestInvisible:0,Collapsed:1},ESplineCoordinateSpace:{World:0},
        NavigationSystemV1:{FindPathToLocationSynchronously:()=>partial},BellManager:{StaticClass:()=> 'bell'},MapSubsystem:{StaticClass:()=> 'map'},
        GameplayStatics:{GetCurrentLevelName:()=> level},PBZBlueprintFunctionLibrary:{GetPBZNarrativeComp:()=>null}};
    const W={finite:q=>q&&Number.isFinite(q.z),alive:o=>!!o,vec:q=>q,norm:s=>String(s),
        plain:q=>({x:q.X,y:q.Y,z:q.Z})};
    const empty=function*(){return null;};
    const map=options.map||{GetMapIDByLocation:()=> 'test',GetCurrentMapID:()=> 'test',LockObjectInfos:{GetRef:()=>null}};
    Object.assign(UE,options.UE);
    if(options.ship)UE.ShipNavigationSystem={StaticClass:()=> 'ship'};
    const mocks={ue:UE,puerts:{},'Library/TsHelper':{default:{getWorldSubsystem:(p,t)=>t==='map'?map:t==='ship'?options.ship:{}}},'Library/MapAreaGroups':{},
        './PBZRouteTables':{data:{worlds:[level],bells:Object.fromEntries((options.bells||[]).map(b=>[b.id.toLowerCase(),b])),areas:options.areas||{}}},
        './PBZRouteRecast':options.recast||{RecastCache:class{covers(){return false;}}},
        './PBZRouteWorld':W,'./PBZRoutePassages':options.passages||{refreshLadders(){},resetLadders(){},isLookout:()=>false,liveRouteJob:empty},
        './PBZRouteDrops':{installJob:empty},'./PBZRouteObstacles':{...require(root+'/PBZRouteObstacles'),installSeamsJob:empty},
        './PBZRouteSurface':{...require(root+'/PBZRouteSurface'),anchorsJob:function*(g,q,goal){return [{id:goal?1:0,q:{...q},r:0,dz:0}];}},
        './PBZPrivateRibbon':{},'./PBZRouteInk':{},'./PBZRouteItems':{},'./PBZRouteMinimap':{},'./PBZRouteScout':{}};
    if(options.localWalk)mocks['./PBZRouteLocalWalk']=options.localWalk;
    if(options.repair)mocks['./PBZRouteRepair']=options.repair;
    if(options.roadbook)mocks['./PBZRouteRoadbook']=options.roadbook;
    if(options.guides)mocks['./PBZRouteGuides']=options.guides;
    if(options.bells){const array=xs=>({Num:()=>xs.length,Get:i=>xs[i]});const bellService={ActivateBellIDs:array(options.activeBellIDs||options.bells.map(b=>b.id)),DisableTeleportBellIDs:array([])};
        mocks['Library/TsHelper'].default.getWorldSubsystem=(p,t)=>t==='map'?map:t==='ship'?options.ship:bellService;}
    if(options.surface)mocks['./PBZRouteSurface']=options.surface;
    const module={exports:{}};
    const local=id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id));
    const source=fs.readFileSync(root+'/PBZQuestRoute.js','utf8')+'\nexports.test={S,graphs,makePlan,nativeWalk,observe,planning,routeRequest,guardRoute,auditor,locks,setTrip,solve,noRoute,reset,clearManual,trackerChanged,selectItem,pollStatus(){if(typeof updateRouteStatus==="function")updateRouteStatus(true);},atlas,queueGuardRetry(at){guardRetry=at;},arm(dest){scout={snapshot:null};oldWorld=S.level;threads={hide(){},clear(){}};S.manual=dest;const r=routeRequest(dest);previous={key:dest.key,p:dest.p,site:{...r.start},level:S.level,revision:r.revision,originRevision:r.originRevision};}};';
    vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{console:options.quiet?{log(){}}:console,
        Date:options.now?class extends Date{static now(){return options.now();}}:Date})(local,module,module.exports);
    const api=module.exports.test,g=options.graph||{name:'test',sameComponent:()=>false,actors:[],observedPassages:new Map(),routeJob:function*(){return null;}};
    api.graphs.set(level,g);Object.assign(api.S,{level,pawn:{},world:{...world,feet:()=>({...p})}});
    return {api,goal,pose:p,dest:{key:'upstairs',item:true,p:goal,world:level}};
}
function run(job){let row,steps=0;do{row=job.next();assert.ok(++steps<100000,'search did not yield a bounded result');}while(!row.done);return row.value;}

test('a covered Recast request bypasses old guides and keeps live physics checks',()=>{
 const world={floorAt:p=>p,step:(a,b)=>({p:b})},recast={RecastCache:class{constructor(){this.revision=1;}covers(){return true;}*route(world,a,b){yield;return {world,provider:'recast',points:[a,b],checks:[],gates:[],moves:[],walks:[],meters:10,partial:false};}}};
 const h=planner(world,{recast,guides:{plan(){throw Error('old guide consulted for a covered Recast request');}}});
 h.goal.z=0;const trip=run(h.api.makePlan(h.dest));assert.equal(trip.legs[0].provider,'recast');assert.equal(trip.legs[0].physicalVerified,true);
 world.step=()=>({why:'closed wall',hit:{x:50,y:0,z:0}});
 const blocked=planner(world,{recast,guides:{plan(){throw Error('old guide consulted');}}});blocked.goal.z=0;
 const rejected=run(blocked.api.makePlan(blocked.dest));assert.ok(!rejected||rejected.legs[0].diagnostic||rejected.legs[0].partial);
});

test('a failed regional bootstrap remains visible in the route status after a null result',()=>{
 const recast={RecastCache:class{constructor(){this.revision=1;this.error='initialize: CompileError: Wasm code generation disallowed by embedder';this.ready=false;}covers(){return true;}*route(){return null;}}};
 let now=1000;const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,recast,now:()=>now});h.goal.z=0;
 h.api.arm(h.dest);h.api.solve(h.dest,'selection');h.api.planning.pump();h.api.pollStatus();
 assert.match(h.api.S.routeStatus,/导航暂不可用/);now+=1000;h.api.pollStatus();assert.match(h.api.S.routeStatus,/导航暂不可用/);
});

test('the reported near currency delivers a checked loaded route before optional bell estimates',()=>{
 const field=require('./fixtures/currency-180-20261115.json');let optional=0;
 const data=require(root+'/PBZRouteTables').data,bells=[data.bells.bell_nles_005,data.bells.bell_nles_018];
 const graph={name:field.world,sameComponent:()=>false,actors:[],observedPassages:new Map(),
  routeJob:function*(){optional++;while(true)yield;}};
 const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,level:field.world,start:field.origins[0].start,bells,graph,complete:true});
 Object.assign(h.goal,field.currency.location?{x:field.currency.location[0],y:field.currency.location[1],z:field.currency.location[2]}:field.query.goal);
 Object.assign(h.dest,{provider:'187',key:field.currency.key});
 const task=h.api.makePlan(h.dest,false,false,false,{clock:()=>0});let result;
 for(let i=0;i<1000;i++){const row=task.next();if(row.done){result=row.value;break;}}
 task.return?.();
 assert.ok(result&&!result.transfer&&!result.legs[0].partial,'an available near-currency walk waited behind optional bell graph searches: '+optional);
 assert.equal(optional,0);assert.ok(result.legs[0].points.length>=2);
});

test('a loaded floor-changing connector to the near currency is not starved by bell recommendations',()=>{
 const field=require('./fixtures/currency-180-20261115.json');let optional=0,actions=0;
 const data=require(root+'/PBZRouteTables').data,bells=[data.bells.bell_nles_005,data.bells.bell_nles_018];
 const graph={name:field.world,sameComponent:()=>true,actors:[],observedPassages:new Map(),routeJob:function*(){optional++;while(true)yield;}};
 const passages={isLookout:()=>false,refreshLadders(){},resetLadders(){},liveRouteJob:function*(g,w,start,goal){
  actions++;return {legs:[{world:field.world,points:[start,goal],walks:[],checks:[],gates:[],
   moves:[{kind:'ladder',guid:'loaded-connector-control',from:0,to:1,p:start,end:goal,edge:-1}],meters:60}],transfer:null};
 }};
 const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,level:field.world,start:field.origins[0].start,bells,graph,passages});
 Object.assign(h.goal,{x:field.currency.location[0],y:field.currency.location[1],z:field.currency.location[2]});
 Object.assign(h.dest,{provider:'187',key:field.currency.key});
 const task=h.api.makePlan(h.dest,false,false,false,{clock:()=>0});let result;
 for(let i=0;i<1000;i++){const row=task.next();if(row.done){result=row.value;break;}}task.return?.();
 assert.ok(result&&!result.transfer&&!result.legs[0].partial,'a usable loaded connector waited behind optional bell searches: '+optional);
 assert.equal(optional,0);assert.equal(actions,1);
});

test('a same-target search keeps a still-valid complete route while publishing a speculative action prefix',()=>{
 let offered=false;
 const passages={isLookout:()=>false,refreshLadders(){},resetLadders(){},liveRouteJob:function*(g,w,a,b,native,options){
  const points=[a,{x:200,y:0,z:600}];
  options.onPartial?.({legs:[{world:'test',provider:'scene',points,partial:true,moves:[{kind:'ascent',from:0,to:1}],walks:[],checks:[],gates:[],meters:7}],transfer:null});
  offered=true;while(true)yield;
 }};
 const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,passages,localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,{x:1000,y:0,z:600});h.api.arm(h.dest);
 const leg={world:'test',provider:'scene',physicalVerified:true,points:[{...h.pose},{...h.goal}],partial:false,moves:[],walks:[],checks:[],gates:[],obstacles:[],meters:12};
 const good={legs:[leg],transfer:null};h.api.setTrip(good,h.dest,h.pose,'checked');h.api.solve(h.dest,'player context changed');
 for(let n=0;n<300&&!offered;n++)h.api.planning.job.iterator.next();
 assert.ok(offered,'replay never published the provisional action chain');
 assert.equal(h.api.S.trip,good,'a provisional search result replaced still-valid complete guidance');
 h.api.planning.clear('test cleanup');
});

test('a rejected direct chord is not flashed as 3D guidance while the action search is pending',()=>{
 const passages={isLookout:()=>false,refreshLadders(){},resetLadders(){},liveRouteJob:function*(){while(true)yield;}};
 const h=planner({floorAt:p=>p,step:(a,b)=>b.x>=300?{why:'no supporting floor'}:{p:b}},
  {quiet:true,passages,UE:{NavigationSystemV1:{}}});
 Object.assign(h.goal,{x:1000,y:0,z:600});h.api.arm(h.dest);h.api.solve(h.dest,'selection');
 for(let n=0;n<250;n++)h.api.planning.job.iterator.next();
 assert.equal(h.api.S.line.length,0,'a known incomplete straight chord was presented as the direction to the goal');
 h.api.planning.clear('test cleanup');
});

test('native custom traversal retains the target and resumes ground planning only after landing',()=>{
 const movement={MovementMode:5},h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,
  UE:{EMovementMode:{MOVE_Custom:5,MOVE_Walking:1,MOVE_Falling:3}}});
 h.api.S.pawn.CharacterMovement=movement;h.api.arm(h.dest);
 h.api.planning.request(h.api.routeRequest(h.dest),function*(){while(true)yield;},()=>{});
 h.api.observe();
 assert.equal(h.api.planning.pending,false,'ordinary ground planning continued during the native ladder/climb mode');
 assert.equal(h.api.S.manual,h.dest,'traversal discarded the selected destination');
 assert.equal(h.api.S.travelPhase?.kind,'traversal');
 movement.MovementMode=3;h.pose.z=150;h.api.observe();
 assert.equal(h.api.planning.pending,false,'ground planning resumed before the traversal had landed');
 movement.MovementMode=1;h.pose.z=0;h.api.observe();h.api.observe();
 assert.ok(h.api.planning.pending,'ground planning did not resume from the actual landing');
 assert.equal(h.api.S.manual,h.dest);h.api.planning.clear('test cleanup');
});

test('keeping complete guidance still rejects new walls, lost floor joins and partial routes',()=>{
 const B=require(root+'/PBZRouteBlocked'),p=(x,y=0,z=0)=>({x,y,z}),leg={physicalVerified:true,points:[p(0),p(1000)],obstacles:[]};
 const world={step:(a,b)=>({p:b})};assert.equal(B.keepComplete(leg,world,p(0),null),true);
 assert.equal(B.keepComplete(leg,world,p(0),{obstacles:[{p:p(500),unknown:false}]}),false,'a new collision on the retained corridor was ignored');
 assert.equal(B.keepComplete(leg,{step:()=>({why:'locked passage'})},p(0,30),null),false,'an invalidated floor/lock join was reused');
 assert.equal(B.keepComplete({...leg,partial:true},world,p(0),null),false,'an incomplete route was treated as the complete fallback');
 assert.equal(B.keepComplete(leg,world,p(0,0,600),null),false,'another floor inherited old guidance');
});

test('a goal-backed pending corridor survives a longer unrelated action prefix',()=>{
 const B=require(root+'/PBZRouteBlocked'),start={x:0,y:0,z:0},goal={x:10000,y:0,z:0},context={};
 const make=(points,extra={})=>({world:'test',provider:'scene',points,diagnostic:true,partial:true,verifiedEndIndex:points.length-1,moves:[],obstacles:[],...extra});
 const bridge=make([start,{x:1000,y:0,z:0}],{goalTopology:{provider:'native'}});
 B.offer(context,bridge,start,goal);
 B.offer(context,make([start,{x:-2000,y:500,z:0}],{moves:[{kind:'ladder',from:0,to:1}]}),start,goal);
 assert.equal(context.best.legs[0],bridge,'an arbitrary reached ladder displaced the corridor with a checked goal-topology suffix');
});

test('makePlan returns the goal-backed safe corridor when other action results remain partial',()=>{
 let horizon;const passages={isLookout:()=>false,refreshLadders(){},resetLadders(){},liveRouteJob:function*(g,w,a,b,native,options){
  horizon={legs:[{world:'test',provider:'scene',points:[a,{x:800,y:300,z:0}],moves:[],walks:[],checks:[],gates:[],obstacles:[],
   physicalVerified:true,partial:true,diagnostic:true,verifiedEndIndex:1,goalTopology:{provider:'native'},meters:9}],transfer:null};
  options.onHorizon?.(horizon);
  return {legs:[{world:'test',provider:'scene',points:[a,{x:-1000,y:0,z:600}],moves:[],walks:[],checks:[],gates:[],obstacles:[],partial:true,meters:12}],transfer:null};
 }};
 const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,passages,localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,{x:16000,y:0,z:600});
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.ok(trip?.legs[0].goalTopology,'the final partial-result fallback discarded the bridge corridor');
 assert.equal(trip,horizon);assert.ok(trip.legs[0].partial,'a pending corridor became a complete route');
});

test('a proved complete action chain reaches the caller before optional scene walking optimization',()=>{
 const field=require('./fixtures/tower-chain-completion-20261114.json'),good=field.features.find(f=>f.guid===field.goodAscent);
 let wall=0,expensiveSearches=0,result,metrics;
 const world={floorAt:p=>p,step:(a,b)=>({p:b})};
 const passages={isLookout:()=>false,refreshLadders(){},resetLadders(){},liveRouteJob:function*(g,w,start,goal){
  const points=[start,good.entry,good.exit,goal];
  return {legs:[{world:'test',points,walks:[{a:start,b:good.entry,from:0,to:1,edge:-1},{a:good.exit,b:goal,from:2,to:3,edge:-1}],
   moves:[{kind:'ascent',guid:field.goodAscent,from:1,to:2,p:good.entry,end:good.exit}],checks:[],gates:[],meters:229}],transfer:null};
 }};
 const h=planner(world,{quiet:true,start:field.start,now:()=>wall,passages,localWalk:{search:function*(w,a,b,options){
  if(options.maxNodes<=192&&options.maxMs<=200)return null;
  expensiveSearches++;const until=options.clock()+2000;while(options.clock()<until){wall+=.25;yield;}return null;
 }}});
 Object.assign(h.goal,field.goal);
 const scheduler=new (require(root+'/PBZRouteJobs').Planner)(()=>{},()=>wall);
 scheduler.request({key:h.dest.key,world:'test',level:'test',start:field.start,p:h.goal,revision:0,originRevision:0},
  clock=>h.api.makePlan(h.dest,true,false,false,{clock}), (trip,request,stats)=>{result=trip;metrics=stats;});
 for(let frame=0;scheduler.pending&&frame<3000;frame++){scheduler.pump();wall+=16;}
 assert.ok(result&&!result.legs[0].partial&&!metrics?.timeout);
 assert.equal(expensiveSearches,0,'makePlan held an audited complete action chain while a pure-walking optimization ran');
 assert.ok(metrics.wall<5000);
 assert.deepEqual(result.legs[0].moves.map(m=>m.guid),[field.goodAscent]);
});

test('a nearby staircase reaches the bell before an unrelated climb consumes the wall deadline',()=>{
 // Captured final-stair query; the physical floor below is an analytic
 // staircase, not a reconstruction of the game's collision mesh.
 const field=require('./fixtures/tower-last-stairs-20261113.json'),start=field.start,goal=field.landing;
 const runLength=Math.hypot(goal.x-start.x,goal.y-start.y),dx=(goal.x-start.x)/runLength,dy=(goal.y-start.y)/runLength;
 const floor=p=>{const t=(p.x-start.x)*dx+(p.y-start.y)*dy,side=Math.abs(-(p.x-start.x)*dy+(p.y-start.y)*dx);
  return side<=95&&t>=-30&&t<=runLength+30?{...p,z:start.z+Math.min(1,Math.max(0,t/runLength))*(goal.z-start.z)}:null;};
 let wall=0,actionStarted=false,result,metrics;
 const world={floorAt:floor,step:(a,b)=>{wall+=.025;const p=floor(b);return p&&Math.abs(p.z-a.z)<=50+Math.hypot(p.x-a.x,p.y-a.y)?{p}:{why:'outside stairs'};}};
 const native={IsValid:()=>true,IsPartial:()=>true,PathPoints:{Num:()=>2,Get:i=>{
  const p=field.nativePoints[i];return {X:p.x,Y:p.y,Z:p.z};}}};
 const passages={isLookout:()=>false,refreshLadders(){},resetLadders(){},liveRouteJob:function*(g,w,a,b,native,settings){
  actionStarted=true;const until=settings.clock()+12000;while(settings.clock()<until){wall+=.1;yield;}return null;}};
 const h=planner(world,{quiet:true,start,now:()=>wall,UE:{NavigationSystemV1:{FindPathToLocationSynchronously:()=>native}},passages});
 Object.assign(h.goal,goal);
 const scheduler=new (require(root+'/PBZRouteJobs').Planner)(()=>{},()=>wall);
 scheduler.request({key:h.dest.key,world:'test',level:'test',start,p:goal,revision:0,originRevision:0},
  clock=>h.api.makePlan(h.dest,true,false,false,{clock}), (trip,request,stats)=>{result=trip;metrics=stats;});
 for(let frame=0;scheduler.pending&&frame<3000;frame++){scheduler.pump();wall+=16;}
 assert.ok(result&&!result.legs[0].partial,'a walkable last staircase is starved behind an unrelated ascent until no route is returned');
 assert.equal(actionStarted,false,'the checked ordinary staircase should finish before the costly action-chain search');
 assert.ok(!metrics?.timeout);
 assert.equal(result.legs[0].moves.length,0);
 assert.ok(Math.abs(result.legs[0].points.at(-1).z-goal.z)<1);
});

test('the recorded lower-floor native partial endpoint is not presented as upstairs guidance',()=>{
 const field=require('./fixtures/tower-doorway-20261113.json'),reports=[];
 const native={IsValid:()=>true,IsPartial:()=>true,PathPoints:{Num:()=>field.nativePoints.length,
  Get:i=>{const p=field.nativePoints[i];return {X:p.x,Y:p.y,Z:p.z};}}};
 const world={floorAt:p=>({...p}),step:(a,b)=>({p:{...b,z:a.z}})};
 const h=planner(world,{quiet:true,start:field.start,UE:{NavigationSystemV1:{FindPathToLocationSynchronously:()=>native}},
  repair:{repair:function*(){return null;}},localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,field.target);
 const trip=run(h.api.makePlan(h.dest,true,false,false,{clock:()=>0,onDiagnostic:r=>reports.push(r)}));
 assert.equal(reports.some(r=>r.legs.some(l=>l.provider==='native')),false,'a partial path ending below the tower is still published as primary guidance');
 assert.equal(trip,null,'without a checked upstairs continuation the lower-floor endpoint is not a usable route');
 assert.equal(h.goal.z,field.target.z);
});

test('native diagnostics preserve the original partial endpoint before a goal is appended',()=>{
 const reports=[],world={floorAt:p=>({...p}),step:(a,b)=>Math.abs(a.z-b.z)<100?{p:b}:{hit:b,why:'other floor'}};
 const h=planner(world,{quiet:true,repair:{repair:function*(){return null;}},localWalk:{search:function*(){return null;}}});
 run(h.api.makePlan(h.dest,true,false,false,{clock:()=>0,report:(phase,data)=>reports.push({phase,...data})}));
 const raw=reports.find(r=>r.phase==='native candidate');
 assert.ok(raw,'the original native query state is missing from the field diagnostic');
 assert.equal(raw.provider,'native');assert.equal(raw.partial,true);
 assert.equal(raw.pointCount,2);assert.equal(raw.last.z,0);
 assert.equal(raw.goal.z,600);assert.equal(raw.points.at(-1).p.z,0,'diagnostics recorded a synthetic goal as an engine path point');
 const query=reports.find(r=>r.phase==='native query');assert.ok(query,'native API result was lost before candidate filtering');
 assert.equal(query.status,'partial');assert.equal(query.last.z,0);
});

test('native diagnostic point lists are bounded while retaining the original endpoint',()=>{
 const reports=[],native={IsValid:()=>true,IsPartial:()=>true,PathPoints:{Num:()=>100,Get:i=>({X:i,Y:0,Z:0})}};
 const world={floorAt:p=>({...p}),step:(a,b)=>Math.abs(a.z-b.z)<100?{p:b}:{hit:b,why:'other floor'}};
 const h=planner(world,{quiet:true,UE:{NavigationSystemV1:{FindPathToLocationSynchronously:()=>native}},
  repair:{repair:function*(){return null;}},localWalk:{search:function*(){return null;}}});
 run(h.api.makePlan(h.dest,true,false,false,{clock:()=>0,report:(phase,data)=>reports.push({phase,...data})}));
 for(const phase of ['native query','native candidate']){
  const r=reports.find(r=>r.phase===phase);assert.ok(r);assert.equal(r.pointCount,100);assert.equal(r.points.length,32);
  assert.equal(r.points[0].i,0);assert.equal(r.points.at(-1).i,99);assert.equal(r.truncated,true);
 }
});

test('a rejected vertical native candidate cannot consume the wall deadline before a ready action',t=>{
 let wall=0,result,metrics;const events=[],point=(x,z=0)=>({x,y:0,z});
 const world={normal:.7,rise:50,slope:1.4,r:45,hit:()=>null,floorAt:p=>({...p}),
  step:(a,b)=>Math.abs(a.z-b.z)>100?{hit:b,why:'climb required'}:{p:b}};
 const passages={isLookout:()=>false,refreshLadders(){},resetLadders(){},
  liveRouteJob:function*(g,w,start,goal){
   events.push({phase:'ready action',wall});
   return {legs:[{world:'test',points:[start,goal],moves:[{kind:'ascent',guid:'resident-climb',from:0,to:1}],walks:[],checks:[],gates:[],meters:6}],transfer:null};
  }};
 const repair={repair:function*(w,leg,failure,origin,options){
  events.push({phase:'slow repair',wall});
  while(options.clock()<options.deadline){wall+=2;yield;}
  return null;
 }};
 const h=planner(world,{quiet:true,now:()=>wall,complete:true,passages,repair});
 const scheduler=new (require(root+'/PBZRouteJobs').Planner)(()=>{},()=>wall);
 scheduler.request({key:h.dest.key,world:'test',level:'test',start:point(0),p:h.goal,revision:0,originRevision:0},
  clock=>h.api.makePlan(h.dest,true,false,false,{clock}), (trip,request,stats)=>{result=trip;metrics=stats;});
 for(let frame=0;scheduler.pending&&frame<3000;frame++){scheduler.pump();wall+=16;}
 t.diagnostic(JSON.stringify({events,metrics}));
 assert.ok(!metrics?.error,'the replay failed for a different reason');
 assert.ok(result?.legs[0].moves.some(m=>m.guid==='resident-climb'),'a resident usable climb was starved behind native detour repair until the 30-second wall timeout');
 assert.ok(!metrics?.timeout,'ready action guidance should finish within the wall deadline');
});

test('an unavailable vertical action still falls back to a checked native walking repair',()=>{
 const events=[],point=(x,y=0,z=0)=>({x,y,z}),F=require(root+'/PBZRouteFeasibility');
 const world={normal:.7,rise:50,slope:1.4,r:45,hit:()=>null,floorAt:p=>({...p}),
  step:(a,b)=>Math.abs(a.z-b.z)>100?{hit:b,why:'climb required'}:{p:b}};
 const passages={isLookout:()=>false,refreshLadders(){},resetLadders(){},
  liveRouteJob:function*(){events.push('action unavailable');return null;}};
 const repair={repair:function*(w,leg,failure,origin){
  events.push('walking repair');
  const points=[origin,point(0,700),...Array.from({length:20},(_,i)=>point((i+1)*5,700,(i+1)*30)),point(100,0,600)];
  const candidate={...leg,points,moves:[],walks:[],checks:[],gates:[],repaired:true,partial:false};
  const verdict=yield* F.check(w,candidate,origin);return {candidate,verdict};
 }};
 const h=planner(world,{quiet:true,complete:true,passages,repair});
 const trip=run(h.api.makePlan(h.dest,true,false,false,{clock:()=>0}));
 assert.ok(trip&&!trip.legs[0].partial&&trip.legs[0].repaired,'deferring failed native repair discarded a valid walking fallback');
 assert.deepEqual(events,['action unavailable','walking repair']);
});

test('the main planner completes a corridor with consecutive rejected rejoin tails',()=>{
 const p=(x,y=0)=>({x,y,z:0}),goal=p(2000),walls=[500,1000,1500];
 const blocked=(a,b)=>walls.find(x=>{
  if(a.x===b.x||(a.x<x&&b.x<x)||(a.x>=x&&b.x>=x))return false;
  const t=(x-a.x)/(b.x-a.x);return Math.abs(a.y+(b.y-a.y)*t)<230;
 });
 const world={normal:.7,rise:45,slope:1,r:35,floorAt:q=>q,hit:()=>null,
  step:(a,b)=>{const x=blocked(a,b);return x===undefined?{p:b}:{hit:p(x,a.y),why:'blocked body clearance'};}};
 const leg=()=>({world:'test',provider:'roadbook',points:[p(0),goal],moves:[],walks:[],checks:[],gates:[],meters:20});
 const h=planner(world,{quiet:true,UE:{NavigationSystemV1:{}},
  roadbook:{plan:function*(){return {legs:[leg()],transfer:null};},prepare(){}},
  localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,goal);h.dest.bell='unopened-corridor';
 const trip=run(h.api.makePlan(h.dest,true,false,false,{clock:()=>0}));
 assert.ok(trip?.legs[0].repaired&&!trip.legs[0].partial,'two top-level repairs left a blocked preview despite a complete bounded bypass');
 assert.ok(trip.legs[0].points.slice(1).every((b,i)=>blocked(trip.legs[0].points[i],b)===undefined));
});

test('tracker native bell selection retains its bell identity instead of using item teleport planning',()=>{
 const goal={x:6400,y:0,z:0},bell={id:'Bell_SZ_004',world:'test',area:'pangzhen',name:'幻鬼酒馆',at:[6400,0,0]};
 const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,bells:[bell],activeBellIDs:[],areas:{pangzhen:{world:'test'}}});
 h.api.arm(h.dest);h.api.trackerChanged({id:'pbz:bell:bell_sz_004',p:goal,area:'pangzhen',provider:'187'},'selected');
 assert.equal(h.api.S.manual.bell,bell.id,'the tracker bell was passed to the planner as an ordinary item');
 assert.equal(h.api.S.manual.key,'item:pangzhen/pbz:bell:bell_sz_004','bridge selection identity must remain stable');
});

test('a blocked long roadbook corridor tries a checked local bypass before abandoning the candidate',()=>{
 const p=(x,y=0)=>({x,y,z:0}),goal=p(30000),world={normal:.7,rise:45,slope:1,r:35,floorAt:p=>p,hit:()=>null,
  step:(a,b)=>((a.x<500&&b.x>=500)||(a.x>=500&&b.x<500))&&Math.abs(b.y)<230?{hit:p(500,b.y),why:'blocked body clearance'}:{p:b}};
 const leg=()=>({world:'test',provider:'roadbook',roadbook:{id:'market-tavern',courses:['market-tavern']},points:[p(0),p(1000),goal],
  moves:[],gates:[],checks:[],walks:[],meters:300});
 const h=planner(world,{quiet:true,UE:{NavigationSystemV1:{}},roadbook:{plan:function*(){return {legs:[leg()],transfer:null};},prepare(){}},
  localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,goal);h.dest.bell='unopened-tavern';
 const trip=run(h.api.makePlan(h.dest,true,false,false,{clock:()=>0}));
 assert.ok(trip?.legs[0].repaired,'a measured roadbook obstruction never entered local repair');
 assert.ok(trip.legs[0].points.some(p=>Math.abs(p.y)>=230),'the repair did not go around the obstruction');
});

test('a known closed gate can be bypassed through a checked side passage',()=>{
 const R=require(root+'/PBZRouteCore'),Repair=require(root+'/PBZRouteRepair'),p=(x,y=0)=>({x,y,z:0});
 const blocked=(a,b)=>((a.x<500&&b.x>=500)||(a.x>=500&&b.x<500))&&Math.abs(b.y)<230;
 const world={normal:.7,rise:45,slope:1,r:35,floorAt:p=>p,hit:()=>null,
  step:(a,b)=>blocked(a,b)?{hit:p(500,b.y),why:'locked passage',locked:true}:{p:b}};
 const source={world:'test',points:[p(0),p(400),p(1000)],walks:[],moves:[],checks:[],gates:[],meters:10};
 const failure={segment:1,fraction:0,prefix:[p(0),p(400)],p:p(500),edge:-1,locked:true};
 const fixed=run(Repair.repair(world,source,failure,p(0),{clock:()=>0}));
 assert.ok(fixed?.verdict.ok,'the lock flag prevented even trying an open side passage');
 assert.ok(fixed.candidate.points.some(p=>Math.abs(p.y)>=230));
 assert.ok(fixed.candidate.points.slice(1).every((b,i)=>!blocked(fixed.candidate.points[i],b)));
});
test('the reported tavern tracker target finds a local side passage at the logged obstruction',t=>{
 const field=require('./fixtures/tavern-blocker-20261113.json'),tables=require(root+'/PBZRouteTables').data;
 const floorZ=field.blockedStep.a.z,wall=field.blockedStep.hit;
 const blocked=(a,b)=>{
  if(!((a.y<wall.y&&b.y>=wall.y)||(a.y>=wall.y&&b.y<wall.y)))return false;
  const t=(wall.y-a.y)/(b.y-a.y);return Math.abs(a.x+(b.x-a.x)*t-wall.x)<230;
 };
 const floor=p=>({...p,z:floorZ}),world={normal:.7,rise:45,slope:1,r:35,floorAt:floor,hit:()=>null,
  step:(a,b)=>blocked(a,b)?{hit:wall,why:'closed gate',locked:true}:{p:floor(b)}};
 const h=planner(world,{quiet:true,level:field.world,start:field.blockedStep.a,complete:true,
  bells:[tables.bells.bell_sz_003,tables.bells.bell_sz_004,tables.bells.bell_sz_017],activeBellIDs:['Bell_SZ_003','Bell_SZ_017'],
  areas:{pangzhen:{world:field.world}},roadbook:{plan:function*(){return null;}},localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,field.target);h.api.arm(h.dest);
 h.api.trackerChanged({id:field.trackerKey,p:{...field.target},area:field.area,provider:'187'},'selected');
 const reports=[],trip=run(h.api.makePlan(h.api.S.manual,true,false,false,{clock:()=>0,report:(phase,data)=>reports.push({phase,...data})}));
 assert.equal(h.api.S.manual.bell,field.bellId);assert.equal(!!trip?.transfer,false);
 if(!trip?.legs[0].repaired||trip.legs[0].partial)t.diagnostic(JSON.stringify({leg:trip?.legs[0]&&{provider:trip.legs[0].provider,repaired:trip.legs[0].repaired,partial:trip.legs[0].partial,last:trip.legs[0].points.at(-1)},reports}));
 assert.ok(trip?.legs[0].repaired&&!trip.legs[0].partial,'the field target never replaced its blocked corridor with the local side passage');
 assert.ok(trip.legs[0].points.slice(1).every((b,i)=>!blocked(trip.legs[0].points[i],b)));
 assert.ok(reports.some(r=>r.phase==='local detour search'));
 assert.ok(reports.some(r=>r.phase==='local detour result'&&r.found));
});
test('local repair never crosses a closed wall with no side passage or grants an unlock',()=>{
 const Repair=require(root+'/PBZRouteRepair'),p=(x,y=0)=>({x,y,z:0});
 const world={normal:.7,rise:45,slope:1,r:35,floorAt:p=>p,hit:()=>null,
  step:(a,b)=>a.x<500&&b.x>=500?{hit:p(500,b.y),locked:true,why:'closed wall'}:{p:b}};
 const source={world:'test',points:[p(0),p(400),p(1000)],moves:[],walks:[],checks:[],gates:[]};
 const failure={segment:1,prefix:[p(0),p(400)],locked:true};
 const result=run(Repair.repair(world,source,failure,p(0),{clock:()=>0}));
 assert.ok(!result||!result.verdict.ok,'a closed wall became an accepted connector');
 assert.equal(failure.locked,true);
});
test('an exhausted repair deadline does not start a local search',()=>{
 const Repair=require(root+'/PBZRouteRepair');let probes=0;const p=x=>({x,y:0,z:0});
 const world={floorAt:p=>{probes++;return p;},step:(a,b)=>{probes++;return {p:b};}};
 const source={points:[p(0),p(400),p(1000)],moves:[]},failure={segment:1,prefix:[p(0),p(400)],locked:true};
 assert.equal(run(Repair.repair(world,source,failure,p(0),{clock:()=>0,deadline:0})),null);assert.equal(probes,0);
});
test('bell identity resolution requires an explicit tracker bell key and matching 3D position',()=>{
 const B=require(root+'/PBZRouteBellIdentity'),tables=require(root+'/PBZRouteTables').data,f=require('./fixtures/tavern-blocker-20261113.json');
 const item={id:f.trackerKey,provider:'187',p:f.target};assert.equal(B.fromItem(item,tables.bells)?.id,f.bellId);
 assert.equal(B.fromItem({...item,id:'ordinary-item',name:'幻鬼酒馆'},tables.bells),null);
 assert.equal(B.fromItem({...item,p:{...f.target,z:f.target.z+1000}},tables.bells),null);
 assert.equal(B.fromItem({...item,id:'pbz:bell:unknown'},tables.bells),null);
});
test('an activated tracker bell retains the previous item-transfer comparison through solve',()=>{
 const bells=[{id:'Bell_From',world:'test',area:'pangzhen',at:[200,0,0]},
  {id:'Bell_Target',world:'test',area:'pangzhen',at:[18000,0,500]}];
 const graph={name:'test',bells:new Map(),actors:[],observedPassages:new Map(),sameComponent:()=>true,h:()=>0,node:p=>p.x<1000?0:1,
  routeJob:function*(a,b){return b.x<1000?{world:'test',points:[a,b],meters:Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)/100,walks:[],moves:[],checks:[],gates:[]}:null;}};
 const h=planner({floorAt:p=>p.x<1000?p:null,step:(a,b)=>b.x<1000?{p:b}:{why:'unloaded'}},
  {quiet:true,bells,graph,areas:{pangzhen:{world:'test'}},localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,{x:18000,y:0,z:500});h.api.arm(h.dest);
 let now=1000;h.api.planning.clock=()=>now;
 h.api.trackerChanged({id:'pbz:bell:bell_target',p:{...h.goal},area:'pangzhen',provider:'187'},'selected');
 for(let n=0;n<500&&h.api.planning.pending;n++){now+=20;h.api.planning.pump();}
 assert.equal(h.api.S.manual.bell,'Bell_Target');
 assert.equal(h.api.S.trip?.transfer?.to.id,'Bell_Target','recognizing a bell changed the already-activated transfer behavior');
});

test('sailing retains the selected target and resumes planning after disembarking',()=>{
 let aboard=true;
 const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,ship:{IsInNavigation:()=>aboard}});
 h.api.arm(h.dest);h.api.observe();assert.equal(h.api.S.manual,h.dest);assert.equal(h.api.S.travelPhase?.kind,'boat');
 assert.equal(h.api.planning.pending,false);assert.equal(h.api.S.line.length,0);assert.match(h.api.S.routeStatus,/乘船中/);
 aboard=false;h.api.observe();assert.equal(h.api.S.travelPhase,null);assert.equal(h.api.S.manual,h.dest);
 assert.ok(h.api.planning.pending,'leaving the boat did not restart the original destination');
});

for(const ready of [false,true])test('an inactive bell roadbook '+(ready?'checks its loaded action and ground':'keeps an unknown action pending'),()=>{
 const RB=require(root+'/PBZRouteRoadbook'),p=(x,z=0)=>({x,y:0,z});
 const courses=[{id:'overland',name:'overland',world:'test',sourceBell:'from',targetBell:'locked',target:p(2000,600),
  points:[p(0),p(500),p(700,600),p(2000,600)],actions:[{kind:'ascent',guid:'wall',start:1,end:2,requiresLive:true}]}];
 const floor=q=>q.x<=500?{...q,z:0}:q.x>=700?{...q,z:600}:null;
 const world={normal:.7,hit:()=>null,floorAt:floor,step:(a,b)=>{const q=floor(b);return q&&Math.abs(q.z-a.z)<50?{p:q}:{why:'wall jump required'};}};
 const passages={refreshLadders(){},isLookout:()=>false,liveRouteJob:function*(){return null;},refreshLoadedJob:function*(){},
  checkJob:function*(){return true;},referenceState:()=>ready?{ready:true,path:[p(500),p(700,600)]}:{ready:false,block:{unknown:true,label:'pending'}}};
 const h=planner(world,{quiet:true,passages,roadbook:{...RB,plan:function*(...args){return yield* RB.plan(...args.slice(0,4),{...args[4],courses});}},
  bells:[{id:'locked',world:'test',at:[2000,0,600]}],activeBellIDs:[],localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,p(2000,600));h.dest.bell='locked';
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 if(ready){assert.equal(trip?.legs[0].roadbook?.id,'overland');assert.equal(trip.legs[0].guide,undefined);assert.equal(trip.legs[0].physicalVerified,true);}
 else assert.ok(!trip||trip.legs.some(l=>l.partial||l.diagnostic),'unread action became a complete route');
});

test('a pending framed route shows loading before its first candidate and clears on completion',()=>{
 let now=10000;
 const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,now:()=>now});
 h.api.arm(h.dest);h.api.planning.clock=()=>now;
 h.api.graphs.get('test').routeJob=function*(){for(let i=0;i<5000;i++)yield;return null;};
 h.api.solve(h.dest,'selection');h.api.pollStatus();
 assert.match(h.api.S.routeStatus||'',/正在计算路线/,'the selected target looks idle while the first route is pending');
 for(let frame=0;frame<5;frame++){now+=250;h.api.planning.pump();h.api.pollStatus();}
 assert.ok(h.api.planning.pending);assert.equal(h.api.S.trip,null);
 assert.match(h.api.S.routeStatus,/1\s*秒/,'the waiting message does not show elapsed time');
 for(let frame=0;frame<1000&&h.api.planning.pending;frame++){now+=20;h.api.planning.pump();h.api.pollStatus();}
 assert.equal(h.api.planning.pending,false);assert.equal(h.api.S.routeStatus,'','loading survived the completed/failed search');
});

test('cancel and world reset remove loading immediately and changing target restarts its timer',()=>{
 let now=10000;const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,now:()=>now});
 h.api.arm(h.dest);h.api.planning.clock=()=>now;h.api.solve(h.dest,'selection');
 now+=8000;h.api.pollStatus();assert.match(h.api.S.routeStatus||'',/8\s*秒/);
 const next={...h.dest,key:'next-item',p:{...h.goal,x:3000}};h.api.S.manual=next;h.api.solve(next,'selection');h.api.pollStatus();
 assert.match(h.api.S.routeStatus,/正在计算路线/);assert.doesNotMatch(h.api.S.routeStatus,/8\s*秒/);
 h.api.clearManual('test');assert.equal(h.api.S.routeStatus,'');assert.equal(h.api.planning.pending,false);
 h.api.arm(next);h.api.solve(next,'selection');h.api.reset();assert.equal(h.api.S.routeStatus,'');
});

test('streamed atlas preparation shows loading between planner jobs and settles on failure',()=>{
 let now=10000;const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,now:()=>now});
 h.api.arm(h.dest);h.api.graphs.clear();h.api.planning.clock=()=>now;
 h.api.solve(h.dest,'selection');h.api.planning.pump();h.api.pollStatus();
 assert.equal(h.api.planning.pending,false);assert.ok(h.api.atlas.pending.has('test'));
 assert.match(h.api.S.routeStatus||'',/正在加载地图路网/,'atlas streaming is mistaken for a failed route');
 h.api.atlas.pending.clear();h.api.atlas.failed.set('test',{next:now+60000,message:'missing atlas'});h.api.pollStatus();
 assert.equal(h.api.S.routeStatus,'');
});

test('the bridge bell can immediately use the fixed cave course despite missing navmesh floor',()=>{
 const course=require(root+'/PBZRouteGuideData').data.courses[0],start=Object.fromEntries(['x','y','z'].map((k,i)=>[k,course.points[0][i]]));
 let queries=0;const h=planner({floorAt:()=>null,step:()=>({why:'query floor missing'}),hit:()=>null},
  {quiet:true,level:course.world,start,graph:{name:course.world,routeJob:function*(){queries++;return null;},sameComponent:()=>false,actors:[],observedPassages:new Map()}});
 Object.assign(h.goal,Object.fromEntries(['x','y','z'].map((k,i)=>[k,course.target[i]])));h.dest.bell=course.targetBell;
 const trip=run(h.api.makePlan(h.dest,true,false,false,{clock:()=>0}));
 assert.equal(trip?.legs[0].guide?.id,course.id,'known broken bell route still enters the failed ground search');
 assert.equal(queries,0);assert.notEqual(trip.legs[0].physicalVerified,true);
 assert.deepEqual(Array.from(trip.legs[0].moves.slice(-3),m=>m.kind),['ascent','ascent','hook']);
 assert.ok(trip.legs[0].points.some(p=>p.z< -3500),'the fixed route skipped the lower cave');
 assert.equal(trip.legs[0].endpointPending,true,'unmeasured last three metres were silently joined to the bell');
});

test('the main planner reaches a cave-side item through the bell spine and a checked last spur',()=>{
 const course=require(root+'/PBZRouteGuideData').data.courses[0],point=a=>({x:a[0],y:a[1],z:a[2]});
 const start=point(course.points[0]),last=point(course.points.at(-1));let probes=0,atlas=0;
 const h=planner({floorAt:()=>null,hit:()=>null,step:(a,b)=>{probes++;return {p:b};}},
  {quiet:true,level:course.world,start,graph:{name:course.world,actors:[],observedPassages:new Map(),sameComponent:()=>false,
   routeJob:function*(){atlas++;return null;}}});
 Object.assign(h.goal,{...last,y:last.y+100});
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.ok(trip?.legs[0].guide,'the item bypassed the authored bell spine');
 assert.equal(trip.legs[0].guide.egress,'item');assert.equal(atlas,0);assert.ok(probes>0);
 assert.deepEqual(Array.from(trip.legs[0].moves.slice(-3),m=>m.kind),['ascent','ascent','hook']);
 assert.ok(require(root+'/PBZRouteCore').dist(trip.legs[0].points.at(-1),h.goal)<1);
 assert.equal(trip.legs[0].partial,false);assert.notEqual(trip.legs[0].physicalVerified,true);
});

test('the tomb fixed course keeps the uphill detour and guard does not run the rejected floor audit',()=>{
 const course=require(root+'/PBZRouteGuideData').data.courses[1],start=Object.fromEntries(['x','y','z'].map((k,i)=>[k,course.points[0][i]]));
 const h=planner({floorAt:()=>null,step:()=>({why:'query floor missing'}),hit:()=>null},{quiet:true,level:course.world,start});
 Object.assign(h.goal,Object.fromEntries(['x','y','z'].map((k,i)=>[k,course.target[i]])));h.dest.bell=course.targetBell;h.api.arm(h.dest);
 const trip=run(h.api.makePlan(h.dest,true,false,false,{clock:()=>0}));
 assert.ok(trip?.legs[0].guide,'no initial tomb route was supplied');
 assert.ok(trip.legs[0].points.some(p=>p.x>6500&&p.x<8500&&p.y<66500&&p.z>6800),'the route cut underneath the real uphill detour');
 h.api.setTrip(trip,h.dest,start,'guide');
 const clockStart=Date.now()+100;
 for(let i=0;i<40;i++){const now=clockStart+i*40;h.api.guardRoute(now);h.api.auditor.pump(()=>now,1000,1000);}
 assert.ok(h.api.S.threadEnd&&require(root+'/PBZRouteCore').dist(h.api.S.threadEnd,start)>200,'missing floor still hides the fixed route');
 assert.equal(h.api.S.trip.legs[0].obstacles?.length||0,0);
});

test('a finished checked route cancels a detour retry queued by the previous blocked candidate',()=>{
 const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true});
 Object.assign(h.goal,{x:1100,y:0,z:0});h.api.arm(h.dest);
 h.api.queueGuardRetry(Date.now()-10);
 const leg={world:'test',provider:'scene',physicalVerified:true,points:[{...h.pose},{...h.goal}],checks:[],gates:[],moves:[],walks:[],meters:11};
 h.api.setTrip({legs:[leg],transfer:null},h.dest,h.pose,'finished');
 h.api.guardRoute(Date.now());
 assert.equal(h.api.planning.stats.requests,0,'the previous candidate immediately restarted the newly completed route');
});

test('small same-level movement preserves a pending frontier instead of recalculating it',()=>{
 let now=10000;const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true,now:()=>now});
 Object.assign(h.goal,{x:4000,y:0,z:0});h.api.arm(h.dest);
 const leg={world:'test',diagnostic:true,partial:true,physicalVerified:true,verifiedEndIndex:1,
  points:[{...h.pose},{x:900,y:0,z:0}],checks:[],gates:[],moves:[],walks:[],meters:9};
 h.api.setTrip({legs:[leg],transfer:null},h.dest,{...h.pose},'pending');h.api.observe();
 h.pose.x=160;now+=4000;h.api.observe();
 assert.equal(h.api.planning.stats.requests,0,'160 cm of same-floor movement restarted the frontier search');
});

test('an ordinary hop on connected ground retains the unfinished search',()=>{
 const h=planner({floorAt:p=>p.z===0?p:null,step:(a,b)=>({p:b})},{quiet:true});h.api.arm(h.dest);
 let closed=0;h.api.planning.request(h.api.routeRequest(h.dest),function*(){try{while(true)yield;}finally{closed++;}},()=>{});
 h.api.planning.pump();h.api.observe();h.pose.z=120;h.api.observe();h.pose.x=120;h.pose.z=0;h.api.observe();h.api.observe();
 assert.equal(closed,0,'an ordinary hop cancelled the ongoing route search');
 h.api.planning.clear('test cleanup');
});

test('a same-height landing beyond an unwalkable gap invalidates the old origin',()=>{
 const h=planner({floorAt:p=>p.z===0?p:null,step:()=>({why:'gap'})},{quiet:true});h.api.arm(h.dest);
 let closed=0;h.api.planning.request(h.api.routeRequest(h.dest),function*(){try{while(true)yield;}finally{closed++;}},()=>{});
 h.api.planning.pump();h.api.observe();h.pose.z=120;h.api.observe();h.pose.x=250;h.pose.z=0;h.api.observe();h.api.observe();
 assert.equal(closed,1,'crossing a gap at the same height retained an unreachable origin');
 h.api.planning.clear('test cleanup');
});

test('walking up a connected slope does not repeatedly cancel an unfinished search',()=>{
 const slope=p=>({...p,z:p.x*.6});
 const h=planner({floorAt:slope,step:(a,b)=>({p:slope(b)})},{quiet:true});
 h.goal.x=3000;h.goal.z=1800;h.api.arm(h.dest);
 let finished=false,closed=0;
 h.api.planning.request(h.api.routeRequest(h.dest),function*(){
  try{for(let i=0;i<240;i++)yield;finished=true;return null;}finally{closed++;}
 },()=>{});
 for(let i=1;i<=6;i++){
  h.pose.x=i*140;h.pose.z=h.pose.x*.6;
  h.api.observe();
 }
 assert.equal(h.api.planning.stats.requests,1,'75 cm of ordinary uphill walking restarted the planner');
 run(h.api.planning.job.iterator);
 assert.equal(finished,true);assert.equal(closed,1);
});

test('a wall at the first portal rejects that portal rather than the final edge of the corridor',()=>{
 const R=require(root+'/PBZRouteCore'),F=require(root+'/PBZRouteFeasibility');
 const columns={p:[0,0,0,200,0,0,400,0,0,600,0,0],v:[100,-80,0,100,80,0,300,-80,0,300,80,0,500,-80,0,500,80,0],
  e:[0,1,0,0,1,0,1,2,0,2,3,0,2,3,0,4,5,0],arc:[0,~0,1,~1,2,~2],lab:[0,0,0,0],cells:[],strong:[0,0,0,0],dag:[],
  off:[0,1,3,5,6],weight:[200,200,200],sizes:[4],order:[0,1,2,3],metric:Array(16).fill(0)};
 const g=new R.Graph({world:'test',n:4,actors:[]},null,columns);
 const leg=g.route(g.pt(0),g.pt(3),{startNode:0,endNode:3});
 const verdict=run(F.check({floorAt:p=>p,step:(a,b)=>a.x<100&&b.x>=100?{hit:b,why:'first portal wall'}:{p:b}},leg,g.pt(0)));
 assert.equal(verdict.ok,false);assert.equal(verdict.edge,0,'the wall was attributed to a distant final portal');
 assert.equal(leg.walks.find(w=>w.b.x===300).edge,1);
 assert.equal(leg.walks.find(w=>w.b.x===500).edge,2);
});

test('the main planner retries newly attached actions before starting an unrelated scene grid',()=>{
 const R=require(root+'/PBZRouteCore');let ready=false,grids=0,attempts=0;
 const points=[{x:0,y:0,z:0},{x:100,y:0,z:0},{x:100,y:0,z:600},{x:500,y:0,z:600}];
 const g={name:'test',actors:[],bells:new Map(),liveEdges:[],observedPassages:new Map(),sameComponent:()=>ready,
  routeJob:function*(){attempts++;return {world:'test',points:points.map(p=>({...p})),checks:[],gates:[],
   moves:[{kind:'ascent',guid:'new-cave-climb',edge:4,from:1,to:2,p:points[1],end:points[2]}],
   walks:[{a:points[0],b:points[1],edge:1,from:0,to:1},{a:points[2],b:points[3],edge:3,from:2,to:3}],meters:R.extent(points)/100};}};
 const passages={refreshLadders(){},isLookout:()=>false,liveRouteJob:function*(){ready=true;g.liveEdges.push({});return null;}};
 const floor=p=>p.x>=100&&p.z>300?600:0;
 const h=planner({floorAt:p=>({...p,z:floor(p)}),step:(a,b)=>Math.abs(floor(b)-a.z)<100?{p:{...b,z:floor(b)}}:{hit:b,why:'climb required'}},
  {quiet:true,graph:g,passages,localWalk:{search:function*(w,a,b,settings){
   assert.ok(settings.maxNodes<=192&&settings.maxMs<=200,'the unbounded scene search preceded the new atlas action');grids++;return null;
  }}});
 Object.assign(h.goal,points.at(-1));
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.ok(trip&&!trip.legs[0].partial&&attempts>0);
 assert.equal(grids,1,'only one small walking preflight may precede the new atlas action');
});

test('a long scene search can leave a small bell platform through a narrow supported exit',()=>{
 const L=require(root+'/PBZRouteLocalWalk'),R=require(root+'/PBZRouteCore');
 const floor=p=>p.x>=-90&&p.x<=90&&Math.abs(p.y)<=90?300:
  p.x>=35&&p.x<=105&&p.y< -90&&p.y>=-1500?Math.max(0,300+(p.y+90)*.5):null;
 const world={floorAt:p=>{const z=floor(p);return z===null?null:{...p,z};},step:(a,b)=>{
  const n=Math.max(1,Math.ceil(R.xy(a,b)/15));let last=a;
  for(let i=1;i<=n;i++){const q=R.lerp(a,b,i/n),z=floor(q);if(z===null||Math.abs(z-last.z)>45+R.xy(q,last)*.7)return {why:'outside supported exit'};last={...q,z};}
  return {p:last};
 }};
 const start={x:0,y:0,z:300},goal={x:70,y:-1400,z:0};
 const route=run(L.search(world,start,goal,{spacing:140,clock:()=>0}));
 assert.ok(route&&!route.partial,'the 140 cm grid could not leave the supported bell platform');
 assert.ok(route.points.some(p=>p.x===70));
 for(let i=1;i<route.points.length;i++)assert.ok(world.step(route.points[i-1],route.points[i]).p);
});

test('scene search reports whether the start lacks support or the checked neighbours are exhausted',()=>{
 const L=require(root+'/PBZRouteLocalWalk'),rows=[],start={x:0,y:0,z:0},goal={x:1000,y:0,z:0};
 const report=(phase,detail)=>rows.push({phase,...detail});
 run(L.search({floorAt:()=>null,step:()=>({why:'no floor'})},start,goal,{report,onProgress(){}}));
 assert.equal(rows.at(-1).reason,'start floor missing');
 run(L.search({floorAt:p=>p,step:()=>({why:'blocked body clearance'})},start,goal,{report,onProgress(){}}));
 const end=rows.at(-1);assert.equal(end.reason,'no checked neighbours');assert.equal(end.expanded,1);
 assert.deepEqual(end.rejected,[['blocked body clearance',8]]);
});

test('a pending atlas backtrack cannot replace a closer checked two-climb frontier',()=>{
 let prepared=false;
 const start={x:0,y:0,z:0},mid={x:100,y:0,z:0},up1={x:200,y:0,z:300},up2={x:500,y:0,z:600},end={x:700,y:0,z:600};
 const partial={world:'test',provider:'scene',partial:true,physicalVerified:true,points:[start,mid,up1,up2,end],checks:[],gates:[],
  moves:[{kind:'ascent',guid:'first',p:mid,end:up1,from:1,to:2},{kind:'ascent',guid:'second',p:up1,end:up2,from:2,to:3}],
  walks:[{a:start,b:mid,from:0,to:1,edge:-1},{a:up2,b:end,from:3,to:4,edge:-1}],meters:11};
 const g={name:'test',actors:[],bells:new Map(),observedPassages:new Map(),sameComponent:()=>true,
  routeJob:function*(a,b){if(!prepared)return null;const far={x:0,y:-13000,z:0};return {world:'test',points:[a,far,b],checks:[],gates:[],moves:[],
   walks:[{a,b:far,from:0,to:1,edge:1},{a:far,b,from:1,to:2,edge:2}],meters:270};}};
 const passages={refreshLadders(){},isLookout:()=>false,liveRouteJob:function*(g,w,s,t,n,o){prepared=true;
  const trip={legs:[partial],transfer:null};o.onPartial?.(trip);return trip;}};
 const h=planner({floorAt:p=>p,step:(a,b)=>Math.abs(a.z-b.z)<80?{p:b}:{hit:b,why:'climb required'}},
  {quiet:true,graph:g,passages,localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,{x:2000,y:0,z:900});
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.ok(trip?.legs[0].partial);assert.deepEqual(trip.legs[0].moves.map(m=>m.guid),['first','second'],
  'the unknown long backtrack discarded both checked climbs');
 const B=require(root+'/PBZRouteBlocked'),ctx={};
 const front=B.fromFailure(partial,{prefix:partial.points,prefixLeg:partial,segment:4,p:end,unknown:true},h.goal);
 B.offer(ctx,front,start,h.goal);
 const back=g.routeJob(start,h.goal);prepared=true;const candidate=run(back);candidate.provider='atlas';
 B.offer(ctx,B.fromFailure(candidate,{prefix:[start,{x:0,y:-10000,z:0}],segment:0,unknown:true},h.goal),start,h.goal);
 assert.equal(ctx.best.legs[0].moves.length,2,'the live preview replaced the checked action frontier before the final decision');
});
function staircase(){
    // Three parallel flights, connected by their landings. A direct approach
    // to x=100,y=0 remains on the ground floor.
    const floor=p=>{
        if(p.y>=-70&&p.y<=70&&p.x>=-80&&p.x<=1000)return 0;
        if(p.x>=930&&p.x<=1070&&p.y>=0&&p.y<=600)return p.y/2;
        if(p.y>=530&&p.y<=670&&p.x>=100&&p.x<=1070)return 300+(1000-p.x)/3;
        return null;
    };
    return {floorAt:p=>{const z=floor(p);return z===null?null:{...p,z};},
        step:(a,b)=>{const z=floor(b);return z!==null&&Math.abs(z-a.z)<=100?{p:{...b,z}}:{why:'wall or absent floor'};}};
}

test('the cave atlas candidate is considered before an expensive failed straight-line repair',()=>{
 let candidates=0;
 const start={x:0,y:0,z:0},end={x:5000,y:0,z:600};
 const g={name:'test',actors:[],sameComponent:()=>true,observedPassages:new Map(),
  routeJob:function*(){candidates++;return null;},bells:new Map()};
 const h=planner({floorAt:p=>({...p,z:p.x>4500?600:0}),
  step:(a,b)=>b.x>250&&Math.abs(b.y)<500?{why:'solid wall',hit:b}:{p:{...b,z:0}}},
  {quiet:true,graph:g,localWalk:{search:function*(){for(let i=0;i<500;i++)yield;return null;}}});
 Object.assign(h.goal,end);
 const job=h.api.makePlan(h.dest,false,false,false,{clock:()=>0});
 for(let i=0;i<100&&!candidates;i++)job.next();
 job.return();
 assert.ok(candidates,'movement can restart the planner before it ever considers the authored cave detour');
});

test('a pending cave candidate retains its traversal and wins over a speculative straight tail',()=>{
 const B=require(root+'/PBZRouteBlocked');
 const points=[{x:0,y:0,z:0},{x:0,y:2000,z:0},{x:1000,y:2000,z:600},{x:1000,y:0,z:600}];
 const source={world:'test',provider:'atlas',points,moves:[{from:1,to:2,kind:'hook',edge:8,guid:'cave-hook'}],walks:[]};
 const failure={prefix:[points[0]],segment:0,p:points[0],unknown:true,why:'scene not loaded'};
 const pending=B.fromFailure(source,failure,points.at(-1));
 assert.equal(pending.moves[0]?.guid,'cave-hook','the unfinished cave tail lost its hook metadata');
 assert.notEqual(pending.obstacles[0].icon,'barrier','unloaded traversal was drawn as a physical X');
 const ctx={};B.offer(ctx,pending,points[0],points.at(-1));
 const direct=B.fromFailure({...source,provider:'direct',points:[points[0],points.at(-1)],moves:[]},
  {...failure,prefix:[points[0],{x:250,y:0,z:0}]},points.at(-1));
 B.offer(ctx,direct,points[0],points.at(-1));
 assert.equal(ctx.best.legs[0].provider,'atlas','a short unverified chord replaced the authored cave route');
 const detour=B.fromFailure(source,{...failure,prefix:[points[0],{x:0,y:1000,z:0}],fraction:.5},points.at(-1));
 B.offer(ctx,detour,points[0],points.at(-1));
 assert.equal(ctx.best.legs[0].verifiedEndIndex,1,'moving away from the target along the required cave detour hid verified progress');
});

test('the real cave corridor retains its far pending tail when only the first scene radius is loaded',()=>{
 const audit=require('./audit-bells.cjs'),R=require(root+'/PBZRouteCore'),F=require(root+'/PBZRouteFeasibility');
 const tables=require(root+'/PBZRouteTables').data,g=audit.load();
 const a=audit.point(tables.bells.bell_sxc_01_11),b=audit.point(tables.bells.bell_ljc_xiaozhang_002);
 const S=require(root+'/PBZRouteSurface'),s=S.anchors(g,a)[0],e=S.anchors(g,b,true)[0];
 const route=g.route(s.q,e.q,{startNode:s.id,endNode:e.id});route.provider='atlas';
 const result=run(F.check({floorAt:p=>p,step:(a,b)=>({p:b})},route,s.q,2500));
 assert.ok(result.ok&&result.leg.partial);
 assert.ok(R.dist(result.leg.points.at(-1),e.q)<1,'streaming discarded the authored destination and pending cave corridor');
 assert.ok(result.leg.verifiedEndIndex<result.leg.points.length-1);
 assert.equal(result.leg.moves.length,route.moves.length,'the distant authored movement vanished');
});

test('a long cemetery trip finds the uphill bypass instead of retaining the lower chord',()=>{
 const floor=p=>p.x>=9000?900:p.x>=7200&&p.y>=1200&&p.y<=2200?(p.x-7200)*.5:0;
 const world={floorAt:p=>({...p,z:floor(p)}),step:(a,b)=>{
  const z=floor(b),run=Math.hypot(b.x-a.x,b.y-a.y);
  return Math.abs(z-a.z)<=45+run*.7?{p:{...b,z}}:{hit:b,why:'cliff below upper road'};
 }};
 const h=planner(world,{quiet:true});Object.assign(h.goal,{x:18000,y:0,z:900});
 const result=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0})),leg=result?.legs[0];
 assert.ok(leg&&!leg.partial,'the long trip never searched the supported uphill bypass');
 assert.ok(leg.points.some(p=>p.y>=1200&&p.x>7200&&p.x<9000&&p.z>0),'the required ramp was skipped');
 assert.equal(leg.points.at(-1).z,900);
});

test('repairing a walking wall preserves the ladder before it and hook after it',()=>{
 const F=require(root+'/PBZRouteFeasibility'),Repair=require(root+'/PBZRouteRepair');
 const points=[{x:0,y:0,z:0},{x:0,y:0,z:600},{x:800,y:0,z:600},{x:1800,y:0,z:600},{x:1800,y:0,z:1200},{x:2000,y:0,z:1200}];
 const source={world:'test',points,moves:[{kind:'ladder',edge:2,from:0,to:1},{kind:'hook',edge:4,from:3,to:4}],
  walks:[{from:1,to:2,edge:5},{from:2,to:3,edge:6},{from:4,to:5,edge:7}],checks:[],gates:[]};
 const R=require(root+'/PBZRouteCore');
 const world={floorAt:p=>p,step:(a,b)=>{const n=Math.max(1,Math.ceil(R.xy(a,b)/10));
  for(let i=1;i<=n;i++){const p=R.lerp(a,b,i/n);if(p.x>=1100&&p.x<=1300&&Math.abs(p.y)<100)return {hit:p,why:'rock'};}
  return {p:b};}};
 const failure=run(F.check(world,source,points[0]));assert.equal(failure.ok,false);
 const fixed=run(Repair.repair(world,source,failure,points[0],{clock:()=>0}));
 assert.ok(fixed?.verdict.ok,'the mere presence of authored actions disabled all walking repair');
 assert.deepEqual(fixed.candidate.moves.map(m=>m.kind),['ladder','hook']);
 for(const move of fixed.candidate.moves){assert.equal(fixed.candidate.points[move.to].z-fixed.candidate.points[move.from].z,600);}
});

test('an atlas walking gap can be repaired by a checked climb without discarding later actions',()=>{
 const F=require(root+'/PBZRouteFeasibility'),Repair=require(root+'/PBZRouteRepair');
 const points=[{x:0,y:0,z:0},{x:1400,y:0,z:600},{x:1400,y:0,z:1200},{x:1800,y:0,z:1200}];
 const source={world:'test',points,checks:[],gates:[],walks:[{from:0,to:1,edge:3},{from:2,to:3,edge:5}],
  moves:[{kind:'hook',edge:4,from:1,to:2}]};
 const floor=p=>p.x<600?0:p.x<1400?600:p.z>=1000?1200:600;
 const world={floorAt:p=>({...p,z:floor(p)}),step:(a,b)=>Math.abs(floor(b)-a.z)<80?{p:{...b,z:floor(b)}}:{hit:b,why:'climb required'}};
 const failure=run(F.check(world,source,points[0]));assert.equal(failure.ok,false);
 let calls=0;
 const fixed=run(Repair.repair(world,source,failure,points[0],{clock:()=>0,traverse:function*(a,b){
  calls++;const ps=[a,{x:560,y:0,z:0},{x:630,y:0,z:600},b];
  return {points:ps,moves:[{kind:'ascent',from:1,to:2}],walks:[],checks:[]};
 }}));
 assert.ok(calls,'the repair never tried the nearby interaction');
 assert.ok(fixed?.verdict.ok,'the repaired route did not pass its physical walking and landing checks');
 assert.deepEqual(fixed.candidate.moves.map(m=>m.kind),['ascent','hook']);
});

test('scene search uses a measured short drop at the cemetery start and rejects an obstructed descent',()=>{
 const Local=require(root+'/PBZRouteLocalWalk');
 const floor=p=>({...p,z:p.x<=140?250:0});let obstructed=false;
 const world={r:30,normal:.7,floorAt:floor,hit:(a,b,body)=>body&&obstructed?{point:b}:null,
  step:(a,b)=>Math.abs(floor(b).z-a.z)<80?{p:floor(b)}:{why:'drop required'}};
 const start={x:0,y:0,z:250},goal={x:560,y:0,z:0};
 const route=run(Local.search(world,start,goal,{clock:()=>0,allowDrops:true,maxNodes:150}));
 assert.ok(route,'scene search stayed stranded on the raised starting platform');
 assert.ok(route.moves.some(m=>m.kind==='fall'&&m.drop),'the descent was mislabeled as ordinary walking');
 assert.ok(route.checks.some(c=>c.kind===12&&c.verified));
 obstructed=true;
 assert.equal(run(Local.search(world,start,goal,{clock:()=>0,allowDrops:true,maxNodes:150})),null,'an obstructed descent was accepted');
 assert.equal(run(Local.search(world,goal,start,{clock:()=>0,allowDrops:true,maxNodes:150})),null,'a downward drop invented an upward climb');
});

test('a long search publishes only checked uphill progress while the destination is still pending',()=>{
 const seen=[],h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true});
 Object.assign(h.goal,{x:18000,y:0,z:0});
 const job=h.api.makePlan(h.dest,false,false,false,{clock:()=>0,onDiagnostic:trip=>seen.push(trip)});
 for(let i=0;i<3000&&!seen.length;i++){const row=job.next();if(row.done)break;}
 job.return();
 assert.ok(seen.length,'the raised starting area remains blank until the entire long search finishes');
 const leg=seen.at(-1).legs[0];assert.ok(leg.partial&&leg.diagnostic);
 assert.equal(leg.verifiedEndIndex,leg.points.length-1,'the preview contains an unchecked chord to the far bell');
 assert.ok(leg.points.at(-1).x>500&&leg.points.at(-1).x<18000);
});

test('same-height obstacles try loaded interactions before the expensive local walk',()=>{
 let actions=0;
 const h=planner({floorAt:p=>({...p,z:0}),step:()=>({why:'gap'})},{quiet:true,
  passages:{refreshLadders(){},isLookout:()=>false,liveRouteJob:function*(){actions++;return null;}},
  localWalk:{search:function*(w,a,b,settings){if(!actions)assert.ok(settings.maxNodes<=192&&settings.maxMs<=200,
   'same-height rope/climb was postponed until after the expensive walking search');return null;}}});
 Object.assign(h.goal,{x:1000,y:0,z:0});run(h.api.makePlan(h.dest));
});

test('typed key locks with opaque GUIDs are read and prevent a complete route',()=>{
 const lock={GuidString:'8C71-93A2',bUnLocked:false,ActorLocation:{X:300,Y:0,Z:0},
  NeedItems:{Num:()=>1,Get:()=> 'key_station'},IsA:cls=>cls==='key-lock'};
 const map={GetMapIDByLocation:()=> 'test',GetCurrentMapID:()=> 'test',
  LockObjectInfos:{GetRef:()=>({MapLockGroups:{GetRef:layer=>layer===0?{LockObjArray:{Num:()=>1,Get:()=>lock}}:null}})}};
 const h=planner({floorAt:p=>Math.abs(p.y)<30?{...p,z:0}:null,step:(a,b)=>Math.abs(b.y)<30?{p:{...b,z:0}}:{why:'corridor wall'}},{quiet:true,complete:true,map,areas:{test:{world:'test'}},
  UE:{SwitchLockObject:{StaticClass:()=> 'key-lock'}}});
 Object.assign(h.goal,{x:700,y:0,z:0});
 const rows=h.api.locks();assert.equal(rows.length,1,'name-based filtering discarded a real key lock');
 const result=run(h.api.makePlan(h.dest)),leg=result?.legs[0];
 assert.ok(leg?.partial,'a known key lock was certified as a complete walk');
 assert.ok(leg.locks.some(r=>r.icon==='keylock'),'the actual requirement was replaced by a generic X');
 lock.bUnLocked=true;h.api.locks();
 const opened=run(h.api.makePlan(h.dest));assert.equal(opened.legs[0].partial,false,'unlocking did not release the route');
});

test('the main planner checks an endpoint staircase even when the full trip exceeds local-search range',()=>{
 const R=require(root+'/PBZRouteCore'),Surface=require(root+'/PBZRouteSurface');
 const columns={p:[0,0,0,18000,0,0,18000,500,500],v:[],e:[0,1,1,0,0,0],arc:[0,~0],lab:[0,0,1],
  cells:[0,0,0,1,5,0,1,3],strong:[0,0,1],dag:[],off:[0,1,2,2],weight:[18000],sizes:[2,1],order:[0,1,2],metric:Array(12).fill(0)};
 const g=new R.Graph({world:'test',n:3,actors:[]},null,columns),reports=[];
 const floor=p=>p.x>=17930&&p.x<=18070&&p.y>=0&&p.y<=500?p.y:
  p.y>=430&&p.y<=570?500:p.y>=-70&&p.y<=70?0:null;
 const world={floorAt:p=>{const z=floor(p);return z===null?null:{...p,z};},
  step:(a,b)=>{const z=floor(b);return z!==null&&Math.abs(z-a.z)<=80?{p:{...b,z}}:{why:'wall'};}};
 const h=planner(world,{quiet:true,graph:g,surface:Surface});Object.assign(h.goal,{x:18000,y:500,z:500});
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0,report:(phase,detail)=>reports.push({phase,detail})}));
 assert.ok(g.liveEdges.some(e=>e.from===1&&e.to===2&&e.move.walk),'global distance suppressed the short endpoint repair');
 assert.ok(reports.some(r=>r.phase==='atlas candidate'),'the repaired atlas was never retried');
 assert.ok(trip.legs[0].partial,'the distant scene must retain its streaming frontier');
 const route=g.route(g.pt(0),h.goal,{startNode:0,endNode:2});
 assert.equal(route.points.at(-1).z,500);assert.equal(route.moves.length,0,'the staircase became a scripted traversal');
 assert.equal(g.path(2,0),null,'a checked outbound staircase invented an unchecked reverse edge');
});
test('a three-floor collectible uses the staircase instead of a ground-floor partial path',()=>{
    const h=planner(staircase());
    // Upstairs landing endpoint of the final flight.
    h.goal.x=100;h.goal.y=600;h.goal.z=600;
    const result=run(h.api.makePlan(h.dest));
    const leg=result?.legs.at(-1);
    assert.ok(leg&&!leg.partial,'route stopped under the target instead of climbing');
    assert.ok(Math.abs(leg.points.at(-1).z-600)<80);
    assert.ok(leg.points.some(p=>p.x>=900&&p.y>200),'staircase entrance was skipped');
});
test('no walking connection must not claim arrival on the wrong floor, even with an X preview',()=>{
    const h=planner({floorAt:p=>p.z===0?{...p}:null,step:(a,b)=>({p:{...b,z:0}})});
    const result=run(h.api.makePlan(h.dest));
    assert.ok(!result||result.legs[0].diagnostic&&result.legs[0].partial,'an incomplete downstairs path was presented as a valid arrival');
    if(result){const leg=result.legs[0];assert.ok(leg.points.slice(0,leg.verifiedEndIndex+1).every(p=>p.z===0));}
});
test('local staircase search is bounded and cannot jump vertically to a disconnected platform',()=>{
    const Local=require(root+'/PBZRouteLocalWalk');let probes=0;
    const world={floorAt:p=>({...p}),step:(a,b)=>{probes++;return {p:{...b,z:a.z}};}};
    const result=run(Local.search(world,{x:0,y:0,z:0},{x:100,y:0,z:1000},{maxNodes:2}));
    assert.equal(result,null);assert.ok(probes<=16);
});
test('same-floor routes must detour around a wall even if the native path claims to be complete',()=>{
    const blocked=(a,b)=>Math.min(a.x,b.x)<250&&Math.max(a.x,b.x)>=250&&Math.abs((a.y+b.y)/2)<250;
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>blocked(a,b)?{why:'solid wall',hit:{x:250,y:0,z:0}}:{p:{...b,z:0}}};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:560,y:0,z:0});
    const result=run(h.api.makePlan(h.dest)),leg=result?.legs[0];
    assert.ok(leg,'no feasible detour was found');
    assert.ok(leg.points.some(p=>Math.abs(p.y)>=250),'the returned route still goes straight through the wall');
    for(let i=1;i<leg.points.length;i++)assert.ok(!blocked(leg.points[i-1],leg.points[i]));
});
test('checked grid search minimizes feasible 3D length rather than a weighted straight-line guess',()=>{
    const Local=require(root+'/PBZRouteLocalWalk'),R=require(root+'/PBZRouteCore'),cells=new Map();
    const key=p=>p.x+','+p.y;
    const put=(x,y,z)=>cells.set(x*70+','+y*70,{x:x*70,y:y*70,z});
    for(let x=0;x<=8;x++){put(x,0,Math.min(x,8-x)*70);put(x,4,0);}
    for(let y=1;y<4;y++){put(0,y,0);put(8,y,0);}
    const world={floorAt:p=>cells.get(key(p))||null,step:(a,b)=>{
        const p=cells.get(key(b));return p&&R.xy(a,p)<=100&&Math.abs(p.z-a.z)<=100?{p}:{why:'no edge'};
    }};
    const start=cells.get('0,0'),goal=cells.get('560,0'),dist=new Map([[key(start),0]]),open=[start];
    while(open.length){open.sort((a,b)=>dist.get(key(a))-dist.get(key(b)));const a=open.shift();
        for(const b of cells.values())if(b!==a&&world.step(a,b).p){const d=dist.get(key(a))+R.dist(a,b);if(d<(dist.get(key(b))??Infinity)){dist.set(key(b),d);open.push(b);}}
    }
    const route=run(Local.search(world,start,goal,{clock:()=>0}));
    assert.ok(route);assert.ok(Math.abs(route.meters*100-dist.get(key(goal)))<.01,
        'returned '+route.meters*100+' instead of feasible shortest length '+dist.get(key(goal)));
});
test('a longer but feasible native route is compared with the shorter checked local route',()=>{
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>({p:{...b,z:0}})};
    const h=planner(world,{complete:true,detour:true});Object.assign(h.goal,{x:560,y:0,z:0});
    const result=run(h.api.makePlan(h.dest));
    assert.ok(Math.abs(result.legs[0].meters-5.6)<.001,'kept the 19.6 m native detour instead of the 5.6 m feasible path');
});
test('having a ladder later in a leg does not skip checking an earlier walking wall',()=>{
    const F=require(root+'/PBZRouteFeasibility');
    const world={floorAt:p=>p,step:()=>({why:'blocked wall'})};
    const points=[{x:0,y:0,z:0},{x:100,y:0,z:0},{x:100,y:0,z:600}];
    const leg={points,moves:[{kind:'ladder',from:1,to:2}],walks:[{from:0,to:1,edge:5}],checks:[]};
    const result=run(F.check(world,leg,points[0]));
    assert.equal(result.ok,false);assert.equal(result.edge,5);
});

test('an unsupported authored landing rejects its own edge so the planner can try a different action',()=>{
 const R=require(root+'/PBZRouteCore');
 const columns={p:[0,0,0,1500,0,600],v:[100,0,0,1000,0,600],
  e:[0,1,7,0,1,1,0,1,7,0,1,2],arc:[],lab:[0,0],cells:[],strong:[0,0],dag:[],
  off:[0,0,0],weight:[1000,1100],sizes:[2],order:[0,1],metric:Array(8).fill(0)};
 const actors=[{kind:'ascent',guid:'stale-landing',path:[[100,0,0],[1000,0,900]]},
  {kind:'ladder',guid:'supported-detour',path:[[100,0,0],[1000,0,600]]}];
 const g=new R.Graph({world:'test',n:2,actors},null,columns),bans=[];
 g.pathJob=function*(from,to,banned){bans.push([...banned]);return banned.has(0)?[1]:[0];};
 const floor=p=>({...p,z:p.x>=900?600:0});
 const world={floorAt:floor,step:(a,b)=>Math.abs(floor(b).z-a.z)<80?{p:floor(b)}:{why:'cliff'}};
 const h=planner(world,{quiet:true,graph:g,localWalk:{search:function*(){return null;}}});
 Object.assign(h.goal,{x:1500,y:0,z:600});
 const trip=run(h.api.makePlan(h.dest));
 assert.ok(trip&&!trip.legs[0].partial,'the planner repeated the failed landing instead of exploring the alternative');
 assert.ok(bans.some(ids=>ids.includes(0)),'the failed authored edge was never excluded');
 assert.equal(trip.legs[0].moves[0].guid,'supported-detour');
});
test('a route ending on an unsupported action pad cannot be certified as complete',()=>{
 const F=require(root+'/PBZRouteFeasibility'),start={x:0,y:0,z:0},end={x:100,y:0,z:600};
 const leg={points:[start,end],walks:[],checks:[],moves:[{kind:'ladder',edge:77,from:0,to:1}]};
 const result=run(F.check({floorAt:p=>p.x===0?p:null},leg,start));
 assert.equal(result.ok,false,'the final action escaped the landing check because no walking segment followed it');
 assert.equal(result.edge,77);
});

test('an unloaded action landing keeps its supported approach and pending action instead of an X at the origin',()=>{
 const F=require(root+'/PBZRouteFeasibility'),B=require(root+'/PBZRouteBlocked');
 const points=[{x:0,y:0,z:0},{x:400,y:0,z:0},{x:400,y:0,z:600},{x:800,y:0,z:600}];
 const source={provider:'atlas',world:'test',points,checks:[],walks:[{from:0,to:1,edge:1},{from:2,to:3,edge:3}],
  moves:[{kind:'ladder',guid:'pending-ladder',edge:2,from:1,to:2}]};
 const failure=run(F.check({floorAt:p=>p.z===0?p:null,step:(a,b)=>({p:b})},source,points[0]));
 const leg=B.fromFailure(source,failure,points.at(-1));
 assert.equal(leg.points[leg.verifiedEndIndex].x,400,'the supported approach was lost');
 assert.equal(leg.points[leg.verifiedEndIndex].z,0,'an unsupported landing became part of the safe prefix');
 assert.equal(leg.moves[0]?.guid,'pending-ladder');assert.equal(leg.obstacles[0].icon,'mechanism');
});
test('a complete feasible route wins over a shorter verified streaming prefix',()=>{
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>({p:{...b,z:0}})};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:7000,y:0,z:0});
    const result=run(h.api.makePlan(h.dest));
    assert.equal(result.legs[0].partial,false);assert.equal(result.legs[0].points.at(-1).x,7000);
});
test('downstairs search follows the same supported staircase instead of falling through the floor',()=>{
    const Local=require(root+'/PBZRouteLocalWalk');
    const route=run(Local.search(staircase(),{x:100,y:600,z:600},{x:0,y:0,z:0}));
    assert.ok(route);assert.equal(route.points.at(-1).z,0);
    assert.ok(route.points.some(p=>p.x>900&&p.z>100&&p.z<400));
});
test('checked off-grid doorway samples allow a narrow opening which the coarse grid misses',()=>{
    const Local=require(root+'/PBZRouteLocalWalk'),R=require(root+'/PBZRouteCore');
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>{
        const n=Math.max(1,Math.ceil(R.xy(a,b)/5));
        for(let i=0;i<=n;i++){const p=R.lerp(a,b,i/n);if(p.x>=260&&p.x<=300&&(p.y<30||p.y>40))return {why:'door frame'};}
        return {p:{...b,z:0}};
    }};
    const route=run(Local.search(world,{x:0,y:0,z:0},{x:560,y:0,z:0},
        {waypoints:[{x:245,y:35,z:0},{x:280,y:35,z:0},{x:315,y:35,z:0}],clock:()=>0}));
    assert.ok(route);
    for(let i=1;i<route.points.length;i++)assert.ok(world.step(route.points[i-1],route.points[i]).p);
    assert.ok(route.points.some(p=>p.x>=260&&p.x<=300&&p.y>=30&&p.y<=40));
});
test('walking validation replaces buried atlas heights with the actual supporting floor',()=>{
    const F=require(root+'/PBZRouteFeasibility');
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>({p:{...b,z:0}})};
    const leg={points:[{x:0,y:0,z:-134},{x:1000,y:0,z:-134}],checks:[],moves:[],walks:[]};
    const checked=run(F.check(world,leg,{x:0,y:0,z:0}));
    assert.equal(checked.ok,true);assert.ok(checked.leg.points.every(p=>p.z===0));
    assert.ok(leg.points.every(p=>p.z===-134),'input atlas data was changed');
});
test('a long flat collectible route repairs a small rock instead of rejecting the whole route',()=>{
    const R=require(root+'/PBZRouteCore');
    const blocked=(a,b)=>{const n=Math.max(1,Math.ceil(R.xy(a,b)/10));for(let i=0;i<=n;i++){const p=R.lerp(a,b,i/n);if(p.x>=1600&&p.x<=1900&&Math.abs(p.y)<180)return true;}return false;};
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>blocked(a,b)?{hit:{x:1600,y:0,z:0},why:'rock'}:{p:{...b,z:0}}};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:9300,y:0,z:0});
    const result=run(h.api.makePlan(h.dest));
    assert.ok(result&&!result.legs[0].partial,'small rock removed a reachable route beyond 90 m');
    assert.ok(result.legs[0].points.some(p=>Math.abs(p.y)>=180));
    assert.equal(result.legs[0].points.at(-1).x,9300);
});
test('a blocking candidate is published early with an X, a safe prefix and an unfinished tail',()=>{
    const world={floorAt:p=>({...p,z:0}),step:(a,b)=>Math.max(a.x,b.x)>=400?{hit:{x:400,y:0,z:0},why:'wall'}:{p:{...b,z:0}}};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:1000,y:0,z:0});
    const seen=[],context={onDiagnostic:trip=>seen.push(trip)};
    const job=h.api.makePlan(h.dest,false,false,false,context);
    for(let i=0;i<100&&!seen.length;i++)assert.equal(job.next().done,false);
    assert.ok(seen.length,'nothing was displayed while detour search was pending');
    const leg=seen[0].legs[0];assert.equal(leg.diagnostic,true);assert.equal(leg.partial,true);
    assert.ok(leg.verifiedEndIndex>0);assert.ok(leg.obstacles.some(o=>o.icon==='barrier'));
    assert.ok(leg.points[leg.verifiedEndIndex].x<400);
    const result=run(job);assert.ok(result.legs[0].diagnostic,'failed search cleared the blocked route');
    const cuts=require(root+'/PBZRouteObstacles').intervals(leg);
    assert.ok(cuts.some(c=>c.unknown&&c.hi>=leg.meters*100-1),'unchecked tail was not shown as unfinished');
});
test('a collectible approach may stop beside its collider without requiring a path through the object',()=>{
    const R=require(root+'/PBZRouteCore');
    const inside=p=>R.xy(p,{x:1000,y:0,z:0})<65;
    const world={floorAt:p=>inside(p)?null:{...p,z:0},step:(a,b)=>inside(b)?{hit:b,why:'collectible collider'}:{p:{...b,z:0}}};
    const h=planner(world,{complete:true});Object.assign(h.goal,{x:1000,y:0,z:120});h.dest.provider='187';
    const result=run(h.api.makePlan(h.dest));
    assert.ok(result&&!result.legs[0].partial);const end=result.legs[0].points.at(-1);
    assert.ok(R.xy(end,h.goal)>=65&&R.xy(end,h.goal)<=185);assert.equal(end.z,0);
});
test('the main navigation planner retains the ladder-plus-hook action chain',()=>{
    const R=require(root+'/PBZRouteCore'),module={exports:{}},UE={ESplineCoordinateSpace:{World:0}};
    const mocks={ue:UE,puerts:{$ref:value=>({value}),$unref:ref=>ref.value},'Library/TsHelper':{default:{}},'./PBZRouteWorld':{alive:o=>!!o}};
    vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRoutePassages.js','utf8')+'\n})',{Date,console})
        (id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id)),module,module.exports);
    const floor=p=>p.x>=-100&&p.x<=500?0:p.x>=650&&p.x<=900?600:p.x>=1100&&p.x<=1500?1200:null;
    const world={normal:.7,rise:45,slope:1,floorAt:p=>{const z=floor(p);return z===null?null:{...p,z};},
        step:(a,b)=>{const z=floor(b);return z!==null&&Math.abs(z-a.z)<80?{p:{...b,z}}:{why:'gap'};},
        hit:(a,b,body)=>{if(body)return null;const z=floor(a);return z!==null&&z<=a.z&&z>=b.z?{point:{x:a.x,y:a.y,z},nz:1}:null;}};
    const actors=[{kind:'ladder',guid:'ladder',both:true,path:[[500,0,0],[650,0,600]]},
        {kind:'swing',guid:'hook',both:true,path:[[900,0,600],[1100,0,1200]]}];
    const g={name:'test',actors,observedPassages:new Map(),openPassages:new Set(),canTraverse:()=>true,sameComponent:()=>false,routeJob:function*(){return null;}};
    const h=planner(world,{passages:module.exports,graph:g});Object.assign(h.goal,{x:1400,y:0,z:1200});
    const trip=run(h.api.makePlan(h.dest));assert.ok(trip&&!trip.legs[0].partial);
    assert.deepEqual(Array.from(trip.legs[0].moves,m=>m.kind),['ladder','swing']);
    for(const w of trip.legs[0].walks)assert.ok(world.step(w.a,w.b).p);
    assert.ok(R.dist(trip.legs[0].points.at(-1),h.goal)<1);
});
test('a sparse path over connected uneven ground is not rejected by its straight height interpolation',()=>{
    const F=require(root+'/PBZRouteFeasibility');
    const height=x=>Math.max(0,400-Math.abs(x-500)*.8);
    const world={floorAt:p=>({...p,z:height(p.x)}),step:(a,b,expected)=>{
        const z=height(b.x);return expected&&Math.abs(z-b.z)>200?{why:'stacked floor mismatch'}:{p:{...b,z}};
    }};
    const source={points:[{x:0,y:0,z:0},{x:1000,y:0,z:0}],moves:[],walks:[],checks:[]};
    const result=run(F.check(world,source,source.points[0]));
    assert.equal(result.ok,true,'connected terrain was treated as another floor');
    assert.ok(Math.max(...result.leg.points.map(p=>p.z))>380);
});
test('collectible approach points do not treat a closed door as the target collider',()=>{
    const Goals=require(root+'/PBZRouteGoals'),point={x:1000,y:0,z:120};
    const world={floorAt:p=>({...p,z:0}),hit:(a,b,body)=>body?null:a.x<1000?
        {point:{x:990,y:0,z:100},owners:['BP_ClosedDoor']}:{point,owners:['BP_Rubbish_123']}};
    const goals=run(Goals.approaches(world,point,140,{targetKey:'pbz:world:BP_Rubbish_123'}));
    assert.ok(goals.length);assert.ok(goals.every(p=>p.x>=1000));
});
test('observe restarts a pending job after landing on the roof without another map click',()=>{
    const h=planner({floorAt:p=>({...p}),step:(a,b)=>({p:{...b}})},{quiet:true});h.api.arm(h.dest);
    let closed=0;
    h.api.planning.request(h.api.routeRequest(h.dest),function*(){try{while(true)yield;}finally{closed++;}},()=>{});
    h.api.planning.pump();h.api.observe();
    h.pose.z=600;h.api.observe();h.api.observe();
    assert.equal(closed,1);assert.equal(h.api.planning.job.request.start.z,600);
    assert.equal(h.api.planning.job.request.key,h.dest.key);
    h.api.planning.clear('test cleanup');
});

test('walking uphill along a checked prefix does not repeatedly cancel its pending cave search',()=>{
 const h=planner({floorAt:p=>({...p}),step:(a,b)=>({p:{...b}})},{quiet:true});h.api.arm(h.dest);
 const points=[{x:0,y:0,z:0},{x:800,y:0,z:300},{x:1800,y:0,z:600}];
 const leg={world:'test',points,partial:true,diagnostic:true,verifiedEndIndex:1,moves:[],walks:[],checks:[],gates:[],obstacles:[]};
 Object.assign(h.api.S,{trip:{legs:[leg]},active:0,line:points,targetKey:h.dest.key});
 let closed=0;
 h.api.planning.request(h.api.routeRequest(h.dest),function*(){try{while(true)yield;}finally{closed++;}},()=>{});
 h.api.planning.pump();h.api.observe();
 h.pose.x=400;h.pose.z=150;h.api.observe();h.api.observe();
 assert.equal(closed,0,'a 150 cm rise along already checked ground restarted the entire cave search');
 h.pose.y=900;h.pose.z=900;h.api.observe();h.api.observe();
 assert.equal(closed,1,'leaving the verified corridor must still restart from the new floor');
 h.api.planning.clear('test cleanup');
});

test('a roof with a shallow overall bearing tries its climb before spending the walking-search budget',()=>{
    let actions=0;
    const empty=function*(){return null;};
    const world={floorAt:p=>({...p,z:p.x<1000?0:600}),step:(a,b)=>{
        const z=b.x<1000?0:600;return Math.abs(z-a.z)<80?{p:{...b,z}}:{why:'roof edge'};
    }};
    const passages={refreshLadders(){},isLookout:()=>false,liveRouteJob:function*(g,w,start,goal){
        actions++;const points=[start,{x:900,y:0,z:0},{x:1000,y:0,z:600},goal];
        return {legs:[{world:'test',points,checks:[],gates:[],physicalVerified:true,
            moves:[{kind:'ascent',guid:'roof-climb',from:1,to:2,p:points[1],end:points[2]}],
            walks:[{a:start,b:points[1],from:0,to:1,edge:-1},{a:points[2],b:goal,from:2,to:3,edge:-1}],
            meters:require(root+'/PBZRouteCore').extent(points)/100}],transfer:null};
    }};
    const h=planner(world,{quiet:true,passages,localWalk:{search:function*(w,a,b,settings){
        if(!actions)assert.ok(settings.maxNodes<=192&&settings.maxMs<=200,'the valid climb was postponed behind an expensive walking search');return yield* empty();
    }}});
    Object.assign(h.goal,{x:3000,y:0,z:600});
    const trip=run(h.api.makePlan(h.dest));assert.ok(trip&&!trip.legs[0].partial);
    assert.equal(trip.legs[0].moves[0].guid,'roof-climb');
});

test('a nearby climb is considered before walking even when the player starts at the roof height',()=>{
    let actions=0;
    const world={floorAt:p=>({...p,z:0}),step:()=>({why:'blocked direct route'})};
    const graph={name:'test',actors:[{kind:'ascent',path:[[900,0,-600],[1000,0,-134]]}],observedPassages:new Map(),
        sameComponent:()=>false,routeJob:function*(){return null;}};
    const passages={refreshLadders(){},isLookout:()=>false,liveRouteJob:function*(){actions++;return null;}};
    const h=planner(world,{quiet:true,graph,passages,localWalk:{search:function*(w,a,b,settings){
        if(!actions)assert.ok(settings.maxNodes<=192&&settings.maxMs<=200,'overall floor height postponed a climb behind the expensive walking search');return null;
    }}});
    Object.assign(h.goal,{x:3000,y:0,z:0});run(h.api.makePlan(h.dest));assert.equal(actions,1);
});
test('diagnostic rechecks while moving do not append a trail of unknown X markers',()=>{
    const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true});h.api.arm(h.dest);
    const points=[{x:0,y:0,z:0},{x:300,y:0,z:0},{x:1000,y:0,z:0}];
    const leg={world:'test',points,partial:true,diagnostic:true,verifiedEndIndex:1,moves:[],walks:[],checks:[],gates:[],
        obstacles:[{id:'route:blocked',p:points[1],approach:points[1],unknown:true,icon:'barrier'}]};
    Object.assign(h.api.S,{trip:{legs:[leg],transfer:null},active:0,line:points,targetKey:h.dest.key});
    h.api.auditor.begin=(candidate,w,p,now)=>{h.api.auditor.job={};h.api.auditor.safe=p;h.api.auditor.origin=p;h.api.auditor.started=now;};
    h.api.auditor.pump=()=>{h.api.auditor.job=null;return {mark:{id:'route:-1:'+h.pose.z,p:{...h.pose},edge:-1,unknown:true,reason:'no floor'}};};
    for(let i=0;i<12;i++){h.pose.z=i*40;h.api.guardRoute(i*2000);}
    assert.equal(leg.obstacles.length,1);assert.equal(leg.obstacles[0].id,'route:blocked');
});

test('route clearance does not run at the 125 Hz callback rate',()=>{
    const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true});h.api.arm(h.dest);
    const points=[{x:0,y:0,z:0},{x:1000,y:0,z:0}],leg={world:'test',points,moves:[],walks:[],checks:[],gates:[],obstacles:[]};
    Object.assign(h.api.S,{trip:{legs:[leg]},line:points});
    let calls=0;h.api.auditor.pump=()=>{calls++;return null;};
    for(let t=0;t<1000;t+=8)h.api.guardRoute(t);
    assert.ok(calls<=31,'route-wide bookkeeping ran '+calls+' times per second');
});

test('throttled route-clearance callbacks skip capsule reads as well as audit work',()=>{
    const h=planner({floorAt:p=>p,step:(a,b)=>({p:b})},{quiet:true});h.api.arm(h.dest);
    const points=[{x:0,y:0,z:0},{x:1000,y:0,z:0}],leg={world:'test',points,moves:[],walks:[],checks:[],gates:[],obstacles:[]};
    Object.assign(h.api.S,{trip:{legs:[leg]},line:points});let reads=0;
    h.api.S.world.feet=()=>{reads++;return points[0];};h.api.auditor.pump=()=>null;
    for(let t=0;t<1000;t+=8)h.api.guardRoute(t);
    assert.ok(reads<=31,'capsule reads still ran '+reads+' times per second');
});

test('a measured atlas wall stays excluded when movement cancels its unfinished repair',()=>{
 const banned=[],start={x:0,y:0,z:0},goal={x:1400,y:0,z:0};
 const graph={name:'test',actors:[],observedPassages:new Map(),sameComponent:()=>true,bells:new Map(),
  routeJob:function*(a,b,options){
   banned.push(options.banned.has(41));
   if(options.banned.has(41))return null;
   return {world:'test',points:[a,b],moves:[],checks:[],gates:[],walks:[{from:0,to:1,edge:41}],meters:14};
  }};
 const world={floorAt:p=>p,step:(a,b)=>b.x>=350?{hit:b,why:'blocked body clearance'}:{p:b}};
 const h=planner(world,{quiet:true,graph,localWalk:{search:function*(){return null;}}});Object.assign(h.goal,goal);
 const context={clock:()=>0},job=h.api.makePlan(h.dest,false,false,false,context);
 for(let i=0;i<300&&!context.repairs;i++)job.next();
 assert.ok(context.repairs,'the regression must cancel inside the suspended repair');
 job.return();h.pose.y=100;
 const next=h.api.makePlan(h.dest,false,false,false,{clock:()=>0});
 for(let i=0;i<60&&banned.length<2;i++)next.next();
 next.return();
 assert.equal(banned[1],true,'movement forgot the collision and selected the same wall again');
});

test('a known wall removes the rejected atlas tail while an unloaded corridor retains its pending tail',()=>{
 const B=require(root+'/PBZRouteBlocked'),points=[{x:0,y:0,z:0},{x:1000,y:0,z:0},{x:2000,y:0,z:0}];
 const source={world:'test',provider:'atlas',points,checks:[],walks:[],moves:[]};
 const prefix=[points[0],{x:300,y:0,z:0}];
 const wall=B.fromFailure(source,{prefix,segment:0,p:{x:350,y:0,z:100},unknown:false,why:'blocked body clearance'},points.at(-1));
 assert.equal(wall.points.length,wall.verifiedEndIndex+1,'the rejected wall route still points through the obstruction');
 const unloaded=B.fromFailure(source,{prefix,segment:0,unknown:true,why:'scene is not loaded'},points.at(-1));
 assert.equal(unloaded.points.at(-1).x,2000);
});

test('a local search still publishes its checked start corridor when the distant target has no loaded floor',()=>{
 const Local=require(root+'/PBZRouteLocalWalk'),start={x:0,y:0,z:0},goal={x:7000,y:0,z:600},seen=[];
 const world={floorAt:p=>p.x<=1200?{...p,z:0}:null,
  step:(a,b)=>b.x<=1200&&Math.abs(b.y)<90?{p:{...b,z:0}}:{why:'unloaded floor'}};
 run(Local.search(world,start,goal,{clock:()=>0,maxNodes:100,onProgress:leg=>seen.push(leg)}));
 assert.ok(seen.some(l=>l.points.at(-1).x>=700),'unloaded target suppressed the reachable starting corridor');
 for(const leg of seen)assert.ok(leg.points.every(p=>p.x<=1200),'progress added an unchecked tail');
});

test('a checked scene prefix can replace a zero-progress atlas preview',()=>{
 const B=require(root+'/PBZRouteBlocked'),start={x:0,y:0,z:0},goal={x:2000,y:0,z:0},context={};
 const atlas=B.fromFailure({provider:'atlas',world:'test',points:[start,goal],moves:[],walks:[]},
  {prefix:[start],segment:0,unknown:true},goal);
 B.offer(context,atlas,start,goal);
 const points=[start,{x:0,y:700,z:0}],scene=B.fromFailure({provider:'scene',world:'test',points,moves:[],walks:[]},
  {prefix:points,segment:1,unknown:true},goal);
 B.offer(context,scene,start,goal);
 assert.ok(context.best.legs[0].points[context.best.legs[0].verifiedEndIndex].y>=700,'provider rank hid a physically checked route in favour of an untested atlas');
});

function bellHarness(direct=false,localWalk={search:function*(){return null;}},extraBells=[],options={}){
 const bells=[{id:'start-bell',world:'test',area:'xigu',name:'起点铃铛',at:[200,0,0]},
  {id:'item-bell',world:'test',area:'xigu',name:'物品附近铃铛',at:[18000,0,500]},...extraBells];
 const g={name:'test',bells:new Map(),actors:[],observedPassages:new Map(),sameComponent:()=>true,h:()=>0,
  node:p=>p.x<1000?0:1,routeJob:function*(a,b){
   if(b.x>1000&&!direct)return null;
   const ps=direct&&a.x<1000&&b.x>19000?[a,{x:0,y:14000,z:0},{x:b.x,y:14000,z:b.z},b]:[a,b];
   return {world:'test',points:ps,checks:[],gates:[],moves:[],walks:ps.slice(1).map((b,i)=>({a:ps[i],b,from:i,to:i+1,edge:-1})),meters:require(root+'/PBZRouteCore').extent(ps)/100};
  }};
 const h=planner({floorAt:p=>p.x<1000?p:null,step:(a,b)=>b.x<1000?{p:b}:{why:'remote scene unloaded'}},
  {quiet:true,bells,graph:g,localWalk,...options});
 Object.assign(h.goal,{x:20000,y:0,z:500});h.dest.provider='187';h.bells=bells;return h;
}
test('an unloaded valley item still gets a checked route to a transfer bell',()=>{
 const h=bellHarness();const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.equal(trip?.transfer?.to.id,'item-bell','an unrouteable item hid its usable bell transfer');
 assert.equal(trip.transfer.from.id,'start-bell');assert.equal(trip.legs[0].partial,false);
 assert.equal(trip.legs[1].arrivalPending,true);assert.equal(trip.legs[1].points.length,1);
 assert.equal(h.dest.p.x,20000,'the bell replaced the selected item coordinates');
});
test('a long same-map atlas corridor does not bypass the shorter bell transfer',()=>{
 const h=bellHarness(true);h.api.S.world.floorAt=p=>p;h.api.S.world.step=(a,b)=>({p:b});
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.equal(trip?.transfer?.to.id,'item-bell','the complete direct corridor returned before comparing bells');
});
test('a nearby scene-walkable item is checked before committing to a distant bell transfer',()=>{
 const h=bellHarness();Object.assign(h.goal,{x:6400,y:0,z:0});
 h.bells[1].at=[6000,0,0];
 h.api.S.world.floorAt=p=>p;h.api.S.world.step=(a,b)=>({p:b});
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.ok(trip,'the loaded walking approach was never tried');
 assert.equal(!!trip.transfer,false,'a 64 m walk was replaced by a much longer transfer');
 assert.ok(!trip.legs[0].partial);assert.ok(trip.legs[0].meters<70);
});
test('selecting an inactive bell keeps an overland route instead of recommending a transfer',()=>{
 const h=bellHarness(false,undefined,[{id:'not-yet-activated',world:'test',at:[6400,0,0]}],
  {activeBellIDs:['start-bell','item-bell']});h.dest.bell='not-yet-activated';
 h.bells[1].at=[6000,0,0];
 h.api.S.world.floorAt=p=>p;h.api.S.world.step=(a,b)=>({p:b});
 Object.assign(h.goal,{x:6400,y:0,z:0});
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.ok(trip);assert.equal(!!trip.transfer,false,'an inactive bell target entered item teleport planning');
});
test('an activated bell target retains the existing shorter transfer recommendation',()=>{
 const h=bellHarness();h.dest.bell='item-bell';
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.equal(trip?.transfer?.to.id,'item-bell');
});
test('the reported ice-lake dock item keeps its short loaded walk with the real atlas',t=>{
 const sample=require('./fixtures/dock-item-20261113.json'),R=require(root+'/PBZRouteCore');
 const data=require(root+'/PBZRouteTables').data,bells=[data.bells[sample.fromBell],data.bells[sample.toBell]];
 const graph=new R.Graph(require(root+'/PBZRouteWorlds/'+sample.world).data,require(root+'/PBZRouteFaces/'+sample.world).faces);
 const departure={x:bells[0].at[0],y:bells[0].at[1],z:bells[0].at[2]};
 // Keep a usable bell approach as well as the field's measured player floor.
 // The real start polygon is about 58 cm above that floor, so its atlas join
 // fails while the loaded scene still offers a continuous short walk.
 const floor=p=>R.xy(p,sample.start)<10000?{...p,z:sample.floorZ+
  (departure.z-sample.floorZ)*Math.max(0,1-R.xy(p,departure)/1500)}:null;
 const h=planner({floorAt:floor,step:(a,b)=>floor(b)?{p:floor(b)}:{why:'unloaded scene'}},
  {quiet:true,level:sample.world,start:sample.start,bells,graph,surface:require(root+'/PBZRouteSurface')});
 Object.assign(h.goal,sample.goal);Object.assign(h.dest,{provider:'187',key:sample.itemKey});
 const events=[],trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0,report:(event,data)=>events.push({event,...data})}));
 assert.ok(events.some(e=>e.event==='bell transfer'),'the field replay must exercise its usable transfer alternative');
 assert.ok(trip);assert.equal(!!trip.transfer,false,'the dock item still recommends the four-image mirror detour');
 assert.ok(!trip.legs[0].partial);assert.ok(trip.legs[0].meters<sample.reportedTransferMeters*.5);
});
test('teleporting to the destination bell restarts planning for the original item',()=>{
 const h=bellHarness();h.api.arm(h.dest);const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.ok(trip?.transfer);h.api.setTrip(trip,h.dest,{...h.pose},'bell');h.api.observe();
 h.pose.x=18000;h.pose.z=500;h.api.S.world.floorAt=p=>p;h.api.observe();h.api.observe();
 assert.equal(h.api.planning.job?.request.key,h.dest.key);
 assert.equal(h.api.planning.job?.request.p.x,20000);h.api.planning.clear('test cleanup');
});

test('the transfer departure stops beside the bell instead of sweeping through its collider',()=>{
 const h=bellHarness();
 h.api.S.world.hit=(a,b,body)=>body&&Math.abs(b.x-200)<80&&Math.abs(b.y)<80?{point:b}:null;
 h.api.S.world.step=(a,b)=>Math.abs(b.x-200)<80&&Math.abs(b.y)<80?{hit:b,why:'bell collider'}:{p:b};
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.equal(trip?.transfer?.to.id,'item-bell');
 const end=trip.legs[0].points.at(-1);assert.ok(Math.hypot(end.x-200,end.y)<=185);
 assert.ok(Math.abs(end.x-200)>=80||Math.abs(end.y)>=80);
});

test('standing near the bell approach endpoint does not mean the bell or item was reached',()=>{
 const h=bellHarness();h.api.arm(h.dest);const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.ok(trip?.transfer);h.api.setTrip(trip,h.dest,{...h.pose},'transfer');
 const end=trip.legs[0].points.at(-1);
 h.api.S.arrival.check(h.api.S,h.pose,end,1000);
 assert.equal(h.api.S.arrival.check(h.api.S,h.pose,end,1150),false,'the approach radius was added to bell interaction range');
 assert.notEqual(h.api.S.arrival.completedTarget,h.dest.key);
});

test('a nearby activated bell behind a wall is not treated as an occupied transfer point',()=>{
 const h=bellHarness();h.pose.x=100;
 h.api.S.world.hit=(a,b)=>a.x<150&&b.x>=150?{point:{x:150,y:b.y,z:b.z},owners:['closed_door']}:null;
 h.api.S.world.step=(a,b)=>a.x<150&&b.x>=150?{hit:{x:150,y:0,z:0},why:'closed door'}:{p:b};
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.equal(!!trip?.transfer,false,'proximity to the bell bypassed a closed door');
});

test('standing beside an accessible bell collider preserves the stationary transfer leg',()=>{
 const h=bellHarness();h.pose.x=100;
 h.api.S.world.hit=(a,b,body)=>body&&Math.abs(b.x-200)<80&&Math.abs(b.y)<80?{point:b}:null;
 h.api.S.world.step=(a,b)=>Math.abs(b.x-200)<80&&Math.abs(b.y)<80?{hit:b,why:'bell collider'}:{p:b};
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.equal(trip?.transfer?.from.id,'start-bell');
 assert.equal(trip.legs[0].waitingTransfer,true);
 assert.equal(trip.legs[0].meters,0);
 assert.ok(trip.legs[0].points.every(p=>p.x===100&&p.y===0&&p.z===0));
});

test('a checked bell alternative is shown before rejected walking previews',()=>{
 const h=bellHarness(true),seen=[];
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0,onDiagnostic:t=>seen.push(t)}));
 assert.ok(trip?.transfer);
 assert.ok(seen.length>0,'the available bell was hidden until walking repair finished');
 assert.ok(seen.every(t=>t.transfer),'a rejected walking preview displaced the checked departure to a bell');
});

test('an arrival at the suggested bell finishes the item approach instead of offering a return transfer',()=>{
 const h=bellHarness();Object.assign(h.goal,{x:24000,y:0,z:500});h.api.arm(h.dest);
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.equal(trip?.transfer?.to.id,'item-bell');h.api.setTrip(trip,h.dest,{...h.pose},'bell');h.api.observe();
 h.pose.x=18000;h.pose.z=500;h.api.S.world.floorAt=p=>p;h.api.S.world.step=(a,b)=>({p:b});
 h.api.observe();h.api.observe();h.api.planning.clear('inspect arrival plan');
 const arrival=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.equal(!!arrival?.transfer,false,'the item approach sent the player back to another bell');
 assert.equal(h.dest.p.x,24000);
});

test('an unconnected near bell cannot outrank a bell with a continuous item corridor',()=>{
 const B=require(root+'/PBZRouteBellTransfer'),p=x=>({x,y:0,z:0});
 const bells=[{id:'from',world:'test',at:[0,0,0]},
  {id:'wrong-floor',world:'test',at:[9900,0,600]},
  {id:'connected',world:'test',at:[8000,0,0]}];
 const graph={name:'test',routeJob:function*(a,b){
  if(a.z===600)return null;
  const points=[a,b];return {world:'test',points,meters:a.x===8000?200:0,partial:false,walks:[],moves:[],checks:[],gates:[]};
 }};
 const trip=run(B.plan(graph,graph,p(0),p(10000),bells,{
  approaches:function*(at){return [at];},ready:function*(){return true;},verify:function*(){return true;}
 }));
 assert.equal(trip?.transfer?.to.id,'connected','a straight-line fallback beat a real corridor from another bell');
});

test('already occupying the best item bell does not select a worse transfer just because self-transfer is excluded',()=>{
 const B=require(root+'/PBZRouteBellTransfer'),start={x:0,y:0,z:0},goal={x:4000,y:0,z:0};
 const bells=[{id:'best',world:'test',at:[0,0,0]},{id:'worse',world:'test',at:[12000,0,0]}];
 const graph={name:'test',routeJob:function*(a,b){return {world:'test',points:[a,b],meters:a.x===0?40:250,partial:false,walks:[],moves:[],checks:[],gates:[]};}};
 const trip=run(B.plan(graph,graph,start,goal,bells,{
  approaches:function*(at){return [at];},ready:function*(){return true;},verify:function*(){return true;}
 }));
 assert.equal(!!trip?.transfer,false,'standing at the best bell generated a detour through a worse bell');
});

test('the reported valley currency prefers the connected tower base over the misleading shorter flower-field atlas',()=>{
 const R=require(root+'/PBZRouteCore'),B=require(root+'/PBZRouteBellTransfer'),tables=require(root+'/PBZRouteTables').data;
 const world='pbz_xigu_wp',g=new R.Graph(require(root+'/PBZRouteWorlds/'+world).data,require(root+'/PBZRouteFaces/'+world).faces);
 const bells=Object.values(tables.bells).filter(b=>b.world===world),from=bells.find(b=>b.id==='Bell_NLES_006');
 const start={x:from.at[0],y:from.at[1],z:from.at[2]},goal={x:-60311.68,y:211444.33,z:-21160.582};
 const trip=run(B.plan(g,g,start,goal,bells,{
  approaches:function*(at){return [at];},ready:function*(){return true;},verify:function*(){return true;}
 }));
 assert.equal(trip?.transfer?.to.id,'Bell_NLES_016','the known bad 177 m flower-field corridor beat the nearer tower-base access');
});

test('a departure can locally go around a wall instead of requiring the player to touch the bell',()=>{
 const h=bellHarness(false,require(root+'/PBZRouteLocalWalk'));h.bells[0].at=[700,0,0];
 const wall=(a,b)=>{if((a.x<300&&b.x>=300)||(a.x>=300&&b.x<300)){
  const t=(300-a.x)/(b.x-a.x);if(Math.abs(a.y+(b.y-a.y)*t)<200)return {x:300,y:a.y+(b.y-a.y)*t,z:0};
 }};
 h.api.S.world.hit=(a,b)=>{const point=wall(a,b);return point?{point,owners:['wall']}:null;};
 h.api.S.world.step=(a,b)=>{const hit=wall(a,b);return hit?{hit,why:'blocked body clearance'}:b.x<1000?{p:b}:{why:'remote scene unloaded'};};
 const trip=run(h.api.makePlan(h.dest,false,false,false,{clock:()=>0}));
 assert.equal(trip?.transfer?.from.id,'start-bell','only the stationary branch could provide a transfer');
 assert.ok(trip.legs[0].points.some(p=>Math.abs(p.y)>=200),'the departure still crosses the wall');
});

test('a newly selected item can use a transfer after the previous item reached its destination bell',()=>{
 const h=bellHarness();Object.assign(h.goal,{x:24000,y:0,z:500});h.api.arm(h.dest);
 const trip=run(h.api.makePlan(h.dest));h.api.setTrip(trip,h.dest,{...h.pose},'bell');
 h.pose.x=18000;h.pose.z=500;h.api.S.world.floorAt=p=>p;h.api.S.world.step=(a,b)=>({p:b});h.api.observe();
 assert.equal(h.api.S.bellArrival?.bell,'item-bell');h.api.planning.clear('next selection');
 const next={...h.dest,key:'another-currency',p:{x:0,y:0,z:0}};
 const result=run(h.api.makePlan(next));
 assert.equal(result?.transfer?.to.id,'start-bell','the previous item suppressed transfers for the next selection');
 assert.equal(result.transfer.from.id,'item-bell');
});

test('an origin revision on teleport cannot bypass the selected item arrival stage',()=>{
 const h=bellHarness();Object.assign(h.goal,{x:24000,y:0,z:500});h.api.arm(h.dest);
 h.api.setTrip(run(h.api.makePlan(h.dest)),h.dest,{...h.pose},'bell');h.api.observe();
 h.pose.x=18000;h.pose.z=500;h.api.S.world.h=95;h.api.S.world.floorAt=p=>p;
 h.api.observe();
 assert.equal(h.api.S.bellArrival?.key,h.dest.key);
 assert.equal(h.api.S.active,1);h.api.planning.clear('test cleanup');
});

for(const locked of [false,true])test('a loaded arrival '+(locked?'lock':'wall')+' excludes the misleading closest bell',()=>{
 const h=bellHarness(false,undefined,[{id:'accessible-bell',world:'test',name:'绕行铃铛',at:[17000,3000,500]}]);
 const g=h.api.graphs.get('test'),original=g.routeJob;
 g.routeJob=function*(a,b){
  if(a.x===17000){const points=[a,{x:20000,y:3000,z:500},b];return {world:'test',points,meters:60,checks:[],moves:[],gates:[],
   walks:points.slice(1).map((b,i)=>({a:points[i],b,from:i,to:i+1,edge:-1}))};}
  if(a.x>1000)return {world:'test',points:[a,b],meters:require(root+'/PBZRouteCore').dist(a,b)/100,checks:[],moves:[],gates:[],walks:[{from:0,to:1,edge:-1}]};
  return yield* original(a,b);
 };
 h.api.S.world.floorAt=p=>p;
 h.api.S.world.step=(a,b)=>a.x<18500&&b.x>=18500&&Math.abs(b.y)<1000?
  locked?{why:'locked passage',locked:true,block:{locked:true}}:{hit:b,why:'wall'}:{p:b};
 const trip=run(h.api.makePlan(h.dest));
 assert.equal(trip?.transfer?.to.id,'accessible-bell');
 assert.equal(trip.transfer.evidence,'checked');
 assert.equal(trip.legs[1].arrivalPending,true,'the remote physical probe must not draw an item walk before teleport');
});

test('a partial departure cannot present its frontier as a reachable transfer bell',()=>{
 const B=require(root+'/PBZRouteBellTransfer'),p=x=>({x,y:0,z:0});
 const graph={name:'test',routeJob:function*(a,b){return {world:'test',points:[a,b],meters:Math.abs(a.x-b.x)/100,checks:[],walks:[],moves:[],gates:[]};}};
 const bells=[{id:'start',world:'test',at:[1000,0,0]},{id:'target',world:'test',at:[10000,0,0]}];
 const trip=run(B.plan(graph,graph,p(0),p(12000),bells,{
  approaches:function*(at){return [at];},verify:function*(leg){leg.points=[leg.points[0],p(100)];leg.partial=true;return true;}
 }));
 assert.equal(trip,null);
});

test('a wrong-floor atlas endpoint stays below a continuous arrival corridor',()=>{
 const B=require(root+'/PBZRouteBellTransfer'),p=x=>({x,y:0,z:0});
 const bells=[{id:'from',world:'test',at:[0,0,0]},{id:'wrong-floor',world:'test',at:[9900,0,600]},
  {id:'connected',world:'test',at:[8000,0,0]}];
 const graph={name:'test',routeJob:function*(a,b){const end=a.z===600?{...b,z:600}:b;
  return {world:'test',points:[a,end],meters:Math.hypot(a.x-end.x,a.z-end.z)/100,walks:[],checks:[],moves:[],gates:[]};}};
 const trip=run(B.plan(graph,graph,p(0),p(10000),bells,{
  approaches:function*(at){return [at];},ready:function*(){return true;},verify:function*(){return true;}
 }));
 assert.equal(trip?.transfer?.to.id,'connected');
});

for(const closedAction of [false,true])test((closedAction?'a closed traversal':'a banned measured wall')+' cannot turn into a proximity-only bell recommendation',()=>{
 const B=require(root+'/PBZRouteBellTransfer'),p=x=>({x,y:0,z:0});
 const bells=[{id:'from',world:'test',at:[0,0,0]},{id:'blocked',world:'test',at:[9900,0,0]},
  {id:'unknown',world:'test',at:[8000,0,0]}];
 const graph={name:'test',foldedPassages:new Set(closedAction?['ladder']:[]),routeJob:function*(a,b,options){
  if(a.x===8000||a.x===0&&b.x===10000)return null;
  if(a.x===9900&&(closedAction?!this.allowBlockedTraverse:options.banned.has(42)))return null;
  return {world:'test',points:[a,b],meters:Math.abs(a.x-b.x)/100,walks:[],checks:[],moves:[],gates:[]};
 }};
 const trip=run(B.plan(graph,graph,p(0),p(10000),bells,{
  banned:{test:new Set(closedAction?[]:[42])},approaches:function*(at){return [at];},ready:function*(){return true;},verify:function*(){return true;}
 }));
 assert.notEqual(trip?.transfer?.to.id,'blocked','a known exclusion became a straight-distance candidate after routeJob returned null');
 assert.equal(graph.allowBlockedTraverse,undefined,'diagnostic traversal flags leaked out of bell selection');
});
