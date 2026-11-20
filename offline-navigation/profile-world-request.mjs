// Offline performance diagnosis using captured endpoints. No game writes and
// no claim that Node timing or --jitless reproduces the game's V8 flags.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const [data='build/offline-navigation/mod-worlds',out='build/field-route005-20261116/profile.json',nodes='65535']=process.argv.slice(2);
const world='pbz_fujizhilin_wp',index=JSON.parse(fs.readFileSync(path.join(data,world,'index.json'),'utf8'));
const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(new URL('../build/offline-navigation/runtime/PBZRecastRuntime.js',import.meta.url),'utf8'),context);
const core=context.module.exports;await core.initialize();const timings=[],events=[];let stepEvents=[];
const measured=(name,fn)=>{const start=performance.now();try{return fn();}finally{const ms=performance.now()-start;stepEvents.push({name,ms});}};
function* tracked(name,job){try{let row;do{row=measured(name,()=>job.next());if(!row.done)yield row.value;}while(!row.done);return row.value;}finally{job.return();}}
for(const [type,key,label]of [[core.Planner,'replaceTile','insert'],[core.PagedWorld,'cacheBlob','blobCache']]){
 const old=type.prototype[key];type.prototype[key]=function(...a){return measured(label,()=>old.apply(this,a));};
}
const insert=core.Planner.prototype.replaceTile;
core.Planner.prototype.replaceTile=function(slot,bytes){
 if(!bytes)return insert.call(this,slot,bytes);
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),label='tile '+[v.getInt32(8,true),v.getInt32(12,true),v.getInt32(16,true)].join(',')+' polys='+v.getInt32(24,true);
 return measured(label,()=>insert.call(this,slot,bytes));
};
for(const [type,key,label]of [[core.Planner,'routeJob','query'],[core.WorldWindow,'_loadWindowJob','load'],[core.PagedWorld,'blobJob','blob'],[core.PagedWorld,'metadataJob','metadata']]){
 const old=type.prototype[key];type.prototype[key]=function(...a){return tracked(label,old.apply(this,a));};
}
const p=new core.PagedWorld(index,file=>measured('read '+file,()=>fs.readFileSync(path.join(data,world,file),'utf8')),{maxNodes:Number(nodes)});
const start=[-51556,136730,3336],goal=[-47835,152968,1717],states=Object.fromEntries(index.actors.map(a=>[a.id,true]));
if(process.env.PBZ_PROFILE_UNKNOWN)for(const id of Object.keys(states))delete states[id];
try{
 const options=process.env.PBZ_PROFILE_OPTIONS?JSON.parse(process.env.PBZ_PROFILE_OPTIONS):{};
 const job=process.env.PBZ_PROFILE_DIRECT?p.directJob(start,goal,states,options):p.routeJob(start,goal,states,options);let row,n=0,scheduled;
 if(process.env.PBZ_PROFILE_SCHEDULED){
  const {Planner:Scheduler}=createRequire(import.meta.url)('../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteJobs.js');
  let wall=0,active=null;const clock=()=>wall+(active===null?0:performance.now()-active),scheduler=new Scheduler((name,value)=>events.push({name,value}),clock);
  const request={key:'captured-route-005',world,level:'field',revision:0,originRevision:0,p:{x:goal[0],y:goal[1],z:goal[2]},start:{x:start[0],y:start[1],z:start[2]}};
  scheduler.request(request,()=>job,(value,request,metrics)=>{row={done:true,value:value??{complete:false,points:[],reason:'scheduler cancelled'}};scheduled={...metrics,stats:scheduler.stats};});
  while(scheduler.pending){active=performance.now();scheduler.pump();wall+=Math.max(16,performance.now()-active);active=null;n++;if(n>10000)throw Error('Scheduler did not terminate');}
 }else{
 do{stepEvents=[];const t=performance.now();row=job.next();const ms=performance.now()-t;timings.push(ms);if(ms>5)events.push({step:n,ms,events:stepEvents.filter(r=>r.ms>1)});if(++n>200000)throw Error('Query did not terminate');}while(!row.done);
 }
 const sorted=[...timings].sort((a,b)=>a-b),report={schema:1,world,start,goal,scope:(process.env.PBZ_PROFILE_UNKNOWN?'All actors unknown/closed':'Explicit all-actor-open')+' offline scenario; profiling only, no live state or physical acceptance',nodeFlags:process.execArgv,maxNodes:Number(nodes),
  result:{complete:row.value.complete,reason:row.value.reason,points:row.value.points.length,meters:row.value.meters,unknownActors:row.value.unknownActors},route:row.value,scheduled,steps:n,maxStepMs:sorted.at(-1),p95Ms:sorted[Math.floor(sorted.length*.95)],slow:events};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));const {route,...brief}=report;console.log(JSON.stringify({...brief,slow:events.sort((a,b)=>b.ms-a.ms).slice(0,5)}));
}finally{p.destroy();}
