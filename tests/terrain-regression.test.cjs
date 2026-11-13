'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.PBZ_TEST_SOURCE||path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const moduleWorld={exports:{}};
vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteWorld.js','utf8')+'\n})')(
 id=>id==='ue'||id==='puerts'?{}:require(path.resolve(root,id)),moduleWorld,moduleWorld.exports);
const {Ground}=moduleWorld.exports;

test('walking and ribbon traces detect a wall with triangle collision but no simple collision',()=>{
 const queries=[];
 const trace=(...args)=>{
  const profileIndex=typeof args[3]==='number'?(typeof args[4]==='number'?5:4):3;
  const complex=args[profileIndex+1];queries.push(complex);
  if(!complex)return false;
  args[profileIndex+4].value={bBlockingHit:true,ImpactPoint:{X:50,Y:0,Z:100},ImpactNormal:{X:-1,Y:0,Z:0}};
  return true;
 };
 const UE={KismetSystemLibrary:{LineTraceSingleByProfile:trace,CapsuleTraceSingleByProfile:trace,SphereTraceSingleByProfile:trace},
  Vector:class{constructor(X,Y,Z){Object.assign(this,{X,Y,Z});}},NewArray:()=>({Add(){}}),LinearColor:class{},EDrawDebugTrace:{None:0}};
 const mod={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteWorld.js','utf8')+'\n})')(
  id=>id==='ue'?UE:id==='puerts'?{$ref:value=>({value}),$unref:ref=>ref.value}:require(path.resolve(root,id)),mod,mod.exports);
 const cap={GetScaledCapsuleHalfHeight:()=>90,GetScaledCapsuleRadius:()=>35,GetCollisionProfileName:()=> 'Pawn'};
 const w=new mod.exports.Ground({CapsuleComponent:cap}),a={x:0,y:0,z:0},b={x:100,y:0,z:0};
 assert.ok(w.hit(a,b,true),'walking capsule passed through a triangle-only wall');
 assert.ok(w.threadHit({...a,z:105},{...b,z:105}),'the drawn thread passed through the same wall');
 assert.ok(w.hit(a,b),'floor/lock line queries skipped triangle collision');
 assert.ok(queries.includes(true));
});
function terrain(floor){
 const world=Object.create(Ground.prototype);Object.assign(world,{rise:45,normal:.7,slope:1,r:35,h:90});
 world.hit=(a,b,body)=>{
  if(body)return null;
  const z=floor(b.x,b.y);
  return z!==null&&z<=a.z&&z>=b.z?{point:{x:b.x,y:b.y,z},nz:1}:null;
 };
 return world;
}

function reflectedGround(component,nz=1,movement={}){
 const raw={bBlockingHit:true,ImpactPoint:{X:35,Y:0,Z:15},ImpactNormal:{X:0,Y:0,Z:nz},Component:component};
 const UE={KismetSystemLibrary:{LineTraceSingleByProfile:(...args)=>{args[7].value=raw;return true;}},
  Vector:class{constructor(X,Y,Z){Object.assign(this,{X,Y,Z});}},NewArray:()=>({Add(){}}),LinearColor:class{},EDrawDebugTrace:{None:0}};
 const mod={exports:{}},P={$ref:value=>({value}),$unref:ref=>ref.value};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteWorld.js','utf8')+'\n})')(
  id=>id==='ue'?UE:id==='puerts'?P:require(path.resolve(root,id)),mod,mod.exports);
 const cap={GetScaledCapsuleHalfHeight:()=>96,GetScaledCapsuleRadius:()=>45,GetCollisionProfileName:()=> 'Profile_Capsule'};
 return new mod.exports.Ground({CapsuleComponent:cap,CharacterMovement:{MaxStepHeight:50,K2_GetWalkableFloorZ:()=>.573576,...movement}});
}

test('the movement component can reject a shallow surface which geometry alone would accept',()=>{
 const w=reflectedGround({},.9,{IsWalkable:()=>false});w.feet=()=>({x:0,y:0,z:0});
 assert.equal(w.floorAt({x:35,y:0,z:15}),null,'a game-unwalkable surface was accepted by its normal alone');
});

test('per-component unwalkable slopes and no-step ledges retain their movement restrictions',()=>{
 const component={GetWalkableSlopeOverride:()=>({WalkableSlopeBehavior:3,WalkableSlopeAngle:0}),CanCharacterStepUpOn:0};
 const w=reflectedGround(component);w.feet=()=>({x:0,y:0,z:0});
 assert.equal(w.floorAt({x:35,y:0,z:15}),null,'WalkableSlope_Unwalkable was ignored');
 component.GetWalkableSlopeOverride=()=>({WalkableSlopeBehavior:0});
 w.hit=((read)=>function(a,b,body){return body?null:read.call(this,a,b);})(w.hit);
 assert.equal(w.step({x:0,y:0,z:0},{x:35,y:0,z:15},true).p,undefined,'a component forbidding step-up became a legal ledge');
});
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

