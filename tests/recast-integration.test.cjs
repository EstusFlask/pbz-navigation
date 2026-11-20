'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..'),mod=process.env.PBZ_TEST_SOURCE||path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const States=require(mod+'/PBZRecastStates'),{RecastCache}=require(mod+'/PBZRouteRecast');
const {RecastCache:Providers}=require(mod+'/PBZRouteRecastProvider');
const {WorldCache}=require(mod+'/PBZRouteRecastProvider');
const array=values=>({Num:()=>values.length,Get:i=>values[i]});
const drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};

test('a complete resident route may extend beyond the previous request rectangle',()=>{
 const world='pbz_test',start={x:100,y:100,z:0},goal={x:900,y:100,z:0},calls=[];
 const planner={destroyed:false,*routeJob(a,b){calls.push([a,b]);yield;return{complete:true,points:[a,b],meters:8};}};
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 Object.assign(cache,{pages:{current:{window:{planner}}},localSession:{world,planner,bounds:[0,0,800,200]}});

 const route=drain(cache.routeLocal(world,start,goal));
 assert.equal(calls.length,1,'the resident Detour planner was rejected before querying the target');
 assert.equal(route.partial,false);
 assert.deepEqual(route.points.at(-1),goal);

 planner.routeJob=function*(){yield;return{complete:false,points:[],meters:0,reason:'endpoint missing'};};
 assert.equal(drain(cache.routeLocal(world,start,{x:100000,y:100,z:0})),null,'a target absent from resident geometry was accepted');
 planner.routeJob=function*(a,b){yield;return{complete:false,points:[a,b],meters:8};};
 assert.equal(drain(cache.routeLocal(world,start,goal)).partial,true,'an incomplete resident corridor became a complete leg');
 assert.equal(drain(cache.routeLocal('another-world',start,goal)),null);
 cache.pages.current.window.planner={destroyed:false,routeJob:function*(){assert.fail('a stale planner was queried');}};
 assert.equal(drain(cache.routeLocal(world,start,goal)),null);
 planner.destroyed=true;cache.pages.current.window.planner=planner;
 assert.equal(drain(cache.routeLocal(world,start,goal)),null);
});

test('the world action planner ranks the existing 512 initial and 512 refill candidates',()=>{
 const world='pbz_test',start={x:0,y:0,z:0},goal={x:1000,y:0,z:0},alternate={x:1060,y:30,z:25},features=[{guid:'original'}];let calls=0;
 const planner={*actionTopologyJob(a,b,inputs,options){
  calls++;assert.equal(inputs,features);assert.deepEqual(a,[0,0,0]);assert.deepEqual(b,[1000,0,0]);
  assert.deepEqual(options,{relevantOnly:true,maxRankedFeatures:1024,pendingMechanisms:true,...(calls===2?{additionalGoals:[[1060,30,25]]}:{})});
  yield;return{features:inputs,stats:{}};
 }},cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 Object.assign(cache,{pages:{window:{planner}},localSession:{world,planner}});
 assert.equal(drain(cache.actionTopology(world,start,goal,features)).features,features);
 const providers=new Providers(()=>{},{});
 providers.active=providers.worlds=cache;
 assert.equal(drain(providers.actionTopology(world,start,goal,features,[alternate])).features,features);
 assert.equal(calls,2);
});

test('an uncovered empty proposal page reaches bounded action discovery before expensive wider walking',()=>{
 const world='pbz_fujizhilin_wp',manifest=require(mod+'/PBZRouteMovementData/'+world+'/index').data,cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0),start={x:-25055,y:156265,z:2130},goal={x:-28146,y:172240,z:631};let discovered=0;
 const planner={dropCandidatesJob:function*(){discovered++;yield;return[{a:[-25600,162500,1800],b:[-25100,163000,900],kind:'fall'},{a:[-25600,162500,900],b:[-25100,163000,1000],kind:'surface'}];}};
 Object.assign(cache,{world,index:{sourceIndexSHA256:manifest.sourceIndexSHA256},pages:{window:{planner}},localSession:{world,planner,bounds:[-32000,155000,-19000,174000],vertical:[0,3000]}});
 cache.walkingAlternative=function*(){assert.fail('empty proposal data started a cold wide-window walk before action discovery');};
 const task=cache.dropCandidates(world,start,goal,[],{maxHeightCm:1036,maxRunCm:814});let r;do{r=task.next();}while(!r.done);
 assert.equal(discovered,1);assert.deepEqual(r.value.map(row=>[row.kind,row.both]),[['fall',false],['surface',true]],'only upward-capable geometric surfaces should expose a separately checked reverse direction');
});

test('nearby descent candidates keep only usable directions and a bounded shortlist',()=>{
 const world='pbz_test',entry=[40,80,550],exit=[170,120,0],guid='recast-movement:40,80,550>170,120,0';
 const start={x:0,y:0,z:550},goal={x:2000,y:0,z:0},policy={maxHeightCm:750,maxRunCm:500};
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0),planner={};
 Object.assign(cache,{world,pages:{window:{planner}},localSession:{world,planner},index:{actors:[{id:'deck',movementRequiresPassable:[guid]}]},
  corridorActions:[guid],corridorPads:new Map([[guid,{entry,exit}]]),corridorDirections:new Map([[guid,1]])});
 let reads=0;
 cache.indexedMovements=function*(name,a,b,p,bounds,height,priority,pads){
  reads++;assert.equal(name,world);assert.equal(p,policy);assert.deepEqual(pads,{entry,exit});
  assert.deepEqual(height,[-120,670]);assert.equal(priority.has(guid),true);
  return [{guid,kind:'fall',path:[entry,exit]},...Array.from({length:40},(_,i)=>({
   guid:'nearby-'+i,kind:'fall',path:[[entry[0]+i+1,entry[1],entry[2]],exit]}))];
 };
 for(const state of [undefined,true]){
  cache.states={deck:state};
  const shortlist=drain(cache.preferredFalls(world,start,goal,policy));
  assert.equal(shortlist.length,24);
  assert.equal(shortlist[0].guid,state===true?guid:'nearby-0');
  assert.equal(shortlist.some(f=>f.guid===guid),state===true);
 }
 cache.corridorDirections.set(guid,2);
 assert.deepEqual(drain(cache.preferredFalls(world,start,goal,policy)),[]);
 assert.equal(reads,2);
});

