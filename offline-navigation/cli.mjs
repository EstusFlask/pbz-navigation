// Recast and Detour are executed by the upstream WebAssembly distribution.
import fs from 'node:fs';
import {maskCompactHeightfield} from './grid-mask.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { init, exportNavMesh, importNavMesh, NavMeshQuery, getNavMeshPositionsAndIndices, Detour, statusSucceed,
 NavMesh, NavMeshParams, VerticesArray, TrianglesArray, RecastChunkyTriMesh, RecastBuildContext, statusFailed, Raw,
 freeHeightfield,freeCompactHeightfield,freeContourSet,freePolyMesh,freePolyMeshDetail } from 'recast-navigation';
import { generateTileNavMeshData,buildTiledNavMeshRcConfig,tiledNavMeshGeneratorConfigDefaults,getBoundingBox } from 'recast-navigation/generators';
const buildSettings=JSON.parse(fs.readFileSync(new URL('./build-settings.json',import.meta.url),'utf8'));

function requireValue(ok,message){if(!ok)throw Error(message);}
function numeric(value){const n=Number(value);requireValue(Number.isFinite(n),'invalid numeric argument');return n;}
function toNav(p,o){return {x:(p[0]-o[0])/100,y:(p[2]-o[2])/100,z:-(p[1]-o[1])/100};}
function fromNav(p,o){return [o[0]+p.x*100,o[1]-p.z*100,o[2]+p.y*100];}
export function readGeometry(file,forcedOrigin){
 const b=fs.readFileSync(file);requireValue(b.length>=20&&b.subarray(0,8).toString()==='PBZCOL01'&&b.readUInt32LE(8)===1,'invalid collision mesh');
 const nv=b.readUInt32LE(12),nt=b.readUInt32LE(16);
 requireValue(nv>=3&&nv<=10_000_000&&nt>=1&&nt<=20_000_000&&b.length===20+nv*24+nt*12,'invalid collision mesh length');
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let at=20;
 for(let i=0;i<nv;i++)for(let k=0;k<3;k++){const v=b.readDoubleLE(at);at+=8;requireValue(Number.isFinite(v)&&Math.abs(v)<1e10,'invalid collision position');lo[k]=Math.min(lo[k],v);hi[k]=Math.max(hi[k],v);}
 const origin=forcedOrigin??[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,Math.floor(lo[2]/100)*100],positions=new Float32Array(nv*3);
 at=20;for(let i=0;i<nv;i++){const x=b.readDoubleLE(at),y=b.readDoubleLE(at+8),z=b.readDoubleLE(at+16);at+=24;positions[i*3]=(x-origin[0])/100;positions[i*3+1]=(z-origin[2])/100;positions[i*3+2]=-(y-origin[1])/100;}
 const indices=new Uint32Array(nt*3);for(let i=0;i<indices.length;i++){const v=b.readUInt32LE(at);at+=4;requireValue(v<nv,'collision index outside vertex buffer');indices[i]=v;}
 return {positions,indices,origin,sha256:crypto.createHash('sha256').update(b).digest('hex')};
}
function saveJSON(path,data){fs.writeFileSync(path,JSON.stringify(data));}
function loadNav(path){const meta=JSON.parse(fs.readFileSync(path+'.json','utf8')),bytes=fs.readFileSync(path);
 requireValue(meta.engine==='recast-navigation@0.44.0'&&crypto.createHash('sha256').update(bytes).digest('hex')===meta.navSHA256,'navigation data/version mismatch');
 return {...importNavMesh(new Uint8Array(bytes)),meta};}
