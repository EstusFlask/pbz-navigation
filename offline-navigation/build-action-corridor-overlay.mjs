// Offline component anchors for real placed/native construction actions.
// The overlay chooses a bounded geometry window only; current actions/locks
// and full scene checks remain mandatory before a route can be displayed.
import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';import{createRequire}from'node:module';import{initialize}from'./query.mjs';import{PagedWorld}from'./world-pages.mjs';import{hookVolumePoints}from'./hook-volume-anchors.mjs';
const require=createRequire(import.meta.url),root=process.cwd(),mod=path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute'),data=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]),chosen=process.argv[4],placed=require(path.join(mod,'PBZRoutePlacedPassages')),volume=require(path.join(mod,'PBZRouteHookVolume')),landing=require(path.join(mod,'PBZRouteLandingLimits')),catalog=JSON.parse(fs.readFileSync(path.join(data,'catalog.json'))),drain=j=>{let r;do{r=j.next();}while(!r.done);return r.value;},sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!data||!output.startsWith(path.resolve('build')+path.sep))throw Error('Private data/output required');await initialize();fs.mkdirSync(output,{recursive:true});const report=[];
const volumesFile=process.argv[5]&&path.resolve(process.argv[5]);
const volumes=volumesFile?JSON.parse(fs.readFileSync(volumesFile,'utf8')):null;
if(volumes&&(!volumesFile.startsWith(path.resolve('build')+path.sep)||volumes.schema!==1||
 volumes.factsSHA256!==sha(fs.readFileSync(path.join(root,'authoring/placed-passage-facts.json')))))
 throw Error('Wallrun volume receipt does not match placed actions');
