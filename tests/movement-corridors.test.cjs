'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),mod=path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const drain=job=>{let result;do{result=job.next();}while(!result.done);return result.value;};
test('coarse action windows query only visited directed movement adjacency without opening walking geometry',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs'),states={gate:false},graph=[[0,0,0,0,0,500,[1]],[1,0,0,100,0,500,[]],[2,0,0,200,0,0,[3]],[3,0,0,300,0,0,[]]],owner={manifest:{corridors:{nodes:4}}},corridor=new WorldCorridors(owner),queries=[];
 corridor.anchors=function*(point){return[{id:point[0]===0?0:3,point,cost:0}];};
 corridor.node=function*(id){return graph[id];};
 const actionSource={*fromJob(id){queries.push(id);yield;return id===1?[{guid:'fall',from:1,to:2,cost:510,entry:[100,0,500],exit:[200,0,0]}]:[];}};
 const result=drain(corridor.path([0,0,500],[300,0,0],states,{actionSource}));
 assert.ok(result,'a movement adjacency source did not bridge two walking components');
 assert.deepEqual(result.map(row=>row.id),[0,1,2,3]);assert.equal(result[2].viaAction,'fall');assert.deepEqual(queries,[0,1,2]);
 assert.equal(drain(corridor.path([300,0,0],[0,0,500],states,{actionSource})),null);
 assert.equal(states.gate,false);assert.deepEqual(graph[1][6],[]);
});
test('a coarse movement corridor can test only the resident tile footprint',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs'),graph=[[0,0,0,0,0,0,[1]],[1,0,0,100,0,0,[2]],[2,0,0,200,0,0,[]]],corridor=new WorldCorridors({manifest:{corridors:{nodes:3}}});
 corridor.anchors=function*(point){return[{id:point[0]/100,point,cost:0}];};corridor.node=function*(id){return graph[id];};
 assert.equal(drain(corridor.path([0,0,0],[200,0,0],{},{tileKeys:new Set(['0,0,0','2,0,0'])})),null,'a resident-only query crossed an unloaded tile');
 assert.ok(drain(corridor.path([0,0,0],[200,0,0],{},{tileKeys:new Set(['0,0,0','1,0,0','2,0,0'])})));
 const attempted=[];
 corridor.node=function*(id){attempted.push(id);return graph[id];};
 assert.equal(drain(corridor.path([0,0,0],[200,0,0],{},{componentIDs:new Set([0,2])})),null);
 assert.ok(!attempted.includes(1),'a pruned component still caused a page lookup');
});
test('a conditional native action is omitted from coarse search until its prerequisite is passable',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs');
 const corridor=new WorldCorridors({manifest:{corridors:{nodes:2}}});
 const upper=[0,0,500],lower=[500,0,0];
 corridor.anchors=function*(point){return[{id:point===upper?0:1,point,cost:0}];};
 corridor.node=function*(id){return[id,0,0,0,0,0,[]];};
 const options={actionHints:[{guid:'slide-relay',from:0,to:1,entry:upper,exit:lower,cost:800,requiresPassable:'gate'}]};
 for(const states of [{},{gate:false}])assert.equal(drain(corridor.path(upper,lower,states,options)),null);
 assert.equal(drain(corridor.path(upper,lower,{gate:true},options)).at(-1).viaAction,'slide-relay');
 assert.equal(drain(corridor.path(lower,upper,{gate:true},options)),null);
});
test('a closed slide gate offers its reachable front only when the open tail uses the relay',()=>{
 const {WorldCache}=require(path.join(mod,'PBZRouteRecastProvider')),world='pbz_zhengdaodaying_wp';
 const relay=require(path.join(mod,'PBZRouteSlideRelay')).forWorld(world);
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0),start={x:0,y:0,z:100},goal={x:14000,y:0,z:-300},approach=[6000,0,0];
 const states={[relay.gate]:false};
 let front=true,tail=true;
 Object.assign(cache,{world,ready:true,states,index:{actors:[]},pages:{corridors:{*path(a,b,current){
  if(b===approach){assert.equal(current,states);return front?[{id:1}]:null;}
  assert.equal(a,approach);assert.equal(current[relay.gate],true);
  return tail?[{id:2,viaAction:relay.guid}]:[{id:2}];
 }}}});
 cache.actionHints=()=>[{guid:relay.guid,requiresPassable:relay.gate,gateApproach:approach}];
 assert.deepEqual(drain(cache.pendingSlideGate(world,start,goal)),{p:{x:6000,y:0,z:0},gate:relay.gate,closed:true});
 assert.equal(states[relay.gate],false);
 tail=false;
 assert.equal(drain(cache.pendingSlideGate(world,start,goal)),null);
 front=false;tail=true;
 assert.equal(drain(cache.pendingSlideGate(world,start,goal)),null);
 states[relay.gate]=true;front=true;
 assert.equal(drain(cache.pendingSlideGate(world,start,goal)),null);
});
test('a launch-volume hint keeps the original actor direction when its row is reversed',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs');
 const corridor=new WorldCorridors({manifest:{corridors:{nodes:2}}});
 const a=[0,0,0],b=[500,0,100],guid='native-wallrun';
 corridor.anchors=function*(point){return [{id:point===a?0:1,point,cost:0}];};
 corridor.node=function*(id){return [id,0,0,...(id===0?a:b),[]];};
 const actionHints=[{guid,from:1,to:0,entry:b,exit:a,cost:550,both:false,reverse:true}];
 const rows=drain(corridor.path(b,a,{}, {actionHints,excludedActions:new Map([[guid,1]])}));
 assert.equal(rows?.at(-1)?.viaReverse,true);
 assert.deepEqual(rows.at(-1).viaEntry,b);
 assert.equal(drain(corridor.path(b,a,{}, {actionHints,excludedActions:new Map([[guid,2]])})),null);
 assert.equal(drain(corridor.path(a,b,{}, {actionHints})),null);
});
test('the production provider expands a disconnected resident window through sparse movement adjacency',()=>{
 const {WorldCache}=require(path.join(mod,'PBZRouteRecastProvider')),world='pbz_test',start={x:0,y:0,z:500},goal={x:8000,y:0,z:0},cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0),actionSource={*fromJob(){return[];}};
 cache.actionHints=()=>[];cache.movementCorridors=()=>actionSource;
 Object.assign(cache,{world,ready:true,index:{sourceIndexSHA256:'a'.repeat(64),actors:[],extentCm:1000},catalogue:{worlds:{[world]:{}}},states:{gate:false},pages:{window:{planner:{},loaded:new Map([['0,0,0',{x:0,y:0,layer:0}]])},corridors:{*path(first,last,states,options){if(!options.actionSource||options.tileKeys)return null;assert.equal(options.actionSource,actionSource);return[{row:[0,0,0,0,0,500]},{row:[4,0,0,4000,0,0],viaAction:'geometry-fall',viaEntry:[3900,0,500],viaExit:[4100,0,0]},{row:[8,0,0,8000,0,0]}];}},*directJob(first,last,states,options){assert.equal(states.gate,false);return{complete:false,points:[first,[100,0,500]],meters:1,windowBoundsUE:options.boundsUE,verticalWindowUE:options.heightBoundsUE};},*routeJob(){assert.fail('movement corridor was replaced with a clipped rectangle');}}});
 cache.actionWindowRoute=function*(){return{complete:false,points:[[0,0,500],[100,0,500]],meters:1};};
 const result=drain(cache.routeCandidate(world,start,goal,{localActions:true}));assert.ok(result.partial);assert.deepEqual(cache.actionCorridorPads().get('geometry-fall'),{entry:[3900,0,500],exit:[4100,0,0]});
});
test('a resident movement chain preserves the existing window and cancellation restores endpoint probes',()=>{
 const {WorldCache}=require(path.join(mod,'PBZRouteRecastProvider')),cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0),saved={planner:'original'},tiles=['tiles'],blobs={original:true};let restored=0,queries=0;
 const window={loaded:new Map([['0,0,0',{x:0,y:0,layer:0}]]),holdWindow:()=>saved,restoreWindow:snapshot=>{assert.equal(snapshot,saved);restored++;}},index={tiles,blobs},pages={window,index,corridors:{*path(first,last,states,options){assert.ok(options.tileKeys);queries++;index.tiles=['temporary'];yield;return[{row:[0,0,0,0,0,0]}];}},*directJob(){assert.fail('a complete resident candidate window was replaced');}};
 cache.pages=pages;cache.movementCorridors=()=>({*fromJob(){return[];}});cache.actionHints=()=>[];
 assert.equal(drain(cache.movementWindowRoute('pbz_test',{x:0,y:0,z:0},{x:100,y:0,z:0})),null);
 assert.equal(queries,1);assert.equal(restored,1);assert.equal(index.tiles,tiles);assert.equal(index.blobs,blobs);
 const task=cache.movementWindowRoute('pbz_test',{x:0,y:0,z:0},{x:100,y:0,z:0});task.next();task.return();
 assert.equal(restored,2);assert.equal(index.tiles,tiles);assert.equal(index.blobs,blobs);
});
for(const withMovementPages of [true,false])test('a nearby placed action retains its standing pads in a resident window, movement pages: '+withMovementPages,async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs');
 const {WorldCache}=require(path.join(mod,'PBZRouteRecastProvider'));
 const world='pbz_test',start={x:0,y:0,z:0},goal={x:1200,y:0,z:400},guid='PlacedLadder';
 const first=[start.x,start.y,start.z],last=[goal.x,goal.y,goal.z];
 const graph=[[0,0,0,...first,[]],[0,0,1,...last,[]]];
 const corridor=new WorldCorridors({manifest:{corridors:{nodes:2}}});
 corridor.anchors=function*(point){return [{id:point[2]===0?0:1,point,cost:0}];};
 corridor.node=function*(id){return graph[id];};
 const planner={},window={planner,loaded:new Map([[0,{coarseSeeds:[[0,...first]]}],[1,{coarseSeeds:[[1,...last]]}]])};
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 Object.assign(cache,{world,ready:true,states:{},catalogue:{worlds:{[world]:{}}},index:{actors:[]},
  pages:{window,corridors:corridor,*directJob(){assert.fail('resident window was replaced');}}});
 cache.actionWindowRoute=function*(){return {complete:false,points:[first,[100,0,0]],meters:1};};
 cache.actionHints=()=>[{guid,from:0,to:1,both:true,cost:800,entry:[550,0,0],exit:[550,0,400]}];
 cache.movementCorridors=()=>withMovementPages?{*fromJob(){return[];}}:null;
 const leg=drain(cache.route(world,start,goal,{localActions:true}));
 assert.equal(leg.partial,true);
 assert.equal(cache.localSession.planner,planner);
 assert.deepEqual(cache.actionCorridorActions(),[guid]);
 assert.deepEqual(cache.actionCorridorPads().get(guid.toLowerCase()),{entry:[550,0,0],exit:[550,0,400]});
 assert.equal(cache.actionCorridorDirections().get(guid.toLowerCase()),1);
});
test('reversed corridor actions publish pads in the source feature order',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs'),{WorldCache}=require(path.join(mod,'PBZRouteRecastProvider'));
 const corridor=new WorldCorridors({manifest:{corridors:{nodes:3}}});
 corridor.anchors=function*(point){return[{id:point[0]/100,point,cost:0}];};
 corridor.node=function*(id){return[id,0,0,id*100,0,0,[]];};
 const placement={guid:'lift',from:1,to:0,both:true,entry:[100,0,0],exit:[0,0,0],cost:100};
 const actionSource={*fromJob(id){return id===1?[{guid:'surface',from:1,to:2,entry:[100,0,0],exit:[200,0,0],cost:100,reverse:true}]:[];}};
 const rows=drain(corridor.path([0,0,0],[200,0,0],{},{actionHints:[placement],actionSource}));
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);cache.pages={*directJob(){return{complete:false};}};cache.index={extentCm:100};
 drain(cache.corridorWindowRoute('pbz_test',{x:0,y:0,z:0},{x:200,y:0,z:0},rows));
 assert.deepEqual(cache.actionCorridorPads().get('lift'),{entry:[100,0,0],exit:[0,0,0]});
 assert.deepEqual(cache.actionCorridorPads().get('surface'),{entry:[200,0,0],exit:[100,0,0]});
 assert.deepEqual([...cache.actionCorridorDirections()],[['lift',2],['surface',2]]);
});
test('a rejected downhill hint can select another footprint without excluding its uphill direction',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs');
 const corridor=new WorldCorridors({manifest:{corridors:{nodes:3}}});
 const points=[[0,0,500],[100,0,400],[200,0,0]];
 corridor.anchors=function*(point){return[{id:points.indexOf(point),point,cost:0}];};
 corridor.node=function*(id){return[id,0,0,...points[id],id===1?[2]:[]];};
 const edge=(guid,from,to,reverse)=>({guid,from,to,reverse,entry:points[from],exit:points[to],cost:1});
 const actionSource={*fromJob(id){return [
  [edge('slope',0,2,true),edge('alternate',0,1,false)],
  [],
  [edge('slope',2,0,false)]
 ][id];}};
 const excludedActions=new Map([['slope',2]]);
 assert.deepEqual(drain(corridor.path(points[0],points[2],{},{actionSource,excludedActions})).map(row=>row.id),[0,1,2]);
 const reverse=drain(corridor.path(points[2],points[0],{},{actionSource,excludedActions}));
 assert.equal(reverse.at(-1).viaAction,'slope');
 const repeated=drain(corridor.path(points[0],points[2],{},{actionSource}));
 assert.equal(repeated.at(-1).viaAction,'slope','an exclusion escaped into a separate planning request');
});
test('an unavailable native placement selects a sparse alternative without movement pages',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs'),{WorldCache}=require(path.join(mod,'PBZRouteRecastProvider'));
 const world='pbz_test',start={x:0,y:0,z:0},goal={x:8000,y:0,z:500},states={gate:false},planner={},loads=[];
 const corridor=new WorldCorridors({manifest:{corridors:{nodes:3}}}),
  graph=[[0,0,0,0,0,0,[]],[4,0,0,4000,100,500,[2]],[8,0,0,8000,0,500,[]]];
 corridor.anchors=function*(point){return[{id:point[0]===0?0:2,point,cost:0}];};
 corridor.node=function*(id){return graph[id];};
 const cache=new WorldCache(()=>{}, {},()=>{},()=>{},()=>0);
 Object.assign(cache,{world,ready:true,index:{extentCm:1000},states,localSession:{world,planner},pages:{
  window:{planner},corridors:corridor,*directJob(a,b,current,options){
   assert.equal(current,states);loads.push(options.tileKeys);return{complete:false,points:[a],meters:0,windowBoundsUE:options.boundsUE};
  }
 }});
 cache.actionHints=()=>[{guid:'Lift',from:0,to:2,both:true,cost:8000},{guid:'Climb',from:0,to:1,cost:4000}];
 const original=drain(corridor.path([0,0,0],[8000,0,500],states,{actionHints:cache.actionHints()}));
 assert.deepEqual(original.map(row=>row.id),[0,2]);
 const alternate=drain(cache.routeAlternateMovement(world,start,goal,new Map([['lift',3]])));
 assert.ok(alternate);
 assert.deepEqual(loads,[['0,0,0','4,0,0','8,0,0']]);
 assert.deepEqual(cache.actionCorridorActions(),['Climb']);
 assert.deepEqual(states,{gate:false});
 drain(cache.corridorWindowRoute(world,start,goal,[{row:graph[0]},{row:graph[2]}]));
 assert.deepEqual(cache.actionCorridorActions(),[]);
 assert.equal(cache.actionCorridorPads().size,0);
 assert.equal(cache.actionCorridorDirections(),null);
});
test('movement corridor storage preserves source direction and millimetre coordinates with bounded plain JS paging',()=>{
 const folder=fs.mkdtempSync(path.join(root,'build','movement-corridor-test-')),world='pbz_test',identity='a'.repeat(64),mappingFile=path.join(folder,'mapping.json'),indexFile=path.join(folder,'navigation.json'),output=path.join(folder,'packed');
 const edges=Array.from({length:1600},(_,offset)=>{const entry=[offset*100+.123,-20.234,500.345],exit=[offset*100+70.456,-30.567,50.678];return{from:offset*2,to:offset*2+1,entry,exit,kind:'fall',reverse:false,guid:'recast-movement:'+entry.map(Math.round).join(',')+'>'+exit.map(Math.round).join(','),cost:Math.hypot(...entry.map((value,axis)=>value-exit[axis]))};});
 edges.push({from:3200,to:3201,entry:[100,200,10],exit:[110,200,0],kind:'surface',reverse:true,guid:'recast-movement:110,200,0>100,200,10',cost:Math.sqrt(200)});
 fs.writeFileSync(mappingFile,JSON.stringify({schema:1,world,sourceIndexSHA256:identity,sourceGridIndexSHA256:identity,navigationGrid:null,movementManifestSHA256:'b'.repeat(64),edges}));fs.writeFileSync(indexFile,JSON.stringify({world,sourceIndexSHA256:identity,corridors:{nodes:3202}}));
 execFileSync('py',['-3.12','tools/pack-movement-corridors.py',mappingFile,indexFile,output],{cwd:root,stdio:'pipe'});
 const manifest=JSON.parse(fs.readFileSync(path.join(output,'index.json'),'utf8')),context=vm.createContext({module:{exports:{}},WebAssembly:undefined},{codeGeneration:{strings:false,wasm:false}});vm.runInContext(fs.readFileSync(path.join(mod,'PBZRecastRuntime.js'),'utf8'),context);
 const {Reader}=require(path.join(mod,'PBZRouteMovementCorridors')),reads=[],reader=new Reader(manifest,file=>{reads.push(file);return fs.readFileSync(path.join(output,file),'utf8');},context.module.exports);
 assert.deepEqual(drain(reader.fromJob(0)),[edges[0]]);assert.deepEqual(drain(reader.fromJob(1)),[]);
 assert.deepEqual(drain(reader.fromJob(3200)),[edges.at(-1)]);assert.ok(reads.length<10);
 for(const offset of [100,400,700,1000,1300,1599])assert.deepEqual(drain(reader.fromJob(offset*2)),[edges[offset]]);
 assert.ok(reader.pages.size<=8);assert.ok(reader.store.containers.size<=2);assert.ok(reader.store.directories.size<=4);
 reader.clear();assert.equal(reader.pages.size,0);assert.equal(reader.store.containers.size,0);
 const broken=new Reader(manifest,file=>file.startsWith('packs/')?'corrupt':fs.readFileSync(path.join(output,file),'utf8'),context.module.exports);
 assert.throws(()=>drain(broken.fromJob(0)),/Packed container identity/);
 const {WorldCache}=require(path.join(mod,'PBZRouteRecastProvider')),cache=new WorldCache(()=>context.module.exports,{dataRoot:'/navigation',movementCorridorsRoot:folder,readText:file=>file.endsWith('/index.json')?JSON.stringify(manifest):fs.readFileSync(path.join(output,file.slice(file.lastIndexOf(world+'/')+world.length+1)),'utf8')},()=>{},()=>{},()=>0);
 cache.index={sourceIndexSHA256:identity};cache.pages={currentID:null};assert.ok(cache.movementCorridors(world));
 cache.index={sourceIndexSHA256:'c'.repeat(64)};assert.equal(cache.movementCorridors(world),null,'a different navigation build reused coarse movement adjacency');
 cache.index={sourceIndexSHA256:identity};manifest.navigationGrid='normal';cache.pages={currentID:'oversized'};
 assert.equal(cache.movementCorridors(world),null,'normal-grid component IDs entered an oversized-grid query');
});
