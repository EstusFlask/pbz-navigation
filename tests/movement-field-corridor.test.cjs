'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('offline movement-field cells follow endpoint geometry without manufacturing route points',async()=>{
 const {movementFieldCells,supportsMovementFieldExtent}=await import('../offline-navigation/movement-field-corridor.mjs'),rows=movementFieldCells([0,0,100],[5000,0,300],1000,500);
 assert.ok(rows.length>=5);assert.ok(rows.every(r=>Math.abs(r.center[1])<1000));assert.ok(rows.some(r=>r.t===0));assert.ok(rows.some(r=>r.t===1));
 assert.ok(rows.every(r=>r.coreBounds[0]===r.x*1000&&r.coreBounds[2]===(r.x+1)*1000));
 assert.deepEqual(rows.map(r=>r.id),movementFieldCells([0,0,100],[5000,0,300],1000,500).map(r=>r.id));
 assert.equal(supportsMovementFieldExtent(640),true);
 assert.equal(supportsMovementFieldExtent(320),false);
 assert.throws(()=>movementFieldCells([0,0,0],[10,10,0],0,1),/Invalid/);
 assert.throws(()=>movementFieldCells([0,0,0],[10,10,0],1,-1),/Invalid/);
 assert.throws(()=>movementFieldCells([0,0],[10,10,0],1,0),/Invalid/);
 assert.throws(()=>movementFieldCells([0,0,0],[1e8,1e8,0],1,0),/budget/);
});

test('an unseeded field cell roots discovery on resident geometry with the planner origin',async()=>{
 const {movementFieldRoot}=await import('../offline-navigation/movement-field-corridor.mjs');
 const calls=[],planner={origin:[10000,20000,30000],query:{findNearestPoly:(point,options)=>{calls.push({point,options});return{success:true,nearestRef:7,nearestPoint:{x:2,y:1,z:-3}};}}};
 assert.deepEqual(movementFieldRoot(planner,[10200,20300,30100],[10000,20000,11000,21000],1280),[10200,20300,30100]);
 assert.deepEqual(calls[0].point,{x:2,y:1,z:-3});
 planner.query.findNearestPoly=()=>({success:true,nearestRef:7,nearestPoint:{x:20,y:1,z:-3}});
 assert.equal(movementFieldRoot(planner,[10200,20300,30100],[10000,20000,11000,21000],1280),null);
 planner.query.findNearestPoly=()=>({success:false,nearestRef:0});
 assert.equal(movementFieldRoot(planner,[10200,20300,30100],[10000,20000,11000,21000],1280),null);
});

test('a source cell without a nearby placed pad can discover its intermediate movement',async()=>{
 const {movementFieldRoot}=await import('../offline-navigation/movement-field-corridor.mjs'),{discoverFalls}=await import('../offline-navigation/movement-links.mjs');
 const shapes=[[[0,5,0],[.3,5,0],[.3,5,.3],[0,5,.3]],[[2,0,0],[2.3,0,0],[2.3,0,.3],[2,0,.3]]];
 const run=project=>{
  const planner={origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getMaxTiles:()=>1,getTile:()=>({header:()=>({polyCount:()=>2})}),getPolyRefBase:()=>1,getTileAndPolyByRef:ref=>({success:true,poly:{firstLink:()=>0xffffffff,vertCount:()=>4,verts:index=>index},tile:{header:()=>({maxLinkCount:()=>0}),verts:index=>shapes[ref-1][Math.floor(index/3)][index%3]}})},query:{getPolyHeight:ref=>({success:true,height:ref===1?5:0}),findNearestPoly:point=>point.x>5?{success:false,nearestRef:0}:{success:true,nearestRef:point.x<1?1:2,nearestPoint:{x:.15,y:5,z:.15}}}};
  const roots=[[10000,-10000,500]];
  if(project)roots.push(movementFieldRoot(planner,[15,-15,500],[0,-100,300,100],1280));
  const job=discoverFalls(planner,roots,{maxHeightCm:600,maxRunCm:300,maxRiseCm:0,allComponents:true,inboundRoots:true,sourceBoundsUE:[0,-100,300,100]});let row;do{row=job.next();}while(!row.done);return row.value;
 };
 assert.equal(run(false).length,0,'an authored root outside the resident window cannot classify any movement');
 assert.ok(run(true).some(row=>row.ref===1&&row.target===2&&row.kind==='fall'));
});

test('inbound fields include source ledges above their only lower standing root',async()=>{
 const {movementFieldHeights}=await import('../offline-navigation/movement-field-corridor.mjs'),{discoverFalls}=await import('../offline-navigation/movement-links.mjs');
 const seeds=[[210,-10,0]],run=inboundRoots=>{
  const vertical=movementFieldHeights(seeds,{componentRoots:true,inboundRoots}),shapes=[{x:0,height:5},{x:2,height:0}].filter(shape=>shape.height*100>=vertical[0]&&shape.height*100<=vertical[1]);
  const planner={origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getMaxTiles:()=>1,getTile:()=>({header:()=>({polyCount:()=>shapes.length})}),getPolyRefBase:()=>1,getTileAndPolyByRef:ref=>{
   const shape=shapes[ref-1],vertices=[[shape.x,shape.height,0],[shape.x+.3,shape.height,0],[shape.x+.3,shape.height,.3],[shape.x,shape.height,.3]];
   return{success:true,poly:{firstLink:()=>0xffffffff,vertCount:()=>4,verts:index=>index},tile:{header:()=>({maxLinkCount:()=>0}),verts:index=>vertices[Math.floor(index/3)][index%3]}};
  }},query:{findNearestPoly:point=>{const index=shapes.findIndex(shape=>shape.x===(point.x<1?0:2));return{success:index>=0,nearestRef:index+1};},getPolyHeight:ref=>({success:true,height:shapes[ref-1].height})}};
  const job=discoverFalls(planner,seeds,{maxHeightCm:600,maxRunCm:300,maxRiseCm:0,allComponents:true,inboundRoots:true,sourceBoundsUE:[0,-100,100,100]});let row;do{row=job.next();}while(!row.done);return row.value;
 };
 assert.equal(run(false).length,0);
 assert.ok(run(true).some(row=>row.kind==='fall'&&row.a[2]===500&&row.b[2]===0));
 assert.deepEqual(movementFieldHeights(seeds),[-200,200]);
 assert.deepEqual(movementFieldHeights(seeds,{componentRoots:true,inboundRoots:false}),[-1950,200]);
});