test('bell access estimates preserve the resident planner, fall capabilities and closed decks',()=>{
 const world='pbz_test',planner={},start={x:0,y:0,z:600},goal={x:1000,y:0,z:0};
 const guid='recast-movement:fall',cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 const rows=[{guid,kind:'fall',entry:[0,0,600],exit:[400,0,0]},
  {guid:'too-deep',kind:'fall',entry:[0,0,1600],exit:[400,0,0]}];
 const session={world,planner};let allowed,exclusions;
 const active={window:{planner},corridors:{*path(a,b,states,options){
  allowed=yield* options.actionSource.fromJob(0);exclusions=options.excludedActions;yield;
  return allowed.some(row=>!exclusions?.has(row.guid))?[{viaEntry:rows[0].entry,viaExit:rows[0].exit}]:null;
 }}};
 Object.assign(cache,{index:{actors:[{id:'deck',movementRequiresPassable:[guid]}]},states:{deck:true},pages:active,localSession:session});
 cache.movementCorridors=()=>({*fromJob(){return rows;}});
 const policy={maxHeightCm:900,maxRunCm:600};
 const estimate=drain(cache.bellArrival(world,start,goal,policy));
 assert.equal(estimate.evidence,'recast-topology');assert.ok(estimate.meters>=Math.hypot(1000,600)/100);
 assert.deepEqual(allowed.map(row=>row.guid),[guid]);assert.equal(estimate.points,undefined);
 assert.equal(cache.localSession,session);assert.equal(active.window.planner,planner);
 cache.states.deck=false;assert.equal(drain(cache.bellArrival(world,start,goal,policy)),null);
 cache.states.deck=true;assert.equal(drain(cache.bellArrival(world,start,goal)),null);
 const job=cache.bellArrival(world,start,goal,policy);job.next();job.return();
 assert.equal(cache.localSession,session);assert.equal(active.window.planner,planner);
});

test('a tower descent chain keeps bounded alternatives for every selected landing',()=>{
 const world='pbz_test',planner={},cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 const a='recast-movement:first',b='recast-movement:second';
 Object.assign(cache,{index:{actors:[]},states:{},pages:{window:{planner}},localSession:{world,planner},
  corridorActions:[a,b],corridorDirections:new Map([[a,1],[b,1]]),
  corridorPads:new Map([[a,{entry:[0,0,1500],exit:[100,0,800]}],[b,{entry:[200,0,800],exit:[300,0,0]}]])});
 cache.indexedMovements=function*(w,start,goal,policy,bounds,vertical,priority,pads){
  return Array.from({length:40},(_,i)=>({guid:[...priority][0]+'-'+i,kind:'fall',path:[pads.entry,pads.exit]}));
 };
 const shortlist=drain(cache.preferredFalls(world,{x:0,y:0,z:1500},{x:1000,y:0,z:0},{maxHeightCm:1000}));
 assert.equal(shortlist.length,48);
 assert.equal(shortlist.filter(f=>f.guid.startsWith(a)).length,24);
 assert.equal(shortlist.filter(f=>f.guid.startsWith(b)).length,24);
});

test('measured recovery proposals do not preempt the original valid route candidates',()=>{
 const world='pbz_test',start={x:0,y:0,z:550},goal={x:200,y:0,z:0},cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 const planner={*dropCandidatesJob(){return [
  {a:[10,0,550],b:[100,0,0]},
  {a:[20,0,510],b:[90,0,0],boundaryRecovery:true}
 ];}};
 Object.assign(cache,{index:{sourceIndexSHA256:'fixture'},pages:{window:{planner}},localSession:{world,planner}});
 const rows=drain(cache.dropCandidates(world,start,goal,[],{maxHeightCm:600,maxRunCm:200}));
 assert.deepEqual(rows.map(r=>r.path[0]),[[10,0,550]]);
 assert.equal(rows.deferredCount,1);
 assert.deepEqual(drain(cache.moreMovementCandidates(world,start,goal)).map(r=>r.path[0]),[[20,0,510]]);
});

test('a descent that requires missing collision is rejected when the source actor is solid or unloaded',()=>{
 const world='pbz_test',start={x:0,y:0,z:500},goal={x:400,y:0,z:0},guid='recast-movement:0,0,500>400,0,0';
 const actor={id:'deck',movementRequiresPassable:[guid]};
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 const planner={*dropCandidatesJob(){return [{a:[0,0,500],b:[400,0,0]},{a:[100,0,500],b:[400,0,0]}];}};
 let excluded;
 const paged={window:{planner},corridors:{*path(a,b,states,options){excluded=options.excludedActions;return null;}}};
 Object.assign(cache,{index:{sourceIndexSHA256:'fixture',actors:[actor]},pages:paged,localSession:{world,planner,bounds:[-500,-500,700,700]}});
 cache.movementCorridors=()=>({});cache.actionHints=()=>[];
 for(const state of [false,undefined,true]){
  cache.states={deck:state};
  drain(cache.movementWindowRoute(world,start,goal));
  assert.equal(!!excluded?.get(guid),state!==true,'coarse route consulted a descent through a solid deck');
  const rows=drain(cache.dropCandidates(world,start,goal,[],{maxHeightCm:700,maxRunCm:800}));
  assert.equal(rows.some(r=>r.guid===guid),state===true);
  assert.ok(rows.some(r=>r.guid!==guid),'an unrelated descent was disabled');
 }
});

