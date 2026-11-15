'use strict';
const path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const field=require('../authoring/route-002-reference-1.7.1-20261115.json');
const R=require(root+'/PBZRouteCore'),Local=require(root+'/PBZRouteLocalWalk'),Hints=require(root+'/PBZRouteWalkHints');
function run(job){let row,n=0;do{row=job.next();assert.ok(++n<100000,'unbounded field replay');}while(!row.done);return row.value;}
function suffix(){
 const marker=field.markers[1].feet;let first=0,d=Infinity;
 for(let i=0;i<field.samples.length;i++){const value=R.dist(field.samples[i].p,marker);if(value<d){d=value;first=i;}}
 const points=[];for(const s of field.samples.slice(first))if(s.mode===1&&s.floor&&(!points.length||R.dist(points.at(-1),s.floor)>1))points.push(s.floor);
 return points;
}
test('route2 second marker has a checked finite candidate chain along the user-confirmed ground suffix',()=>{
 const points=suffix(),start=points[0],goal=points.at(-1),hints=Hints.forWorld(field.world);let locked=false,checks=0;
 // Actual captured geometry; support/collision callbacks are a corridor control,
 // not the game's collision mesh. The closed-edge case must still fail.
 const onRoad=p=>R.nearestOnLine(p,points).d<=85;
 const world={r:45,rise:50,slope:1.43,floorAt:p=>onRoad(p)?p:null,hit:()=>null,step:(a,b)=>{
  checks++;if(locked&&Math.min(a.x,b.x)<=-64600&&Math.max(a.x,b.x)>-64600)return {why:'locked bridge',locked:true};
  const n=Math.max(1,Math.ceil(R.dist(a,b)/35));
  for(let i=0;i<=n;i++)if(!onRoad(R.lerp(a,b,i/n)))return {why:'outside captured corridor'};
  return {p:b};
 }};
 const route=run(Local.search(world,start,goal,{hints,hintsOnly:true,clock:()=>0}));
 assert.ok(route&&!route.partial,'known continuous ground after route2 marker2 is absent from the author candidate graph');
 assert.ok(R.dist(route.points.at(-1),goal)<1);assert.ok(checks>0&&checks<=64,'live connector budget was bypassed or exhausted');
 locked=true;assert.equal(run(Local.search(world,start,goal,{hints,hintsOnly:true,clock:()=>0})),null,'author geometry bypassed the closed bridge');
});
test('route2 observed four-metre descent stays outside the generic short-drop envelope',()=>{
 const d=field.descents[0];assert.ok(d.verticalDropCm>390);
 const a=field.samples[d.first].floor,b=field.samples[d.last].floor;
 const verdict=require(root+'/PBZRouteDrops').check({floorAt:p=>p,hit:()=>null},a,b);
 assert.equal(verdict.ok,false);assert.equal(verdict.why,'outside short drop envelope');
 const points=require(root+'/PBZRouteWalkHintData/pbz_xigu_wp').data.points;
 for(const sample of field.samples.filter(s=>s.mode!==1))assert.ok(points.every(p=>R.dist({x:p[0],y:p[1],z:p[2]},sample.p)>1),'air sample was compiled as grounded geometry');
});
