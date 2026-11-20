'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const drain=job=>{let r;do{r=job.next();}while(!r.done);return r.value;};
test('expanding a window reuses matching resident tiles without rereading compressed packets',async()=>{
 const {WorldWindow}=await import('../offline-navigation/world-window.mjs'),world=Object.create(WorldWindow.prototype),bytes=new Uint8Array(100000),v=new DataView(bytes.buffer),row={x:-2,y:3,layer:1,blob:'same',slot:8};
 v.setUint32(0,0x444e4156,true);v.setUint32(4,7,true);v.setInt32(8,-2,true);v.setInt32(12,3,true);v.setInt32(16,1,true);v.setInt32(24,1,true);bytes[50000]=77;
 let reads=0;Object.assign(world,{loaded:new Map([['-2,3,1',row]]),planner:{tileBuffers:new Map([[8,{size:bytes.length,getHeapView:()=>bytes}]])},index:{blobs:{same:{bytes:bytes.length,polygons:1},changed:{bytes:bytes.length,polygons:1}}},readBlobJob:function*(){reads++;yield;return bytes;}});
 const task=world._bytesJob({...row,slot:0});let r,steps=0;do{r=task.next();steps++;}while(!r.done);assert.equal(reads,0);assert.ok(steps>4);assert.equal(r.value[50000],77);r.value[50000]=3;assert.equal(bytes[50000],77,'staging changed the old authoritative tile');
 drain(world._bytesJob({...row,blob:'changed'}));assert.equal(reads,1,'a changed gate variant reused stale resident geometry');
 const cancelled=world._bytesJob(row);cancelled.next();cancelled.return();assert.equal(bytes[50000],77);
});
test('direct-only budget failure cannot silently replace the action window with a coarse query',async()=>{
 const {PagedWorld}=await import('../offline-navigation/world-pages.mjs');const owner={directJob:function*(){throw Error('World tile byte budget exceeded');},corridors:{routeJob:function*(){assert.fail('coarse fallback ran inside direct-only query');}}};
 assert.throws(()=>drain(PagedWorld.prototype._routeJob.call(owner,[0,0,0],[1,1,1],{}, {directOnly:true})),/byte budget/);
});

test('a valid coarse corridor shortens a clipped partial segment before abandoning the chain',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs'),seen=[],states={gate:false},owner={window:{maxTiles:256},directJob:function*(a,b,current){
  assert.equal(current,states);seen.push([a[0],b[0]]);yield;const complete=b[0]-a[0]<=100,goal=complete?b:[a[0]+50,0,0];return{complete,partial:!complete,reason:complete?'complete':'disconnected',points:[a,goal],corners:[a,goal]};
 }};
 const corridor=new WorldCorridors(owner);corridor.path=function*(){yield;return[0,100,200].map((x,id)=>({id,row:[id,0,0,x,0,0,[]]}));};
 const r=drain(corridor.routeJob([0,0,0],[300,0,0],states));
 assert.equal(r.complete,true,'the first clipped rectangle discarded a real coarse chain');assert.equal(r.points.at(-1)[0],300);assert.ok(seen.some(([a,b])=>b-a>100));assert.ok(seen.some(([a,b])=>b-a===100));
});

test('coarse endpoint anchoring imports only layers near the actual projection height',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs'),point=[500,500,10000],seen=[];
 const owner={manifest:{extentCm:1000},metadataJob:function*(bounds,vertical){seen.push(vertical);yield;return{tiles:[]};}};
 const corridor=new WorldCorridors(owner);corridor.exactAnchor=function*(p,states,bounds,vertical){assert.deepEqual(vertical,[9800,10200]);yield;return{id:1,point:p,cost:0};};
 assert.equal(drain(corridor.anchors(point,{})).length,1);assert.deepEqual(seen,[[9800,10200]],'an endpoint imported unrelated floors within a 400m vertical range');
});

