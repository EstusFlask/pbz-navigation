'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('offline proposal selection retains a safe lower drop when shorter high drops fill the first 24 slots',async()=>{
 const {selectMovementProposals}=await import('../offline-navigation/movement-links.mjs'),rows=Array.from({length:24},(_,i)=>({a:[i*200,0,1100],b:[i*200+200,0,34],span:200,score:i}));
 const lower={a:[5000,0,1000],b:[5700,0,88],span:700,score:500};rows.push(lower);
 assert.equal(selectMovementProposals(rows).length,24);
 const selected=selectMovementProposals(rows,{envelopeBands:true});assert.ok(selected.includes(lower),'every saved proposal exceeds the current 1036cm safe-height limit, despite an available 912cm alternative');assert.ok(selected.length<=96);
});
test('boundary proposals include a landing interval shorter than one metre',async()=>{
 const {discoverFalls}=await import('../offline-navigation/movement-links.mjs');
 const shapes=[[[0,0],[.2,0],[.2,.2],[0,.2]],[[.4,0],[.6,0],[.6,.2],[.4,.2]]],byRef=new Map();
 for(let i=0;i<shapes.length;i++){const vertices=shapes[i],row={success:true,poly:{firstLink:()=>0xffffffff,vertCount:()=>4,verts:i=>i},tile:{header:()=>({maxLinkCount:()=>0}),verts:i=>i%3===0?vertices[Math.floor(i/3)][0]:i%3===2?vertices[Math.floor(i/3)][1]:0}};byRef.set(i+1,row);}
 const planner={origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getTileAndPolyByRef:ref=>byRef.get(ref)||{success:false}},query:{getPolyHeight:ref=>({success:true,height:ref===1?1:2}),findNearestPoly:p=>({success:true,nearestRef:p.x<.3?1:2,nearestPoint:p})}};
 const runWith=maxRiseCm=>{const job=discoverFalls(planner,[[10,-10,0],[50,-10,0]],{goal:[50,-10,0],maxHeightCm:310,maxRunCm:200,maxRiseCm});let row;do{row=job.next();}while(!row.done);return row.value;};
 const permissive=runWith(200),current=runWith(50);
 assert.ok(permissive.some(r=>r.a[0]<30&&r.b[0]>35&&r.b[0]<65),'a sub-metre landing polygon was skipped before physical checking');
 assert.ok(permissive.some(r=>r.a[2]-r.b[2]<-50));assert.ok(current.every(r=>r.a[2]-r.b[2]>=-50),'movement discovery admitted a rise above the current jump apex');
});

test('offline movement discovery includes an intermediate platform with no bell or authored actor',async()=>{
 const {discoverFalls}=await import('../offline-navigation/movement-links.mjs'),shapes=[0,1,2].map(x=>[[x,0],[x+.2,0],[x+.2,.2],[x,.2]]),byRef=new Map();
 for(let i=0;i<shapes.length;i++){const v=shapes[i];byRef.set(i+1,{success:true,poly:{firstLink:()=>0xffffffff,vertCount:()=>4,verts:j=>j},tile:{header:()=>({maxLinkCount:()=>0}),verts:j=>j%3===0?v[Math.floor(j/3)][0]:j%3===2?v[Math.floor(j/3)][1]:0}});}
 const planner={origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getTileAndPolyByRef:ref=>byRef.get(ref)||{success:false},getMaxTiles:()=>1,getTile:()=>({header:()=>({polyCount:()=>3})}),getPolyRefBase:()=>1},query:{getPolyHeight:()=>({success:true,height:0}),findNearestPoly:p=>({success:true,nearestRef:p.x<.6?1:p.x<1.6?2:3,nearestPoint:p})}};
 const old=discoverFalls(planner,[[10,-10,0],[210,-10,0]],{goal:[210,-10,0],maxHeightCm:310,maxRunCm:120});let previous;do{previous=old.next();}while(!previous.done);assert.equal(previous.value.some(f=>f.ref===2||f.target===2),false,'seed-only negative control unexpectedly visited the middle platform');
 const task=discoverFalls(planner,[[10,-10,0],[210,-10,0]],{goal:[210,-10,0],maxHeightCm:310,maxRunCm:120,allComponents:true});let r;do{r=task.next();}while(!r.done);
 assert.ok(r.value.some(f=>f.ref===1&&f.target===2),'the first hop to the unseeded platform disappeared');assert.ok(r.value.some(f=>f.ref===2&&f.target===3),'the second hop from the unseeded platform disappeared');
});

