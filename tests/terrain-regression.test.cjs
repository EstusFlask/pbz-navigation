'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const moduleWorld={exports:{}};
vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteWorld.js','utf8')+'\n})')(
 id=>id==='ue'||id==='puerts'?{}:require(path.resolve(root,id)),moduleWorld,moduleWorld.exports);
const {Ground}=moduleWorld.exports;
function terrain(floor){
 const world=Object.create(Ground.prototype);Object.assign(world,{rise:45,normal:.7,slope:1,r:35,h:90});
 world.hit=(a,b,body)=>{
  if(body)return null;
  const z=floor(b.x,b.y);
  return z!==null&&z<=a.z&&z>=b.z?{point:{x:b.x,y:b.y,z},nz:1}:null;
 };
 return world;
}
test('real ground stepping follows closely spaced legal stair treads in both directions',()=>{
 const world=terrain(x=>Math.floor(Math.max(0,x)/18)*28);
 const start={x:0,y:0,z:0},end={x:70,y:0,z:84};
 assert.ok(world.step(start,end,true).p,'legal 28 cm stair risers were combined into a false 56 cm ledge');
 assert.ok(world.step(end,start,true).p,'descending legal stairs was rejected');
});
test('real ground stepping uses capsule support beside a narrow pavement crack',()=>{
 const world=terrain((x,y)=>x>=30&&x<=40&&Math.abs(y)<6?null:0);
 assert.ok(world.step({x:0,y:0,z:0},{x:70,y:0,z:0},true).p,'a crack narrower than the capsule was treated as a missing floor');
});
test('terrain recovery keeps wide pits and a genuinely high ledge blocked',()=>{
 for(const floor of [(x,y)=>x>20&&x<110?null:0,x=>x>=60?120:0]){
  const world=terrain(floor);
  assert.equal(world.step({x:0,y:0,z:0},{x:140,y:0,z:0},false).p,undefined);
 }
});
