// Persistent offline WASM worker. The game runtime remains plain JavaScript.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {init,NavMesh,NavMeshParams,RecastBuildContext,exportNavMesh,Raw} from 'recast-navigation';
import {buildTiledNavMeshRcConfig,tiledNavMeshGeneratorConfigDefaults} from 'recast-navigation/generators';
import {readGeometry,buildOneTile} from './cli.mjs';
import {navHeader} from './nav-set.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),need=(v,m)=>{if(!v)throw Error(m);};
const settingsBytes=fs.readFileSync(new URL('./build-settings.json',import.meta.url)),settings=JSON.parse(settingsBytes);
const compilerSHA256=hash(Buffer.concat([fs.readFileSync(new URL(import.meta.url)),fs.readFileSync(new URL('./cli.mjs',import.meta.url)),settingsBytes,
 fs.readFileSync(new URL('./nav-set.mjs',import.meta.url)),fs.readFileSync(new URL('./grid-mask.mjs',import.meta.url)),fs.readFileSync(new URL('./package-lock.json',import.meta.url)),
 fs.readFileSync(new URL('./node_modules/@recast-navigation/wasm/dist/recast-navigation.wasm.wasm',import.meta.url))]));
const rules=JSON.parse(fs.readFileSync(new URL('../authoring/offline-collision-state-rules.json',import.meta.url),'utf8')).rules;
const atomic=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);};
await init();
function compile(request){
 const local=JSON.parse(fs.readFileSync(request.metadata,'utf8')),m=local.metadata,out=request.output;
 fs.mkdirSync(out,{recursive:true});const receipt=path.join(out,'receipt.json');
 if(fs.existsSync(receipt)){
  const old=JSON.parse(fs.readFileSync(receipt,'utf8'));
  if(!old.error&&old.inputSHA256===local.inputSHA256&&old.compilerSHA256===compilerSHA256&&Object.values(old.blobs).every(b=>{
   const file=path.join(out,b.file);return fs.existsSync(file)&&hash(fs.readFileSync(file))===b.sha256;
  })){
   old.sourceLedgerSHA256=m.sourceLedgerSHA256;old.spatialIndexSHA256=m.spatialIndexSHA256;atomic(receipt,old);
   return{resumed:true};
  }
 }
 const g=readGeometry(request.input,m.originUE);need(g.sha256===local.meshSHA256,'Selected collision hash mismatch');
 const cell=m.cellCm,cs=cell/100,ch=.05,tcs=m.extentCm/100,x=local.x,y=local.y,agent=m.agent;
 const nav=new NavMesh(),params=NavMeshParams.create({orig:{x:0,y:0,z:0},tileWidth:tcs,tileHeight:tcs,maxTiles:256,maxPolys:16384});
 need(nav.initTiled(params),'Window navigation initialization failed');Raw.destroy(params.raw);
 const header=navHeader(exportNavMesh(nav)).bytes;nav.destroy();
 const allIds=[...new Set(local.conditionalRanges.map(r=>r.condition.actorID))].sort();
 const conditional=new Int32Array(g.indices.length/3);conditional.fill(-1);
 for(const range of local.conditionalRanges)conditional.fill(allIds.indexOf(range.condition.actorID),range.firstTriangle,range.firstTriangle+range.triangles);
 const blobs={},actors=new Map(),layers=[],rasterCoverage=[];
 need(local.layers.length<=32,'Too many disconnected height layers');
 for(const layer of local.layers){
  const faceIds=[];for(const [first,count]of layer.triangleRanges)for(let i=first;i<first+count;i++)faceIds.push(i);
  const ids=[...new Set(faceIds.filter(i=>conditional[i]>=0).map(i=>allIds[conditional[i]]))].sort();
  need(ids.length<=6,'More than six conditional actors in one height layer');
  for(const id of ids){
   const condition=local.conditionalRanges.find(r=>r.condition.actorID===id).condition,rule=rules.find(r=>r.id===condition.rule);need(rule,'Unknown condition');
   actors.set(id,{id,rule:rule.id,classAsset:rule.classAsset,savedField:rule.savedField});
  }
  const bmin=[x*tcs,Math.floor(layer.boundsZUE[0]/5)*ch,y*tcs],bmax=[(x+1)*tcs,Math.ceil(layer.boundsZUE[1]/5)*ch+ch,(y+1)*tcs];
  need(bmax[1]-bmin[1]<65530*ch,'Connected vertical span exceeds Recast height range; additional geometry partitioning required');
  const config={...tiledNavMeshGeneratorConfigDefaults,cs,ch,tileSize:m.tileCells,
   walkableHeight:Math.ceil(agent.heightCm/5),walkableClimb:Math.floor(agent.climbCm/5),
   walkableRadius:Math.ceil((agent.radiusCm+(settings.maxSimplificationErrorVoxels+settings.voxelBoundaryReserveVoxels)*cell)/cell),
   walkableSlopeAngle:agent.slope,maxSimplificationError:settings.maxSimplificationErrorVoxels,maxEdgeLen:Math.floor(1200/cell),
   minRegionArea:4,mergeRegionArea:20,maxVertsPerPoly:6,detailSampleDist:6,detailSampleMaxError:1,bounds:[bmin,bmax]};
  need(m.borderCm>=(config.walkableRadius+3)*cell,'Spatial border too small');
  const {config:rc}=buildTiledNavMeshRcConfig({recastConfig:config,navMeshBounds:config.bounds}),context=new RecastBuildContext(),variants={};
  try{
   for(let mask=0;mask<2**ids.length;mask++){
    const key=ids.map((_,i)=>(mask>>i)&1).join(''),closed=new Set(ids.filter((_,i)=>mask&(1<<i))),selected=[];
    for(const i of faceIds)if(conditional[i]<0||closed.has(allIds[conditional[i]]))selected.push(g.indices[i*3],g.indices[i*3+1],g.indices[i*3+2]);
    const obstacleBounds=(local.nonWalkableBoundsUE??[]).filter(r=>!r.actorID||closed.has(r.actorID)).map(r=>{
     const b=r.boundsUE,o=m.originUE,pad=agent.climbCm/100+ch;return[[(b[0]-o[0])/100,(b[2]-o[2])/100-pad,-(b[4]-o[1])/100],[(b[3]-o[0])/100,(b[5]-o[2])/100+pad,-(b[1]-o[1])/100]];
    });
    const result=buildOneTile({positions:g.positions,indices:Uint32Array.from(selected),obstacleBounds,conservativeGridMask:local.conservativeGridMask},rc,{x,y,bmin,bmax},context);let blob=null;
    rasterCoverage.push({layer:layer.layer,variant:key,...result.chunkCoverage});
    if(result.data)try{
     const bytes=Uint8Array.from(result.data.toTypedArray()),view=new DataView(bytes.buffer);
     const polygons=view.getInt32(24,true);need(polygons<=65536,'Tile exceeds maximum dense-window polygon capacity: '+polygons);
     // Upstream's generator emits layer 0. Only the documented dtMeshHeader
     // identity field changes; all Recast geometry and Detour links are intact.
     view.setInt32(16,layer.layer,true);
     blob=hash(bytes);if(!blobs[blob]){fs.writeFileSync(path.join(out,blob+'.bin'),bytes);blobs[blob]={file:blob+'.bin',bytes:bytes.length,sha256:blob,polygons};}
    }finally{result.data.destroy();}
    variants[key]=blob;
   }
   layers.push({layer:layer.layer,verticalBoundsUE:layer.boundsZUE,conditions:ids,variants});
  }finally{context.destroy();Raw.destroy(rc);}
 }
 atomic(receipt,{schema:1,x,y,layers,blobs,actors:[...actors.values()],inputSHA256:local.inputSHA256,
  sourceLedgerSHA256:m.sourceLedgerSHA256,spatialIndexSHA256:m.spatialIndexSHA256,materializerSHA256:m.materializerSHA256,
  compilerSHA256,navHeaderBase64:Buffer.from(header).toString('base64'),inputTriangles:local.triangles,rasterCoverage,
  completeCollisionClaim:false,physicalVerified:false});
 return{compiled:true};
}
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
 let request;
 try{request=JSON.parse(line);process.stdout.write(JSON.stringify(compile(request))+'\n');}
 catch(error){
  const result={error:String(error.stack??error)};
  if(request)try{const local=JSON.parse(fs.readFileSync(request.metadata));atomic(path.join(request.output,'receipt.json'),{...result,x:local.x,y:local.y,inputSHA256:local.inputSHA256,sourceLedgerSHA256:local.metadata.sourceLedgerSHA256,spatialIndexSHA256:local.metadata.spatialIndexSHA256,compilerSHA256});}catch{}
  process.stdout.write(JSON.stringify(result)+'\n');
 }
}
