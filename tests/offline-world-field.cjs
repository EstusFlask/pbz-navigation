'use strict';
// Actual captured endpoints and packaged world, through the Mod provider and
// its unchanged 2ms/50ms/30s scheduler. This is offline, with unknown actors;
// it makes no claim about loaded game physics or the missing full corridor.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),mod=path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {WorldCache}=require(path.join(mod,'PBZRouteRecastProvider')),{Planner}=require(path.join(mod,'PBZRouteJobs'));
(async()=>{
 const data=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'build/offline-navigation/mod-worlds'),world='pbz_fujizhilin_wp',index=JSON.parse(fs.readFileSync(path.join(data,world,'index.json')));
 const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
 vm.runInContext(fs.readFileSync(path.join(root,'build/offline-navigation/runtime/PBZRecastRuntime.js'),'utf8'),context);const core=context.module.exports;await core.initialize();
 const a={x:-51556,y:136730,z:3336},b={x:-47835,y:152968,z:1717};let wall=0,active=null,result,metrics,completion=0;
 const clock=()=>wall+(active===null?0:performance.now()-active),events=[],api={dataRoot:data,readText:file=>fs.readFileSync(file,'utf8')};
 const cache=new WorldCache(()=>core,api,(name,value)=>events.push({name,value}),()=>{},clock);
 cache.world=world;cache.ready=true;cache.index=index;cache.states={};cache.pages=new core.PagedWorld(index,file=>api.readText(path.join(data,world,file)),{maxNodes:65535});
 cache.pages.candidateJob=function*(){assert.fail('an unrelated unknown fog gate restarted the entire request');};
 const scheduler=new Planner((name,value)=>events.push({name,value}),clock),request={key:'field-005-standing',world,level:world,start:a,p:b,revision:0,originRevision:0};
 try{
  scheduler.request(request,()=>cache.route(world,a,b),(value,selected,stats)=>{result=value;metrics=stats;completion++;});
  for(let frame=0;scheduler.pending&&frame<3000;frame++){active=performance.now();scheduler.pump();wall+=Math.max(16,performance.now()-active);active=null;}
  assert.equal(completion,1);assert.ok(!metrics.paused&&!metrics.timeout&&!metrics.error,JSON.stringify(metrics));
  assert.ok(result?.points.length>1,'standing still never produced a candidate');assert.equal(result.topologyComplete,false);assert.equal(result.physicalVerified,false);
  assert.equal(result.conditionalCandidate,false);assert.ok(events.some(r=>r.name==='recast world query'));
  const report={schema:1,scope:'captured endpoints; actual paged core, WorldCache and Jobs; unknown actors; no live physics acceptance',nodeFlags:process.execArgv,points:result.points.length,meters:result.meters,complete:result.topologyComplete,metrics,events,physicalVerified:false};
  const output=path.join(root,'build/field-route005-20261116/provider-scheduled'+(process.execArgv.includes('--jitless')?'-jitless':'')+'.json');fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,events:undefined}));
 }finally{cache.cancel();cache.pages?.destroy();}
})().catch(error=>{console.error(error);process.exitCode=1;});
