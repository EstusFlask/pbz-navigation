'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
test('checked-frontier selection minimizes unknown steps and handles checked cycles',async()=>{
 const {checkedFrontierJob}=await import('../offline-navigation/checked-frontier.mjs');
 const edges=[{guid:'walk',from:0,to:1,checked:true},{guid:'cycle-a',from:1,to:5,checked:true},{guid:'cycle-b',from:5,to:1,checked:true},{guid:'critical',from:1,to:2,score:100},{guid:'final',from:2,to:4,checked:true},{guid:'cheap-detour',from:1,to:3,score:1},{guid:'extra',from:3,to:2,score:1}];
 const result=drain(checkedFrontierJob(edges,0,4));
 assert.equal(result.minimumUncheckedSteps,1);assert.deepEqual(result.selected.map(row=>row.guid),['critical']);
 assert.deepEqual([...result.forward].sort((left,right)=>left-right),[0,1,5]);assert.deepEqual([...result.backward].sort((left,right)=>left-right),[2,4]);
});
test('checked-frontier candidates remain diverse and bounded without inventing a disconnected bridge',async()=>{
 const {checkedFrontierJob}=await import('../offline-navigation/checked-frontier.mjs');
 const edges=[...Array.from({length:50},(_,index)=>({guid:'first-'+index,from:0,to:1,score:index})),{guid:'another-pair',from:0,to:2,score:500},{guid:'finish-a',from:1,to:3,checked:true},{guid:'finish-b',from:2,to:3,checked:true}];
 const result=drain(checkedFrontierJob(edges,0,3,{perPair:2,maxFeatures:3}));
 assert.deepEqual(result.selected.map(row=>row.guid),['first-0','another-pair','first-1']);
 assert.deepEqual(drain(checkedFrontierJob(edges,0,99)).selected,[]);
});

test('goal-side frontier selects an incoming fall in its actual direction',async()=>{
 const {checkedFrontierJob}=await import('../offline-navigation/checked-frontier.mjs');
 const edges=[{guid:'first',from:0,to:1},{guid:'fall',from:1,to:2,reverse:false,entry:[0,0,500],exit:[0,0,0]},{guid:'finish',from:2,to:3,checked:true},{guid:'outgoing-trap',from:3,to:0}];
 const result=drain(checkedFrontierJob(edges,0,3,{side:'goal',maxFeatures:1}));
 assert.equal(result.minimumUncheckedSteps,2);
 assert.deepEqual(result.selected.map(({guid,from,to,reverse,entry,exit})=>({guid,from,to,reverse,entry,exit})),[edges[1]]);
 assert.equal(result.forward.has(3),false);
 assert.deepEqual([...result.backward],[3,2]);
 assert.throws(()=>drain(checkedFrontierJob(edges,0,3,{side:'unknown'})),/frontier side/);
});