test('deferred movement candidates are invalidated by cancellation and topology revisions',()=>{
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0),start={x:0,y:0,z:0},goal={x:100,y:0,z:0},rows=[{guid:'lower'}],drain=j=>{let r;do{r=j.next();}while(!r.done);return r.value;};cache.states={gate:false};
 const pending=()=>({world:'test',start:{...start},goal:{...goal},revision:cache.revision,rows});cache.deferredMovements=pending();assert.equal(drain(cache.moreMovementCandidates('test',start,goal)),rows);assert.deepEqual(drain(cache.moreMovementCandidates('test',start,goal)),[]);
 cache.deferredMovements=pending();cache.revision++;assert.deepEqual(drain(cache.moreMovementCandidates('test',start,goal)),[]);cache.deferredMovements=pending();cache.cancel();assert.deepEqual(drain(cache.moreMovementCandidates('test',start,goal)),[]);assert.equal(cache.states.gate,false);
});

test('endpoint mesh candidates stay bounded, on the requested floor, and belong to the current window',()=>{
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0),world='pbz_test',origin=[10000,20000,30000],p={x:10100,y:20100,z:30100};let calls=0,restores=0;
 const planner={origin,query:{findNearestPoly(q){calls++;return{success:true,nearestRef:calls,nearestPoint:{...q,y:calls===1?q.y+5:q.y}};}}};
 const window={planner,holdWindow(){return{planner:this.planner};},restoreWindow(snapshot){this.planner=snapshot.planner;restores++;}};
 Object.assign(cache,{world,pages:{window,index:{tiles:{},blobs:{}},*directJob(){yield;}},localSession:{world,planner,bounds:[p.x-900,p.y-900,p.x+900,p.y+900],vertical:[p.z-150,p.z+150]}});
 cache.pages.window=window;
 const job=cache.endpointCandidates(world,p);let row,yields=0;do{row=job.next();if(!row.done)yields++;}while(!row.done);
 assert.equal(calls,17);assert.equal(yields,18,'endpoint tile loading and each projection query must yield');assert.ok(row.value.length<=6&&row.value.length>0);
 assert.equal(restores,1);assert.equal(window.planner,planner);
 assert.ok(row.value.every(q=>Math.abs(q.z-p.z)<=120&&Math.hypot(q.x-p.x,q.y-p.y)<=750),'a nearby roof or distant polygon became an endpoint candidate');
 planner.destroyed=true;const stale=cache.endpointCandidates(world,p);assert.deepEqual(stale.next().value,[]);assert.equal(calls,17);
});

test('endpoint projection uses a bounded local window after the route window misses the endpoint',()=>{
 const world='pbz_test',p={x:10100,y:20100,z:30100},cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);let projectionCalls=0,loads=0,restores=0;
 const routePlanner={destroyed:false},localPlanner={destroyed:false,origin:[0,0,0],query:{findNearestPoly(q){projectionCalls++;return{success:true,nearestRef:projectionCalls,nearestPoint:{...q}};}}};
 const window={planner:routePlanner,holdWindow(){return{planner:this.planner};},restoreWindow(snapshot){this.planner=snapshot.planner;restores++;}};
 const pages={window,*directJob(from,to,states,options){loads++;assert.deepEqual(from,[p.x,p.y,p.z]);assert.deepEqual(to,from);assert.deepEqual(options.boundsUE,[p.x-800,p.y-800,p.x+800,p.y+800]);assert.deepEqual(options.heightBoundsUE,[p.z-120,p.z+120]);window.planner=localPlanner;yield;return{complete:false,points:[]};}};
 Object.assign(cache,{world,states:{gate:false},pages,localSession:{world,planner:routePlanner,bounds:[0,0,100,100],vertical:[0,100]}});

 const rows=drain(cache.endpointCandidates(world,p));
 assert.equal(loads,1,'the endpoint query never loaded its own bounded tiles');
 assert.equal(projectionCalls,17);assert.ok(rows.length>0);
 assert.equal(restores,1);assert.equal(window.planner,routePlanner,'temporary endpoint geometry replaced the route planner');
 assert.equal(cache.localSession.planner,routePlanner,'the route session was left pointing at the temporary planner');

 const cancelled=cache.endpointCandidates(world,p);cancelled.next();cancelled.return();
 assert.equal(restores,2,'cancelling endpoint projection did not restore the route window');
 assert.equal(window.planner,routePlanner);assert.equal(cache.localSession.planner,routePlanner);
});

test('native action pad projections use only the resident mesh',()=>{
 const world='pbz_test',p={x:10100,y:20100,z:30100},cache=new WorldCache(()=>{}, {},()=>{},()=>0);
 const origin=[10000,20000,30000],queries=[];
 let onMesh=false;
 const planner={origin,query:{findNearestPoly(q,{halfExtents}){
  queries.push({q,halfExtents});
  if(halfExtents.x===1)return {success:true,nearestRef:onMesh?1:0};
  if(q.x<.8)return {success:true,nearestRef:2,nearestPoint:{...q,y:q.y+2}};
  return {success:true,nearestRef:3,nearestPoint:q};
 }}};
 Object.assign(cache,{pages:{window:{planner},*directJob(){assert.fail('native projection replaced the action mesh');}},localSession:{world,planner}});
 const providers=new Providers(()=>{},{});
 providers.active=providers.worlds=cache;

 assert.deepEqual(drain(providers.actionPadCandidates(world,p)),[p]);
 assert.deepEqual(queries[0],{q:{x:1,y:1,z:-1},halfExtents:{x:1,y:.9,z:1}});
 assert.equal(queries.length,82,'projection work must stay bounded');
 assert.equal(cache.pages.window.planner,planner);

 onMesh=true;
 assert.deepEqual(drain(providers.actionPadCandidates(world,p)),[]);
 assert.equal(queries.length,83,'an existing mesh exit should use its original standing pad');
 assert.deepEqual(drain(providers.actionPadCandidates('another-world',p)),[]);
 planner.destroyed=true;
 assert.deepEqual(drain(providers.actionPadCandidates(world,p)),[]);
 assert.equal(queries.length,83);
});