test('a bounded offline source field keeps external landing polygons without leaking neighbour sources',async()=>{
 const {discoverFalls}=await import('../offline-navigation/movement-links.mjs'),byRef=new Map(),shapes=[{x:0,h:0},{x:2,h:5},{x:3,h:5}];
 for(let i=0;i<shapes.length;i++){const {x,h}=shapes[i],v=[[x,0],[x+.2,0],[x+.2,.2],[x,.2]];byRef.set(i+1,{success:true,poly:{firstLink:()=>0xffffffff,vertCount:()=>4,verts:j=>j},tile:{header:()=>({maxLinkCount:()=>0}),verts:j=>j%3===0?v[Math.floor(j/3)][0]:j%3===2?v[Math.floor(j/3)][1]:h}});}
 const make=()=>({origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getTileAndPolyByRef:ref=>byRef.get(ref)||{success:false},getMaxTiles:()=>1,getTile:()=>({header:()=>({polyCount:()=>3})}),getPolyRefBase:()=>1},query:{getPolyHeight:ref=>({success:true,height:shapes[ref-1].h}),findNearestPoly:p=>({success:true,nearestRef:p.x<1?1:p.x<2.6?2:3,nearestPoint:p})}});
 const run=sourceBoundsUE=>{const job=discoverFalls(make(),[[10,-10,0],[210,-10,0]],{goal:[210,-10,0],maxHeightCm:310,maxRunCm:120,maxRiseCm:0,allComponents:true,sourceBoundsUE});let r;do{r=job.next();}while(!r.done);return r.value;};
 assert.ok(run().some(f=>f.ref===2&&f.target===3));
 const bounded=run([200,-20,220,0]);assert.ok(bounded.length>0);assert.ok(bounded.every(f=>f.a[0]>=200&&f.a[0]<=220),'expanded loading margins leaked unrelated source platforms into the local field');
 assert.ok(bounded.some(f=>f.b[0]>=300),'a target beyond the local source cell was incorrectly clipped');
 assert.throws(()=>run([200,0,NaN,20]),/Invalid movement field source bounds/);
});

test('a bounded field retains one-way arrivals at a known pad without retaining departures to unrelated islands',async()=>{
 const {discoverFalls}=await import('../offline-navigation/movement-links.mjs');
 const heights=[0,5,0],shapes=heights.map((h,x)=>[[x,h,0],[x+.3,h,0],[x+.3,h,.3],[x,h,.3]]),byRef=new Map();
 for(let i=0;i<shapes.length;i++)byRef.set(i+1,{success:true,poly:{firstLink:()=>0xffffffff,vertCount:()=>4,verts:j=>j},tile:{header:()=>({maxLinkCount:()=>0}),verts:j=>shapes[i][Math.floor(j/3)][j%3]}});
 const run=inboundRoots=>{
  const planner={origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getTileAndPolyByRef:ref=>byRef.get(ref),getMaxTiles:()=>1,getTile:()=>({header:()=>({polyCount:()=>3})}),getPolyRefBase:()=>1},query:{getPolyHeight:ref=>({success:true,height:heights[ref-1]}),findNearestPoly:p=>({success:true,nearestRef:p.x<.6?1:p.x<1.6?2:3})}};
  const task=discoverFalls(planner,[[15,-15,0]],{maxHeightCm:600,maxRunCm:130,maxRiseCm:0,allComponents:true,inboundRoots,sourceBoundsUE:[50,-100,175,100]});let r;
  do{r=task.next();}while(!r.done);return r.value;
 };
 assert.equal(run(false).length,0,'control: the only seeded pad has no possible outbound action');
 const arrivals=run(true);
 assert.ok(arrivals.length>0,'one-way arrivals from a platform without an authored seed were dropped');
 assert.ok(arrivals.every(f=>f.ref===2&&f.target===1&&f.kind==='fall'),'directed inbound discovery also retained a departure away from the known pad');
});

