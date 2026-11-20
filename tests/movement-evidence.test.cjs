'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
test('evidence collection includes the deferred stage without changing searched candidates',async()=>{
 const {collectDeferredEvidence}=await import('../offline-navigation/movement-evidence.mjs'),first={guid:'first'},second={guid:'second'},searched=[first];let calls=0;
 const result=drain(collectDeferredEvidence(searched,function*(){calls++;yield;return[second];}));
 assert.deepEqual(searched,[first]);assert.deepEqual(result.features,[first,second]);assert.equal(result.collection.searchedCandidates,1);assert.equal(result.collection.deferredCandidates,1);assert.equal(calls,1);
});
test('deferred evidence refuses ambiguous source identities',async()=>{
 const {collectDeferredEvidence}=await import('../offline-navigation/movement-evidence.mjs');
 assert.throws(()=>drain(collectDeferredEvidence([{guid:'same'}],function*(){return[{guid:'same'}];})),/Duplicate/);
});
