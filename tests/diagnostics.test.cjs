'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {Recorder,snapshot}=require(root+'/PBZRouteDiagnostics');
function setup(write){let now=0;const files=new Map(),r=new Recorder({build:'1.5.0-dev',root:'saved/',clock:()=>now,
 write:write||((p,s)=>files.set(p,s))});return {r,files,set:t=>now=t};}
test('development marker saves before/after context and survives an interrupted post window',()=>{
 const {r,files,set}=setup();r.sample({context:'world/1',feet:{x:0,y:0,z:0}},0);r.poll(false,true,()=>({}),0);
 set(100);r.event('native',{status:'invalid path'});r.sample({context:'world/1',feet:{x:1,y:2,z:3}});
 const result=r.poll(true,true,()=>({target:{key:'gate'},route:{points:[1,2,3]}}));assert.ok(result.saved);
 let saved=JSON.parse(files.get(result.path));assert.equal(saved.snapshot.target.key,'gate');assert.equal(saved.before.events[0].kind,'native');assert.equal(saved.after.complete,false);
 set(500);r.sample({context:'world/1',feet:{x:4,y:5,z:6}});r.event('query',{hit:'wall'});
 set(5200);r.advance();saved=JSON.parse(files.get(result.path));assert.equal(saved.after.complete,true);assert.equal(saved.after.samples.length,1);assert.equal(saved.after.events[0].data.hit,'wall');
});
test('held heavy attack, menus and cooldown do not duplicate reports or consume game input',()=>{
 const {r,set}=setup();r.sample({context:'w',feet:null});assert.equal(r.poll(true,true,()=>({})),null);r.poll(false,true,()=>({}));
 assert.equal(r.poll(true,false,()=>{throw Error('menu capture');}),null);r.poll(false,true,()=>({}));set(100);
 assert.ok(r.poll(true,true,()=>({})));assert.equal(r.poll(true,true,()=>({})),null);r.poll(false,true,()=>({}));set(1000);assert.equal(r.poll(true,true,()=>({})),null);
 r.poll(false,true,()=>({}));set(2200);assert.ok(r.poll(true,true,()=>({})));assert.equal(r.count,2);
});
test('a world/context change closes reports without fabricating continuous travel',()=>{
 const {r,files,set}=setup();r.sample({context:'a',feet:{x:0,y:0,z:0}});const mark=r.mark({});
 set(200);r.sample({context:'b',feet:{x:10000,y:0,z:0}});const saved=JSON.parse(files.get(mark.path));
 assert.equal(saved.after.complete,false);assert.equal(saved.after.reason,'context changed');assert.equal(saved.after.samples.length,0);assert.equal(r.samples.length,1);assert.ok(r.events.every(e=>e.kind==='observation boundary'));
});
test('same-world position jumps keep a discontinuity instead of a learned walking segment',()=>{
 const {r,files,set}=setup();r.sample({context:'a',feet:{x:0,y:0,z:0}});const mark=r.mark({});
 set(200);r.sample({context:'a',feet:{x:5000,y:0,z:0}});
 const data=JSON.parse(files.get(mark.path));assert.equal(data.after.reason,'position discontinuity');assert.equal(r.samples.length,1);assert.equal(r.events[0].kind,'observation boundary');
});
test('failed file writes show failure and do not announce a saved report',()=>{
 const {r}=setup(()=>false);const mark=r.mark({});assert.equal(mark.saved,false);assert.match(r.notice(),/保存失败/);assert.equal(r.pending.length,0);
});
test('physics probe traffic cannot evict planning events from the pre-marker window',()=>{
 const {r,files}=setup();r.sample({context:'w',feet:null});r.event('planner finished',{mode:'reverse'});
 for(let i=0;i<1000;i++)r.event('walking probe rejected',{why:'wall',i});
 const mark=r.mark({});const saved=JSON.parse(files.get(mark.path));
 assert.equal(saved.before.events[0].kind,'planner finished');assert.equal(saved.before.probes.length,128);
});
test('case snapshot retains exact active route and visible blue-line inputs as plain data',()=>{
 const a={x:1,y:2,z:3},b={x:4,y:5,z:6};
 const state={level:'w',manual:{key:'item',p:b},trip:{legs:[{world:'w',points:[a,b],moves:[],checks:[],obstacles:[]}]},active:0,line:[a,b],cfg:{ReverseSearch:true},version:2};
 const data=snapshot(state,{pending:false,stats:{}},{pool:[{on:true,__devPoints:[a,b],__devTotal:2},{on:false,__devPoints:[b]}]},['log']);
 a.x=900;assert.equal(data.trip.legs[0].points[0].x,1);assert.equal(data.rendered.length,1);assert.deepEqual(data.rendered[0].points[1],b);
});
