// Real dense-tile control under the game's code-generation restrictions.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {initialize} from './query.mjs';
import {WorldWindow} from './world-window.mjs';
const [folder]=process.argv.slice(2);if(!folder)throw Error('Expected full-world folder');
const index=JSON.parse(fs.readFileSync(path.join(folder,'navigation-index.json')));
const entry=Object.entries(index.blobs).find(([,b])=>b.polygons>16384);if(!entry)throw Error('Dense tile fixture unavailable');
const [blob,descriptor]=entry,tile=index.tiles.find(t=>Object.values(t.variants).includes(blob));
const read=(id,r)=>{const b=fs.readFileSync(path.join(folder,r.file));if(crypto.createHash('sha256').update(b).digest('hex')!==id)throw Error('Blob hash mismatch');return b;};
const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(new URL('../build/offline-navigation/runtime/PBZRecastRuntime.js',import.meta.url),'utf8'),context);
const js=context.module.exports;await js.initialize();await initialize();
const finish=job=>{let r,maxStepMs=0,steps=0;do{const t=performance.now();r=job.next();maxStepMs=Math.max(maxStepMs,performance.now()-t);steps++;}while(!r.done);return{value:r.value,maxStepMs,steps};};
const a=new js.WorldWindow(index,read,{maxTiles:256,maxNodes:65535}),b=new WorldWindow(index,read,{maxTiles:256,maxNodes:65535});
const e=index.extentCm,bounds=[tile.x*e+.1,-(tile.y+1)*e+.1,(tile.x+1)*e-.1,-tile.y*e-.1];
try{
 const interrupted=a.loadWindowJob(bounds);interrupted.next();interrupted.return();
 if(a.loaded.size||a.planner.header.maxPolys!==16384)throw Error('Dense load cancellation changed the authoritative graph');
 const load=finish(a.loadWindowJob(bounds));finish(b.loadWindowJob(bounds));
 if(a.planner.header.maxPolys!==32768||a.planner.header.maxTiles!==128)throw Error('Dense reference capacity was not adapted');
 let start,goal,sampledPolygonIndex;
 for(let slot=0;slot<a.planner.navMesh.getMaxTiles()&&!start;slot++){
  const t=a.planner.navMesh.getTile(slot),h=t.header();if(!h||h.x()!==tile.x||h.y()!==tile.y||h.layer()!==tile.layer)continue;
  for(let i=16384;i<h.polyCount()&&!start;i++){
   const p=t.polys(i);if(p.getType()!==0||!(p.flags()&1))continue;
   const center=[0,0,0];for(let j=0;j<p.vertCount();j++){const v=p.verts(j)*3;for(let k=0;k<3;k++)center[k]+=t.verts(v+k)/p.vertCount();}
   const ref=a.planner.navMesh.getPolyRefBase(t)+i,h1=a.planner.query.getPolyHeight(ref,{x:center[0],y:center[1],z:center[2]});if(!h1.success)continue;
   const v=p.verts(0)*3,next=center.map((n,k)=>n*.99+t.verts(v+k)*.01),h2=a.planner.query.getPolyHeight(ref,{x:next[0],y:next[1],z:next[2]});if(!h2.success)continue;
   start=[center[0]*100,-center[2]*100,h1.height*100];goal=[next[0]*100,-next[2]*100,h2.height*100];sampledPolygonIndex=i;
  }
 }
 if(!start)throw Error('No supported dense polygon');
 const first=finish(a.routeJob(start,goal,{}, {boundsUE:bounds})),second=finish(b.routeJob(start,goal,{}, {boundsUE:bounds}));
 if(!first.value.complete||!second.value.complete||first.value.points.length!==second.value.points.length)throw Error('Dense tile route failed');
 let maxDifferenceCm=0;for(let i=0;i<first.value.points.length;i++)maxDifferenceCm=Math.max(maxDifferenceCm,Math.hypot(...first.value.points[i].map((v,k)=>v-second.value.points[i][k])));
 if(maxDifferenceCm>=.01)throw Error('Dense tile JS/WASM mismatch');
 const result={schema:1,world:index.world,tile:[tile.x,tile.y,tile.layer],blob,polygons:descriptor.polygons,bytes:descriptor.bytes,
  maxResidentTiles:a.planner.header.maxTiles,maxPolys:a.planner.header.maxPolys,codeGeneration:{strings:false,wasm:false},
  start,goal,sampledPolygonIndex,complete:true,maxDifferenceCm,loadMaxStepMs:load.maxStepMs,routeMaxStepMs:first.maxStepMs,
  scope:'Dense payload admission, cancellation and same-polygon query control; no game performance or full-tile walking acceptance',physicalVerified:false};
 fs.writeFileSync(path.join(folder,'dense-world-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{a.destroy();b.destroy();}
