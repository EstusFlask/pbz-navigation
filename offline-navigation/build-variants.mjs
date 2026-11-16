// Offline compiler: actual collision -> upstream Recast -> conditional Detour tiles.
// No executable is generated and no saved progress is written into the public data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {init,NavMesh,NavMeshParams,RecastBuildContext,exportNavMesh,Raw} from 'recast-navigation';
import {buildTiledNavMeshRcConfig,tiledNavMeshGeneratorConfigDefaults} from 'recast-navigation/generators';
import {readGeometry,buildOneTile} from './cli.mjs';
import {navHeader} from './nav-set.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);},hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const [input,output,...extra]=process.argv.slice(2);
need(input&&output&&!extra.length,'Usage: node build-variants.mjs collision.tiles.json output-folder');
const root=path.dirname(path.resolve(input)),manifest=JSON.parse(fs.readFileSync(input,'utf8'));
need(manifest.scenario==='base'&&manifest.unresolvedCount===0,'Conditional compilation requires base geometry with zero unresolved colliders');
const file=path.resolve(root,manifest.conditionalFile??'');need(file.startsWith(root+path.sep),'Conditional file escapes region');
const raw=fs.readFileSync(file);need(hash(raw)===manifest.conditionalSHA256,'Conditional collision hash mismatch');
const dynamic=JSON.parse(raw),rules=JSON.parse(fs.readFileSync(new URL('../authoring/offline-collision-state-rules.json',import.meta.url),'utf8')).rules;
need(dynamic.schema===1&&dynamic.scenario==='base','State-specific input cannot become public navigation');
const origin=manifest.originUE,b=manifest.boundsUE,agent={radiusCm:45,heightCm:192,climbCm:50,slope:55};
const settings=JSON.parse(fs.readFileSync(new URL('./build-settings.json',import.meta.url),'utf8'));
const cellCm=manifest.cellCm,tileSize=manifest.tileCells,cs=cellCm/100,ch=.05;
need(manifest.radiusCm===agent.radiusCm,'Agent radius mismatch');
const config={...tiledNavMeshGeneratorConfigDefaults,cs,ch,tileSize,walkableHeight:Math.ceil(agent.heightCm/(ch*100)),walkableClimb:Math.floor(agent.climbCm/(ch*100)),
 walkableRadius:Math.ceil((agent.radiusCm+(settings.maxSimplificationErrorVoxels+settings.voxelBoundaryReserveVoxels)*cellCm)/cellCm),
 walkableSlopeAngle:agent.slope,maxSimplificationError:settings.maxSimplificationErrorVoxels,maxEdgeLen:Math.floor(1200/cellCm),
 minRegionArea:4,mergeRegionArea:20,maxVertsPerPoly:6,detailSampleDist:6,detailSampleMaxError:1,
 bounds:[[(b[0]-origin[0])/100,(b[2]-origin[2])/100,-(b[4]-origin[1])/100],[(b[3]-origin[0])/100,(b[5]-origin[2])/100,-(b[1]-origin[1])/100]]};
