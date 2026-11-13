'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const G=require(root+'/PBZRouteGuides'),R=require(root+'/PBZRouteCore');
const p=(x,y=0,z=0)=>({x,y,z});
const w=()=>({step:(a,b)=>({p:b}),hit:()=>null});
function run(job){let r,n=0;do{r=job.next();assert.ok(++n<100000);}while(!r.done);return r.value;}
const course=(id,from,to,points,actions=[])=>({id,name:id,world:'test',sourceBell:from,targetBell:to,target:points.at(-1),points,actions});
const courses=[course('A-B','A','B',[p(0),p(400),p(800)]),
 course('B-C','B','C',[p(800),p(800,400),p(800,800),p(1200,800)])];
const plan=(dest,start=p(0),world=w(),data=courses)=>run(G.plan(world,'test',{world:'test',...dest},start,{courses:data}));

test('authored bell courses compose through their explicit bell identity',()=>{
 const trip=plan({bell:'C',p:p(1200,800)});assert.ok(trip);
 assert.deepEqual(trip.legs[0].guide.courses,['A-B','B-C']);
 assert.ok(trip.legs[0].points.some(q=>R.dist(q,p(800))<1));
 assert.equal(trip.legs[0].physicalVerified,undefined);
});

test('an item uses the directed bell spine and a checked walking spur',()=>{
 const trip=plan({key:'item',item:true,p:p(1200,1000)});assert.ok(trip);
 assert.deepEqual(trip.legs[0].guide.courses,['A-B','B-C']);
 assert.equal(trip.legs[0].guide.egress,'item');
 assert.ok(R.dist(trip.legs[0].points.at(-1),p(1200,1000))<1);
});

test('nearer points on another floor or across a wall are rejected as item exits',()=>{
 assert.equal(plan({item:true,p:p(800,400,650)}),null);
 const blocked={hit:()=>null,step:(a,b)=>b.y>850?{why:'wall'}:{p:b}};
 assert.equal(plan({item:true,p:p(1200,1000)},p(0),blocked),null);
});

test('map crossings, proximity and reversed endpoints do not invent bell connections',()=>{
 const broken=[courses[0],{...courses[1],sourceBell:'different-bell'}];
 assert.equal(plan({bell:'C',p:p(1200,800)},p(0),w(),broken),null);
 assert.equal(plan({bell:'A',p:p(0)},p(1200,800)),null);
 assert.equal(run(G.plan(w(),'test',{world:'other',bell:'C',p:p(1200,800)},p(0),{courses})),null);
});

test('unmeasured gaps between two courses at the same bell need a checked connector',()=>{
 const data=[courses[0],course('B-C','B','C',[p(800,200),p(800,800),p(1200,800)])];
 const blocked={hit:()=>null,step:(a,b)=>a.y<200&&b.y>0?{why:'door'}:{p:b}};
 assert.equal(plan({bell:'C',p:p(1200,800)},p(0),blocked,data),null);
});

test('joining after a directed climb never replays it and preserves later action indices',()=>{
 const data=[course('A-B','A','B',[p(0),p(300),p(300,0,500),p(700,0,500)],
  [{start:1,end:2,kind:'ascent',guid:'climb'}]),
  course('B-C','B','C',[p(700,0,500),p(1100,0,500),p(1100,0,1000),p(1500,0,1000)],
  [{start:1,end:2,kind:'hook',guid:'hook'}])];
 const leg=plan({bell:'C',p:p(1500,0,1000)},p(500,0,500),w(),data)?.legs[0];assert.ok(leg);
 assert.deepEqual(leg.moves.map(m=>m.kind),['hook']);
 for(const m of leg.moves){assert.deepEqual(leg.points[m.from],m.p);assert.deepEqual(leg.points[m.to],m.end);}
 assert.ok(leg.points.every(q=>q.z>=500));
});

test('a known locked short course chooses the open bell detour',()=>{
 const data=[...courses,course('A-C-short','A','C',[p(0),p(400,400),p(1200,800)])];
 const locked={...w(),blockAt:(a,b)=>R.nearestOnLine(p(400,400),[a,b]).d<1?{locked:true}:null};
 const trip=plan({bell:'C',p:p(1200,800)},p(0),locked,data);assert.ok(trip);
 assert.deepEqual(trip.legs[0].guide.courses,['A-B','B-C']);
});

test('an unavailable resident action chooses the open detour without inventing a reverse',()=>{
 const data=[...courses,course('locked-hook','A','C',[p(0),p(200),p(400,400),p(1200,800)],
  [{start:1,end:3,kind:'hook',guid:'hook'}])];
 const graph={passageStates:new Map([['hook',{ready:false,block:{locked:true}}]])};
 const trip=run(G.plan(w(),'test',{world:'test',bell:'C',p:p(1200,800)},p(0),{courses:data,graph}));
 assert.deepEqual(trip.legs[0].guide.courses,['A-B','B-C']);
 graph.passageStates.set('hook',{ready:true});
 const open=run(G.plan(w(),'test',{world:'test',bell:'C',p:p(1200,800)},p(0),{courses:data,graph}));
 assert.deepEqual(open.legs[0].guide.courses,['locked-hook']);
});

test('an item before a locked segment can still leave the spine safely',()=>{
 const data=[course('A-B','A','B',[p(0),p(400),p(800),p(1200)])];
 const locked={...w(),blockAt:(a,b)=>R.nearestOnLine(p(1000),[a,b]).d<1?{locked:true}:null};
 assert.ok(plan({item:true,p:p(300,100)},p(0),locked,data));
 assert.equal(plan({bell:'B',p:p(1200)},p(0),locked,data),null);
});
