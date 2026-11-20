// Recover local descent proposals into an authored destination's walking component.
// This offline supplement changes candidate coverage only. It never authorizes a
// jump, creates an edge from a recording, or changes the live action checks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {initialize} from './query.mjs';
import {createWorld} from './world-set.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)), require=createRequire(import.meta.url);
const mod=path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const [dataRoot,output,world,bellID,policyFile]=process.argv.slice(2);
const need=(ok,message)=>{if(!ok)throw Error(message);};
need([dataRoot,output,world,bellID,policyFile].every(Boolean),'Expected DATA_ROOT OUTPUT WORLD AUTHORED_BELL_ID CAPABILITIES_JSON');
need(/^pbz_[a-z0-9_]+$/.test(world),'Invalid world');
const relative=path.relative(path.join(root,'build'),path.resolve(output));
need(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)&&!fs.existsSync(output),'Expected a fresh private output in build/');
const hash=content=>crypto.createHash('sha256').update(content).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const authoredFile=path.join(mod,'PBZRouteTables.js');
const matching=Object.values(require(authoredFile).data.bells).filter(b=>b.world===world&&b.id===bellID);
need(matching.length===1,'Destination is not a unique authored bell in the requested world');
const [x,y,z]=matching[0].at, point=matching[0].at, policy=read(policyFile);
need([x,y,z,policy.maxHeightCm,policy.maxRunCm].every(Number.isFinite)&&policy.maxHeightCm>=100&&policy.maxHeightCm<=2000&&policy.maxRunCm>=100&&policy.maxRunCm<=2000,'Invalid terminal or movement envelope');
const dir=path.join(dataRoot,world),indexFile=path.join(dir,'index.json'),index=read(indexFile);
need(index.world===world,'Terminal world differs from baked data');
const drain=it=>{let step;do{step=it.next();}while(!step.done);return step.value;};
await initialize();
const pages=createWorld(index,file=>fs.readFileSync(path.join(dir,file),'utf8'),{maxNodes:65535});
try{
 const active=typeof pages.select==='function'?pages.ensure(pages.select(point)):pages;
 const radius=Math.max(active.manifest.extentCm+Math.ceil(policy.maxRunCm),3200),bounds=[x-radius,y-radius,x+radius,y+radius];
 const vertical=[z-220,z+policy.maxHeightCm+450];
 // Unknown or closed geometry stays in the initial window.
 drain(active.directJob(point,point,{}, {boundsUE:bounds,heightBoundsUE:vertical}));
 const planner=active.window.planner,[ox,oy,oz]=planner.origin;
 const near=planner.query.findNearestPoly({x:(x-ox)/100,y:(z-oz)/100,z:-(y-oy)/100},{halfExtents:{x:1.9,y:1.1,z:1.9}});
 need(near.success&&near.nearestRef,'No same-level polygon near the authored destination');
 const goal=[ox+100*near.nearestPoint.x,oy-100*near.nearestPoint.z,oz+100*near.nearestPoint.y];
 need(Math.hypot(x-goal[0],y-goal[1])<=190&&Math.abs(z-goal[2])<=110,'Terminal projection exceeded the standing band');
 const result=drain(planner.dropCandidatesJob([goal],{...policy,maxRiseCm:0,allComponents:true,inboundRoots:true,envelopeBands:true}));
 need(result.stats?.allComponents===true,'Incomplete terminal-neighborhood topology');
 const terminal=planner.movementTopology.polygons.get(near.nearestRef)?.component;
 need(terminal!==undefined,'Could not classify terminal walking component');
 const selected=new Map();
 for(const row of result){
  if(row.kind!=='fall'||planner.movementTopology.polygons.get(row.target)?.component!==terminal)continue;
  const a=row.a.map(v=>Number(v.toFixed(3))), b=row.b.map(v=>Number(v.toFixed(3)));
  if(a[2]-b[2]<100)continue;
  const guid='recast-movement:'+a.map(Math.round).join(',')+'>'+b.map(Math.round).join(',');
  if(!selected.has(guid))selected.set(guid,{guid,kind:'fall',both:false,source:'recast-boundary',path:[a,b]});
 }
 const features=[...selected.values()];
 const sourceIndexSHA256=index.sourceIndexSHA256,navigationGrid=pages.currentID??null,sourceGridIndexSHA256=active.manifest.sourceIndexSHA256;
 const directory=path.join(output,world);
 fs.mkdirSync(directory,{recursive:true});
 const manifest={schema:1,kind:'geometry-movement-proposals',world,sourceIndexSHA256,sourceGridIndexSHA256,navigationGrid,
  authoredBell:bellID,authoredTablesSHA256:hash(fs.readFileSync(authoredFile)),navigationManifestSHA256:hash(fs.readFileSync(indexFile)),
  sourceScriptSHA256:hash(fs.readFileSync(new URL(import.meta.url))),policySHA256:hash(fs.readFileSync(policyFile)),rootedAtPlacedComponents:true,inboundRoots:true,
  fieldExtentCm:2*radius,region:bounds,vertical,terminal,terminalPolygon:near.nearestRef,pageRows:512,pages:Math.ceil(features.length/512),rows:features.length,coverage:[],physicalVerified:false};
 for(let i=0;i<manifest.pages;i++){
  const rows=features.slice(i*512,(i+1)*512).map(row=>row.path.flat());
  fs.writeFileSync(path.join(directory,i+'.js'),"'use strict';\nexports.rows="+JSON.stringify(rows)+';\n');
 }
 fs.writeFileSync(path.join(directory,'index.js'),"'use strict';\nexports.data="+JSON.stringify(manifest)+';\n');
 // Reuse the independent collision oracle's input format. This diagnostic
 // case is a set of generated candidates with a single endpoint, no course.
 const number=1,id='terminal';
 fs.writeFileSync(path.join(output,'01-terminal.json'),JSON.stringify({number,id,world,sourceIndexSHA256,policy,movementFeatures:features},null,2));
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({results:[{number,id}],manifest,polygonCount:result.stats.polygons},null,2));
 console.log(JSON.stringify({world,bellID,terminal,polygons:result.stats.polygons,scanned:result.length,incomingFalls:features.length,bounds,vertical}));
}finally{pages.destroy();}
