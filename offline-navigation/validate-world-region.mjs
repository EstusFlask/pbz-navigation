// Real extracted-world differential evidence. No game state or acceptance implied.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {initialize} from './query.mjs';
import {WorldWindow} from './world-window.mjs';
const [folder,referenceFile,repairBackup]=process.argv.slice(2);if(!folder)throw Error('Expected full-world build folder');
const evidenceFolder=repairBackup||folder,index=JSON.parse(fs.readFileSync(path.join(evidenceFolder,'navigation-index.json'),'utf8'));
const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(new URL('../build/offline-navigation/runtime/PBZRecastRuntime.js',import.meta.url),'utf8'),context);
const js=context.module.exports;await js.initialize();await initialize();
const read=(id,row)=>{const saved=repairBackup&&path.join(repairBackup,row.file),bytes=fs.readFileSync(saved&&fs.existsSync(saved)?saved:path.join(folder,row.file));if(crypto.createHash('sha256').update(bytes).digest('hex')!==id)throw Error('World blob hash mismatch');return bytes;};
const first=new js.WorldWindow(index,read,{maxTiles:256,maxBytes:32*1024*1024,maxNodes:65535}),control=new WorldWindow(index,read,{maxTiles:256,maxBytes:32*1024*1024,maxNodes:65535});
const scenario=JSON.parse(fs.readFileSync(new URL('../authoring/offline-route-001-exploration-state.json',import.meta.url),'utf8'));
const assumed=Object.fromEntries(Object.entries(scenario.actors).map(([id,row])=>[id,row.Passable]));
const cases=[{name:'unknown',states:{},paddingTiles:2},{name:'twoFogDoorsExplicitlyPassable',states:assumed,paddingTiles:2}];
if(referenceFile){
 const snapshot=JSON.parse(fs.readFileSync(referenceFile,'utf8')),lookup=new Map(Object.entries(snapshot.actors).map(([id,r])=>[id.toLowerCase(),r]));
 const saved=Object.fromEntries(index.actors.map(a=>[a.id,lookup.get(a.id.toLowerCase())?.[a.savedField]]).filter(([,v])=>typeof v==='boolean'));
 cases.push({name:'frozenReferenceAndTwoFogDoors',states:{...saved,...assumed},paddingTiles:8,boundsUE:[-196000,105000,-166000,130000]});
}
const finish=job=>{let row,yields=0;do{row=job.next();yields++;}while(!row.done);return{result:row.value,yields};};
const a=[-174688.995,112340.126,-3034.172],rows=[];
try{
 for(const {name,states,paddingTiles,boundsUE}of cases){
  for(const [target,b]of Object.entries({route001:[-187916,114639,-1057],nearBell:[-171921,120932,-4137]})){
   const started=performance.now(),value=finish(first.routeJob(a,b,states,{paddingTiles,boundsUE})),elapsedMs=performance.now()-started;
   const expected=finish(control.routeJob(a,b,states,{paddingTiles,boundsUE})).result,result=value.result;
   if(name==='frozenReferenceAndTwoFogDoors'&&!result.complete)throw Error(`Frozen world route control failed: ${target}: ${result.reason}`);
   if(result.complete!==expected.complete||result.reason!==expected.reason||result.points.length!==expected.points.length)throw Error('World JS/WASM route mismatch');
   let maxDifferenceCm=0;
   for(let i=0;i<result.points.length;i++)maxDifferenceCm=Math.max(maxDifferenceCm,Math.hypot(...result.points[i].map((v,k)=>v-expected.points[i][k])));
   if(maxDifferenceCm>=.01)throw Error('World JS/WASM coordinate mismatch');
   const row={name,target,complete:result.complete,reason:result.reason,points:result.points.length,meters:result.meters,
    elapsedMs,yields:value.yields,residentTiles:result.residentTiles,residentBytes:result.residentBytes,maxDifferenceCm,
    maxSurfaceClampCm:result.maxSurfaceClampCm,quantizedPortalClamps:result.quantizedPortalClamps,physicalVerified:false};
   rows.push(row);fs.writeFileSync(path.join(evidenceFolder,`route-${target}-${name}.json`),JSON.stringify({...result,assumedActorStates:states}));console.log(JSON.stringify(row));
  }
 }
}finally{first.destroy();control.destroy();}
fs.writeFileSync(path.join(evidenceFolder,'regional-world-validation.json'),JSON.stringify({schema:1,world:index.world,scope:repairBackup?'Frozen legacy tile bytes for quantized-portal regression only; explicit fog assumptions, no new geometry/game acceptance':'Real full-world extraction tiles, first-region endpoints; explicit fog assumptions, no live-state assertion',
 spatialIndexSHA256:index.spatialIndexSHA256,compilerSHA256:index.compilerSHA256,
 querySHA256:crypto.createHash('sha256').update(fs.readFileSync(new URL('./query.mjs',import.meta.url))).digest('hex'),
 runtimeSHA256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../build/offline-navigation/runtime/PBZRecastRuntime.js',import.meta.url))).digest('hex'),
 referenceStateSHA256:referenceFile?crypto.createHash('sha256').update(fs.readFileSync(referenceFile)).digest('hex'):null,
 rows,completeCollisionClaim:false,physicalVerified:false},null,2));