test('endpoint bridge walking loads its coarse corridor and restores the resident route window',()=>{
 const world='pbz_test',a={x:100,y:200,z:300},b={x:5100,y:6200,z:900},cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0),routePlanner={destroyed:false},walkPlanner={destroyed:false};
 const tiles={old:true},blobs={old:true},requests=[];let restores=0;
 const window={planner:routePlanner,holdWindow(){return{planner:this.planner};},restoreWindow(snapshot){this.planner=snapshot.planner;restores++;}};
 const pages={manifest:{extentCm:1000},index:{tiles,blobs},window,corridors:{*path(from,to,states,options){assert.deepEqual(from,[a.x,a.y,a.z]);assert.deepEqual(to,[b.x,b.y,b.z]);assert.deepEqual(options,{maxCoarseNodes:2048});yield;return[{row:[0,-1,0,0,0,300]},{row:[5,-7,0,0,0,900]}];}},*directJob(from,to,states,options){requests.push(options);this.index.tiles={temporary:true};this.index.blobs={temporary:true};window.planner=walkPlanner;yield;return{complete:true,points:[from,to],meters:80,windowBoundsUE:options.boundsUE,verticalWindowUE:options.heightBoundsUE};},*routeJob(){assert.fail('known coarse endpoint corridor unexpectedly fell back to broad routing');}};
 Object.assign(cache,{world,states:{gate:false},index:{extentCm:1000},pages,localSession:{world,planner:routePlanner,bounds:[0,0,100,100],vertical:[0,100]}});

 const leg=drain(cache.routeEndpointLocal(world,a,b));
 assert.equal(leg.partial,false);assert.deepEqual(leg.points,[a,b]);assert.equal(requests.length,1);
 assert.deepEqual(requests[0].tileKeys,['0,-1,0','5,-7,0']);
 assert.deepEqual(requests[0].heightBoundsUE,[-1200,2400]);
 assert.equal(restores,1);assert.equal(window.planner,routePlanner);assert.equal(cache.localSession.planner,routePlanner);
 assert.equal(pages.index.tiles,tiles);assert.equal(pages.index.blobs,blobs);

 const cancelled=cache.routeEndpointLocal(world,a,b);cancelled.next();cancelled.return();
 assert.equal(restores,2,'cancelling endpoint bridge routing did not restore the route planner');
 assert.equal(window.planner,routePlanner);assert.equal(pages.index.tiles,tiles);assert.equal(pages.index.blobs,blobs);

 let broadFallbacks=0;const noPathPages={...pages,corridors:{*path(){yield;return null;}},*routeJob(){broadFallbacks++;}};
 const noPathWindow={planner:routePlanner,holdWindow(){return{planner:this.planner};},restoreWindow(snapshot){this.planner=snapshot.planner;restores++;}};noPathPages.window=noPathWindow;
 Object.assign(cache,{pages:noPathPages,localSession:{world,planner:routePlanner,bounds:[0,0,100,100],vertical:[0,100]}});
 assert.equal(drain(cache.routeEndpointLocal(world,a,b)),null);
 assert.equal(broadFallbacks,0,'a missing coarse corridor triggered an unbounded route retry');
 assert.equal(noPathWindow.planner,routePlanner);
});

test('wider custom-route retries preserve known closed states and reject clipped prefixes',()=>{
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0),world='pbz_test',a={x:0,y:0,z:0},b={x:2000,y:0,z:0},seen=[];
 Object.assign(cache,{world,ready:true,index:{actors:[{id:'closed-gate',rule:'fogdoor-passability'}]},catalogue:{worlds:{[world]:{}}},states:{'closed-gate':false},pages:{window:{planner:{}},routeJob:function*(a,b,states,options){seen.push(options.paddingTiles);assert.equal(states['closed-gate'],false);yield;return{complete:options.paddingTiles===2,points:options.paddingTiles===2?[a,b]:[a,[500,0,0]],meters:20,unknownActors:[],windowBoundsUE:[-100,-100,2100,100]};}}});
 const job=cache.walkingAlternative(world,a,b);let row;do{row=job.next();}while(!row.done);
 assert.deepEqual(seen,[2]);assert.equal(row.value.partial,false);assert.equal(row.value.conditionalCandidate,false);assert.equal(row.value.points.at(-1).x,2000);
});

test('a known coarse walking corridor avoids decoding two clipped custom-route windows first',()=>{
 const world='pbz_test',a={x:100,y:100,z:0},b={x:7500,y:100,z:0},cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);let direct=0;
 Object.assign(cache,{world,ready:true,index:{actors:[],extentCm:1000},catalogue:{worlds:{[world]:{}}},states:{gate:false},pages:{window:{planner:{}},corridors:{path:function*(a,b,states){assert.equal(states.gate,false);yield;return[{row:[0,-1,0,100,100,0]},{row:[7,-1,0,7500,100,0]}];}},directJob:function*(a,b,states,options){direct++;assert.equal(states.gate,false);assert.ok(options.boundsUE[2]<10000,'unrelated action seed expanded the walking load');yield;return{complete:true,points:[a,b],meters:74,unknownActors:[],windowBoundsUE:options.boundsUE};},routeJob:function*(){assert.fail('a clipped action rectangle was loaded before the known walking corridor');}}});
 const task=cache.routeCandidate(world,a,b,{localActions:true,motionSeeds:[{x:-50000,y:50000,z:0}]});let row;do{row=task.next();}while(!row.done);
 assert.equal(direct,1);assert.equal(row.value.partial,false);
});