test('an external walking portal leaves the uncovered ledge interval eligible for a drop',async()=>{
 const {discoverFalls}=await import('../offline-navigation/movement-links.mjs');
 const shapes=[
  [[0,5,0],[4,5,0],[4,5,4],[0,5,4]],
  [[4,5,0],[5,5,0],[5,5,.5],[4,5,.5]],
  [[4.2,0,1.8],[5.2,0,1.8],[5.2,0,2.65],[4.2,0,2.65]],
 ];
 const run=(interval,packed)=>{
  const link={ref:()=>2,edge:()=>1,side:()=>0,bmin:()=>interval[0],bmax:()=>interval[1],next:()=>0xffffffff};
  const byRef=new Map(shapes.map((shape,i)=>[i+1,{
   success:true,poly:{firstLink:()=>i===0?0:0xffffffff,vertCount:()=>4,verts:j=>j},
   tile:{header:()=>({maxLinkCount:()=>1}),verts:j=>shape[Math.floor(j/3)][j%3],links:()=>link},
  }]));
  const tileBuffers=new Map();
  if(packed){
   const bytes=new Uint8Array(100+4*12+32+12),v=new DataView(bytes.buffer),polyAt=148,linkAt=180;
   v.setUint32(0,0x444e4156,true);v.setInt32(4,7,true);v.setInt32(24,1,true);v.setInt32(28,4,true);v.setInt32(32,1,true);
   for(let i=0;i<4;i++){
    v.setUint16(polyAt+4+i*2,i,true);
    for(let axis=0;axis<3;axis++)v.setFloat32(100+(i*3+axis)*4,shapes[0][i][axis],true);
   }
   v.setUint8(polyAt+30,4);v.setUint32(linkAt,2,true);v.setUint32(linkAt+4,0xffffffff,true);
   v.setUint8(linkAt+8,1);v.setUint8(linkAt+9,0);v.setUint8(linkAt+10,interval[0]);v.setUint8(linkAt+11,interval[1]);
   tileBuffers.set(1,{getHeapView:()=>bytes});
  }
  const source=packed?4:1;
  const planner={origin:[0,0,0],header:packed?{maxPolys:4,maxTiles:2}:{maxPolys:16384,maxTiles:256},tileBuffers,navMesh:{getTileAndPolyByRef:ref=>byRef.get(ref)},
   query:{getPolyHeight:ref=>({success:true,height:ref===3?0:5}),findNearestPoly:p=>({success:true,nearestRef:p.y<3?3:source})}};
  const job=discoverFalls(planner,[[200,-200,500]],{goal:[460,-210,0],maxHeightCm:600,maxRunCm:120,maxRiseCm:0});
  let r;do{r=job.next();}while(!r.done);
  return r.value.filter(f=>f.ref===source&&f.target===3);
 };
 for(const packed of [false,true]){
  const rows=run([0,32],packed);
  assert.ok(rows.some(f=>f.kind==='fall'&&f.a[1]<-100),'a short portal suppressed the rest of the ledge');
  assert.deepEqual(run([0,255],packed),[],'an entirely linked edge was offered as a ledge');
 }
});


test('a ledge candidate with an invalid detail height does not suppress its valid neighbour',async()=>{
 const {discoverFalls}=await import('../offline-navigation/movement-links.mjs');
 const faces=[
  [[0,5,0],[.2,5,0],[.2,5,1.9],[0,5,1.9]],
  [[.4,0,0],[.6,0,0],[.6,0,1.9],[.4,0,1.9]],
 ];
 const refs=new Map(faces.map((v,i)=>[i+1,{success:true,poly:{firstLink:()=>0xffffffff,vertCount:()=>4,verts:j=>j},
  tile:{header:()=>({maxLinkCount:()=>0}),verts:j=>v[Math.floor(j/3)][j%3]}}]));
 const checked=[];
 const planner={origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getTileAndPolyByRef:ref=>refs.get(ref)},
  query:{findNearestPoly:p=>({success:true,nearestRef:p.x<.3?1:2}),getPolyHeight:(ref,p)=>{
   if(ref===1)return{success:true,height:5};
   checked.push(p.z);
   return{success:true,height:p.z<1?-2:0};
  }}};
 const job=discoverFalls(planner,[[10,-47,500]],{goal:[50,-142,0],maxHeightCm:600,maxRunCm:100,maxRiseCm:0,sourceBoundsUE:[14,-180,20,0]});
 let step;do{step=job.next();}while(!step.done);
 assert.ok(checked[0]<1,'the closest approximate candidate must fail the exact height limit');
 assert.ok(step.value.some(f=>f.ref===1&&f.target===2&&f.b[1]<-100&&f.a[2]-f.b[2]===500),
  'a false drop consumed the spacing slot of the nearby 500cm landing');
});


test('outward ledge sampling can land on an overlapping lower platform',async()=>{
 const {discoverFalls}=await import('../offline-navigation/movement-links.mjs');
 const faces=[
  [[0,5,0],[.2,5,0],[.2,5,1.9],[0,5,1.9]],
  [[.16,0,-1],[.9,0,-1],[.9,0,3],[.16,0,3]],
 ];
 const refs=new Map(faces.map((v,i)=>[i+1,{success:true,poly:{firstLink:()=>0xffffffff,vertCount:()=>4,verts:j=>j},
  tile:{header:()=>({maxLinkCount:()=>0}),verts:j=>v[Math.floor(j/3)][j%3]}}]));
 const planner={origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getTileAndPolyByRef:ref=>refs.get(ref)},
  query:{findNearestPoly:p=>({success:true,nearestRef:p.y>=3?1:2}),getPolyHeight:ref=>({success:true,height:ref===1?5:0})}};
 const job=discoverFalls(planner,[[10,-47,500]],{goal:[80,-142,0],maxHeightCm:600,maxRunCm:100,maxRiseCm:0,sourceBoundsUE:[14,-180,20,0]});
 let step;do{step=job.next();}while(!step.done);
 assert.ok(step.value.some(f=>f.ref===1&&f.target===2&&f.b[0]>20&&f.kind==='fall'),
  'the nearest lower polygon boundary lies behind the launch, but the outward ray reaches its interior');
 assert.ok(step.value.every(f=>f.a[2]-f.b[2]===500),'do not reverse the downward link');
});
