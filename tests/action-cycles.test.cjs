'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const T=require(root+'/PBZRouteTransitions'),R=require(root+'/PBZRouteCore'),f=require('./fixtures/a04-ladder-cycle-20261114.json');
function run(job){let r,n=0;do{r=job.next();assert.ok(++n<100000);}while(!r.done);return r.value;}
function options(direction,alternative=false){
 const [bottom,top]=f.feature.runtimePath,start=f.start,goal=f.goal;
 const entry={x:start.x-9000,y:start.y,z:start.z},exit={...entry,z:goal.z};
 const same=(a,b)=>R.dist(a,b)<1,leg=(a,b)=>({points:[a,b],meters:R.dist(a,b)/100});
 return {name:f.world,start,goal,direction,clock:()=>0,stagedWalk:true,
  features:[f.feature,...(alternative?[{guid:'valid-other-ascent',kind:'ascent',runtimePath:[entry,exit]}]:[])],
  canTraverse:()=>true,landing:function*(feature,p){return p;},walk:function*(a,b,settings){
   if(same(a,b)||same(a,start)&&same(b,bottom))return leg(a,b);
   // Preserve the caller's existing policy: a high-difference final local
   // connector is enabled after an action. Up/down of the same ladder must
   // not be invented solely to switch that policy on at the original pad.
   if(same(a,bottom)&&same(b,goal)&&settings.local)return leg(a,b);
   if(alternative&&(same(a,start)&&same(b,entry)||same(a,exit)&&same(b,goal)))return leg(a,b);
   return null;
  }};
}
for(const direction of ['forward','reverse']){
 test('captured A-04 '+direction+' search cannot use a same-ladder return to unlock a final connector',()=>{
  const trip=run(T.route(options(direction)));
  assert.equal(trip,null,'the planner inserted a useless up/down ladder loop and called the resulting connection complete');
 });
 test('removing an immediate ladder return preserves a real alternative chain in '+direction+' search',()=>{
  const trip=run(T.route(options(direction,true)));assert.ok(trip);
  assert.deepEqual(trip.legs[0].moves.map(m=>m.guid),['valid-other-ascent']);
 });
}

test('opposite native wallrun views cannot make an immediate return between their distinct pads',()=>{
 const p=x=>({x,y:0,z:0}),start=p(-100),goal=p(50),a=p(0),b=p(900),back=p(1000),end=p(100);
 const first={guid:'native-wall',kind:'wallrun',both:false,launchBox:{},runtimePath:[a,b]};
 const reverse={...first,wallrunReverse:true,runtimePath:[back,end]};
 const close=(a,b)=>R.dist(a,b)<1,edges=[];
 const trip=run(T.route({name:'fixture',start,goal,features:[first,reverse],clock:()=>0,lazyActions:true,
  maxConnectors:8,canTraverse:()=>true,landing:function*(feature,p){return p;},validate:function*(){return true;},
  walk:function*(a,b,settings){
   edges.push([a.x,b.x]);
   if(close(a,start)&&close(b,first.runtimePath[0])||close(a,first.runtimePath[1])&&close(b,back)||close(a,end)&&close(b,goal)&&settings.local)
    return{points:[a,b],meters:R.dist(a,b)/100};
   return null;
  }}));
 assert.equal(trip,null,'using the same wall in both directions manufactured a checked route');
 assert.ok(!edges.some(([a,b])=>a===900&&b===1000),'the immediate return spent walking-connector budget');
});


test('equal-cost seam candidates retain their original order after a collision',()=>{
 const point=(x,z)=>({x,y:0,z}),start=point(0,0),goal=point(1000,100),checked=[];
 const features=['earliest','second','third','fourth'].map(guid=>({guid,kind:'surface',source:'recast-boundary',
  runtimePath:[point(400,0),point(600,100)]}));
 const result=run(T.route({name:'test',clock:()=>0,start,goal,lazyActions:true,features,component:p=>p.z,componentConnectors:true,
  canTraverse:()=>true,landing:function*(f,p){return p;},validate:function*(action){checked.push(action.feature.guid);return checked.length>2;},
  walk:function*(a,b){return{points:[a,b],meters:R.dist(a,b)/100};}}));
 assert.ok(result);
 assert.deepEqual(checked,['earliest','second','third']);
 assert.equal(result.legs[0].moves[0].guid,'third');
});