'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..'),folder=process.argv[2];
const finish=job=>{let r,n=0;do{r=job.next();assert.ok(++n<10000);}while(!r.done);return r.value;};
const snapshot=window=>JSON.stringify([...window.loaded].map(([id,r])=>[id,r.slot,r.blob]).sort());
(async()=>{
 const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
 vm.runInContext(fs.readFileSync(path.join(root,'build/offline-navigation/runtime/PBZRecastRuntime.js'),'utf8'),context);
 const js=context.module.exports;await js.initialize();
 const baseReplace=js.Planner.prototype.replaceTile;
 js.Planner.prototype.replaceTile=function(slot,bytes){
  if(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),at=100+v.getInt32(28,true)*12;
   for(let i=0;i<v.getInt32(24,true);i++)for(let e=0;e<v.getUint8(at+i*32+30);e++)assert.equal(v.getUint16(at+i*32+16+e*2,true)&0x8000,0,'native admission still performs synchronous external-link scans');
  }
  return baseReplace.call(this,slot,bytes);
 };
 const upstream=await import(pathToFileURL(path.join(root,'offline-navigation/query.mjs')).href);await upstream.initialize();
 const {WorldWindow}=await import(pathToFileURL(path.join(root,'offline-navigation/world-window.mjs')).href);
 const index=JSON.parse(fs.readFileSync(path.join(folder,'navigation-index.json')));let corrupt=false,unreadable=false;
 const read=(id,row)=>{
  if(unreadable)throw Error('Data source unavailable');
  const b=fs.readFileSync(path.join(folder,row.file));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),id);
  const candidateOnly=index.tiles.some(t=>t.conditions.length&&t.variants['0'.repeat(t.conditions.length)]===id&&t.variants['1'.repeat(t.conditions.length)]!==id);
  return corrupt&&candidateOnly?b.subarray(0,b.length-1):b;
 };
 const a=[-5500,0,0],b=[5500,0,0],closed={'pbz_test-door':false},open={'pbz_test-door':true};
 const first=new js.WorldWindow(index,read,{maxTiles:32,maxBytes:2*1024*1024}),other=new WorldWindow(index,read,{maxTiles:32,maxBytes:2*1024*1024});
 try{
  assert.equal(finish(first.routeJob(a,b,{})).complete,false,'unknown door opened');
  const initial=snapshot(first),before=first.planner.tileBuffers.size;
  const dense=[];
  for(const tile of index.tiles)if(tile.conditions.length){const blob=tile.variants['0'.repeat(tile.conditions.length)];if(blob){dense.push([blob,index.blobs[blob].polygons]);index.blobs[blob].polygons=20790;}}
  const resizing=first.candidateJob(a,b,{},open);let resized=false,step;
  do{step=resizing.next();resized=first.planner.header.maxPolys===32768;}while(!step.done&&!resized);
  assert.equal(resized,true,'dense variants did not use an adaptive reference layout');resizing.return();
  assert.equal(first.planner.header.maxPolys,16384,'cancelled dense candidate kept its temporary reference layout');assert.equal(snapshot(first),initial);
  for(const [blob,value]of dense){if(value===undefined)delete index.blobs[blob].polygons;else index.blobs[blob].polygons=value;}
  const candidate=finish(first.candidateJob(a,b,{},open));assert.equal(candidate.complete,true,candidate.reason);
  assert.equal(snapshot(first),initial,'temporary state persisted');assert.equal(first.planner.tileBuffers.size,before);
  const outage=first.candidateJob(a,b,{},open);let loaded=false;
  for(let i=0;i<1000&&!loaded;i++){const step=outage.next();loaded=snapshot(first)!==initial;if(step.done)break;}
  assert.equal(loaded,true);unreadable=true;
  assert.doesNotThrow(()=>outage.return(),'restoring an authoritative graph must not need another disk read');unreadable=false;assert.equal(snapshot(first),initial);
  assert.throws(()=>finish(first.candidateJob(a,b,closed,open)),/Known closed/);
  const interrupted=first.candidateJob(a,b,{},open);interrupted.next();interrupted.return();assert.equal(snapshot(first),initial);
  const cancelled=first.candidateJob(a,b,{},open);cancelled.next();first.cancelQueries();assert.equal(cancelled.next().done,true);assert.equal(snapshot(first),initial);
  const loading=first.loadWindowJob([-6000,4000,6000,6000]);loading.next();loading.return();assert.equal(snapshot(first),initial);
  corrupt=true;assert.throws(()=>finish(first.routeJob(a,b,open)),/Invalid world tile size/);corrupt=false;
  assert.equal(snapshot(first),initial,'failed load did not restore prior graph');
  assert.equal(finish(first.routeJob(a,b,closed)).complete,false);
  const result=finish(first.routeJob(a,b,open)),control=finish(other.routeJob(a,b,open));
  assert.equal(result.complete,true,result.reason);assert.equal(control.complete,true,control.reason);assert.equal(result.physicalVerified,false);
  assert.ok(first.loaded.size<=32);assert.ok(result.residentBytes<=2*1024*1024);
  assert.equal(result.points.length,control.points.length);
  for(let i=0;i<result.points.length;i++)assert.ok(Math.hypot(...result.points[i].map((v,k)=>v-control.points[i][k]))<.01);
  assert.equal(finish(first.routeJob([-5500,0,3000000],[5500,0,3000000],closed)).complete,true,'distant height layer was dropped');
  assert.ok([...first.loaded.values()].some(t=>t.layer>0),'nonzero Detour layers were not resident');
  assert.equal(finish(first.routeJob(a,[5500,0,3000000],open,{paddingTiles:0})).complete,false,'separate height layers were joined');
  assert.equal(finish(first.routeJob([-2000,5000,0],[2000,5000,0],open,{paddingTiles:0})).complete,false,'deep pit was bridged');
  const tiny=new js.WorldWindow(index,read,{maxTiles:1});
  try{assert.throws(()=>finish(tiny.routeJob(a,b,open)),/window budget/);assert.equal(tiny.loaded.size,0);}finally{tiny.destroy();}
 }finally{first.destroy();other.destroy();}
 console.log('Sparse world: negative-coordinate seams, closed doors, deep pit, bounded residency, failed/cancelled transactions and JS/WASM parity passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
