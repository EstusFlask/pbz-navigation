'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('the legacy safe threshold includes a full 512-leaf result and selects larger inputs',async()=>{
 const C=await import('../offline-navigation/node_modules/@recast-navigation/core/dist/index.mjs');await C.init();
 for(const count of [131072,131073]){
  const positions=new C.VerticesArray(),indices=new C.TrianglesArray(),mesh=new C.RecastChunkyTriMesh(),ids=new C.ChunkIdsArray();
  try{
   positions.copy([0,0,0,1,0,0,0,0,1]);indices.copy(Uint32Array.from({length:count*3},(_,i)=>i%3));assert.ok(mesh.init(positions,indices,count,256));
   ids.resize(count);const complete=mesh.getChunksOverlappingRect([-1,-1],[2,2],ids,count);let total=0;for(let i=0;i<complete;i++)total+=mesh.nodes(ids.get(i)).n;
   assert.equal(total,count);assert.equal(complete<=512,count<=131072);
  }finally{ids.destroy();mesh.destroy();indices.destroy();positions.destroy();}
 }
});
test('a dense tile rasterizes the complete collision index beyond 512 chunks',async()=>{
 const C=await import('../offline-navigation/node_modules/@recast-navigation/core/dist/index.mjs'),G=await import('../offline-navigation/node_modules/@recast-navigation/generators/dist/index.mjs'),{buildOneTile}=await import('../offline-navigation/cli.mjs');await C.init();
 const size=25.6,n=350,positions=new Float32Array((n+1)*(n+1)*3),indices=new Uint32Array(n*n*6);let at=0;
 for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){positions[at++]=x*size/n;positions[at++]=0;positions[at++]=z*size/n;}
 at=0;for(let z=0;z<n;z++)for(let x=0;x<n;x++){const a=z*(n+1)+x,b=a+1,c=a+n+1,d=c+1;for(const i of [a,c,b,b,c,d])indices[at++]=i;}
 const bounds=[[0,-1,0],[size,1,size]],config={...G.tiledNavMeshGeneratorConfigDefaults,cs:.1,ch:.05,tileSize:256,walkableHeight:39,walkableClimb:10,walkableRadius:6,minRegionArea:4,mergeRegionArea:20,maxSimplificationError:.25,bounds};
 const {config:rc}=G.buildTiledNavMeshRcConfig({recastConfig:config,navMeshBounds:bounds}),context=new C.RecastBuildContext(),nav=new C.NavMesh(),params=C.NavMeshParams.create({orig:{x:0,y:0,z:0},tileWidth:size,tileHeight:size,maxTiles:256,maxPolys:16384});
 let built,query;try{
  built=buildOneTile({positions,indices},rc,{x:0,y:0,bmin:bounds[0],bmax:bounds[1]},context);assert.ok(built.data);
  assert.ok(built.chunkCoverage.largestOverlap>512);assert.ok(built.chunkCoverage.largestCapacity>built.chunkCoverage.largestOverlap);
  assert.ok(nav.initTiled(params));const tile=nav.addTile(built.data,0,0);assert.ok(C.statusSucceed(tile.status));query=new C.NavMeshQuery(nav);
  const points=[{x:4,y:0,z:4},{x:21,y:0,z:21}],refs=points.map(p=>query.findNearestPoly(p,{halfExtents:{x:.5,y:.5,z:.5}}).nearestRef);
  assert.ok(refs.every(Boolean),'the fixed 512-chunk rasterization cap silently dropped part of a flat floor');
  const path=query.findPath(refs[0],refs[1],points[0],points[1]);try{assert.equal(path.polys.get(path.polys.size-1),refs[1]);}finally{path.polys.destroy();}
 }finally{query?.destroy();nav.destroy();built?.data?.destroy();C.Raw.destroy(params.raw);context.destroy();C.Raw.destroy(rc);}
});
