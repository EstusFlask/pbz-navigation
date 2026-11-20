'use strict';
// Real resident Detour geometry and production action search/scheduler. Actor
// states and air physics are explicit controls, not game acceptance.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),mod=path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {WorldCache}=require(path.join(mod,'PBZRouteRecastProvider')),{Planner}=require(path.join(mod,'PBZRouteJobs')),T=require(path.join(mod,'PBZRouteTransitions')),D=require(path.join(mod,'PBZRouteDrops'));
(async()=>{
 const data=path.resolve(process.argv[2]||'build/offline-navigation/mod-worlds-deflate-1101'),world='pbz_fujizhilin_wp',index=JSON.parse(fs.readFileSync(path.join(data,world,'index.json')));
 const vmctx=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});vm.runInContext(fs.readFileSync(path.join(root,'build/offline-navigation/runtime/PBZRecastRuntime.js'),'utf8'),vmctx);const core=vmctx.module.exports;await core.initialize();
 const start={x:-51556,y:136730,z:3336},goal={x:-47835,y:152968,z:1717},array=p=>[p.x,p.y,p.z],point=p=>({x:p[0],y:p[1],z:p[2]});
 const authored=require(path.join(mod,'PBZRoutePlacedPassages',world)).data.rows.filter(f=>f.path.some(p=>p[0]>-56000&&p[0]<-45000&&p[1]>135000&&p[1]<154000&&p[2]>1000&&p[2]<4000));
 let wall=0,active=null,result,metrics,features,topology;const events=[],clock=()=>wall+(active===null?0:performance.now()-active),report=(name,value)=>events.push({name,value});
 const cache=new WorldCache(()=>core,{dataRoot:data,readText:f=>fs.readFileSync(f,'utf8')},report,()=>{},clock);cache.world=world;cache.ready=true;cache.index=index;cache.catalogue={worlds:{[world]:{}}};cache.states=Object.fromEntries(index.actors.map(a=>[a.id,true]));cache.pages=core.createWorld(index,f=>fs.readFileSync(path.join(data,world,f),'utf8'),{maxNodes:65535});
 const policy={maxHeightCm:1150,maxRunCm:934,gravityCm:2156,speedCm:750,jumpVelocityCm:420,canJump:true},mockWorld={r:45,dropPolicy:()=>policy,floorAt:p=>p,standAt:p=>p,step:(a,b)=>({p:b}),airHit:()=>null,blockAt:()=>null};
 const scheduler=new Planner(report,clock),request={key:'field-005-movement-control',world,level:world,start,p:goal,revision:0,originRevision:0};
 try{
  scheduler.request(request,searchClock=>(function*(){
   yield* cache.route(world,start,goal,{localActions:true,motionSeeds:authored.flatMap(f=>[point(f.path[0]),point(f.path.at(-1))])});report("phase",{phase:"walk",wall,cpu:searchClock()});
   const seeds=authored.flatMap(f=>[point(f.path[0]),point(f.path.at(-1))]);features=[...authored,...yield* cache.dropCandidates(world,start,goal,seeds,policy)];
   report("phase",{phase:"falls",wall,cpu:searchClock()});topology=yield* cache.actionTopology(world,start,goal,features);
   report("phase",{phase:"topology",wall,cpu:searchClock()});
   return yield* T.route({name:world,start,goal,features:topology.features.map(f=>({...f,runtimePath:f.path.map(point)})),clock:searchClock,lazyActions:true,maxConnectors:24,component:p=>topology.component(array(p)),canConnect:(a,b)=>topology.canConnect(array(a),array(b)),canTraverse:()=>true,
    landing:function*(f,p){yield;return p;},validate:function*(a){if(['fall','surface'].includes(a.feature.kind)){const r=yield* D.inspect(mockWorld,a.entry,a.exit,a.feature.kind==='surface'?'jump':'fall');return r.ok?r:false;}return true;},
    walk:function*(a,b){const leg=yield* cache.routeLocal(world,a,b);return leg&&!leg.partial?leg:null;},report});
  })(),(value,selected,stats)=>{result=value;metrics=stats;});
  for(let frame=0;scheduler.pending&&frame<4000;frame++){active=performance.now();scheduler.pump();wall+=Math.max(16,performance.now()-active);active=null;}
  const output={scope:'Real pure-JS compressed Detour and action search; all actors open, specified synthetic movement policy, clear mocked scene; not physical or game acceptance',policy,metrics,events,features,result,physicalVerified:false};
  fs.writeFileSync(path.join(root,'build/field-1101-route005-20261116/hybrid-scheduled'+(process.execArgv.includes('--jitless')?'-jitless':'')+'.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({metrics,features:features?.length,topology:topology?.stats,points:result?.legs[0].points.length,moves:result?.legs[0].moves.map(m=>({kind:m.kind,guid:m.guid})),last:events.filter(e=>!["raw candidates"].includes(e.name)).slice(-2)}));
  assert.ok(!metrics?.paused&&!metrics?.timeout&&!metrics?.error,JSON.stringify(metrics));assert.ok(result?.legs[0].moves.some(m=>m.kind==='ascent'),'no complete mixed topology was found');
 }finally{cache.cancel();cache.pages?.destroy();}
})().catch(error=>{console.error(error);process.exitCode=1;});