test('a partial walking result inside a mixed coarse corridor retains the action window',()=>{
 const world='pbz_test',start={x:100,y:100,z:0},goal={x:7500,y:100,z:600},cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);let paths=0,direct=0;
 cache.actionHints=()=>[{guid:'climb',from:1,to:2,cost:600}];Object.assign(cache,{world,ready:true,index:{actors:[],extentCm:1000},catalogue:{worlds:{[world]:{}}},states:{gate:false},pages:{window:{planner:{}},corridors:{path:function*(a,b,states,options){paths++;if(!options.actionHints)return null;return[{row:[0,-1,0,100,100,0]},{row:[4,-1,0,4500,100,600],viaAction:'climb',viaEntry:[4400,120,0],viaExit:[4520,120,600]},{row:[7,-1,0,7500,100,600]}];}},directJob:function*(a,b,states,options){direct++;assert.equal(states.gate,false);return{complete:false,points:[a,[500,100,0]],meters:4,windowBoundsUE:options.boundsUE,verticalWindowUE:options.heightBoundsUE};},routeJob:function*(){assert.fail('the mixed action window was replaced with a clipped direct rectangle');}}});
 const task=cache.routeCandidate(world,start,goal,{localActions:true,motionSeeds:[]});let r;do{r=task.next();}while(!r.done);assert.equal(paths,2);assert.equal(direct,1);assert.ok(r.value.partial);assert.ok(cache.localSession.bounds[2]>=8000-.01);
 assert.deepEqual(cache.actionCorridorPads().get('climb'),{entry:[4400,120,0],exit:[4520,120,600]});cache.cancel();assert.equal(cache.actionCorridorPads().size,0);assert.equal(cache.states.gate,false);
});

test('an oversized local action window falls back from direct-only retries to coarse routing',()=>{
 const world='pbz_test',start={x:100,y:100,z:0},goal={x:7500,y:100,z:0},requests=[];
 const planner={},pages={window:{planner},corridors:{*path(){yield;return[{row:[0,-1,0,100,100,0]},{row:[7,-1,0,7500,100,0]}];}},
  *directJob(){throw Error('World tile byte budget exceeded');},
  *routeJob(from,to,states,options={}){requests.push(options);yield;if(options.directOnly)throw Error('World tile byte budget exceeded');return{complete:true,points:[from,to],meters:74,unknownActors:[],windowBoundsUE:[0,-100,8000,200],verticalWindowUE:[-1500,1500]};}};
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 Object.assign(cache,{world,ready:true,index:{actors:[],extentCm:1000},catalogue:{worlds:{[world]:{}}},states:{gate:false},pages});
 const result=drain(cache.routeCandidate(world,start,goal,{localActions:true,motionSeeds:[]}));
 assert.deepEqual(requests.map(row=>!!row.directOnly),[true,true,false]);
 assert.equal(result.partial,false,'a direct tile budget error suppressed the coarse fallback');
 assert.equal(cache.localSession.planner,planner);
});

test('an oversized action rectangle keeps the source component in a bounded sparse window',()=>{
 const world='pbz_test',start={x:100,y:100,z:900},goal={x:8100,y:8100,z:700},requests=[];
 const sourcePlanner={},targetPlanner={},pages={window:{planner:null},corridors:{*path(){return null;}},
  *routeJob(from,to,states,options){
   requests.push(options);assert.equal(states.gate,false);
   if(!options.xyKeys){
    if(options.directOnly)throw Error('World tile byte budget exceeded');
    this.window.planner=targetPlanner;return{complete:false,points:[],reason:'coarse corridor unavailable'};
   }
   assert.ok(options.directOnly&&options.xyKeys.length<=256);
   assert.ok(options.xyKeys.includes('0,-1')&&options.xyKeys.includes('8,-9'));
   assert.ok(!options.xyKeys.includes('0,-9'),'the sparse retry still admits distant corners of the rectangle');
   assert.deepEqual(options.heightBoundsUE,[-800,2400]);
   this.window.planner=sourcePlanner;
   return{complete:false,points:[from,[500,500,850]],meters:5,windowBoundsUE:options.boundsUE,verticalWindowUE:options.heightBoundsUE};
  }};
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 Object.assign(cache,{world,ready:true,index:{actors:[],extentCm:1000},catalogue:{worlds:{[world]:{}}},states:{gate:false},pages});
 const result=drain(cache.routeCandidate(world,start,goal,{localActions:true,motionSeeds:[{x:1300,y:-1900,z:-3400}]}));
 assert.ok(result?.partial,'the action search lost the start window after both rectangular requests exceeded the budget');
 assert.equal(cache.localSession.planner,sourcePlanner);
 assert.equal(requests.length,3);
});

