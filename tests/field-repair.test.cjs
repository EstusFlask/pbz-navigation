'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const F=require(root+'/PBZRouteFeasibility'),Repair=require(root+'/PBZRouteRepair');
const p=(x,y=0,z=0)=>({x,y,z});
function run(job){let row,steps=0;do{row=job.next();assert.ok(++steps<100000,'unbounded replay');}while(!row.done);return row.value;}

function obstacles(walls){
 const blocked=(a,b)=>walls.find(x=>{
  if(a.x===b.x||(a.x<x&&b.x<x)||(a.x>=x&&b.x>=x))return false;
  const t=(x-a.x)/(b.x-a.x);return Math.abs(a.y+(b.y-a.y)*t)<230;
 });
 const world={normal:.7,rise:45,slope:1,r:35,floorAt:q=>q,hit:()=>null,
  step:(a,b)=>{const x=blocked(a,b);return x===undefined?{p:b}:{hit:p(x,a.y),why:'blocked body clearance'};}};
 const source={world:'test',provider:'native',points:[p(0),p(2000)],moves:[],walks:[],checks:[],gates:[]};
 const failure=run(F.check(world,source,p(0)));assert.equal(failure.ok,false);
 const reports=[],fixed=run(Repair.repair(world,source,failure,p(0),{clock:()=>0,
  report:(phase,data)=>reports.push({phase,...data})}));
 return {fixed,reports,blocked};
}

test('a checked local bypass with a rejected remaining tail still finds a complete bypass',t=>{
 // Field sequence: local connector found -> whole-route validation rejected.
 // Physics is a minimal two-obstacle substitute, not captured game collision.
 for(const walls of [[500],[1100]])assert.ok(obstacles(walls).fixed?.verdict.ok,'either obstruction alone must work');
 const {fixed,reports,blocked}=obstacles([500,1100]);
 assert.ok(reports.some(r=>r.phase==='local detour result'&&r.found),'replay did not reach a checked connector');
 assert.ok(reports.some(r=>r.phase==='local detour validation'&&!r.ok),'replay did not reject the remaining tail');
 t.diagnostic(JSON.stringify(reports.filter(r=>r.phase==='local detour validation')));
 assert.ok(fixed?.verdict.ok,'repair abandoned a later complete bypass after its first connector left a blocked tail');
 assert.ok(fixed.candidate.points.slice(1).every((b,i)=>blocked(fixed.candidate.points[i],b)===undefined));
});

test('the field tower climb can continue upstairs through a checked local walking connector',()=>{
 const T=require(root+'/PBZRouteTransitions'),field=require('./fixtures/tower-stairs-20261113.json');
 const point=a=>p(...a),start=point(field.start),entry=point(field.entry),exit=point(field.exit),goal=point(field.goal);
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),calls=[];
 const feature={kind:'ascent',guid:field.actor,both:false,runtimePath:field.actionPath.map(point)};
 const trip=run(T.route({name:field.world,world:{},start,goal,features:[feature],clock:()=>0,
  landing:function*(f,q){return {...q};},canTraverse:()=>true,validate:function*(){return true;},
  walk:function*(a,b,settings){
   calls.push({a,b,local:settings.local});
   if(dist(b,entry)<1&&dist(a,start)<1)return {points:[a,entry],meters:dist(a,entry)/100};
   if(dist(a,exit)<1&&dist(b,goal)<1&&settings.local){
    const points=field.upperWalk.map(point);return {points,meters:require(root+'/PBZRouteCore').extent(points)/100};
   }
   return null;
  }}));
 assert.ok(calls.some(c=>dist(c.a,exit)<1&&dist(c.b,goal)<1),'replay did not reach the post-climb connector');
 assert.ok(trip,'a valid local staircase after the observed climb was disabled because the goal is higher');
 assert.deepEqual(trip.legs[0].moves.map(m=>m.kind),['ascent']);
 assert.ok(dist(trip.legs[0].points.at(-1),goal)<1);
});
