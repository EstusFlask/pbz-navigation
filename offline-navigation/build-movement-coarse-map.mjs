import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {initialize} from './query.mjs';import {PagedWorld} from './world-pages.mjs';import {PackedStore} from './packed-storage.mjs';import {tileComponentsJob,movementComponentEdges} from './coarse-components.mjs';
const require=createRequire(import.meta.url),mod=path.resolve('Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute'),data=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]),world=process.argv[4],policyFile=path.resolve(process.argv[5]),movementRoot=path.resolve(process.argv[6]||path.join(mod,'PBZRouteMovementData')),need=(value,message)=>{if(!value)throw Error(message);},sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),drain=job=>{let result;do{result=job.next();}while(!result.done);return result.value;};
need(output.startsWith(path.resolve('build')+path.sep)&&/^pbz_[a-z0-9_]+$/.test(world),'Private output and a world ID required');
const directory=path.join(output,world);need(!fs.existsSync(directory),'Fresh world mapping output required');
const movement=path.join(movementRoot,world),manifest=require(path.join(movement,'index.js')).data,rootIndex=JSON.parse(fs.readFileSync(path.join(data,world,'index.json'))),policy=JSON.parse(fs.readFileSync(policyFile));
need(manifest.sourceIndexSHA256===rootIndex.sourceIndexSHA256&&Number.isFinite(policy.maxHeightCm)&&policy.maxHeightCm>0&&Number.isFinite(policy.maxRunCm)&&policy.maxRunCm>0,'Navigation source or movement policy differs');
const grid=rootIndex.kind==='multi-grid-world'?rootIndex.grids.find(row=>row.id===manifest.navigationGrid):null;
need(rootIndex.kind==='paged-sparse-world'||grid,'An explicit matching movement grid is required');
const prefix=grid?path.dirname(grid.index)+'/':'',index=grid?JSON.parse(fs.readFileSync(path.join(data,world,grid.index))):rootIndex;
need(!manifest.sourceGridIndexSHA256||manifest.sourceGridIndexSHA256===index.sourceIndexSHA256,'Movement grid source differs');
fs.mkdirSync(directory,{recursive:true});
const {Reader}=require(path.join(mod,'PBZRouteMovementStore')),reader=new Reader(manifest,file=>fs.readFileSync(path.join(movement,file),'utf8'),{PackedStore}),descriptors=drain(reader.descriptorsJob([-1e9,-1e9,1e9,1e9])),points=[],pointMap=new Map(),references=[],size=index.extentCm,groups=new Map();
const identify=point=>{const key=point.join(',');if(pointMap.has(key))return pointMap.get(key);const id=points.length;pointMap.set(key,id);points.push(point);const cell=[Math.floor(point[0]/size),Math.floor(-point[1]/size),Math.floor(point[2]/1500)].join('/');if(!groups.has(cell))groups.set(cell,[]);groups.get(cell).push(id);return id;};
for(const descriptor of descriptors)for(const row of drain(reader.pageJob(descriptor))){const drop=row[2]-row[5],span=Math.hypot(row[0]-row[3],row[1]-row[4]);if(drop>policy.maxHeightCm||drop< -200||span>policy.maxRunCm+1)continue;references.push([identify(row.slice(0,3)),identify(row.slice(3)),drop<100]);}
reader.clear();pointMap.clear();console.log('MAPPING INPUT',world,references.length,points.length,groups.size);
await initialize();const pages=new PagedWorld(index,file=>fs.readFileSync(path.join(data,world,prefix+file),'utf8'),{maxNodes:65535}),states=Object.fromEntries(index.actors.map(row=>[row.id,true])),mapped=new Int32Array(points.length);mapped.fill(-1);const cache=new Map(),failures=[];
const componentOrdinals=(tile,planner)=>{
 let labels=cache.get(tile.blob);if(labels)return labels;
 need(tile.blob===tile.variants['0'.repeat(tile.conditions.length)],'Nonoptimistic tile cannot use coarse IDs');
 const decoded=drain(tileComponentsJob(planner.tileBuffers.get(tile.slot).getHeapView()));
 need(decoded.components===tile.coarseSeeds.length,'Coarse ordinal count differs');labels=decoded.labels;cache.set(tile.blob,labels);while(cache.size>16)cache.delete(cache.keys().next().value);return labels;
};
let completed=0;
try{
 for(const [cell,ids]of groups){
  const [x,y,z]=cell.split('/').map(Number),sample=points[ids[0]],boundsUE=[x*size-101,-(y+1)*size-101,(x+1)*size+101,-y*size+101];
  try{
   drain(pages.directJob(sample,sample,states,{boundsUE,heightBoundsUE:[z*1500-200,(z+1)*1500+200]}));const planner=pages.window.planner,slots=new Map([...pages.window.loaded.values()].map(row=>[row.slot,row]));
   for(const id of ids){const point=points[id],near=planner.query.findNearestPoly({x:point[0]/100,y:point[2]/100,z:-point[1]/100},{halfExtents:{x:1,y:.9,z:1}});if(!near.success||!near.nearestRef)continue;const decoded=planner.navMesh.decodePolyId(near.nearestRef),tile=slots.get(decoded.tileIndex);if(!tile?.coarseSeeds?.length)continue;const ordinal=componentOrdinals(tile,planner)[decoded.tilePolygonIndex];if(ordinal!==undefined)mapped[id]=tile.coarseSeeds[ordinal][0];}
  }catch(error){if(!/budget|capacity/.test(String(error)))throw error;failures.push({cell,points:ids.length,error:String(error)});}
  if(++completed%20===0)console.log('MAPPING GROUP',world,completed,'/',groups.size,'failures',failures.length);
 }
 const edges=new Map();let unclassified=0,same=0;
 for(const [first,last]of references){const from=mapped[first],to=mapped[last];if(from<0||to<0){unclassified++;continue;}if(from===to){same++;continue;}for(const edge of movementComponentEdges(from,to,points[first],points[last])){const key=edge.from+'/'+edge.to;if(!edges.has(key)||edge.cost<edges.get(key).cost)edges.set(key,edge);}}
 const scripts=['build-movement-coarse-map.mjs','coarse-components.mjs','query.mjs','world-pages.mjs','world-window.mjs','admission.mjs','packed-storage.mjs'],report={schema:1,world,sourceIndexSHA256:rootIndex.sourceIndexSHA256,navigationGrid:grid?.id||null,sourceGridIndexSHA256:index.sourceIndexSHA256,movementManifestSHA256:sha(path.join(movement,'index.js')),sourceScriptsSHA256:Object.fromEntries(scripts.map(file=>[file,sha(new URL(file,import.meta.url))])),policySHA256:sha(policyFile),policy,scope:'Optimistic geometry component hints only; no physical/native/game certificate, no trajectory input',inputRows:manifest.rows,eligibleRows:references.length,uniquePoints:points.length,groups:groups.size,failures,unclassified,sameComponent:same,edges:[...edges.values()]};fs.writeFileSync(path.join(directory,'mapping.json'),JSON.stringify(report));console.log('MAPPING DONE',JSON.stringify({...report,edges:report.edges.length}));
}finally{pages.destroy();}