test('a coarse tile footprint excludes unrelated dense layers inside its bounding rectangle',async()=>{
 const {PagedWorld}=await import('../offline-navigation/world-pages.mjs'),page={schema:1,world:'test',id:0,tiles:[0,1,2].map(layer=>({x:0,y:0,layer,verticalBoundsUE:[0,100],variants:{'':'blob'+layer}})),blobs:{blob0:{},blob1:{},blob2:{}}},text=JSON.stringify(page),owner=Object.create(PagedWorld.prototype);
 Object.assign(owner,{manifest:{world:'test',extentCm:100,pages:[{id:0,boundsUE:[0,-100,100,0],verticalBoundsUE:[0,100],characters:text.length}]},pages:new Map(),maxPages:1,window:{maxTiles:1},textJob:function*(){yield;return text;}});
 const selected=drain(owner.metadataJob([0,-100,100,0],[0,100],new Set(['0,0,1'])));
 assert.deepEqual(selected.tiles.map(t=>t.layer),[1]);assert.deepEqual(Object.keys(selected.blobs),['blob1']);
 assert.throws(()=>drain(owner.metadataJob([0,-100,100,0],[0,100])),/budget/,'the sparse footprint enlarged the ordinary window budget');
});

test('placed action hints select component windows without opening authoritative walking links or reversing an ascent',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs'),states={gate:false},owner={manifest:{corridors:{nodes:4}}},graph=[[0,0,0,0,0,0,[1]],[1,0,0,100,0,0,[]],[2,0,0,200,0,600,[3]],[3,0,0,300,0,600,[]]],corridor=new WorldCorridors(owner);
 corridor.anchors=function*(point,current){assert.equal(current,states);return[{id:point[0]===0?0:3,point,cost:0}];};corridor.node=function*(id){return graph[id];};
 const hints=[{guid:'real-climb',from:1,to:2,both:false,cost:700,entry:[120,10,0],exit:[210,10,600]}];
 assert.equal(drain(corridor.path([0,0,0],[300,0,600],states,{})),null);
 const candidate=drain(corridor.path([0,0,0],[300,0,600],states,{actionHints:hints}));assert.ok(candidate);assert.deepEqual(candidate.map(r=>r.id),[0,1,2,3]);assert.equal(candidate[2].viaAction,'real-climb');assert.equal(states.gate,false);assert.deepEqual(graph[1][6],[],'a planning hint mutated walking adjacency');
 assert.equal(drain(corridor.path([300,0,600],[0,0,0],states,{actionHints:hints})),null);
 assert.deepEqual(candidate[2].viaEntry,[120,10,0]);assert.deepEqual(candidate[2].viaExit,[210,10,600]);
});

test('a compressed tile span inflates only its containing 32KiB records and reuses them within the old cache bound',async()=>{
 const {PagedWorld}=await import('../offline-navigation/world-pages.mjs'),world=Object.create(PagedWorld.prototype),raw=Uint8Array.from({length:196608},(_,i)=>i%251),reads=[];
 Object.assign(world,{manifest:{blobLayout:'packets-v1',packetCount:1,lastPacketBytes:raw.length,chunkBytes:196608},packed:{layout:{blockBytes:32768},bytesJob:function*(){assert.fail('the entire 192KiB packet was inflated for a 1000-byte tile span');},recordJob:function*(id){reads.push(id);yield;return raw.slice(id*32768,(id+1)*32768);}},packetCache:new Map(),maxPackets:4,blobCache:new Map(),blobCacheBytes:0,maxCachedBytes:0});
 const result=drain(world.blobJob('a'.repeat(64),{bytes:1000,parts:[[0,40000,1000]]}));assert.deepEqual(Array.from(result),Array.from(raw.slice(40000,41000)));assert.deepEqual(reads,[1]);
 const next=drain(world.blobJob('b'.repeat(64),{bytes:1000,parts:[[0,41000,1000]]}));assert.deepEqual(Array.from(next),Array.from(raw.slice(41000,42000)));assert.deepEqual(reads,[1]);assert.ok(world.packetCache.size<=4);
 for(const offset of [0,32000,65000,98000,130000,163000])drain(world.blobJob('c'.repeat(64),{bytes:1000,parts:[[0,offset,1000]]}));assert.ok(world.packetCache.size<=4);assert.ok([...world.packetCache.values()].every(r=>r.length<=32768));
 assert.throws(()=>drain(world.blobJob('d'.repeat(64),{bytes:1000,parts:[[0,196000,1000]]})),/span exceeds/);
});

