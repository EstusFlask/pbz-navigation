'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const T=require(path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteTransitions'));
const crowded=require('./fixtures/crowded-action-replan.cjs');
const p=(x,z=0)=>({x,y:0,z});
function run(job){let row,steps=0;do{row=job.next();assert.ok(++steps<200000);}while(!row.done);return row.value;}
function alternativePads(mutate=false){
 const start=p(0),goal=p(300,1000),entry=p(100),calls=[];
 const bad={guid:'blocked-tail',kind:'ascent',runtimePath:[{...entry},p(200,1000)]},good={guid:'clear-tail',kind:'ascent',runtimePath:[{...entry},p(400,1000)]};
 const options={name:'exact-pad-cache',start,goal,features:[bad,good],clock:()=>0,lazyActions:true,
  component:p=>p.z,componentConnectors:true,canTraverse:()=>true,landing:function*(feature,p){yield;return{...p};},validate:function*(){yield;return true;},
  walk:function*(a,b){yield;calls.push([a.x,a.z,b.x,b.z]);
   if(a.z===0&&a.x===0&&b.x===100){if(mutate)start.x=10;return{points:[{...a},b],meters:1};}
   if(a.x===400&&b.x===300)return{points:[a,b],meters:1};
   return null;
  }};
 return{options,calls};
}
test('equal-coordinate standing-pad copies reuse a checked prefix across alternative actions',()=>{
 const {options,calls}=alternativePads(),result=run(T.route(options));assert.ok(result);
 assert.deepEqual(result.legs[0].moves.map(m=>m.guid),['clear-tail']);
 assert.equal(calls.filter(([x,z,to])=>x===0&&z===0&&to===100).length,1,'a coordinate-identical pad spent another connector');
});
test('a walking cache cannot reuse the former coordinates after a start point mutates during validation',()=>{
 const {options,calls}=alternativePads(true),result=run(T.route(options));assert.equal(result,null);
 assert.ok(calls.some(([x,z,to])=>x===10&&z===0&&to===100),'the moved start reused its former checked prefix');
});
test('nearby unequal standing pads retain separate physical connector checks',()=>{
 const {options,calls}=alternativePads();options.features[1].runtimePath[0].x+=.00001;
 assert.equal(run(T.route(options)),null);
 assert.ok(calls.some(([x,z,to])=>x===0&&z===0&&to===100.00001),'a nearby unchecked pad inherited the checked pad result');
});
for(const lazyActions of [false,true])test(`a structured failed movement audit cannot become an accepted action, lazy=${lazyActions}`,()=>{
 const {options}=alternativePads();options.features=[options.features[1]];options.lazyActions=lazyActions;
 options.validate=function*(){yield;return{ok:false,unknown:false,why:'trajectory capsule obstructed'};};
 assert.equal(run(T.route(options)),null,'a truthy failure object was treated as a successful physical audit');
});
test('crowded rejected descents preserve a physically checked alternative with the same connector quota',()=>{
 const fixture=crowded(96),result=run(T.route(fixture.options));assert.ok(result);
 assert.equal(fixture.counts.rejected,96);assert.equal(fixture.counts.walks,3);
 assert.deepEqual(result.legs[0].moves.map(m=>m.guid),['first-descent','clear-descent']);
});
test('cached component comparisons batch replanning without batching additional component projections',()=>{
 const fixture=crowded(),original=fixture.options.component;let queries=0,maxQueries=0,steps=0,row;
 fixture.options.component=p=>{queries++;return original(p);};
 const job=T.route(fixture.options);
 do{const before=queries;row=job.next();steps++;maxQueries=Math.max(maxQueries,queries-before);}while(!row.done);
 assert.ok(row.value);assert.equal(fixture.counts.rejected,480);assert.equal(fixture.counts.walks,3);
 assert.ok(maxQueries<=16,`a scheduled step made ${maxQueries} uncached component queries`);
 assert.ok(steps<6000,`cached component comparisons split the checked alternative into ${steps} scheduled steps`);
});
