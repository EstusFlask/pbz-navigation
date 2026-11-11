"use strict";
const UE=require('ue'),P=require('puerts'),R=require('./PBZRouteCore');
const vec=p=>new UE.Vector(p.x,p.y,p.z),plain=p=>p?{x:Number(p.X),y:Number(p.Y),z:Number(p.Z)}:null;
function alive(o){try{return !!o&&UE.KismetSystemLibrary.IsValid(o);}catch(_){return false;}}
const norm=s=>String(s||'').toLowerCase().split('/').pop().split('.').pop().replace(/^uedpie_\d+_/,'');
function supportHit(w,a,b){
 const hit=w.hit(a,b);
 if(!hit||hit.penetrating||hit.nz>=w.normal-.025)return hit;
 // A centre ray on a rock's side is not the character's whole floor contact.
 // Sample inside the capsule footprint without weakening its body sweep.
 const d=Math.max(8,Math.min(22,(Number(w.r)||35)*.45));let best=null;
 for(const [x,y] of [[d,0],[-d,0],[0,d],[0,-d]]){
  const q=w.hit({x:a.x+x,y:a.y+y,z:a.z},{x:b.x+x,y:b.y+y,z:b.z});
  const reference=(a.z+b.z)/2;
  if(q&&!q.penetrating&&q.nz>=w.normal-.025&&(!best||Math.abs(q.point.z-reference)<Math.abs(best.point.z-reference)))best=q;
 }
 return best?{...best,point:{x:b.x,y:b.y,z:best.point.z}}:hit;
}
class Ground{
 constructor(pawn){this.pawn=pawn;this.cap=pawn.CapsuleComponent||pawn.GetCapsuleComponent();const m=pawn.CharacterMovement;this.h=this.cap.GetScaledCapsuleHalfHeight();this.r=this.cap.GetScaledCapsuleRadius();this.rise=Math.max(12,Math.min(65,Number(m?.MaxStepHeight)||45));this.normal=Math.max(.55,Math.min(.91,Number(m?.GetWalkableFloorZ?.())||.70));this.slope=Math.sqrt(1-this.normal*this.normal)/this.normal;
  const prof=String(this.cap.GetCollisionProfileName()||'Pawn');this.profile=/^(none|custom|nocollision)$/i.test(prof)?'Pawn':prof;this.ignored=UE.NewArray(UE.Actor);this.ignored.Add(pawn);this.color=new UE.LinearColor(0,0,0,0);this.calls=0;}
 feet(){
  const r=Number(this.cap.GetScaledCapsuleRadius?.()),h=Number(this.cap.GetScaledCapsuleHalfHeight?.());
  if(Number.isFinite(r)&&r>4)this.r=r;
  if(Number.isFinite(h)&&h>=this.r)this.h=h;
  const p=plain(this.cap.K2_GetComponentLocation());p.z-=this.h;return p;
 }
 hit(a,b,body=false,owners=false){const o=P.$ref(undefined),k=UE.KismetSystemLibrary,c=this.color;this.calls++;
  const tail=[this.profile,false,this.ignored,UE.EDrawDebugTrace.None,o,true,c,c,0];let yes;
  if(body){const lift=this.rise+3,half=Math.max(this.r,this.h-lift/2);const da={...a,z:a.z+lift+half},db={...b,z:b.z+lift+half};yes=k.CapsuleTraceSingleByProfile(this.pawn,vec(da),vec(db),Math.max(5,this.r*.98),half,...tail);}
  else yes=k.LineTraceSingleByProfile(this.pawn,vec(a),vec(b),...tail);
  if(!yes)return null;const h=P.$unref(o);if(!h||!h.bBlockingHit)return null;
  const point=plain(h.ImpactPoint),nz=Number(h.ImpactNormal.Z);if(!R.finite(point))return null;
  const result={point,nz,normal:plain(h.ImpactNormal),penetrating:!!h.bStartPenetrating};
  if(owners){
   result.owners=[];
   try{let component=h.Component;if(component&&!component.GetOwner&&component.Get)component=component.Get();
    let actor=component?.GetOwner?.();
    for(let i=0;i<4&&alive(actor);i++){result.owners.push(String(actor.GetName()).toLowerCase());const parent=actor.GetAttachParentActor?.()||actor.GetOwner?.();if(actor===parent)break;actor=parent;}
   }catch(_){}
  }
  return result;
 }
 threadHit(a,b){
  const k=UE.KismetSystemLibrary;if(typeof k.SphereTraceSingleByProfile!=='function')return this.hit(a,b);
  const out=P.$ref(undefined),c=this.color;this.calls++;
  const yes=k.SphereTraceSingleByProfile(this.pawn,vec(a),vec(b),7,this.profile,false,this.ignored,UE.EDrawDebugTrace.None,out,true,c,c,0);
  if(!yes)return null;const h=P.$unref(out);return h?.bBlockingHit?{point:plain(h.ImpactPoint)}:null;
 }
 floorAt(p,deep=false){
  for(const up of [Math.max(55,this.rise+10),180]){
   const h=supportHit(this,{...p,z:p.z+up},{...p,z:p.z-(deep?520:155)});
   if(h&&!h.penetrating&&h.nz>=this.normal-.025)return h.point;
  }return null;
 }
 step(a,b,expected){
  const n=Math.max(1,Math.ceil(R.xy(a,b)/35)),points=[];let previous=a;
  for(let i=1;i<=n;i++){
   const q=R.lerp(a,b,i/n),run=R.xy(previous,q),reach=this.rise+run*this.slope+7;
   const hit=supportHit(this,{x:q.x,y:q.y,z:previous.z+reach},{x:q.x,y:q.y,z:previous.z-reach-8});
   if(!hit)return {why:'no supporting floor'};if(hit.penetrating||hit.nz<this.normal-.025)return {hit:hit.point,why:'steep surface'};
   const p=hit.point,dz=p.z-previous.z;if(Math.abs(dz)>reach+1)return {why:'different floor'};
   if(hit.nz>.98&&Math.abs(dz)>this.rise+2)return {hit:p,why:'ledge exceeds step height'};
   if(expected&&Math.abs(p.z-q.z)>200)return {why:'stacked floor mismatch'};
   const wall=this.hit(previous,p,true);if(wall)return {hit:wall.point,normal:wall.normal,why:'blocked body clearance'};
   points.push(p);previous=p;
  }
  return {p:previous,points};
 }
 anchor(){const feet=this.feet(),mesh=this.pawn.Mesh;
  // Alternating calf animation is not a stable attachment height. Use capsule
  // proportions at knee level; retain only a little lateral body movement.
  let joint=feet;const height=R.clamp(this.h*.5,43,49);
  if(mesh&&typeof mesh.DoesSocketExist==='function'){
   if(this.bone===undefined)this.bone=['pelvis','Pelvis','Hips','hip'].find(k=>mesh.DoesSocketExist(k))||'';
   if(this.bone){const p=plain(mesh.GetSocketLocation(this.bone));if(R.finite(p)&&R.xy(p,feet)<90)joint=p;}
  }
  const side=plain(this.pawn.GetActorRightVector?.());return {x:feet.x+(joint.x-feet.x)*.23+(side?.x||0)*11,y:feet.y+(joint.y-feet.y)*.23+(side?.y||0)*11,z:feet.z+height};
 }
}
exports.Ground=Ground;exports.alive=alive;exports.vec=vec;exports.plain=plain;exports.norm=norm;
