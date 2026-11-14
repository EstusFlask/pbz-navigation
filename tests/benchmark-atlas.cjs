'use strict';
// Local loading benchmark, not an in-game frame-rate measurement.
const path=require('node:path');
const source=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {AtlasCache}=require(source+'/PBZRouteAtlas'),R=require(source+'/PBZRouteCore');
const generated=path.resolve(process.argv[2]||'build/streamed-atlas'),world=process.argv[3]||'pbz_pangzhen_wp';
let frame=1000,pumps=0,reads=0,cpu=0,maxSlice=0;
const cache=new AtlasCache(id=>{reads++;return require(id.replace('./PBZRouteStreaming',generated));},R.graphJob,()=>{},()=>performance.now()+frame);
cache.get(world);
while(cache.pending.size){const start=performance.now();cache.pump();const ms=performance.now()-start;
 cpu+=ms;maxSlice=Math.max(maxSlice,ms);frame+=16;if(++pumps>10000)throw Error('atlas failed to finish');}
const graph=cache.get(world);if(!graph)throw Error('atlas unavailable');
console.log(JSON.stringify({world,reads,pumps,cpuMs:+cpu.toFixed(2),maxSliceMs:+maxSlice.toFixed(2),simulatedWallMs:Math.round(frame-1000+cpu),nodes:graph.n}));
