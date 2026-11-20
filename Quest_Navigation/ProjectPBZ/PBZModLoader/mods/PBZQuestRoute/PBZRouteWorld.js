"use strict";
const UE=require('ue'),P=require('puerts'),R=require('./PBZRouteCore');
const vec=p=>new UE.Vector(p.x,p.y,p.z),plain=p=>p?{x:Number(p.X),y:Number(p.Y),z:Number(p.Z)}:null;
function alive(o){try{return !!o&&UE.KismetSystemLibrary.IsValid(o);}catch(_){return false;}}
const norm=s=>String(s||'').toLowerCase().split('/').pop().split('.').pop().replace(/^uedpie_\d+_/,'');
const walkable=(w,h)=>!!h&&(typeof h.walkable==='boolean'?h.walkable:h.nz>=w.normal-.025);
function contact(w,h,ground=true){
 let component=h.Component;try{if(component&&!component.GetOwner&&component.Get)component=component.Get();}catch(_){component=null;}
 if(!ground)return {component};
 const result={};
 try{const verdict=w.pawn?.CharacterMovement?.IsWalkable?.(h);if(typeof verdict==='boolean')result.walkable=verdict;}catch(_){}
 try{
  const override=component?.GetWalkableSlopeOverride?.(),behavior=Number(override?.WalkableSlopeBehavior),angle=Number(override?.WalkableSlopeAngle);
  if(result.walkable===undefined&&override){
   let limit=w.normal;
   if(behavior===3)result.walkable=false;
   else {if(Number.isFinite(angle)&&angle>=0&&angle<=90){const z=Math.cos(angle*Math.PI/180);if(behavior===1)limit=Math.min(limit,z);if(behavior===2)limit=Math.max(limit,z);}
    result.walkable=Number(h.ImpactNormal?.Z)>=limit;}
  }
  const allowed=component?.CanCharacterStepUpOn;
  if(allowed!==undefined)result.stepUp=Number(allowed)!==0;
 }catch(_){}
 return {...result,component};
}
function supportHit(w,a,b,expectedZ){
 const hit=w.hit(a,b);
 const lowerSeam=hit&&Number.isFinite(expectedZ)&&hit.nz>.98&&hit.point.z<expectedZ-w.rise-2;
 if(hit&&(hit.penetrating||walkable(w,hit)&&!lowerSeam))return hit;
 // A centre ray on a rock's side is not the character's whole floor contact.
 // Sample inside the capsule footprint without weakening its body sweep.
 const d=Math.max(8,Math.min(22,(Number(w.r)||35)*.45)),samples=[];let best=null;
 for(const [x,y] of [[d,0],[-d,0],[0,d],[0,-d]]){
  const q=w.hit({x:a.x+x,y:a.y+y,z:a.z},{x:b.x+x,y:b.y+y,z:b.z});
  const reference=(a.z+b.z)/2;
  const valid=q&&!q.penetrating&&walkable(w,q);
  samples.push(valid?q:null);
  if(valid&&(!best||Math.abs(q.point.z-reference)<Math.abs(best.point.z-reference)))best=q;
 }
 // A missing, unwalkable or implausibly low centre hit needs walkable ground
 // on opposite sides of the capsule. IsWalkable=false describes the sampled
 // riser/side contact; it does not forbid probing a different floor contact.
 // A single nearby bank must not turn a pit or a platform edge into a walk.
 if(!hit||!walkable(w,hit)||lowerSeam){
  const pairs=[[samples[0],samples[1]],[samples[2],samples[3]]].filter(([a,b])=>a&&b&&Math.abs(a.point.z-b.point.z)<=12&&
   (!lowerSeam||Math.abs((a.point.z+b.point.z)/2-expectedZ)<Math.abs(hit.point.z-expectedZ)));
  if(!pairs.length)return hit;
  const pair=pairs.sort((x,y)=>Math.abs((x[0].point.z+x[1].point.z)/2-(a.z+b.z)/2)-Math.abs((y[0].point.z+y[1].point.z)/2-(a.z+b.z)/2))[0];
  best={...pair[0],point:{...pair[0].point,z:(pair[0].point.z+pair[1].point.z)/2}};
 }
 return best?{...best,point:{x:b.x,y:b.y,z:best.point.z}}:hit;
}
class Ground{
 constructor(pawn){this.pawn=pawn;this.cap=pawn.CapsuleComponent||pawn.GetCapsuleComponent();const m=pawn.CharacterMovement;this.h=this.cap.GetScaledCapsuleHalfHeight();this.r=this.cap.GetScaledCapsuleRadius();
  this.rise=Math.max(1,Math.min(200,Number(m?.MaxStepHeight)||45));
  // K2_ is the reflected callable API. The C++ inline getter is normally not
  // exposed to Puerts; using only that name silently forced the .70 default.
  const floorZ=Number(m?.K2_GetWalkableFloorZ?.()??m?.GetWalkableFloorZ?.()??m?.WalkableFloorZ);
  this.normal=Math.max(.1,Math.min(.999,Number.isFinite(floorZ)&&floorZ>0?floorZ:.70));this.slope=Math.sqrt(1-this.normal*this.normal)/this.normal;
  const prof=String(this.cap.GetCollisionProfileName()||'Pawn');this.profile=/^(none|custom|nocollision)$/i.test(prof)?'Pawn':prof;this.ignored=UE.NewArray(UE.Actor);this.ignored.Add(pawn);this.color=new UE.LinearColor(0,0,0,0);this.calls=0;}
 feet(){
  const r=Number(this.cap.GetScaledCapsuleRadius?.()),h=Number(this.cap.GetScaledCapsuleHalfHeight?.());
  if(Number.isFinite(r)&&r>4)this.r=r;
  if(Number.isFinite(h)&&h>=this.r)this.h=h;
  const p=plain(this.cap.K2_GetComponentLocation());p.z-=this.h;return p;
 }
 hit(a,b,body=false,owners=false,walking=true){const o=P.$ref(undefined),k=UE.KismetSystemLibrary,c=this.color;
  const tail=[this.profile,false,this.ignored,UE.EDrawDebugTrace.None,o,true,c,c,0];let yes;
  // A simple-collision miss is not proof of empty space: some cooked meshes
  // expose only triangle collision. Keep the pawn profile for both queries.
  let reversed=false;
  // Single-sided triangle walls can be invisible to a back-face sweep. A
  // walking connector must be clear from both sides of that same geometry;
  // this does not create a reverse traversal/action edge. Ground rays retain
  // their downward direction. Only add the reverse complex sweep after misses.
  for(let pass=0;pass<(body?3:2);pass++){
   tail[1]=pass>0;reversed=pass===2;this.calls++;
   if(body){const lift=walking?this.rise+3:2,half=walking?Math.max(this.r,this.h-lift/2):this.h;const da={...a,z:a.z+lift+half},db={...b,z:b.z+lift+half};yes=k.CapsuleTraceSingleByProfile(this.pawn,vec(reversed?db:da),vec(reversed?da:db),Math.max(5,this.r*.98),half,...tail);}
   else yes=k.LineTraceSingleByProfile(this.pawn,vec(a),vec(b),...tail);
   if(yes&&P.$unref(o)?.bBlockingHit)break;
  }
  if(!yes)return null;const h=P.$unref(o);if(!h||!h.bBlockingHit)return null;
  const point=plain(h.ImpactPoint),nz=Number(h.ImpactNormal.Z);if(!R.finite(point))return null;
  const {component,...limits}=contact(this,h,!body);
  const result={point,nz,normal:plain(h.ImpactNormal),penetrating:!!h.bStartPenetrating,component,complex:!!tail[1],body,...limits,...(reversed?{reverse:true}:{}),...(body&&h.Location?{center:plain(h.Location)}:{})};
  if(body)try{result.actor=component?.GetOwner?.();}catch(_){}
  if(owners){
   result.owners=[];
   try{
    let actor=component?.GetOwner?.();
    for(let i=0;i<4&&alive(actor);i++){result.owners.push(String(actor.GetName()).toLowerCase());const parent=actor.GetAttachParentActor?.()||actor.GetOwner?.();if(actor===parent)break;actor=parent;}
   }catch(_){}
  }
  return result;
 }
 threadHit(a,b){
  const k=UE.KismetSystemLibrary;if(typeof k.SphereTraceSingleByProfile!=='function')return this.hit(a,b)||this.hit(b,a);
  const out=P.$ref(undefined),c=this.color;
  for(let pass=0;pass<3;pass++){
   this.calls++;
   const yes=k.SphereTraceSingleByProfile(this.pawn,vec(pass===2?b:a),vec(pass===2?a:b),7,this.profile,pass>0,this.ignored,UE.EDrawDebugTrace.None,out,true,c,c,0);
   const h=yes&&P.$unref(out);if(h?.bBlockingHit)return {point:plain(h.ImpactPoint),normal:plain(h.ImpactNormal),
    component:contact(this,h,false).component,shape:'sphere',complex:pass>0,...(pass===2?{reverse:true}:{})};
  }
  return null;
 }
 standingFloor(p){
  // CharacterMovement uses the pawn's actual collision responses and its
  // swept floor contact. A profile line query can disagree with that contact.
  // This evidence belongs only to the occupied footprint, never a nearby deck.
  try{
   const m=this.pawn?.CharacterMovement,mode=m?.MovementMode,modes=UE.EMovementMode;
   const grounded=typeof m?.IsMovingOnGround==='function'?m.IsMovingOnGround():
    modes&&[modes.MOVE_Walking,modes.MOVE_NavWalking].some(v=>v!==undefined&&v===mode);
   if(!grounded)return null;
   const floor=m.CurrentFloor,hit=floor?.HitResult,q=plain(hit?.ImpactPoint),feet=this.feet();
   if(floor?.bWalkableFloor!==true||!hit?.bBlockingHit||hit.bStartPenetrating||!R.finite(q)||
    R.xy(p,feet)>2||Math.abs(p.z-feet.z)>65||Math.abs(q.z-feet.z)>65)return null;
   return {x:p.x,y:p.y,z:q.z};
  }catch(_){return null;}
 }
 dropPolicy(){
  try{
   const m=this.pawn.CharacterMovement,damage=Number(this.pawn.DamageDepth),death=Number(this.pawn.DeadDepth),gravity=Math.abs(Number(m.GetGravityZ?.())),speed=Number(m.GetMaxSpeed?.()),jump=Number(m.JumpZVelocity),canJump=this.pawn.CanJump?.()===true;
   if(!(damage>100&&death>=damage&&gravity>1&&speed>0))return null;
   const forceDisable=Number(m.bForceDisableLedgeProtection)||0,forceEnable=Number(m.bForceEnableLedgeProtection)||0;
   const allowRunoff=forceDisable>0&&forceEnable<=0&&m.bCanWalkOffLedges===true;
   const launch=canJump&&jump>0?jump:0,apex=launch*launch/(2*gravity),safeHeight=Math.min(damage,death)-Math.max(50,this.rise);
   const maxJumpHeightCm=launch?Math.max(0,Math.min(1950,safeHeight-apex)):0;
   const maxRunoffHeightCm=allowRunoff?Math.max(0,Math.min(1950,safeHeight)):0;
   const maxHeightCm=Math.max(maxJumpHeightCm,maxRunoffHeightCm);if(maxHeightCm<100)return null;
   const jumpSeconds=launch?(launch+Math.sqrt(launch*launch+2*gravity*maxJumpHeightCm))/gravity:0;
   const runoffSeconds=Math.sqrt(2*maxRunoffHeightCm/gravity);
   const maxRunCm=Math.min(1200,speed*Math.max(jumpSeconds,runoffSeconds));
   return{maxHeightCm,maxRunCm,maxJumpHeightCm,maxRunoffHeightCm,maxRiseCm:launch?Math.max(0,apex-20):0,gravityCm:gravity,speedCm:speed,jumpVelocityCm:launch,canJump,allowRunoff,ledgeProtection:{forceDisable,forceEnable,heightCm:Number(m.LedgeProtectionHeight)||null},source:'current-player-fall-thresholds',damageDepthCm:damage,deadDepthCm:death};
  }catch(_){return null;}
 }
 airHit(a,b){return this.hit(a,b,true,false,false);}
 standAt(p){
  const hit=this.hit({...p,z:p.z+this.rise+50},{...p,z:p.z-this.rise-50},true,false,false);
  return hit&&!hit.penetrating&&hit.nz>=this.normal-.025&&R.finite(hit.center)?{x:p.x,y:p.y,z:hit.center.z-this.h-2}:null;
 }
 snapshot(p){
  const m=this.pawn?.CharacterMovement;
  return {feet:p,halfHeight:this.h,radius:this.r,stepHeight:this.rise,normal:this.normal,profile:this.profile,
   mode:Number(m?.MovementMode),customMode:Number(m?.CustomMovementMode),slopeVolumes:this.slopeRules?.volumes.length||0,movementFloor:this.standingFloor(p),query:this.lastFloorQuery,dropPolicy:this.dropPolicy()};
 }
 *refreshRulesJob(){
  this.slopeRules||=new (require('./PBZRouteTerrainRules').SlopeRules)(this.pawn);
  yield* this.slopeRules.refresh();
 }
 resetRules(){this.slopeRules=null;this.blockerCache=new WeakMap();}
 describeTrace(hit){
  if(!hit)return null;
  const out={profile:this.profile,shape:hit.shape||(hit.body?'capsule':'line'),complex:!!hit.complex,point:hit.point,normal:hit.normal,...(hit.reverse?{reverse:true}:{})};
  const read=(key,fn)=>{try{const value=fn();if(typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))out[key]=value;}catch(_){}};
  const component=hit.component;let actor=hit.actor;
  if(!actor)try{actor=component?.GetOwner?.();}catch(_){}
  read('actor',()=>actor&&String(actor.GetName()));read('component',()=>component&&String(component.GetName()));
  read('componentProfile',()=>component&&String(component.GetCollisionProfileName()));
  read('complexCollisionEnabled',()=>component?.bEnableComplexCollision);
  read('componentCollisionType',()=>component?.CollisionType);
  read('doubleSidedGeometry',()=>component?.MeshBodySetup?.bDoubleSidedGeometry);
  read('playerProfile',()=>this.cap?.GetCollisionProfileName?String(this.cap.GetCollisionProfileName()):undefined);
  read('hitObjectType',()=>component?.GetCollisionObjectType?.());read('playerObjectType',()=>this.cap?.GetCollisionObjectType?.());
  if(out.hitObjectType!==undefined)read('playerResponseToHitType',()=>this.cap?.GetCollisionResponseToChannel?.(out.hitObjectType));
  if(out.playerObjectType!==undefined)read('hitResponseToPlayerType',()=>component?.GetCollisionResponseToChannel?.(out.playerObjectType));
  return out;
 }
 describeBlocker(actor){
  if(!actor)return null;
  const cache=this.blockerCache||=new WeakMap(),now=Date.now(),old=cache.get(actor);
  if(old&&now-old.at<1200)return old.value;
  let value=null;try{value=require('./PBZRouteMechanisms').describe(actor,{UE,P,pawn:this.pawn,point:plain,...this.requirements});}catch(_){}
  cache.set(actor,{at:now,value});return value;
 }
 floorAt(p,deep=false){
  const occupied=this.standingFloor?.(p);if(occupied){this.lastFloorQuery={source:'movement',at:p,floor:occupied};return occupied;}
  // Start close to the expected feet before probing from above. An elevated
  // ray can start inside a ceiling or hit another walkable layer first.
  const attempts=[];let best=null;
  for(const up of [12,Math.max(55,this.rise+10),180]){
   const h=supportHit(this,{...p,z:p.z+up},{...p,z:p.z-(deep?520:155)},p.z);
   attempts.push({up,hit:h?{z:h.point.z,nz:h.nz,penetrating:!!h.penetrating}:null});
   if(h&&!h.penetrating&&walkable(this,h)){
    if(!best||Math.abs(h.point.z-p.z)<Math.abs(best.z-p.z))best=h.point;
    if(Math.abs(best.z-p.z)<=12)break;
   }
  }this.lastFloorQuery={source:best?'ray':'missing',at:p,...(best?{floor:best}:{}),attempts};return best;
 }
 step(a,b,expected){
  // Rechecking a zero-distance connector must agree with floorAt at the
  // occupied feet. This contact certifies no movement; nearby steps and other
  // floors still require their ordinary support, slope and capsule probes.
  if(R.dist(a,b)<.1){const occupied=this.standingFloor(a);if(occupied)return {p:occupied,points:[occupied]};}
  const n=Math.max(1,Math.ceil(R.xy(a,b)/35)),points=[];let previous=a;
  const probe=(from,q,depth=0)=>{
   const run=R.xy(from,q),reach=this.rise+run*this.slope+7;
   const hit=supportHit(this,{x:q.x,y:q.y,z:from.z+reach},{x:q.x,y:q.y,z:from.z-reach-8},from.z);
   let failure;
   if(!hit)failure={why:'no supporting floor'};
   else if(hit.penetrating||!walkable(this,hit))failure={hit:hit.point,why:'surface is not walkable',collision:hit};
   else if(Math.abs(hit.point.z-from.z)>reach+1)failure={why:'different floor'};
   else if(hit.nz>.98&&Math.abs(hit.point.z-from.z)>this.rise+2)failure={hit:hit.point,why:'ledge exceeds step height',collision:hit};
   else if(hit.stepUp===false&&hit.nz>.98&&hit.point.z-from.z>3)failure={hit:hit.point,why:'component forbids step up',collision:hit};
   else {
    const rule=this.slopeRules?.blocked(from,hit.point);
    if(rule)return {hit:hit.point,why:'forced slope slide uphill',block:rule};
    const wall=this.hit(from,hit.point,true);
    if(wall){const block=this.describeBlocker?.(wall.actor);failure={hit:wall.point,normal:wall.normal,owners:wall.owners,why:'blocked body clearance',block,locked:!!block?.locked,collision:wall};}
    else return {p:hit.point,points:[hit.point]};
   }
   // Several individually legal risers can lie inside one 35 cm sample.
   // Refine only rejected edges; keep every smaller body sweep and limit work.
   if(depth<3&&run>8){
    const first=probe(from,R.lerp(from,q,.5),depth+1);
    if(first.p){const last=probe(first.p,q,depth+1);if(last.p)return {p:last.p,points:[...first.points,...last.points]};}
   }
   return failure;
  };
  for(let i=1;i<=n;i++){
   const q=R.lerp(a,b,i/n),row=probe(previous,q);if(!row.p)return row;
   const p=row.p;
   if(expected&&Math.abs(p.z-q.z)>200)return {why:'stacked floor mismatch'};
   points.push(...row.points);previous=p;
  }
  return {p:previous,points};
 }
 anchor(){const feet=this.feet(),mesh=this.pawn.Mesh;
  // Keep guidance at crouched-head height, independent of stance animation.
  let joint=feet;const height=105;
  if(mesh&&typeof mesh.DoesSocketExist==='function'){
   if(this.bone===undefined)this.bone=['pelvis','Pelvis','Hips','hip'].find(k=>mesh.DoesSocketExist(k))||'';
   if(this.bone){const p=plain(mesh.GetSocketLocation(this.bone));if(R.finite(p)&&R.xy(p,feet)<90)joint=p;}
  }
  const side=plain(this.pawn.GetActorRightVector?.());return {x:feet.x+(joint.x-feet.x)*.23+(side?.x||0)*11,y:feet.y+(joint.y-feet.y)*.23+(side?.y||0)*11,z:feet.z+height};
 }
}
exports.Ground=Ground;exports.alive=alive;exports.vec=vec;exports.plain=plain;exports.norm=norm;