export function buildOneTile(local,rcConfig,tile,context){
 const positions=new VerticesArray(),indices=new TrianglesArray(),chunky=new RecastChunkyTriMesh();
 const chunkCoverage={schema:1,triangles:local.indices.length/3,queries:0,largestOverlap:0,largestCapacity:0,expandedQueries:0};
 const compact=Raw.Recast.buildCompactHeightfield;
 if(local.obstacleBounds?.length||local.conservativeGridMask)Raw.Recast.buildCompactHeightfield=function(ctx,height,climb,hf,chf){
  const result=compact.call(this,ctx,height,climb,hf,chf);
  if(result)for(const bounds of local.obstacleBounds??[])Raw.Recast.markBoxArea(ctx,bounds[0],bounds[1],0,chf);
  if(result&&local.conservativeGridMask){const m=local.conservativeGridMask;maskCompactHeightfield(chf,m.supports,m.blockers,m.marginCm??2);}
  return result;
 };
 try{
  positions.copy(local.positions);indices.copy(local.indices);
  if(!local.indices.length)return{data:null,empty:true,chunkCoverage};
  requireValue(chunky.init(positions,indices,local.indices.length/3,256),'collision spatial index failed');
  // Upstream's tile generator asks for at most 512 chunks and accepts a full
  // result buffer as complete. Dense real tiles exceed that cap. Grow the
  // supplied array until the query is unsaturated; at most one leaf exists
  // per input triangle, so the existing geometry limit also bounds this work.
  const overlap=chunky.getChunksOverlappingRect.bind(chunky);
  chunky.getChunksOverlappingRect=(min,max,ids,requested)=>{
   let capacity=Math.min(requested,chunkCoverage.triangles),expanded=false,count;
   for(;;){ids.resize(capacity);count=overlap(min,max,ids,capacity);if(count<capacity||capacity===chunkCoverage.triangles)break;capacity=Math.min(chunkCoverage.triangles,capacity*2);expanded=true;}
   chunkCoverage.queries++;chunkCoverage.largestOverlap=Math.max(chunkCoverage.largestOverlap,count);chunkCoverage.largestCapacity=Math.max(chunkCoverage.largestCapacity,capacity);if(expanded)chunkCoverage.expandedQueries++;
   return count;
  };
  const result=generateTileNavMeshData(positions,indices,rcConfig,chunky,tile,{buildBvTree:true},false,context);
  if(result.success)return{data:result.data??null,empty:!result.data,chunkCoverage};
  const retry=generateTileNavMeshData(positions,indices,rcConfig,chunky,tile,{buildBvTree:true},true,context);
  let empty=false;
  try{empty=result.error==='Failed to create Detour navmesh data'&&retry.intermediates.polyMesh?.npolys()===0&&retry.intermediates.polyMesh?.nverts()===0;}
  finally{retry.data?.destroy();for(const [key,free]of [['heightfield',freeHeightfield],['compactHeightfield',freeCompactHeightfield],['contourSet',freeContourSet],['polyMesh',freePolyMesh],['polyMeshDetail',freePolyMeshDetail]])if(retry.intermediates[key])free(retry.intermediates[key]);}
  requireValue(empty,`Recast tile ${tile.x},${tile.y}: ${result.error}`);return{data:null,empty:true,chunkCoverage};
 }finally{Raw.Recast.buildCompactHeightfield=compact;chunky.destroy();positions.destroy();indices.destroy();}
}
function checkedTiledBuild(g,config,partition,inputFile){
 const generatorConfig={...tiledNavMeshGeneratorConfigDefaults,...config};
 const box=config.bounds??(()=>{const {bbMin,bbMax}=getBoundingBox(g.positions,g.indices);return [bbMin,bbMax];})();
 const built=buildTiledNavMeshRcConfig({recastConfig:generatorConfig,navMeshBounds:box});
 const {config:rcConfig,tileWidth,tileHeight,tcs,orig,maxTiles,maxPolysPerTile}=built;
 const navMesh=new NavMesh(),params=NavMeshParams.create({orig,tileWidth:tcs,tileHeight:tcs,maxTiles,maxPolys:maxPolysPerTile});
 requireValue(navMesh.initTiled(params),'Detour tiled initialization failed');
 const context=new RecastBuildContext();let completed=0,emptyTiles=0;
 try{
  const tiles=partition?.tiles??Array.from({length:tileWidth*tileHeight},(_,i)=>({x:i%tileWidth,y:Math.floor(i/tileWidth)}));
  if(partition)requireValue(partition.gridWidth===tileWidth&&partition.gridHeight===tileHeight,'partition grid does not match Recast');
  for(const tile of tiles){
   let local=g;const started=Date.now();
   if(partition){
    const root=path.dirname(path.resolve(inputFile)),file=path.resolve(root,tile.file);
    requireValue(file.startsWith(root+path.sep),'tile file escapes partition');local=readGeometry(file,g.origin);
    requireValue(local.sha256===tile.sha256,'partition tile hash differs');
   }
   const bmin=[box[0][0]+tile.x*tcs,box[0][1],box[0][2]+tile.y*tcs],bmax=[bmin[0]+tcs,box[1][1],bmin[2]+tcs];
   const result=buildOneTile(local,rcConfig,{x:tile.x,y:tile.y,bmin,bmax},context);
   if(result.empty)emptyTiles++;
   if(result.data){const added=navMesh.addTile(result.data,Detour.DT_TILE_FREE_DATA,0);requireValue(!statusFailed(added.status),'Detour tile insertion failed');}
   completed++;
   if(completed%20===0||completed===tiles.length)console.log(`Baked ${completed}/${tiles.length} tiles; last ${Date.now()-started}ms`);
  }
  return {success:true,navMesh,emptyTiles};
 }catch(error){navMesh.destroy();throw error;}
 finally{context.destroy();Raw.destroy(rcConfig);}
}
function bake(args){
 requireValue(args.length===11,'bake mesh nav report cellCm heightCellCm radiusCm heightCm climbCm slope tileCells validated-input');
 const [file,navFile,reportFile,...values]=args;
 const partition=file.endsWith('.tiles.json')?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const g=partition?{origin:partition.originUE,sha256:partition.sourceMeshSHA256}:readGeometry(file);
 requireValue(values.pop()==='validated-input','missing input validation marker');
 const [cellCm,heightCellCm,radiusCm,heightCm,climbCm,slope,tileSize]=values.map(numeric);
 requireValue(cellCm>=2&&cellCm<=100&&heightCellCm>=1&&heightCellCm<=50&&radiusCm>0&&heightCm>2*radiusCm&&climbCm>=0&&slope>0&&slope<90&&Number.isInteger(tileSize)&&tileSize>=32&&tileSize<=1024,'invalid agent/build settings');
 const cs=cellCm/100,ch=heightCellCm/100,maxSimplificationError=buildSettings.maxSimplificationErrorVoxels;
 // Independent swept-radius controls require retaining clearance after contour
 // approximation. Reserve its maximum error and one voxel before erosion.
 const config={cs,ch,tileSize,walkableHeight:Math.ceil(heightCm/heightCellCm),walkableClimb:Math.floor(climbCm/heightCellCm),
  walkableRadius:Math.ceil((radiusCm+(maxSimplificationError+buildSettings.voxelBoundaryReserveVoxels)*cellCm)/cellCm),walkableSlopeAngle:slope,
  maxSimplificationError,maxEdgeLen:Math.floor(1200/cellCm),minRegionArea:4,mergeRegionArea:20,maxVertsPerPoly:6,
  detailSampleDist:6,detailSampleMaxError:1};
 const sidecar=partition??JSON.parse(fs.readFileSync(file+'.json','utf8'));
 requireValue(partition||sidecar.meshSHA256===g.sha256,'collision geometry differs from its audit');
 if(partition)requireValue(Math.abs(partition.cellCm*partition.tileCells-cellCm*tileSize)<1e-6&&partition.radiusCm===radiusCm&&partition.borderCm>=(config.walkableRadius+3)*cellCm,'partition configuration differs');
 if(sidecar.boundsUE){const b=sidecar.boundsUE,lo=toNav([b[0],b[4],b[2]],g.origin),hi=toNav([b[3],b[1],b[5]],g.origin);config.bounds=[[lo.x,lo.y,lo.z],[hi.x,hi.y,hi.z]];}
 const result=checkedTiledBuild(g,config,partition,file);
 requireValue(result.success,result.error||'Recast build failed');
 try{
  const bytes=exportNavMesh(result.navMesh);fs.writeFileSync(navFile,bytes);let tiles=0;
  for(let i=0;i<result.navMesh.getMaxTiles();i++)if(result.navMesh.getTile(i).header())tiles++;
  const [positions,indices]=getNavMeshPositionsAndIndices(result.navMesh);
  const report={schema:1,engine:'recast-navigation@0.44.0',backend:'upstream-recast-detour-webassembly',originUE:g.origin,
   config,agent:{radiusCm,heightCm,climbCm,slope},tiles,emptyTiles:result.emptyTiles,triangles:indices.length/3,inputTriangles:partition?partition.tiles.reduce((sum,t)=>sum+t.triangles,0):g.indices.length/3,
   collisionSHA256:g.sha256,navSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),completeCollisionClaim:false};
  saveJSON(navFile+'.json',report);saveJSON(reportFile,report);
  console.log(`Built ${tiles} tiles through WebAssembly; ${indices.length/3} detail triangles`);
 }finally{result.navMesh.destroy();}
}
function query(args){
 requireValue(args.length===8,'query nav report sx sy sz gx gy gz');const [file,report,...values]=args;
 const {navMesh,meta}=loadNav(file),q=new NavMeshQuery(navMesh,{maxNodes:65535});
 let path,straight;
 try{
  const coords=values.map(numeric),start=coords.slice(0,3),goal=coords.slice(3),a=toNav(start,meta.originUE),b=toNav(goal,meta.originUE),halfExtents={x:1,y:.75,z:1};
  const from=q.findNearestPoly(a,{halfExtents}),to=q.findNearestPoly(b,{halfExtents});let complete=false,points=[];
  if(from.success&&to.success&&from.nearestRef&&to.nearestRef){
   path=q.findPath(from.nearestRef,to.nearestRef,from.nearestPoint,to.nearestPoint,{maxPathPolys:65535});
   if(path.success&&path.polys.size){
    const last=path.polys.get(path.polys.size-1),end=last===to.nearestRef?to.nearestPoint:q.closestPointOnPoly(last,to.nearestPoint).closestPoint;
    straight=q.findStraightPath(from.nearestPoint,end,path.polys,{maxStraightPathPoints:65535});
    if(straight.success)for(let i=0;i<straight.straightPathCount;i++)points.push(fromNav({x:straight.straightPath.get(i*3),y:straight.straightPath.get(i*3+1),z:straight.straightPath.get(i*3+2)},meta.originUE));
    const bad=Detour.DT_PARTIAL_RESULT|Detour.DT_OUT_OF_NODES|Detour.DT_BUFFER_TOO_SMALL;
    complete=last===to.nearestRef&&points.length>1&&statusSucceed(path.status)&&!(path.status&bad)&&straight.success&&!(straight.status&bad);
   }
  }
  const projectedStart=fromNav(from.nearestPoint,meta.originUE),projectedGoal=fromNav(to.nearestPoint,meta.originUE);
  saveJSON(report,{schema:1,provider:'upstream-detour-webassembly',complete,startFound:!!from.nearestRef,goalFound:!!to.nearestRef,
   pathStatus:path?.status??0,straightStatus:straight?.status??0,corridorPolygons:path?.polys.size??0,
   start,goal,projectedStart,projectedGoal,startProjectionErrorCm:Math.hypot(...start.map((v,k)=>v-projectedStart[k])),
   goalProjectionErrorCm:Math.hypot(...goal.map((v,k)=>v-projectedGoal[k])),points});
  console.log(`${complete?'Complete':'Incomplete'} path through WebAssembly: ${points.length} corners`);
 }finally{path?.polys.destroy();straight?.straightPath.destroy();straight?.straightPathFlags.destroy();straight?.straightPathRefs.destroy();q.destroy();navMesh.destroy();}
}
function inspect(args){
 requireValue(args.length===2,'inspect nav report');const {navMesh,meta}=loadNav(args[0]);
 try{const [positions,indices]=getNavMeshPositionsAndIndices(navMesh),polygons=[];for(let i=0;i<indices.length;i+=3)polygons.push(Array.from(indices.slice(i,i+3),v=>fromNav({x:positions[v*3],y:positions[v*3+1],z:positions[v*3+2]},meta.originUE)));saveJSON(args[1],{schema:1,polygons});}
 finally{navMesh.destroy();}
}
function coverage(args){
 requireValue(args.length===3,'coverage nav samples output');const {navMesh,meta}=loadNav(args[0]);const q=new NavMeshQuery(navMesh,{maxNodes:65535});
 try{
  const input=JSON.parse(fs.readFileSync(args[1],'utf8')),rows=[];let previous;
  for(const sample of input.samples){
   const found=q.findNearestPoly(toNav(sample.p,meta.originUE),{halfExtents:{x:.5,y:.75,z:.5}}),point=fromNav(found.nearestPoint,meta.originUE);
   const error=found.nearestRef?Math.hypot(...point.map((v,k)=>v-sample.p[k])):null;
   let connected;
   if(previous&&found.nearestRef&&previous.found.nearestRef&&sample.at-previous.sample.at<1000&&Math.hypot(...sample.p.map((v,k)=>v-previous.sample.p[k]))<150){
    const route=q.findPath(previous.found.nearestRef,found.nearestRef,previous.found.nearestPoint,found.nearestPoint,{maxPathPolys:8192});
    try{connected=route.success&&route.polys.size>0&&route.polys.get(route.polys.size-1)===found.nearestRef&&!(route.status&(Detour.DT_PARTIAL_RESULT|Detour.DT_OUT_OF_NODES|Detour.DT_BUFFER_TOO_SMALL));}
    finally{route.polys.destroy();}
   }
   rows.push({at:sample.at,p:sample.p,projected:point,errorCm:error,covered:error!==null&&error<=50,connectedFromPrevious:connected});previous={sample,found};
  }
  const report={schema:1,scope:'Comparison with actual captured supported feet; reference samples are never construction inputs',samples:rows.length,
   covered:rows.filter(r=>r.covered).length,disconnectedAdjacent:rows.filter(r=>r.connectedFromPrevious===false).length,rows};
  saveJSON(args[2],report);console.log(`Reference coverage ${report.covered}/${report.samples}; ${report.disconnectedAdjacent} adjacent disconnections`);
 }finally{q.destroy();navMesh.destroy();}
}
function components(args){
 requireValue(args.length===8,'components nav output sx sy sz gx gy gz');const {navMesh,meta}=loadNav(args[0]),nodes=new Map();
 try{
  for(let i=0;i<navMesh.getMaxTiles();i++){
   const tile=navMesh.getTile(i),header=tile.header();if(!header)continue;const base=navMesh.getPolyRefBase(tile);
   for(let j=0;j<header.polyCount();j++){
    const poly=tile.polys(j);if(poly.getType()!==0||!(poly.flags()&1))continue;
    const vertices=[];for(let k=0;k<poly.vertCount();k++){const v=poly.verts(k)*3;vertices.push(fromNav({x:tile.verts(v),y:tile.verts(v+1),z:tile.verts(v+2)},meta.originUE));}
    const neighbors=[];let link=poly.firstLink()>>>0,count=0;
    while(link!==0xffffffff){requireValue(++count<=header.maxLinkCount()&&link<header.maxLinkCount(),'invalid Detour link chain');const row=tile.links(link);if(row.ref())neighbors.push(row.ref()>>>0);link=row.next()>>>0;}
    nodes.set((base+j)>>>0,{ref:(base+j)>>>0,vertices,neighbors,component:-1});
   }
  }
  const summary=[];
  for(const root of nodes.values())if(root.component===-1){
   const id=summary.length,queue=[root];root.component=id;const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let count=0;
   while(queue.length){const row=queue.pop();count++;for(const p of row.vertices)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}for(const ref of row.neighbors){const next=nodes.get(ref);if(next&&next.component===-1){next.component=id;queue.push(next);}}}
   summary.push({id,polygons:count,boundsUE:[...lo,...hi]});
  }
  const q=new NavMeshQuery(navMesh),numbers=args.slice(2).map(numeric),endpointComponents=[];
  try{for(const endpoint of [numbers.slice(0,3),numbers.slice(3)]){const hit=q.findNearestPoly(toNav(endpoint,meta.originUE),{halfExtents:{x:1,y:.75,z:1}});endpointComponents.push(nodes.get(hit.nearestRef)?.component??null);}}
  finally{q.destroy();}
  saveJSON(args[1],{schema:1,endpointComponents,summary,nodes:[...nodes.values()]});console.log(`Detour components ${summary.length}; endpoint components ${endpointComponents.join(', ')}`);
 }finally{navMesh.destroy();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{await init();const [command,...args]=process.argv.slice(2);if(command==='bake')bake(args);else if(command==='query')query(args);else if(command==='inspect')inspect(args);else if(command==='coverage')coverage(args);else if(command==='components')components(args);else throw Error('Expected bake, query, inspect, coverage or components');}
 catch(error){console.error('ERROR:',error.message);process.exitCode=2;}
}