test('a forced slide volume rejects uphill walking even on a geometrically walkable slope',()=>{
 const world=terrain(x=>x*.2);
 world.slopeRules={blocked:(a,b)=>b.x>a.x?{id:'slide',p:b,label:'强制滑坡 · 此方向无法步行上坡'}:null};
 const uphill=world.step({x:0,y:0,z:0},{x:70,y:0,z:14},true);
 assert.equal(uphill.p,undefined,'forced downhill movement was ignored by the walking search');
 assert.equal(uphill.block?.id,'slide');
 assert.ok(world.step({x:70,y:0,z:14},{x:0,y:0,z:0},true).p,'downhill movement was incorrectly reversed');
});

test('slide membership uses the native position and character arguments and refreshes at a bounded rate',()=>{
 const pawn={},calls={scan:0,member:0};
 const actor={GetName:()=> 'downhill',IsPositionInSlopeArea:(p,char)=>{assert.equal(char,pawn);calls.member++;return p.X>=0&&p.X<=100;},
  GetClosestSplineT:(p,cached)=>{assert.equal(cached,-1);return .5;},GetDownhillDirection:t=>({X:-1,Y:0,Z:-.2})};
 const UE={Vector:class{constructor(X,Y,Z){Object.assign(this,{X,Y,Z});}},SpecialMoveVolume_SlopeSlide:{StaticClass:()=> 'slide'},
  GameplayStatics:{GetAllActorsOfClass:(char,cls,out)=>{calls.scan++;out.value={Num:()=>1,Get:()=>actor};}}};
 const P={$ref:value=>({value}),$unref:ref=>ref.value},mod={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteTerrainRules.js','utf8')+'\n})')(
  id=>id==='ue'?UE:P,mod,mod.exports);
 const rules=new mod.exports.SlopeRules(pawn);
 for(let i=0;i<5;i++){const job=rules.refresh();while(!job.next().done){}}
 assert.equal(calls.scan,1);
 assert.ok(rules.blocked({x:0,y:0,z:0},{x:35,y:0,z:7}));
 assert.equal(rules.blocked({x:35,y:0,z:7},{x:0,y:0,z:0}),null);
 assert.equal(rules.blocked({x:200,y:0,z:40},{x:235,y:0,z:47}),null,'another floor outside the native volume was blocked');
});

test('the character movement floor remains usable when a profile ray misses the occupied floor',()=>{
 const p={x:-56412.570041,y:124797.050277,z:-1215.014996};
 const world=terrain(()=>null),hit={bBlockingHit:true,bStartPenetrating:false,
  ImpactPoint:{X:p.x,Y:p.y,Z:p.z-2},ImpactNormal:{X:0,Y:0,Z:1}};
 world.feet=()=>({...p});
 world.pawn={CharacterMovement:{IsMovingOnGround:()=>true,CurrentFloor:{bBlockingHit:true,bWalkableFloor:true,HitResult:hit}}};
 assert.ok(world.floorAt(p,true),'standing player lost the floor reported by CharacterMovement');
 assert.equal(world.floorAt({...p,z:p.z-600},true),null,'the pawn floor was reused for an unoccupied lower level');
 world.pawn.CharacterMovement.IsMovingOnGround=()=>false;
 assert.equal(world.floorAt(p,true),null,'an airborne pawn reused a stale floor');
});

test('reflected character limits admit the same steep slopes and steps as the game',()=>{
 const UE={KismetSystemLibrary:{},NewArray:()=>({Add(){}}),LinearColor:class{}},module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteWorld.js','utf8')+'\n})')(
  id=>id==='ue'?UE:id==='puerts'?{}:require(path.resolve(root,id)),module,module.exports);
 const cap={GetScaledCapsuleHalfHeight:()=>90,GetScaledCapsuleRadius:()=>35,GetCollisionProfileName:()=> 'Pawn'};
 const w=new module.exports.Ground({CapsuleComponent:cap,CharacterMovement:{MaxStepHeight:80,K2_GetWalkableFloorZ:()=>.5}});
 assert.equal(w.rise,80,'game step height was clamped to 65 cm');assert.equal(w.normal,.5,'reflected walkable slope getter was ignored');
 w.hit=(a,b,body)=>{if(body)return null;const z=b.x*1.4;return z<=a.z&&z>=b.z?{point:{x:b.x,y:b.y,z},nz:.58}:null;};
 assert.ok(w.step({x:0,y:0,z:0},{x:70,y:0,z:98},true).p,'a game-walkable slope was rejected');
});
