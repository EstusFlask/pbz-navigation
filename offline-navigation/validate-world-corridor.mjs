// A long real-world corridor control. Explicitly open modeled actors are an
// offline scenario, never a game-state assertion or an authoring trajectory.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const [worldFolder,dataFolder]=process.argv.slice(2);if(!dataFolder)throw Error('Expected world evidence and paged-data folders');
const graph=JSON.parse(fs.readFileSync(path.join(worldFolder,'corridors.json'),'utf8')),nodes=graph.nodes,world=graph.world;
const manifest=JSON.parse(fs.readFileSync(path.join(dataFolder,world,'index.json'),'utf8')),reference=[-174688.995,112340.126,-3034.172];
const seen=new Set();let component=[];
for(let id=0;id<nodes.length;id++){
 if(seen.has(id))continue;const queue=[id];seen.add(id);
 for(let at=0;at<queue.length;at++)for(const n of nodes[queue[at]][6])if(!seen.has(n)){seen.add(n);queue.push(n);}
 if(queue.length>component.length)component=queue;
}
let origin=component[0],nearest=Infinity;for(const i of component){const d=Math.hypot(...nodes[i].slice(3,6).map((v,k)=>v-reference[k]));if(d<nearest){nearest=d;origin=i;}}
let target=origin,farthest=0;
for(const id of component){
 const a=nodes[id],b=nodes[origin],d=Math.hypot(a[3]-b[3],a[4]-b[4]);
 if(d>farthest&&d<=120000&&Math.abs(a[5]-b[5])<=10000){target=id;farthest=d;}
}
if(farthest<30000)throw Error('Reference component has no sufficiently long ordinary-walk control');
const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(new URL('../build/offline-navigation/runtime/PBZRecastRuntime.js',import.meta.url),'utf8'),context);
const core=context.module.exports;await core.initialize();
const slow=[];let phase='direct';const measured=(label,fn)=>{const at=performance.now();try{return fn();}finally{const ms=performance.now()-at;if(ms>5){slow.push({phase,label,ms});if(slow.length>30)slow.shift();}}};
const pages=new core.PagedWorld(manifest,file=>measured('read '+file,()=>fs.readFileSync(path.join(dataFolder,world,file),'utf8')),{maxTiles:32,maxBytes:16*1024*1024,maxPages:4,maxNodes:65535});
const route=pages.window.planner.routeJob.bind(pages.window.planner),replace=pages.window.planner.replaceTile.bind(pages.window.planner);
pages.window.planner.routeJob=function*(...args){const job=route(...args);try{let row;do{row=measured('Detour query step',()=>job.next());if(!row.done)yield row.value;}while(!row.done);return row.value;}finally{job.return();}};
pages.window.planner.replaceTile=(...args)=>measured('Detour tile insertion',()=>replace(...args));
const start=nodes[origin].slice(3,6),goal=nodes[target].slice(3,6),states=Object.fromEntries(manifest.actors.map(a=>[a.id,true]));
try{
 let row,steps=0,maxStepMs=0;const job=pages.routeJob(start,goal,states),started=performance.now();
 do{const at=performance.now();row=job.next();maxStepMs=Math.max(maxStepMs,performance.now()-at);if(++steps>500000)throw Error('Coarse control did not finish');}while(!row.done);
 const result=row.value;if(!result.complete||!result.coarseCorridor)throw Error('Real coarse corridor failed: '+JSON.stringify({reason:result.reason,complete:result.complete,coarse:result.coarseCorridor,meters:result.meters}));
 if(pages.window.loaded.size>32||pages.pages.size>4||pages.corridors.pages.size>16)throw Error('Unbounded coarse control residency');
 const report={schema:1,world,scope:'Largest cooked geometry component, not a playable-scene claim; every modeled actor explicitly passable for this offline control; no game acceptance',start,goal,
  meters:result.meters,points:result.points.length,coarseComponents:result.coarseComponents,steps,maxStepMs,elapsedMs:performance.now()-started,
  residentTiles:pages.window.loaded.size,metadataPages:pages.pages.size,coarsePages:pages.corridors.pages.size,physicalVerified:false};
 // Run the real Mod scheduler too: draining a generator alone would miss its
 // 50ms single-step and 30s wall guards. Simulated 60Hz is not an FPS claim.
 const require=createRequire(import.meta.url),{Planner:Jobs}=require('../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteJobs.js');
 phase='scheduler';slow.length=0;
 let frame=0,active=null,scheduled,metrics;
 const timer=()=>frame+(active===null?0:performance.now()-active),scheduler=new Jobs(()=>{},timer);
 scheduler.request({key:'real-world-corridor',world,level:world,p:{x:goal[0],y:goal[1],z:goal[2]},start:{x:start[0],y:start[1],z:start[2]},revision:'recast/control',originRevision:'control'},
  ()=>pages.routeJob(start,goal,states),(value,request,info)=>{scheduled=value;metrics=info;});
 for(let i=0;scheduler.pending&&i<10000;i++){
  active=performance.now();scheduler.pump();const elapsed=performance.now()-active;active=null;frame+=Math.max(16,elapsed);await new Promise(setImmediate);
 }
 if(!scheduled?.complete)throw Error('Real Mod scheduler rejected the long corridor: '+JSON.stringify({metrics,slow}));
 report.scheduler={...metrics,simulatedHz:60,frameClaim:false};report.slowSteps=slow;
 fs.writeFileSync(path.join(worldFolder,'paged-corridor-validation.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(worldFolder,'route-paged-corridor-control.json'),JSON.stringify({...result,assumedActorStates:states}));console.log(JSON.stringify(report));
}finally{pages.destroy();}
