'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.PBZ_TEST_SOURCE||path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const field=require('./fixtures/currency-180-20261115.json'),R=require(root+'/PBZRouteCore');
const {Planner}=require(root+'/PBZRouteJobs'),Local=require(root+'/PBZRouteLocalWalk'),{Index}=require(root+'/PBZRouteMapHints');

function coldCurrency(withSurface,{deferred=false,narrow=false}={}){
 let wall=0,loads=0,route,metrics;
 const start={...field.query.start},goal={...field.query.goal};
 const points=Array.from({length:13},(_,i)=>R.lerp(start,goal,i/12));
 const bytes=Buffer.from(Int32Array.from(points.flatMap(p=>[p.x,p.y,p.z].map(v=>Math.round(v*10)))).buffer).toString('base64');
 const row={name:'cold',lo:Math.min(start.z,goal.z)-1,hi:Math.max(start.z,goal.z)+1,n:points.length},tiles={};
 for(const p of points)tiles[Math.floor(p.x/3200)+','+Math.floor(p.y/3200)]=[row];
 const hints=new Index({schema:1,tileSize:3200,scale:10,points:points.length,tiles},()=>{
  loads++;wall+=field.coldPauseMs;return {p:bytes};
 });
 hints.deferred=deferred;
 const floor=p=>{
  const side=Math.abs((p.x-start.x)*(goal.y-start.y)-(p.y-start.y)*(goal.x-start.x))/R.xy(start,goal);
  if(narrow&&side>3)return null;
  return {...p,z:start.z+(goal.z-start.z)*Math.max(0,Math.min(1,
   ((p.x-start.x)*(goal.x-start.x)+(p.y-start.y)*(goal.y-start.y))/R.xy(start,goal)**2))};
 };
 // A clear, gently graded local floor isolates scheduling from terrain. The
 // cold-read delay is the actual installed session's 53 ms paused slice.
 const world={floorAt:p=>{wall+=.02;return floor(p);},step:(a,b)=>{wall+=.02;return {p:floor(b)};}};
 const scheduler=new Planner(()=>{},()=>wall);
 scheduler.request({key:field.currency.key,world:field.world,level:field.world,p:goal,start,revision:1,originRevision:1},
  clock=>Local.search(world,start,goal,{clock,direction:'forward',maxNodes:700,maxMs:1200,...(withSurface?{hints}:{})}),
  (result,request,stats)=>{route=result;metrics=stats;});
 for(let frame=0;scheduler.pending&&frame<1000;frame++){
  if(deferred)hints.pump(); // Host tick loads one page outside Planner's CPU slice.
  scheduler.pump();wall+=50;
 }
 return {route,metrics,loads,failed:scheduler.failed};
}

function run(job){let row,n=0;do{row=job.next();assert.ok(++n<100000);}while(!row.done);return row.value;}

test('a near currency keeps its working local route when optional model data is cold',()=>{
 const original=coldCurrency(false);assert.ok(original.route&&!original.route.partial,'clear local walking control must work');
 const current=coldCurrency(true);
 assert.ok(current.route&&!current.route.partial,'cold optional geometry permanently paused a reachable near currency: '+JSON.stringify(current.metrics));
 assert.equal(current.failed,null);assert.equal(current.loads,0,'a usable local walk waited on optional model I/O');
});

test('a cold model-only connector resumes after one outside-planner read without losing the currency request',()=>{
 assert.equal(coldCurrency(false,{narrow:true}).route,null,'the narrow control must require surface candidates');
 const result=coldCurrency(true,{deferred:true,narrow:true});
 assert.ok(result.route&&!result.route.partial,'deferred model pages lost the pending connector');
 assert.equal(result.loads,1);assert.equal(result.failed,null);assert.ok(!result.metrics.paused);
 assert.ok(result.metrics.maxSlice<field.coldPauseMs);assert.ok(result.metrics.wall<2000);
});

test('requesting walking hints does not synchronously parse an optional world model index',()=>{
 const M=require(root+'/PBZRouteMapHints'),H=require(root+'/PBZRouteWalkHints'),load=M.forWorld;let reads=0;
 M.forWorld=(...args)=>{reads++;return load(...args);};
 try{assert.ok(H.forWorld('pbz_dengdingshandao_wp'));assert.equal(reads,0,'hint lookup loads optional geometry inside the planner frame');}
 finally{M.forWorld=load;}
});

test('an unsuccessful model connector is tried once per request and physical walking is retried',()=>{
 let modelQueries=0,physics=0;
 const hints={surfaceCandidates:true,world:field.world,near(){modelQueries++;return[];},candidates:()=>[]};
 const world={floorAt:p=>p,step(){physics++;return{why:'measured blocked floor'};}};
 const budget={remainingMs:100,attempted:new Set()};
 const options={hints,maxNodes:1,maxMs:500,clock:()=>0,surfaceBudget:budget};
 assert.equal(run(Local.search(world,field.query.start,field.query.goal,options)),null);
 const firstQueries=modelQueries,firstPhysics=physics;assert.ok(firstQueries>0&&firstPhysics>0);
 assert.equal(run(Local.search(world,field.query.start,field.query.goal,options)),null);
 assert.equal(modelQueries,firstQueries,'the same failed source graph was recomputed within the request');
 assert.ok(physics>firstPhysics,'a model failure cached a physical walking verdict');
 run(Local.search(world,field.query.start,field.query.goal,{...options,surfaceBudget:{remainingMs:100,attempted:new Set()}}));
 assert.ok(modelQueries>firstQueries,'another request inherited a stale source-graph failure');
});