test('a focused height retry includes lower floors under the original bounded window budget',()=>{
 const world='pbz_test',a={x:100,y:100,z:900},b={x:4100,y:4100,z:700},requests=[],cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 Object.assign(cache,{world,ready:true,index:{actors:[],extentCm:1000},catalogue:{worlds:{[world]:{}}},states:{gate:false},pages:{window:{planner:{}},routeJob:function*(from,to,states,options){assert.equal(states.gate,false);requests.push(options);return{complete:false,points:[from,[500,500,850]],meters:5,windowBoundsUE:options.boundsUE,verticalWindowUE:options.heightBoundsUE};}}});
 const drain=task=>{let r;do{r=task.next();}while(!r.done);return r.value;};
 drain(cache.routeCandidate(world,a,b,{localActions:true,motionSeeds:[],focusedWindow:true}));
 drain(cache.routeCandidate(world,a,b,{localActions:true,motionSeeds:[],focusedWindow:true,heightPaddingCm:1500}));
 drain(cache.routeCandidate(world,a,b,{localActions:true,motionSeeds:[],focusedWindow:true,heightPaddingCm:20000}));
 assert.deepEqual(requests.map(r=>r.heightBoundsUE),[[550,1050],[-800,2400],[-800,2400]]);
 assert.deepEqual(requests[0].boundsUE,requests[1].boundsUE);assert.deepEqual(requests[0].xyKeys,requests[1].xyKeys);
 assert.ok(requests.every(r=>r.directOnly&&r.xyKeys.length<=256));assert.equal(cache.states.gate,false);
});
function fixture(index,saved={}){
 let loaded=[],mode=0,now=0,invalidated=0;
 const P={$ref:value=>({value}),$unref:ref=>ref.value};
 const UE={Class:{Load:value=>value},PrimitiveComponent:{StaticClass:()=> 'primitive'},SplineMeshComponent:{StaticClass:()=> 'spline'},
  PBZLevelActorManager:{StaticClass:()=> 'manager'},JsonObjectWrapper:class{},
  JSONUtility:{TryGetBoolField(object,field,value,success){value.value=object[field];success.value=typeof object[field]==='boolean';}},
  GameplayStatics:{GetAllActorsOfClass(pawn,cls,out){out.value=array(loaded.filter(actor=>cls.includes(actor.asset)));}}};
 const manager={GetSaveData(id,out){out.value=saved[id]||{};}};
 const api={UE,P,T:{getWorldSubsystem:()=>manager},alive:x=>!!x};
 return {api,setMode:value=>mode=value,setLoaded:values=>{loaded=values;},
  actor(item){return {asset:item.classAsset,GetName:()=>item.name,K2_GetComponentsByClass:()=>array([
   {GetName:()=>item.components?.[0]||'Fog',GetCollisionEnabled:()=>mode,GetCollisionResponseToChannel:()=>2},
   ...(item.components?.slice(1)||[]).map(name=>({GetName:()=>name,GetCollisionEnabled:()=>mode,GetCollisionResponseToChannel:()=>2}))])};},
  clock:()=>now+=16,invalidate:()=>invalidated++,get invalidated(){return invalidated;}};
}

test('the first-region provider stays independent of optional full-world data and polling',()=>{
 const index=require(mod+'/PBZRecastData/route-001/index'),f=fixture(index);let reads=0;
 const cache=new Providers(id=>require(path.resolve(mod,id)),{...f.api,dataRoot:'/optional-world-data',readText(){reads++;throw Error('Optional world data must remain lazy');}},()=>{},()=>{},f.clock);
 const p={x:-174688.995,y:112340.126,z:-3034.172};
 try{assert.equal(cache.covers(index.world,p,p),true);cache.pump(index.world,{},p);assert.equal(reads,0);assert.equal(cache.worlds.world,undefined);assert.equal(cache.active,cache.regional);}
 finally{cache.cancel();cache.regional.job?.return?.();cache.regional.planner?.destroy();cache.worlds.pages?.destroy();}
});
test('saved flags never override loaded closed or transitional collision',()=>{
 const item={id:'World-Actor',name:'Actor',classAsset:'/test/bp_vine',savedField:'Broken',components:['Vine','Plane']},index={actors:[item]};
 const f=fixture(index,{[item.id]:{Broken:true}});
 assert.equal(States.read({},index,f.api)[item.id],true);
 f.setLoaded([f.actor(item)]);f.setMode(3);assert.equal(States.read({},index,f.api)[item.id],false);
 f.setMode(0);assert.equal(States.read({},index,f.api)[item.id],true);
 f.setMode(99);assert.equal(States.read({},index,f.api)[item.id],undefined);
 assert.equal(States.componentPassable({GetCollisionEnabled:()=>1,GetCollisionResponseToChannel:()=>1},f.api.UE),true);
 assert.equal(States.componentPassable({GetCollisionEnabled:()=>1},f.api.UE),undefined);
});
test('world state polling splits class enumeration and commits a complete pass together',()=>{
 const items=['/test/bridge','/test/door'].map((classAsset,i)=>({id:'condition-'+i,name:'actor-'+i,classAsset}));
 const world='pbz_test',index={actors:items},p={x:0,y:0,z:0},pawn={};
 let frame=0,opens=true,invalidations=0,finds=0;
 const scans=[];
 const api={alive:actor=>!!actor,P:{$ref:value=>({value}),$unref:out=>out.value},UE:{
  Class:{Find:name=>{finds++;return name;},Load:()=>assert.fail('state polling cold-loaded an actor class')},
  GameplayStatics:{GetAllActorsOfClass(pawn,cls,out){
   scans.push(frame);
   out.value=array([{GetName:()=>items[cls.includes('bridge')?0:1].name,GetActorEnableCollision:()=>!opens}]);
  }}
 }};
 const cache=new WorldCache(()=>{},api,()=>{},()=>{invalidations++;},()=>frame*16);
 Object.assign(cache,{world,pawn,ready:true,index,catalogue:{worlds:{[world]:{}}},states:{},pages:{}});
 for(frame=1;frame<32&&!cache.signature;frame++){
  cache.pump(world,pawn,p);
  if(!cache.signature)assert.deepEqual(cache.states,{});
 }
 assert.ok(cache.signature);
 assert.equal(finds,2);
 assert.equal(invalidations,1);
 assert.equal(scans.length,2);
 assert.notEqual(scans[0],scans[1]);
 assert.deepEqual(cache.states,{'condition-0':true,'condition-1':true});
 opens=false;
 for(frame+=35;frame<100&&invalidations===1;frame++)cache.pump(world,pawn,p);
 assert.equal(invalidations,2);
 assert.deepEqual(cache.states,{});
});

