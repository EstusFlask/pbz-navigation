// Geometry-derived movement proposals around real placed interactions/bells.
// No observed player coordinates, routes, saves or field reports are inputs.
import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import {createRequire} from 'node:module';
import {initialize} from './query.mjs';import {PagedWorld} from './world-pages.mjs';
import {movementFieldCells,movementFieldRoot,movementFieldHeights,supportsMovementFieldExtent} from './movement-field-corridor.mjs';
const require=createRequire(import.meta.url),root=process.cwd(),mod=path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute'),data=path.resolve(process.argv[2]||'build/offline-navigation/mod-worlds'),output=path.resolve(process.argv[3]||'build/offline-navigation/movement-proposals'),selected=process.argv[4],allComponents=process.argv[5]==='all-components'||process.argv[6]==='component-roots',componentRoots=process.argv[6]==='component-roots',extent=Number(process.argv[7]||(componentRoots?1280:10240));
if(!supportsMovementFieldExtent(extent))throw Error('Unsupported bounded movement field extent');
if(process.argv[5]&&!['all-components','seeded'].includes(process.argv[5])||process.argv[6]&&process.argv[6]!=='component-roots')throw Error('Expected seeded|all-components followed by optional component-roots, extent and JSON region bounds');
const region=process.argv[8]?JSON.parse(process.argv[8]):null;
if(region&&(!Array.isArray(region)||region.length!==4||!region.every(Number.isFinite)||region[0]>=region[2]||region[1]>=region[3]))throw Error('Invalid geometry field region');
const corridorSpec=process.argv[9]?JSON.parse(process.argv[9]):null;
if(corridorSpec&&(!Array.isArray(corridorSpec.start)||corridorSpec.start.length!==3||!Array.isArray(corridorSpec.goal)||corridorSpec.goal.length!==3||!Number.isFinite(corridorSpec.widthCm)||corridorSpec.widthCm<0||![...corridorSpec.start,...corridorSpec.goal].every(Number.isFinite)))throw Error('Invalid geometry-only movement field corridor');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceScriptsSHA256=Object.fromEntries(['offline-navigation/build-movement-proposals.mjs','offline-navigation/movement-field-corridor.mjs','offline-navigation/movement-links.mjs','offline-navigation/query.mjs','offline-navigation/world-pages.mjs','offline-navigation/world-window.mjs','offline-navigation/admission.mjs'].map(file=>[file,digest(path.join(root,file))]));
const tables=require(path.join(mod,'PBZRouteTables')).data,catalog=JSON.parse(fs.readFileSync(path.join(data,'catalog.json'))),drain=job=>{let r;do{r=job.next();}while(!r.done);return r.value;};await initialize();fs.mkdirSync(output,{recursive:true});
for(const world of Object.keys(catalog.worlds).filter(w=>!selected||selected===w)){
 const rootIndex=JSON.parse(fs.readFileSync(path.join(data,world,'index.json'))),grid=rootIndex.kind==='multi-grid-world'?rootIndex.grids.find(g=>g.selector.mode==='exclude'):null;
 const prefix=grid?path.dirname(grid.index)+'/':'';const index=grid?JSON.parse(fs.readFileSync(path.join(data,world,grid.index))):rootIndex;if(index.kind!=='paged-sparse-world')continue;
 if(!selected&&fs.existsSync(path.join(output,world+'.receipt.json'))){const old=JSON.parse(fs.readFileSync(path.join(output,world+'.receipt.json')));if(JSON.stringify(old.sourceScriptsSHA256)===JSON.stringify(sourceScriptsSHA256)&&old.sourceIndexSHA256===rootIndex.sourceIndexSHA256)continue;}
 const actors=require(path.join(mod,'PBZRoutePlacedPassages')).forWorld(world);
 const anchors=[...actors.flatMap(f=>[f.path[0],f.path.at(-1)]),...Object.values(tables.bells).filter(b=>b.world===world).map(b=>b.at)];
 const groups=new Map(),rows=new Map(),coverage=[],failures=[],corridorRows=corridorSpec?movementFieldCells(corridorSpec.start,corridorSpec.goal,extent,corridorSpec.widthCm):[];
 for(const cell of corridorRows)groups.set(cell.id,[]);
 if(corridorSpec){
  for(const p of anchors){const id=Math.floor(p[0]/extent)+','+Math.floor(p[1]/extent);if(groups.has(id))groups.get(id).push(p);}
 }else if(region&&componentRoots){
  for(let x=Math.floor(region[0]/extent);x<=Math.floor(region[2]/extent);x++)for(let y=Math.floor(region[1]/extent);y<=Math.floor(region[3]/extent);y++)groups.set(x+','+y,[]);
  for(const p of anchors){const id=Math.floor(p[0]/extent)+','+Math.floor(p[1]/extent);if(groups.has(id))groups.get(id).push(p);}
 }else for(const p of anchors){if(region&&(p[0]<region[0]||p[0]>region[2]||p[1]<region[1]||p[1]>region[3]))continue;const id=Math.floor(p[0]/extent)+','+Math.floor(p[1]/extent);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
 const paged=new PagedWorld(index,f=>fs.readFileSync(path.join(data,world,prefix+f),'utf8'),{maxNodes:65535});
 try{for(const [id,local]of groups){
  const [x,y]=id.split(',').map(Number),coreBounds=[x*extent,y*extent,(x+1)*extent,(y+1)*extent],bounds=[coreBounds[0]-1280,coreBounds[1]-1280,coreBounds[2]+1280,coreBounds[3]+1280],seeds=anchors.filter(p=>p[0]>=bounds[0]&&p[0]<=bounds[2]&&p[1]>=bounds[1]&&p[1]<=bounds[3]),corridorCell=corridorRows.find(row=>row.id===id);
  if(corridorCell)seeds.push(corridorCell.center);
  if(!seeds.length){
   if(!region)continue;
   const cx=(coreBounds[0]+coreBounds[2])/2,cy=(coreBounds[1]+coreBounds[3])/2,nearest=anchors.slice().sort((a,b)=>Math.hypot(a[0]-cx,a[1]-cy)-Math.hypot(b[0]-cx,b[1]-cy))[0];
   if(!nearest||Math.hypot(nearest[0]-cx,nearest[1]-cy)>20000){failures.push({id,error:'No nearby placed-component root'});continue;}
   seeds.push(nearest);
  }
   const [lo,hi]=movementFieldHeights(seeds,{componentRoots,corridor:!!corridorCell});
  try{
   const center=[(coreBounds[0]+coreBounds[2])/2,(coreBounds[1]+coreBounds[3])/2,seeds[0][2]];
   drain(paged.directJob(center,center,{}, {boundsUE:bounds,heightBoundsUE:[lo,hi]}));
   const roots=seeds.map(p=>[...p]);
   const sample=corridorCell?.center||(region&&componentRoots&&!local.length?center:null),geometryRoot=sample?movementFieldRoot(paged.window.planner,sample,bounds,extent):null;
   if(geometryRoot)roots.push(geometryRoot);
   const found=drain(paged.window.planner.dropCandidatesJob(roots,{maxHeightCm:1950,maxRunCm:1200,maxRiseCm:200,envelopeBands:true,allComponents,...(componentRoots?{sourceBoundsUE:coreBounds,inboundRoots:true}:{})}));
   for(const row of found){const id=[...row.a,...row.b].map(Math.round).join(',');if(!rows.has(id))rows.set(id,[...row.a,...row.b].map(v=>+v.toFixed(3)));}
   if(found.stats?.allComponents)coverage.push({boundsUE:coreBounds,heightBoundsUE:[lo,hi],rows:found.length,rootedAtPlacedComponents:componentRoots,geometryCorridorRoot:!!corridorCell,geometryFieldRoot:geometryRoot});
   else if(allComponents)failures.push({id,error:'Movement component limit reached',stats:found.stats});
   // A seed-only scan does not prove that an unseeded intermediate platform
   // has no action. Leave that region incomplete for bounded live discovery.
   console.log('MOVEMENT',world,id,found.length,rows.size);
  }catch(error){failures.push({id,error:String(error)});console.log('MOVEMENT SKIPPED',world,id,String(error));}
 }}finally{paged.destroy();}
 const directory=path.join(output,world);fs.mkdirSync(directory,{recursive:true});const values=[...rows.values()],pages=Math.ceil(values.length/512);
 for(let i=0;i<pages;i++)fs.writeFileSync(path.join(directory,i+'.js'),"'use strict';\nexports.rows="+JSON.stringify(values.slice(i*512,(i+1)*512))+";\n");
 const manifest={schema:1,world,sourceScriptsSHA256,placedInputsSHA256:fs.existsSync(path.join(mod,'PBZRoutePlacedPassages',world+'.js'))?digest(path.join(mod,'PBZRoutePlacedPassages',world+'.js')):null,sourceFeaturesSHA256:crypto.createHash('sha256').update(JSON.stringify(actors)).digest('hex'),bellsInputSHA256:digest(path.join(mod,'PBZRouteTables.js')),sourceIndexSHA256:rootIndex.sourceIndexSHA256,navigationGrid:grid?.id||null,sourceGridIndexSHA256:index.sourceIndexSHA256,kind:'geometry-movement-proposals',pageRows:512,region,fieldExtentCm:extent,rootedAtPlacedComponents:componentRoots,inboundRoots:componentRoots,corridorSpec,corridorCells:corridorRows.length,pages,rows:values.length,coverage,failures,physicalVerified:false};fs.writeFileSync(path.join(directory,'index.js'),"'use strict';\nexports.data="+JSON.stringify(manifest)+";\n");fs.writeFileSync(path.join(output,world+'.receipt.json'),JSON.stringify(manifest,null,2));console.log('MOVEMENT WORLD',world,values.length,pages,failures.length);
}
