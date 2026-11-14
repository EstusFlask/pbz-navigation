'use strict';
// Compare a delivered baseline against current rendering math and allocations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
function load(file){
 let now=1000,colors=0,uploads=0;
 const mocks={ue:{Vector:function(){},LinearColor:function(...rgba){colors++;this.rgba=rgba;},NewArray:()=>({Add(){}})},
  './PBZRouteWorld':{plain:()=>({x:0,y:0,z:0}),vec:p=>p}};
 const module={exports:{}};vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',{Date:{now:()=>now}})
  (id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id)),module,module.exports);
 const row={fiber:{K2_GetComponentLocation(){},CreateMeshSection_LinearColor(){uploads++;},UpdateMeshSection_LinearColor(){uploads++;}}};
 return {...module.exports,frame:ps=>{now+=40;module.exports.draw(row,true,()=>{},ps);},counts:()=>({colors,uploads})};
}
const baseline=load(path.resolve(process.argv[2])),current=load(root+'/PBZRouteFiber.js');let cases=0;
for(const count of [2,3,7,14,29,49,64])for(let shape=0;shape<3;shape++){
 const points=Array.from({length:count},(_,i)=>({x:shape===2?Math.sin(i*.2)*30:i*20,y:Math.sin(i*.19)*35,z:shape===0?18:i*10+18}));
 assert.equal(JSON.stringify(current.mesh(points,{x:31,y:-17,z:8})),JSON.stringify(baseline.mesh(points,{x:31,y:-17,z:8})));cases++;
}
for(let frame=0;frame<120;frame++){
 const points=Array.from({length:49},(_,i)=>({x:i*20,y:Math.sin(i*.2+frame*.1)*5,z:18}));
 baseline.frame(points);current.frame(points);
}
console.log(JSON.stringify({identicalGeometryCases:cases,baseline:baseline.counts(),current:current.counts()}));
