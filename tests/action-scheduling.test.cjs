'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.PBZ_TEST_SOURCE||path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const T=require(root+'/PBZRouteTransitions'),R=require(root+'/PBZRouteCore'),{Planner}=require(root+'/PBZRouteJobs');
function run(job){let row,n=0;do{row=job.next();assert.ok(++n<100000);}while(!row.done);return row.value;}

for(const mode of ['minimal','captured'])test('a fully checked tower chain is submitted before speculative alternative connectors consume the wall deadline ('+mode+')',t=>{
 const field=require('./fixtures/tower-chain-completion-20261114.json');
 const selected=mode==='minimal'?field.features.filter(f=>[field.goodAscent,'BP_SpecialMove_UpRunning_C_UAID_BCFCE7058A98988402_1736629466'].includes(f.guid)):field.features;
 // Captures contain directional pads; the live API takes one feature per
 // actor with a both flag. Group reverse samples so pad-cache keys stay real.
 const byGuid=new Map();for(const f of selected){const old=byGuid.get(f.guid);
  if(!old)byGuid.set(f.guid,{...f,both:false,runtimePath:[f.entry,f.exit]});
  else if(R.dist(f.entry,old.exit)<1&&R.dist(f.exit,old.entry)<1)old.both=true;
 }
 const features=[...byGuid.values()];
 const good=features.find(f=>f.guid===field.goodAscent),near=(a,b)=>R.dist(a,b)<1;
 let wall=0,goalChecked=false,afterComplete=0,result,metrics;
 const scheduler=new Planner(()=>{},()=>wall);
 scheduler.request({key:'checked-chain',world:field.world,level:field.world,start:field.start,p:field.goal,revision:0,originRevision:0},
  clock=>T.route({name:field.world,start:field.start,goal:field.goal,features,clock,stagedWalk:true,
   landing:function*(f,p){return p;},canTraverse:()=>true,validate:function*(){return true;},
   walk:function*(a,b,settings){
    if(near(a,field.start)&&near(b,good.entry))return {points:[a,b],meters:100};
    if(near(a,good.exit)&&near(b,field.goal)){goalChecked=true;return {points:[a,b],meters:129};}
    if(goalChecked){afterComplete++;const until=Math.min(settings.deadline,clock()+200);while(clock()<until){wall+=.25;yield;}}
    return null;
   }}),(trip,request,stats)=>{result=trip;metrics=stats;});
 for(let frame=0;scheduler.pending&&frame<3000;frame++){scheduler.pump();wall+=16;}
 t.diagnostic(JSON.stringify({mode,simulatedMetrics:metrics,queriesAfterComplete:afterComplete}));
 assert.ok(goalChecked,'the replay never reached the checked upstairs connector');
 assert.ok(result&&!metrics?.timeout,'a completely checked route was retained in the queue until the30s wall deadline');
 assert.ok(metrics.wall<5000,'a checked route was delayed by simulated speculative work rather than being submitted');
 assert.equal(afterComplete,0,'speculative alternatives were still queried after the full route had passed validation');
 assert.deepEqual(result.legs[0].moves.map(m=>m.guid),[field.goodAscent]);
});

test('a partial walking connector cannot complete an action-chain proposal',()=>{
 const start={x:0,y:0,z:0},goal={x:1000,y:0,z:0};
 const trip=run(T.route({name:'test',start,goal,features:[],clock:()=>0,stagedWalk:true,
  landing:function*(f,p){return p;},canTraverse:()=>true,
  walk:function*(a,b){return {points:[a,b],meters:10,partial:true};}}));
 assert.equal(trip,null,'an incomplete connector was submitted as a fully checked route');
});

test('the captured doorway climb continues to its checked upstairs route before a slow unrelated ladder repair',()=>{
 const field=require('./fixtures/tower-doorway-scheduling-20261114.json');
 let wall=0,result,metrics,slowRepairs=0;
 const features=field.features.filter(f=>[field.goodAscent,field.slowLadder].includes(f.guid))
  .map(f=>({...f,both:f.kind==='ladder',runtimePath:[f.entry,f.exit]}));
 const good=features.find(f=>f.guid===field.goodAscent),ladder=features.find(f=>f.guid===field.slowLadder);
 const near=(a,b)=>R.dist(a,b)<1;
 const scheduler=new Planner(()=>{},()=>wall);
 scheduler.request({key:'doorway',world:field.world,level:field.world,start:field.start,p:field.goal,revision:0,originRevision:0},
  clock=>T.route({name:field.world,start:field.start,goal:field.goal,features,clock,stagedWalk:true,
   landing:function*(f,p){return p;},validate:function*(){return true;},canTraverse:()=>true,
   walk:function*(a,b,settings){
    if(near(a,field.start)&&near(b,good.entry))return {points:[a,b],meters:76};
    if(near(a,good.exit)&&near(b,field.goal))return {points:[a,b],meters:129};
    if(near(a,field.start)&&near(b,ladder.exit)){
     if(settings.quick)return null;
     slowRepairs++;while(clock()<settings.deadline){wall+=.25;yield;}return null;
    }
    return null;
   }}),(trip,request,stats)=>{result=trip;metrics=stats;});
 for(let frame=0;scheduler.pending&&frame<3000;frame++){scheduler.pump();wall+=16;}
 assert.ok(result&&!metrics?.timeout,'a checked climb entry was found, but an unrelated ladder repair consumed the30s wall deadline before its upstairs continuation');
 assert.equal(slowRepairs,0,'a complete checked native/author-point action chain must precede expensive grid repair');
 assert.deepEqual(result.legs[0].moves.map(m=>m.guid),[field.goodAscent]);
 assert.ok(near(result.legs[0].points.at(-1),field.goal));
});

test('a quick negative does not suppress the checked full walking repair',()=>{
 const start={x:0,y:0,z:0},goal={x:1000,y:0,z:0},calls=[];
 const trip=run(T.route({name:'test',start,goal,features:[],clock:()=>0,stagedWalk:true,maxConnectors:4,
  landing:function*(f,p){return p;},canTraverse:()=>true,
  walk:function*(a,b,settings){calls.push(settings.quick);return settings.quick?null:{points:[a,b],meters:10};}}));
 assert.ok(trip&&!trip.legs[0].partial,'failure of cheap providers permanently blocked the full grid fallback');
 assert.deepEqual(calls,[true,false]);
});

test('a checked quick action entry is reused when its continuation needs full repair',()=>{
 const start={x:0,y:0,z:0},entry={x:200,y:0,z:0},exit={x:200,y:0,z:600},goal={x:1000,y:0,z:600};let entries=0;
 const near=(a,b)=>R.dist(a,b)<1;
 const trip=run(T.route({name:'test',start,goal,clock:()=>0,stagedWalk:true,
  features:[{kind:'ascent',guid:'available-climb',runtimePath:[entry,exit]}],landing:function*(f,p){return p;},canTraverse:()=>true,
  validate:function*(){return true;},walk:function*(a,b,settings){
   if(near(a,start)&&near(b,entry)){entries++;return {points:[a,b],meters:2};}
   if(near(a,exit)&&near(b,goal)&&!settings.quick)return {points:[a,b],meters:8};
   return null;
  }}));
 assert.ok(trip&&!trip.legs[0].partial);assert.equal(entries,1,'phase change repeated a checked physical entry');
 assert.deepEqual(trip.legs[0].moves.map(m=>m.guid),['available-climb']);
});