test('an unavailable collision class stays closed and can become ready after its stream loads',()=>{
 const item={id:'bridge',name:'Bridge',classAsset:'/test/bridge',savedField:'Opened'};
 const index={actors:[item]},f=fixture(index,{bridge:{Opened:true}}),classes=new Map();
 let resident=false;
 f.api.UE.Class.Find=name=>resident?name:null;
 f.api.UE.Class.Load=()=>assert.fail('cold load in collision state poll');
 assert.deepEqual(States.read({},index,f.api,classes),{});
 assert.equal(classes.size,0);
 resident=true;f.setLoaded([f.actor(item)]);
 assert.deepEqual(States.read({},index,f.api,classes),{bridge:true});
 f.setMode(3);
 assert.deepEqual(States.read({},index,f.api,classes),{bridge:false});
});

test('native flow collision is read from the exact tagged actor without enumerating every mesh actor',()=>{
 const item={id:'World-Deck',name:'Deck',classAsset:'/Script/Engine.StaticMeshActor',nativeActorClass:'StaticMeshActor',actorTag:'movable',
  savedField:null,componentClass:'StaticMeshComponent',components:['Cube']},index={actors:[item]},f=fixture(index);
 const nativeClass={},pawn={};let collision=true,mode=3,loaded=true,missing=false,queries=0;
 const component={GetName:()=> 'Cube',GetCollisionEnabled:()=>mode,GetCollisionResponseToChannel:()=>2};
 Object.assign(f.api.UE,{StaticMeshActor:{StaticClass:()=>nativeClass},StaticMeshComponent:{StaticClass:()=> 'mesh'}});
 f.api.UE.Class.Load=()=>assert.fail('native class was resolved as a Blueprint asset');
 f.api.UE.GameplayStatics={GetAllActorsOfClass(){assert.fail('native bridge requested every static mesh actor');},
  GetAllActorsOfClassWithTag(context,actorClass,tag,out){
   queries++;assert.equal(context,pawn);assert.equal(actorClass,nativeClass);assert.equal(tag,'movable');
   const unrelated={GetName:()=> 'OtherDeck',GetActorEnableCollision:()=>false};
   const deck={GetName:()=>item.name,GetActorEnableCollision:()=>collision,
    K2_GetComponentsByClass(cls){assert.equal(cls,'mesh');return array(missing?[]:[component]);}};
   out.value=array(loaded?[unrelated,deck]:[unrelated]);
  }};
 const read=()=>States.read(pawn,index,f.api)[item.id];
 assert.equal(read(),false,'solid deck collision was not recognized');
 collision=false;assert.equal(read(),true);
 collision=true;mode=0;assert.equal(read(),true);
 missing=true;assert.equal(read(),undefined);
 missing=false;loaded=false;assert.equal(read(),undefined);
 assert.equal(queries,5);
});

test('a stalled host bootstrap reports its phase and terminates instead of waiting forever',()=>{
 let now=0;const events=[],index=require(mod+'/PBZRecastData/route-001/index');
 const core={initialize:()=>new Promise(()=>{})};
 const cache=new RecastCache(id=>id==='./PBZRecastRuntime'?core:index,{},(name,message)=>events.push([name,message]),()=>{},()=>now);
 const p={x:-174522,y:112570,z:-3042},pawn={};
 for(let i=0;i<40&&!cache.error;i++){now+=500;cache.pump(index.world,pawn,p);}
 assert.match(cache.error||'',/initializ.*timed out/i,'neither destination gets a result or a useful failure while bootstrap hangs');
 assert.equal(cache.ready,false);assert.ok(events.some(([name,text])=>name==='recast unavailable'&&text.includes('initialize')));
});