need(manifest.borderCm>=(config.walkableRadius+3)*cellCm,'Partition border too small');
await init();const built=buildTiledNavMeshRcConfig({recastConfig:config,navMeshBounds:config.bounds});
const {config:rc,tileWidth,tileHeight,tcs,orig,maxTiles,maxPolysPerTile}=built;
need(tileWidth===manifest.gridWidth&&tileHeight===manifest.gridHeight,'Partition grid mismatch');
const nav=new NavMesh(),params=NavMeshParams.create({orig,tileWidth:tcs,tileHeight:tcs,maxTiles,maxPolys:maxPolysPerTile});
need(nav.initTiled(params),'Navigation initialization failed');const header=navHeader(exportNavMesh(nav)).bytes;nav.destroy();
const context=new RecastBuildContext(),actors=new Map(),meshes=dynamic.meshes.map(row=>{
 const rule=rules.find(rule=>rule.id===row.condition.rule);need(rule,'Unknown collision-state rule');
 const id=row.condition.actorID,worldPrefix=manifest.world.toLowerCase()+'-';need(id.toLowerCase().startsWith(worldPrefix),'Actor world mismatch');
 actors.set(id,{id,name:id.slice(worldPrefix.length),rule:rule.id,classAsset:rule.classAsset,savedField:rule.savedField,components:rule.components??null,componentClass:rule.componentClass??null});
 const positions=new Float32Array(row.vertices.length*3),indices=Uint32Array.from(row.triangles.flat());
 const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
 row.vertices.forEach((v,i)=>{positions[i*3]=(v[0]-origin[0])/100;positions[i*3+1]=(v[2]-origin[2])/100;positions[i*3+2]=-(v[1]-origin[1])/100;
  for(let k=0;k<2;k++){lo[k]=Math.min(lo[k],v[k]);hi[k]=Math.max(hi[k],v[k]);}});
 return {id,lo,hi,positions,indices};
});
const baseTiles=new Map(manifest.tiles.map(t=>[t.x+','+t.y,t])),tiles=[],blobs={},out=path.resolve(output);
fs.mkdirSync(out,{recursive:true});let count=0,variants=0;
try{
 for(let y=0;y<tileHeight;y++)for(let x=0;x<tileWidth;x++){
  const tile=baseTiles.get(x+','+y),border=manifest.borderCm,left=b[0]+x*tcs*100,top=b[4]-y*tcs*100;
  const conditional=meshes.filter(m=>m.lo[0]<=left+tcs*100+border&&m.hi[0]>=left-border&&m.lo[1]<=top+border&&m.hi[1]>=top-tcs*100-border);
  const ids=[...new Set(conditional.map(m=>m.id))].sort();need(ids.length<=6,`Tile ${x},${y} needs too many conditional combinations`);
  let base={positions:new Float32Array(),indices:new Uint32Array()};
  if(tile){const file=path.resolve(root,tile.file);need(file.startsWith(root+path.sep),'Tile escapes region');base=readGeometry(file,origin);need(base.sha256===tile.sha256,'Base tile hash mismatch');}
  const row={slot:y*tileWidth+x,x,y,conditions:ids,variants:{}};
  const bmin=[config.bounds[0][0]+x*tcs,config.bounds[0][1],config.bounds[0][2]+y*tcs],bmax=[bmin[0]+tcs,config.bounds[1][1],bmin[2]+tcs];
  for(let mask=0;mask<2**ids.length;mask++){
   const key=ids.map((_,i)=>(mask>>i)&1).join(''),closed=new Set(ids.filter((_,i)=>(mask>>i)&1));
   const parts=[base,...conditional.filter(m=>closed.has(m.id))],np=parts.reduce((n,p)=>n+p.positions.length,0),ni=parts.reduce((n,p)=>n+p.indices.length,0);
   const positions=new Float32Array(np),indices=new Uint32Array(ni);let vp=0,ip=0;
   for(const p of parts){positions.set(p.positions,vp);for(let j=0;j<p.indices.length;j++)indices[ip+j]=p.indices[j]+vp/3;vp+=p.positions.length;ip+=p.indices.length;}
   const result=buildOneTile({positions,indices},rc,{x,y,bmin,bmax},context);let blob=null;
   if(result.data)try{const bytes=result.data.toTypedArray();blob=hash(bytes);if(!blobs[blob]){fs.writeFileSync(path.join(out,blob+'.bin'),bytes);blobs[blob]={file:blob+'.bin',bytes:bytes.length,sha256:blob};}}
   finally{result.data.destroy();}
   row.variants[key]=blob;variants++;
  }
  tiles.push(row);if(++count%20===0)console.log(`Compiled ${count}/${tileWidth*tileHeight} tiles; ${variants} variants`);
 }
 const index={schema:1,engine:'recast-navigation@0.44.0',backend:'upstream-recast-detour-webassembly',world:manifest.world,boundsUE:b,originUE:origin,
  agent,config,navHeaderBase64:Buffer.from(header).toString('base64'),actors:[...actors.values()],tiles,blobs,
  sourceCollisionSHA256:manifest.sourceMeshSHA256,conditionalCollisionSHA256:manifest.conditionalSHA256,
  unknownState:'closed',completeCollisionClaim:false,physicalVerified:false};
 fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index));
 console.log(`Conditional navigation: ${tiles.length} slots, ${actors.size} actors, ${variants} variants, ${Object.keys(blobs).length} distinct tiles`);
}finally{context.destroy();Raw.destroy(rc);}