test('walking and mixed coarse retries reuse exact endpoint anchors until authoritative states change',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs'),owner={manifest:{corridors:{nodes:2},actors:[{id:'gate'}]}},corridor=new WorldCorridors(owner),states={gate:false};let anchors=0;
 corridor.anchors=function*(p){anchors++;yield;return[{id:p[0]?1:0,point:p,cost:0}];};corridor.node=function*(id){return[id,0,0,id*100,0,0,[]];};
 assert.equal(drain(corridor.path([0,0,0],[100,0,0],states,{})),null);const hints=[{guid:'ascent',from:0,to:1,cost:100,both:false}];assert.ok(drain(corridor.path([0,0,0],[100,0,0],states,{actionHints:hints})));assert.equal(anchors,2,'the mixed retry reimported both dense endpoint tiles');
 states.gate=true;drain(corridor.path([0,0,0],[100,0,0],states,{}));assert.equal(anchors,4,'changed gate states reused an anchor from a different authoritative graph');
});

test('a focused action window imports the actual segment bands while retaining the broad query as a separate retry',async()=>{
 const {PagedWorld}=await import('../offline-navigation/world-pages.mjs'),page={schema:1,world:'test',id:0,tiles:[{x:0,y:0,layer:0},{x:1,y:1,layer:0}].map((t,i)=>({...t,verticalBoundsUE:[0,100],variants:{'':'blob'+i}})),blobs:{blob0:{},blob1:{}}},text=JSON.stringify(page),owner=Object.create(PagedWorld.prototype);
 Object.assign(owner,{manifest:{world:'test',extentCm:100,pages:[{id:0,boundsUE:[0,-200,200,0],verticalBoundsUE:[0,100],characters:text.length}]},pages:new Map(),maxPages:1,window:{maxTiles:2},textJob:function*(){return text;}});
 const chosen=drain(owner.metadataJob([0,-200,200,0],[0,100],null,new Set(['0,0'])));assert.deepEqual(chosen.tiles.map(t=>[t.x,t.y]),[[0,0]],'focused stage decoded an unrelated rectangle corner');const broad=drain(owner.metadataJob([0,-200,200,0],[0,100]));assert.equal(broad.tiles.length,2);
});


test('neighboring endpoint trials reuse the common side without reusing an arrival as a departure',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs'),corridor=new WorldCorridors({manifest:{corridors:{nodes:3}}});
 const a=[0,0,0],b=[100,0,0],c=[200,0,0],states={gate:false},calls=[];
 corridor.anchors=function*(p,current,goal){calls.push([p[0],goal,!!current.gate]);yield;return[{id:p[0]/100,point:p,cost:0}];};
 corridor.node=function*(id){return[id,0,0,id*100,0,0,[0,1,2].filter(x=>x!==id)];};
 assert.ok(drain(corridor.path(a,b,states)));assert.ok(drain(corridor.path(a,c,states)));
 assert.deepEqual(calls,[[0,false,false],[100,true,false],[200,true,false]],'a different target reimported the same departure tiles');
 assert.ok(drain(corridor.path(b,a,states)));
 assert.deepEqual(calls.slice(3),[[100,false,false],[0,true,false]]);
 states.gate=true;
 assert.ok(drain(corridor.path(a,c,states)));
 assert.deepEqual(calls.slice(5),[[0,false,true],[200,true,true]]);
});