const volumeRows=new Map(volumes?.rows.map(row=>[row.guid,row]));
const relayFile=path.join(mod,'PBZRouteWallrunRelays.js'),relays=require(relayFile);
const slideRelayFile=path.join(mod,'PBZRouteSlideRelay.js'),slideRelays=require(slideRelayFile);
const slideFile=process.argv[6]&&path.resolve(process.argv[6]);
if(slideFile&&!slideFile.startsWith(path.resolve('build')+path.sep))throw Error('Private slide landing evidence required');
const slideEvidence=slideFile?JSON.parse(fs.readFileSync(slideFile,'utf8')):null;
const gateFile=process.argv[7]&&path.resolve(process.argv[7]);
if(gateFile&&!gateFile.startsWith(path.resolve('build')+path.sep))throw Error('Private gate-front evidence required');
const gateEvidence=gateFile?JSON.parse(fs.readFileSync(gateFile,'utf8')):null;
for(const world of Object.keys(catalog.worlds).filter(w=>!chosen||w===chosen)){
 const rootIndex=JSON.parse(fs.readFileSync(path.join(data,world,'index.json'))),grid=rootIndex.kind==='multi-grid-world'?rootIndex.grids.find(g=>g.selector.mode==='exclude'):null,prefix=grid?path.dirname(grid.index)+'/':'',index=grid?JSON.parse(fs.readFileSync(path.join(data,world,grid.index))):rootIndex,features=placed.forWorld(world),states=Object.fromEntries(index.actors.map(a=>[a.id,true])),pages=new PagedWorld(index,f=>fs.readFileSync(path.join(data,world,prefix+f),'utf8'),{maxNodes:65535}),memo=new Map(),rows=[],failures=[];
 const anchor=(p,kind)=>{
  const key=kind+'/'+p.map(v=>Math.round(v*10)).join(',');if(memo.has(key))return memo.get(key);let result;
  for(const radius of [0,1])try{
   drain(pages.directJob(p,p,states,{paddingTiles:radius,heightPaddingCm:600}));
   const planner=pages.window.planner,origin=planner.origin,limits=landing.below(kind),height=(limits+landing.above)/200;
   const centre={x:(p[0]-origin[0])/100,y:(p[2]-origin[2])/100,z:-(p[1]-origin[1])/100};
   const project=(c,y)=>{
    const near=planner.query.findNearestPoly(c,{halfExtents:{x:3.6,y,z:3.6}});
    if(!near.success||!near.nearestRef)return null;
    const q=[origin[0]+near.nearestPoint.x*100,origin[1]-near.nearestPoint.z*100,origin[2]+near.nearestPoint.y*100];
    return landing.contains(kind,p[2],q[2])?q:null;
   };
   // Prefer the nearest authored anchor. If a roof wins outside the allowed
   // height band, query the supported lower interval instead.
   const q=project(centre,Math.max(limits,landing.above)/100)||project({...centre,y:centre.y+(landing.above-limits)/200},height);
   if(!q)continue;
   const found=drain(pages.corridors.anchors(q,states));if(found.length){result={node:found[0].id,point:q.map(v=>+v.toFixed(3))};break;}
  }catch(error){if(!/budget|capacity/.test(String(error)))throw error;}
  memo.set(key,result);return result;
 };
 const wallrunEntries=(box,kind)=>{
  const extent=box.axes[0].map((_,axis)=>box.axes.reduce((sum,v)=>sum+Math.abs(v[axis]),0)), c=box.center;
  const [ex,ey,ez]=extent;
  drain(pages.directJob(c,c,states,{boundsUE:[c[0]-ex-45,c[1]-ey-45,c[0]+ex+45,c[1]+ey+45],heightBoundsUE:[c[2]-ez-192,c[2]+ez+45]}));
  const projected=hookVolumePoints(pages.window.planner,box,volume,96,45);
  const collected=new Map();
  for(const point of projected){
   const found=anchor(point,kind);
   if(found&&!collected.has(found.node)&&volume.overlapsCapsule(box,found.point,96,45))collected.set(found.node,found);
   if(collected.size>=16)break;
  }
  return collected.values();
 };
 try{for(const f of features){
  const entries=new Map(),b=anchor(f.path.at(-1),f.kind),box=f.kind==='hook'&&volume.valid(f.entryVolume)?f.entryVolume:null;
  let points=box?volume.samples(box,f.path[0]):[f.path[0]];
  if(box)try{
   const e=[0,1,2].map(i=>box.axes.reduce((n,a)=>n+Math.abs(a[i]),0)),c=box.center;
   drain(pages.directJob(c,c,states,{boundsUE:[c[0]-e[0],c[1]-e[1],c[0]+e[0],c[1]+e[1]],heightBoundsUE:[c[2]-e[2]-96,c[2]+e[2]]}));
   points=[...hookVolumePoints(pages.window.planner,box,volume),...points];
  }catch(error){if(!/budget|capacity/.test(String(error)))throw error;}
  for(const p of points){
   const a=anchor(p,f.kind);if(a&&(!box||volume.contains(box,a.point))&&!entries.has(a.node))entries.set(a.node,a);if(entries.size>=32)break;
  }
  const add=(a,b,both,reverse)=>rows.push({guid:f.guid,kind:f.kind,both,from:a.node,to:b.node,entry:a.point,exit:b.point,
   cost:Math.max(1,Math.hypot(...a.point.map((v,i)=>v-b.point[i]))),...(reverse?{reverse:true}:{})});
  if(entries.size&&b)for(const a of entries.values())add(a,b,!!f.both,false);
  else failures.push({guid:f.guid,missingEntry:!entries.size,missingExit:!b});if((rows.length+failures.length)%20===0)console.log('ACTION OVERLAY',world,rows.length,failures.length);
  const source=volumeRows.get(f.guid);
  if(f.kind==='wallrun'&&source?.world===world){
   const first=[...entries.values()][0];
   for(const [name,box] of Object.entries(source.boxes)){
    if(!volume.valid(box))continue;
    const reverse=(name==='A')!==source.boxes.firstIsA, exit=reverse?first:b, original=reverse?b:first;
    if(!exit)continue;
    try{
     for(const pad of wallrunEntries(box,f.kind))if(pad.node!==exit.node&&pad.node!==original?.node)add(pad,exit,false,reverse);
    }catch(error){if(!/budget|capacity/.test(String(error)))throw error;}
   }
  }
 }
 const slide=slideRelays.forWorld(world);
 if(slide&&slideEvidence){
  const [first,last]=slide.steps,source=rows.find(row=>row.guid===first),terminal=features.find(f=>f.guid===last);
  if(!source||!terminal||slideEvidence.upper?.guid!==last||!rootIndex.actors.some(a=>a.id===slide.gate))
   throw Error('Slide evidence does not match the native placements and current gate');
  const exits=new Map(),lip=terminal.path.at(-1);
  for(const {point,id,sameLandingRegion} of slideEvidence.projections){
   if(!sameLandingRegion||point[2]>=lip[2]-150||Math.hypot(...point.map((x,i)=>x-lip[i]))>1300)continue;
   const exit=anchor(point,'slide');
   if(exit?.node!==id||Math.hypot(...point.map((x,i)=>x-exit.point[i]))>90)continue;
   if(!exits.has(id))exits.set(id,exit);
  }
  if(!exits.size)throw Error('Slide evidence has no supported lower landing in the current mesh');
  const cost=source.cost+terminal.path.slice(1).reduce((n,p,i)=>n+Math.hypot(...p.map((v,axis)=>v-terminal.path[i][axis])),0)+800;
  const gateApproach=gateEvidence?.crossings.find(row=>row.closedFailure?.obstructed&&row.fronts.some(front=>front.side===-1))?.approach;
  if(gateEvidence&&!(gateApproach?.length===3&&gateApproach.every(Number.isFinite)))throw Error('No supported gate approach');
  for(const exit of exits.values())rows.push({guid:slide.guid,kind:'slide',both:false,requiresPassable:slide.gate,gateApproach,
   from:source.from,to:exit.node,entry:source.entry,exit:exit.point,cost});
 }
 }
 finally{pages.destroy();}
 const handoffs=relays.hints(world,rows);
 rows.push(...handoffs);
 if(rows.length>1024)throw Error('Coarse action hint budget exceeded');
 const manifest={schema:1,world,sourceIndexSHA256:rootIndex.sourceIndexSHA256,navigationGrid:grid?.id||null,sourceGridIndexSHA256:index.sourceIndexSHA256,sourceFeatureSHA256:sha(JSON.stringify(features)),sourceScriptSHA256:sha(fs.readFileSync(new URL(import.meta.url))),geometryScriptSHA256:sha(fs.readFileSync(new URL('./hook-volume-anchors.mjs',import.meta.url))),landingLimitsSHA256:sha(fs.readFileSync(path.join(mod,'PBZRouteLandingLimits.js'))),...(volumes?{wallrunVolumesSHA256:sha(fs.readFileSync(volumesFile))}:{}),...(handoffs.length?{wallrunRelaysSHA256:sha(fs.readFileSync(relayFile))}:{}),...(slideEvidence&&slideRelays.forWorld(world)?{slideRelaySHA256:sha(fs.readFileSync(slideRelayFile)),slideEvidenceSHA256:sha(fs.readFileSync(slideFile)),...(gateFile?{gateEvidenceSHA256:sha(fs.readFileSync(gateFile))}:{})}:{}),scope:'Optimistic placed-action component hints for bounded window selection only; current native endpoints, states and physics mandatory',rows};fs.writeFileSync(path.join(output,world+'.js'),"'use strict';\nexports.data="+JSON.stringify(manifest)+';\n');fs.writeFileSync(path.join(output,world+'.receipt.json'),JSON.stringify({...manifest,failures},null,2));report.push({world,rows:rows.length,failures:failures.length});console.log('ACTION OVERLAY WORLD',world,rows.length,failures.length);
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(report,null,2));
}
