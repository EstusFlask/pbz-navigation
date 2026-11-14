'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {AtlasCache}=require(root+'/PBZRouteAtlas'),R=require(root+'/PBZRouteCore');

test('requesting a cold atlas queues it without loading or constructing it in the caller frame',()=>{
 let loads=0;
 const cache=new AtlasCache(()=>{loads++;throw Error('not in map callback');},()=>{},()=>{});
 assert.equal(cache.get('test'),null);
 assert.equal(loads,0,'map/tracking callback synchronously parsed a whole world module');
});

test('streamed atlas decoding yields and retains exact typed values',()=>{
 assert.equal(typeof R.decodeJob,'function','no incremental decoder is available');
 const values=Int32Array.from({length:50000},(_,i)=>i%2?-i:i),encoded=Buffer.from(values.buffer).toString('base64');
 const parts=[encoded.slice(0,262144),encoded.slice(262144)],reads=[];
 const job=R.decodeJob({stream:'test/p',chunks:2,bytes:values.byteLength},Int32Array,key=>{reads.push(key);return parts[reads.length-1];});
 let row,steps=0;do{row=job.next();steps++;}while(!row.done);
 assert.ok(steps>5,'a complete large column was decoded in one synchronous step');
 assert.equal(reads.length,2);assert.deepEqual(Array.from(row.value),Array.from(values));
});

test('a completed queued atlas changes the context revision and a failure is not retried each tick',()=>{
 let now=1000,loads=0;
 const cache=new AtlasCache(id=>{loads++;if(id.endsWith('/bad/index'))throw Error('missing');
  return {data:{world:'test',n:1},actorChunks:0,faces:{}};},function*(){yield;yield;return {n:1};},()=>{},()=>now);
 cache.get('test');assert.equal(cache.revision,0);
 for(let i=0;i<4;i++){cache.pump();now+=16;}
 assert.equal(cache.get('test').n,1);assert.equal(cache.revision,1);
 cache.get('bad');cache.pump();const before=loads;now+=16;
 cache.get('bad');cache.pump();assert.equal(loads,before);
});

test('a real streamed world has the same columns, actors and graph lookup as the original data',()=>{
 const fs=require('node:fs'),crypto=require('node:crypto'),world='pbz_xigu_wp';
 const generated=path.resolve(__dirname,'../build/streamed-atlas');
 assert.ok(fs.existsSync(generated+'/'+world+'/index.js'),'run node --expose-gc tests/stream-atlas.cjs first');
 let frame=1000,pumps=0,max=0;
 const cache=new AtlasCache(id=>require(id.replace('./PBZRouteStreaming',generated)),R.graphJob,()=>{},()=>frame+performance.now());
 assert.equal(cache.get(world),null);
 while(cache.pending.size){const start=performance.now();cache.pump();max=Math.max(max,performance.now()-start);frame+=16;assert.ok(++pumps<10000);}
 const graph=cache.get(world),index=require(generated+'/'+world+'/index.js');assert.ok(graph);assert.equal(graph.n,249434);
 for(const key of ['p','v','e','arc','lab','cells','strong','dag','off','weight','sizes','order','metric','faces']){
  const ref=key==='faces'?index.faces:index.data[key];
  assert.equal(crypto.createHash('sha256').update(Buffer.from(graph[key].buffer)).digest('hex'),ref.sha256,key);
 }
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(graph.actors)).digest('hex'),index.actorsHash);
 const original=require(root+'/PBZRouteWorlds/'+world).data;
 assert.equal(graph.node({x:-35577,y:264703,z:-25670}),new R.Graph(original,require(root+'/PBZRouteFaces/'+world).faces).node({x:-35577,y:264703,z:-25670}));
});
