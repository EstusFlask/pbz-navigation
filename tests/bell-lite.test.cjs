'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const mod=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {RecastCache}=require(mod+'/PBZRouteRecastProvider');
test('Lite keeps its regional provider and only pumps bell subset data for a bell target',()=>{
 const cache=new RecastCache(()=>{}, {bellOnly:true}),calls=[];
 cache.regional.covers=()=>false;cache.regional.pump=()=>calls.push('regional');
 cache.worlds.covers=()=>true;cache.worlds.pump=()=>calls.push('world');
 const p={x:0,y:0,z:0};
 assert.equal(cache.covers('test',p),false);cache.pump('test',{},p);assert.deepEqual(calls,['regional']);
 cache.setBellTarget(true);assert.equal(cache.covers('test',p),true);cache.pump('test',{},p);assert.deepEqual(calls,['regional','regional','world']);
 cache.regional.covers=()=>true;cache.setBellTarget(false);assert.equal(cache.covers('test',p),true,'original regional coverage was disabled');
});
test('ending a Lite bell query closes generators and releases its subset tile and movement caches',()=>{
 const cache=new RecastCache(()=>{}, {bellOnly:true}),calls=[];
 cache.setBellTarget(true);cache.worlds.job=(function*(){try{yield;}finally{calls.push('job');}})();cache.worlds.job.next();
 cache.worlds.pages={cancelQueries(){calls.push('queries');},destroy(){calls.push('tiles');}};
 cache.worlds.movementStorage={reader:{clear(){calls.push('movement');}}};cache.worlds.ready=true;cache.active=cache.worlds;
 cache.setBellTarget(false);assert(calls.includes('job'));assert(calls.includes('tiles'));assert(calls.includes('movement'));
 assert.equal(cache.worlds.pages,null);assert.equal(cache.worlds.world,null);assert.equal(cache.worlds.ready,false);assert.equal(cache.active,cache.regional);
});
test('Full continues to preload and expose general world navigation',()=>{
 const cache=new RecastCache(()=>{}, {}),p={x:0,y:0,z:0};let pumped=0;
 cache.regional.covers=()=>false;cache.regional.pump=()=>{};cache.worlds.covers=()=>true;cache.worlds.pump=()=>pumped++;
 assert.equal(cache.covers('test',p),true);cache.pump('test',{},p);assert.equal(pumped,1);
});
