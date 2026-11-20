'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const hash=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const finish=job=>{let r,n=0;do{r=job.next();assert.ok(++n<100000);}while(!r.done);return r.value;};
test('bounded upstream inflater rejects stored, literal and match overflow before writing',async()=>{
 const {inflateBounded}=await import('../offline-navigation/vendor/fflate-bounded.mjs');
 for(const options of [{level:0},{strategy:zlib.constants.Z_FIXED},{level:6}]){
  const raw=Buffer.from('real checked data'.repeat(1000)),packed=zlib.deflateRawSync(raw,options);assert.deepEqual(Buffer.from(inflateBounded(packed,raw.length)),raw);
  assert.throws(()=>inflateBounded(packed,32),/bounded|extent/);assert.throws(()=>inflateBounded(Buffer.concat([packed,Buffer.from([0])]),raw.length),/extent/);
 }
 assert.throws(()=>inflateBounded(zlib.deflateRawSync(Buffer.alloc(1048576)),32768),/bounded/);
});
function fixture(records){
 const world='pbz_test',source='a'.repeat(64),header='PBZDF1|'+world+'|'+source+'|0\n';let text=header;
 const rows=records.map(raw=>{const payload=zlib.deflateRawSync(raw).toString('base64'),row=[0,text.length,payload.length,raw.length,hash(raw)];text+=payload;return row;});
 const manifest={world,sourceIndexSHA256:source,storage:{kind:'deflate-text-v1',blockBytes:32768,records:rows.length,containers:1,indexPageRecords:512,maxContainerCharacters:1048576}};
 const files={'packs/0.txt':text,'directories/0.json':JSON.stringify({schema:1,world,sourceIndexSHA256:source,first:0,records:rows})};return{manifest,files,rows};
}
test('packed records restore exact bytes and Unicode through bounded generator steps',async()=>{
 const {PackedStore}=await import('../offline-navigation/packed-storage.mjs'),raw=Buffer.from('导航\u{1f514} / real data\n'.repeat(800)),f=fixture([raw]),store=new PackedStore(f.manifest,file=>f.files[file]);
 assert.deepEqual(Buffer.from(finish(store.bytesJob([0,1,raw.length]))),raw);
 assert.equal(finish(store.textJob([0,1,raw.length])),raw.toString('utf8'));
 assert.ok(store.containers.size<=2);assert.ok(store.directories.size<=4);
});
test('bad extents, wrong world, corruption and oversized expansion fail closed',async()=>{
 const {PackedStore}=await import('../offline-navigation/packed-storage.mjs');
 for(const mutate of [f=>{f.rows[0][3]=32769;},f=>{f.rows[0][1]=-1;},f=>{f.files['packs/0.txt']=f.files['packs/0.txt'].replace('pbz_test','pbz_else');},f=>{f.rows[0][4]^=1;},f=>{f.rows[0][3]=8;}]){
  const f=fixture([Buffer.alloc(32768,7)]);mutate(f);f.files['directories/0.json']=JSON.stringify({schema:1,world:f.manifest.world,sourceIndexSHA256:f.manifest.sourceIndexSHA256,first:0,records:f.rows});
  const store=new PackedStore(f.manifest,file=>f.files[file]);assert.throws(()=>finish(store.bytesJob([0,1,f.rows[0][3]])));
 }
});
test('incompressible input and cancellation preserve bounded caches and yield repeatedly',async()=>{
 const {PackedStore}=await import('../offline-navigation/packed-storage.mjs'),raw=require('node:crypto').randomBytes(32768),f=fixture([raw]),store=new PackedStore(f.manifest,file=>f.files[file]);
 let n=0,r,job=store.bytesJob([0,1,raw.length]);do{r=job.next();n++;}while(!r.done);assert.ok(n>8);assert.deepEqual(Buffer.from(r.value),raw);
 job=store.bytesJob([0,1,raw.length]);job.next();job.return();assert.deepEqual(Buffer.from(finish(store.bytesJob([0,1,raw.length]))),raw);store.clear();assert.equal(store.containers.size,0);
});


test('ASCII fast decoding preserves UTF-8 that begins across a chunk boundary',async()=>{
 const {PackedStore}=await import('../offline-navigation/packed-storage.mjs');
 for(const n of [8191,8192,16383]){const raw=Buffer.from('a'.repeat(n)+'导航🔔'),f=fixture([raw]),store=new PackedStore(f.manifest,file=>f.files[file]);assert.equal(finish(store.textJob([0,1,raw.length])),raw.toString('utf8'));}
});
