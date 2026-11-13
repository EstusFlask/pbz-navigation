'use strict';
const UE=require('ue'),P=require('puerts');
const vec=p=>new UE.Vector(p.x,p.y,p.z);
// Native reflected signatures were checked in the installed game:
// IsPositionInSlopeArea(Position, TestCharacter), GetClosestSplineT(WorldPos,
// CachedT), GetDownhillDirection(T). All three are read-only queries.
class SlopeRules{
 constructor(pawn){this.pawn=pawn;this.volumes=[];this.next=0;}
 *refresh(){
  const now=Date.now();if(now<this.next)return;this.next=now+3000;
  const cls=UE.SpecialMoveVolume_SlopeSlide?.StaticClass?.()||UE.Class?.Find?.('/Script/AdvancedSpecialMove.SpecialMoveVolume_SlopeSlide');
  if(!cls||!UE.GameplayStatics?.GetAllActorsOfClass)return;
  const out=P.$ref(undefined);UE.GameplayStatics.GetAllActorsOfClass(this.pawn,cls,out);yield;
  const actors=P.$unref(out),volumes=[];
  for(let i=0;i<Math.min(256,actors?.Num()||0);i++){
   const actor=actors.Get(i);
   if(actor&&typeof actor.IsPositionInSlopeArea==='function'&&typeof actor.GetClosestSplineT==='function'&&typeof actor.GetDownhillDirection==='function')volumes.push(actor);
   if((i&15)===15)yield;
  }
  this.volumes=volumes;
 }
 blocked(a,b){
  if(b.z-a.z<=.5)return null;
  for(const actor of this.volumes){try{
   if(UE.KismetSystemLibrary?.IsValid&&!UE.KismetSystemLibrary.IsValid(actor))continue;
   const p=vec(b),inside=actor.IsPositionInSlopeArea(p,this.pawn)||actor.IsPositionInSlopeArea(vec(a),this.pawn);
   if(!inside)continue;
   const t=Number(actor.GetClosestSplineT(p,-1));if(!Number.isFinite(t))continue;
   const down=actor.GetDownhillDirection(t),dot=(b.x-a.x)*Number(down?.X)+(b.y-a.y)*Number(down?.Y)+(b.z-a.z)*Number(down?.Z);
   if(dot<-.5)return {id:String(actor.GetName()),p:b,icon:'barrier',locked:true,unknown:false,label:'强制滑坡 · 此方向无法步行上坡',source:'slope-volume'};
  }catch(_){}}
  return null;
 }
}
exports.SlopeRules=SlopeRules;