test('an unknown nearby fog gate requests a scene-checked complete candidate instead of the wrong partial branch',async()=>{
 const index=require(mod+'/PBZRecastData/route-001/index'),saved={};for(const item of index.actors)saved[item.id]={[item.savedField]:true};
 const gate=index.actors.find(item=>item.name.endsWith('1366641873'));delete saved[gate.id];
 const f=fixture(index,saved),cache=new RecastCache(id=>require(path.resolve(mod,id)),f.api,()=>{},()=>{},f.clock),pawn={};
 const start={x:-174688.995,y:112340.126,z:-3034.172},goal={x:-187916,y:114639,z:-1057};
 const drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
 try{
  for(let i=0;i<5000&&!(cache.ready&&cache.revision>=3);i++){cache.pump(index.world,pawn,start);if(cache.error)throw Error(cache.error);await new Promise(setImmediate);}
  assert.equal(cache.unknownActors.length,1);
  const leg=drain(cache.route(index.world,start,goal));
  assert.equal(leg?.conditionalCandidate,true,'closed-state partial path was offered without considering the locally open but unknown gate');
  assert.equal(leg.topologyComplete,true);assert.equal(leg.partial,true,'scene verification must still gate this candidate');
  let walked=0,a=leg.points[0],forward=a;
  for(const p of leg.points.slice(1)){walked+=Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z);forward=p;a=p;if(walked>=1000)break;}
  assert.ok(forward.y-start.y>700&&Math.abs(forward.x-start.x)<500,'initial guidance did not head toward the actual northern stair approach');
  assert.equal(cache.states[gate.id],undefined,'an unknown gate became permanently open');
  assert.equal(cache.planner.route(Object.values(start),Object.values(goal)).complete,false,'hypothetical tile state leaked into the authoritative graph');
  const replace=cache.planner.replaceTile;let swaps=0;
  cache.planner.replaceTile=function(...args){swaps++;return replace.apply(this,args);};
  const cancelled=cache.route(index.world,start,goal);for(let i=0;i<1000&&!swaps;i++)cancelled.next();
  assert.ok(swaps>0,'cancellation control never reached the temporary tile state');cancelled.return();
  cache.planner.replaceTile=replace;
  assert.equal(cache.planner.route(Object.values(start),Object.values(goal)).complete,false,'cancellation retained open hypothetical tiles');
  assert.equal(cache.queryJobs.size,0);assert.equal(cache.planner.jobs.size,0);
  const revision=cache.revision;f.setLoaded([f.actor(gate)]);f.setMode(3);
  for(let i=0;i<5000&&!(cache.ready&&cache.revision>revision);i++){cache.pump(index.world,pawn,start);await new Promise(setImmediate);}
  assert.equal(cache.states[gate.id],false,'unknown-to-closed certainty change was lost because its tile variant stayed closed');
  const closed=drain(cache.route(index.world,start,goal));assert.equal(closed.conditionalCandidate,false,'a known closed gate was relaxed');
 }finally{cache.planner?.destroy();}
});
test('real packaged regional tiles switch doors, cancel old corridors and restore a complete route',{
 skip:!fs.existsSync(mod+'/PBZRecastData/route-001/index.js')
},async()=>{
 const index=require(mod+'/PBZRecastData/route-001/index'),saved={};
 for(const item of index.actors)if(item.savedField)saved[item.id]={[item.savedField]:true};
 const door=index.actors.find(item=>item.name.endsWith('1366641873')),f=fixture(index,saved);delete saved[door.id];f.setLoaded([f.actor(door)]);
 const cache=new RecastCache(id=>require(path.resolve(mod,id)),f.api,()=>{},f.invalidate,f.clock),a={x:-174688.995,y:112340.126,z:-3034.172},b={x:-187916,y:114639,z:-1057};
 const pawn={};
 const until=async predicate=>{for(let i=0;i<5000;i++){cache.pump(index.world,pawn,a);if(cache.error)throw Error(cache.error);if(predicate())return;await new Promise(setImmediate);}throw Error('Recast warm/state update stalled');};
 const drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
 try{
  await until(()=>cache.ready&&cache.revision>=3);
  assert.equal(drain(cache.route(index.world,a,b)).partial,false);
  const pending=cache.planner.routeJob(Object.values(a),Object.values(b));pending.next();
  const revision=cache.revision;f.setMode(3);await until(()=>cache.ready&&cache.revision>revision);
  assert.ok(f.invalidated);assert.equal(pending.next().done,true);assert.equal(drain(cache.route(index.world,a,b)).partial,true);
  const closed=cache.revision;f.setMode(0);await until(()=>cache.ready&&cache.revision>closed);assert.equal(drain(cache.route(index.world,a,b)).partial,false);
  const beforeTravel=cache.revision;cache.pump('another_world',pawn,a);assert.equal(cache.ready,false);
  await until(()=>cache.ready&&cache.revision>=beforeTravel+4);assert.equal(drain(cache.route(index.world,a,b)).partial,false);
 }finally{cache.planner?.destroy();}
});

test('captured selections and the finish approach work when the game forbids WASM code generation',async()=>{
 const index=require(mod+'/PBZRecastData/route-001/index'),saved={};for(const item of index.actors)saved[item.id]={[item.savedField]:true};
 const f=fixture(index,saved),door=index.actors.find(item=>item.name.endsWith('1366641873'));delete saved[door.id];f.setLoaded([f.actor(door)]);
 const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
 vm.runInContext(fs.readFileSync(process.env.PBZ_TEST_RECAST_BUNDLE||path.join(root,'build/offline-navigation/runtime/PBZRecastRuntime.js'),'utf8'),context);
 const core=context.module.exports,cache=new RecastCache(id=>id==='./PBZRecastRuntime'?core:require(path.resolve(mod,id)),f.api,()=>{},()=>{},f.clock);
 const field=require('./fixtures/recast-190-selections-20261115.json'),pawn={},a=field.origin;
 try{
  for(let i=0;i<5000&&!(cache.ready&&cache.revision>=3);i++){cache.pump(index.world,pawn,a);if(cache.error)throw Error(cache.error);await new Promise(setImmediate);}
  assert.equal(cache.ready,true,'captured selections never reach a usable regional planner');
  for(const {bell:name,p:b}of field.destinations){
   const job=cache.route(index.world,a,b);let row;do{row=job.next();}while(!row.done);
   assert.ok(row.value,'no route candidate for '+name);assert.equal(row.value.partial,false,name+' did not reach the selected endpoint');
  }
  const latest=require('./fixtures/recast-191-codegen-20261115.json'),near=latest.nearFinishOrigin,goal=latest.target,revision=cache.revision;f.setMode(3);
  for(let i=0;i<5000&&!(cache.ready&&cache.revision>revision);i++){cache.pump(index.world,pawn,near);if(cache.error)throw Error(cache.error);await new Promise(setImmediate);}
  const task=cache.route(index.world,near,goal);let result;do{result=task.next();}while(!result.done);
  assert.ok(result.value&&!result.value.partial,'the captured finish approach still produces no route with a distant closed door');
 }finally{cache.planner?.destroy();}
});