test('a goal anchor checks traversal from its baked representative to the requested floor',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs');
 const point=[200,0,0],seed=[100,0,0],tile={slot:0,coarseSeeds:[[0,...seed]],blob:'test',variants:{'':'test'},conditions:[]};
 const bytes=new Uint8Array(132),header=new DataView(bytes.buffer);
 header.setUint32(0,0x444e4156,true);header.setInt32(4,7,true);header.setInt32(24,1,true);
 const calls=[],owner={manifest:{extentCm:1000},index:{blobs:{test:{}}},
  *metadataJob(){return{tiles:[tile]};},
  *directJob(a,b){calls.push([a,b]);return{complete:false};},
  *blobJob(){return bytes;},
  window:{loaded:new Map([[0,tile]]),planner:{
   navMesh:{decodePolyId:()=>({tileIndex:0,tilePolygonIndex:0})},
   query:{findNearestPoly:()=>({success:true,nearestRef:1})},
   *routeJob(a,b){calls.push([a,b]);return{complete:a[0]===100&&b[0]===200,meters:1};},
  }},
 };
 const result=drain(new WorldCorridors(owner).anchors(point,{},true));
 assert.deepEqual(result,[{id:0,point:seed,cost:100}]);
 assert.deepEqual(calls,[[point,point],[seed,point]]);
});

test('nearby coarse anchors reuse tile components but still project and check each direction',async()=>{
 const {WorldCorridors}=await import('../offline-navigation/world-corridors.mjs');
 const bytes=new Uint8Array(164),header=new DataView(bytes.buffer);
 header.setUint32(0,0x444e4156,true);header.setInt32(4,7,true);header.setInt32(24,2,true);
 const connected=bytes.slice(),edges=new DataView(connected.buffer);
 edges.setUint8(130,1);edges.setUint16(116,2,true);
 const a=[80,0,0],b=[200,0,40],s0=[100,0,0],s1=[210,0,40];
 const tile={slot:0,coarseSeeds:[[11,...s0],[22,...s1]],blob:'separate',variants:{'0':'separate','1':'open'},conditions:['gate']};
 const routes=[],reads=[],loaded=new Map([[0,tile]]),blobs={separate:{},connected:{},open:{}};
 let projected=0;
 const owner={index:{blobs},window:{loaded,planner:{
  navMesh:{decodePolyId:ref=>({tileIndex:0,tilePolygonIndex:ref-1})},
  query:{findNearestPoly:point=>{projected++;return{success:true,nearestRef:point.x<1?1:2};}},
  *routeJob(a,b){routes.push([a,b]);return{complete:true,meters:1};},
 }},
  *directJob(){yield;},
  *blobJob(blob){reads.push(blob);yield;return blob==='separate'?bytes:connected;},
 };
 const corridor=new WorldCorridors(owner),bounds=[0,-800,800,0];
 assert.equal(drain(corridor.exactAnchor(a,{gate:false},bounds)).id,11);
 assert.equal(drain(corridor.exactAnchor(b,{gate:false},bounds,undefined,true)).id,22);
 assert.deepEqual(reads,['separate'],'different endpoints rebuilt the same tile components');
 assert.equal(projected,2);
 assert.deepEqual(routes,[[a,s0],[s1,b]]);

 tile.blob='open';
 assert.equal(drain(corridor.exactAnchor(b,{gate:true},bounds)),null,'a different tile variant reused the default labels');
 Object.assign(tile,{blob:'connected',variants:{'0':'connected','1':'open'},coarseSeeds:[[44,...s0]]});
 const cancelled=corridor.exactAnchor(b,{gate:false},bounds);
 cancelled.next();cancelled.next();cancelled.return();
 assert.equal(drain(corridor.exactAnchor(b,{gate:false},bounds)).id,44);
 assert.deepEqual(reads,['separate','connected','connected'],'cancelled or replaced tile labels were reused');
});
