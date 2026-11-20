'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder=process.argv[2],world=process.argv[3]||'pbz_test';
const drain=job=>{let row,n=0;do{row=job.next();assert.ok(++n<30000);}while(!row.done);return row.value;};
const snapshot=pages=>JSON.stringify([...pages.window.loaded].map(([id,r])=>[id,r.blob,r.slot]).sort());
(async()=>{
 const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
 vm.runInContext(fs.readFileSync(path.join(root,'build/offline-navigation/runtime/PBZRecastRuntime.js'),'utf8'),context);
 const core=context.module.exports;await core.initialize();
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,world,'index.json'),'utf8'));let reads=0,maxText=0,broken=false;
 const rawPacket=Buffer.alloc(196608,171),packetText=rawPacket.toString('base64');
 const slicing=new core.PagedWorld({...manifest,storage:undefined,blobLayout:'packets-v1',packetCount:1,lastPacketBytes:rawPacket.length},()=>packetText);
 try{
  const job=slicing.blobJob('a'.repeat(64),{bytes:rawPacket.length,parts:[[0,0,rawPacket.length]]});let row,steps=0;
  do{row=job.next();steps++;}while(!row.done);
  assert.ok(steps>=16,'a full 192KiB packet was decoded in one synchronous step');assert.deepEqual(Buffer.from(row.value),rawPacket);
  for(const invalid of ['A===','AB==','AAB=','AAAA=AAA','!!!!','AA A','AA\nA','AAĀA'])assert.throws(()=>drain(slicing.decodePacketJob(invalid)),/base64|payload/);
  for(let length=0;length<37;length++){const bytes=Buffer.from(Array.from({length},(_,i)=>(i*71+length)&255));assert.deepEqual(Buffer.from(drain(slicing.decodePacketJob(bytes.toString('base64')))),bytes);}
 }finally{slicing.destroy();}
 const read=file=>{const text=fs.readFileSync(path.join(folder,world,file),'utf8');reads++;maxText=Math.max(maxText,text.length);return broken&&file.includes('/0.txt')?text.slice(4):text;};
 const first=new core.PagedWorld(manifest,read,{maxTiles:32,maxBytes:2*1024*1024,maxPages:2});
 const a=[-5500,0,0],b=[5500,0,0],open={'pbz_test-door':true},closed={'pbz_test-door':false};
 const band=[2999000,3001000],setManifest={schema:1,kind:'multi-grid-world',world,unknownState:'closed',grids:[{id:'normal',index:'grids/normal/index.json',sourceIndexSHA256:manifest.sourceIndexSHA256,selector:{mode:'exclude',zBandUE:band}},{id:'high',index:'grids/high/index.json',sourceIndexSHA256:manifest.sourceIndexSHA256,selector:{mode:'include',zBandUE:band}}]};
 const multi=core.createWorld(setManifest,file=>file.endsWith('/index.json')?JSON.stringify(manifest):read(file.replace(/^grids\/(normal|high)\//,'')),{maxTiles:32,maxBytes:2*1024*1024});
 try{
  assert.equal(drain(multi.routeJob(a,b,open)).complete,true);const old=multi.current;
  assert.equal(drain(multi.routeJob(a,[b[0],b[1],3000000],open)).points.length,0,'isolated grids gained an unverified vertical connection');
  assert.equal(multi.current,old,'a rejected cross-grid request mutated the resident graph');
  const high=drain(multi.routeJob([a[0],a[1],3000000],[b[0],b[1],3000000],{}));
  assert.equal(high.complete,true);assert.equal(high.navigationGrid,'high');assert.equal(old.window.destroyed,true,'grid travel retained a second graph');
  assert.throws(()=>drain(multi.candidateJob(a,b,closed,open)),/Known closed/);
 }finally{multi.destroy();}
 try{
  assert.equal(drain(first.routeJob(a,b,{})).complete,false);const before=snapshot(first);
  const candidate=drain(first.candidateJob(a,b,{},open));assert.equal(candidate.complete,true);assert.equal(snapshot(first),before);
  assert.throws(()=>drain(first.candidateJob(a,b,closed,open)),/Known closed/);
  const interrupted=first.candidateJob(a,b,{},open);interrupted.next();interrupted.return();assert.equal(snapshot(first),before);
  first.packetCache.clear();first.packed?.clear();first.blobCache.clear();first.blobCacheBytes=0;broken=true;assert.throws(()=>drain(first.routeJob(a,b,open)),/Truncated world data chunk|Packed container identity/);broken=false;first.packed?.clear();assert.equal(snapshot(first),before);
  const result=drain(first.routeJob(a,b,open));assert.equal(result.complete,true);assert.equal(result.physicalVerified,false);assert.equal(result.pagedWorld,true);
  assert.ok(first.pages.size<=2);assert.ok(first.window.loaded.size<=32);assert.ok(maxText<=1048576);assert.ok(reads>1);
  assert.ok(Object.keys(first.index.blobs).length<=manifest.blobs);
  const long=drain(first.routeJob([-59000,21000,0],[59000,21000,0],{}));
  assert.equal(long.complete,true,long.reason);assert.equal(long.coarseCorridor,true);assert.ok(long.meters>1180&&long.meters<1200);
  assert.ok(first.window.loaded.size<=32);assert.ok(first.pages.size<=2);assert.ok(first.corridors.pages.size<=16);
  assert.ok(first.packetCache.size<=4);
  assert.ok(first.blobCacheBytes<=8*1024*1024);
  assert.equal(drain(first.routeJob([-500,35000,300],[500,35000,300],{},{paddingTiles:0})).complete,false,'uncertain moving reference geometry became a walkable support');
 }finally{first.destroy();}
 const {RecastCache,WorldCache}=require(path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteRecastProvider'));
 let now=0,invalidations=0,loaded=false;
 const P={$ref:value=>({value}),$unref:r=>r.value},array=values=>({Num:()=>values.length,Get:i=>values[i]});
 const UE={Class:{Load:x=>x},SplineMeshComponent:{StaticClass:()=>1},GameplayStatics:{GetAllActorsOfClass(p,cls,out){out.value=array(loaded?[{GetName:()=> 'door',K2_GetComponentsByClass:()=>array([{GetName:()=> 'Spline',GetCollisionEnabled:()=>3,GetCollisionResponseToChannel:()=>2}])}]:[]);}}};
 const api={P,UE,T:{},alive:x=>!!x,readText:file=>fs.existsSync(file)?fs.readFileSync(file,'utf8'):'',dataRoot:folder};
 const cache=new RecastCache(()=>core,api,()=>{},()=>invalidations++,()=>now),worldCache=cache.worlds;
 const start={x:a[0],y:a[1],z:a[2]},goal={x:b[0],y:b[1],z:b[2]},pawn={};
 const cold=new WorldCache(()=>core,api,()=>{},()=>{},()=>now);
 try{const pending=cold.route(world,start,goal);assert.doesNotThrow(()=>pending.next(),'a cold request must not cancel its own running generator');}
 finally{cold.cancel();cold.job?.return?.();cold.pages?.destroy();}
 async function until(test){for(let i=0;i<1000;i++){now+=32;cache.pump(world,pawn,start);if(cache.error)throw Error(cache.error);if(test())return;await new Promise(setImmediate);}throw Error('World provider stalled');}
 try{
  assert.equal(cache.covers(world,start,goal),true);cache.route(world,start,goal);await until(()=>cache.ready&&worldCache.signature);
  const leg=drain(cache.route(world,start,goal));assert.equal(leg.topologyComplete,true);assert.equal(leg.conditionalCandidate,true);assert.equal(leg.partial,true);assert.equal(leg.physicalVerified,false);
  assert.equal(worldCache.states['pbz_test-door'],undefined);
  const previous=cache.revision;loaded=true;await until(()=>cache.revision>previous);
  assert.equal(worldCache.states['pbz_test-door'],false);assert.equal(drain(cache.route(world,start,goal)).conditionalCandidate,false);
  const job=cache.route(world,start,goal);job.next();cache.pump('other',{},start);assert.equal(job.next().done,true);assert.equal(worldCache.pages,null);assert.ok(invalidations>0);
 }finally{cache.cancel();worldCache.pages?.destroy();cache.regional.job?.return?.();cache.regional.planner?.destroy();}
 console.log('Paged plain-JS data and actual Mod provider: closed states, candidates, cancellation, corrupt chunks and world travel passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
