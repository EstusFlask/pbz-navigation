'use strict';
const R=require('./PBZRouteCore');
function inspect(actor,feature,options={}){
 const {UE={},pawn}=options,kind=feature.kind;
 const id=String(feature.guid||actor.GetName()),raw=feature.path?.[0];
 const p=raw?{x:raw[0],y:raw[1],z:raw[2]}:options.point?.(actor.K2_GetActorLocation());
 const stop=(label,unknown=false,extra={})=>({ready:false,block:{id,p,icon:unknown?'mechanism':'locked',label,unknown,locked:!unknown,source:'live-mechanism',...extra}});
 if(kind==='ladder'&&(typeof actor.bFold==='boolean'?actor.bFold:feature.fold)){
  const moving=[actor.HookTimelineComponent,actor.LadderTimelineComponent].some(t=>t?.IsPlaying?.());
  if(actor.bTriggered!==true||moving)return stop(moving?'折梯正在放下 · 等待停止':'折梯未放下 · 需从另一侧解锁');
 }
 if(kind==='lift'){
  if(actor.bIsBroken===true||actor.LiftBroken===true)return stop('升降装置已损坏');
  if(actor.GearIsDoing===true||actor.Lift?.IsPlaying?.())return stop('升降装置运动中 · 等待停靠');
 }
 let requiredWeapon='';
 try{requiredWeapon=String(actor.GetNeedShaChiWeaponID?.()||'');if(/^none$/i.test(requiredWeapon))requiredWeapon='';}catch(_){}
 const states=UE.EInteractRequirementState;
 try{
  const value=actor.GetInteractRequirementMeet?.(pawn);
  if(states&&value!==undefined){
   if(states.RequirementNotMeet!==undefined&&value===states.RequirementNotMeet)return stop('交互条件未满足'+(requiredWeapon?' · 需要影之武装 '+(options.weapon?.(requiredWeapon)?.name||requiredWeapon):''),false,{requiredWeapons:requiredWeapon?[requiredWeapon]:[]});
   if([states.NoRequirement,states.RequirementMeet].some(v=>v!==undefined&&value===v))return {ready:true};
  }
 }catch(_){}
 // This newly discovered hook was absent from the original authored graph.
 // Its geometry alone cannot certify weapon, flow or activation conditions.
 if(kind==='hook')return stop('钩索交互条件待确认'+(requiredWeapon?' · '+(options.weapon?.(requiredWeapon)?.name||requiredWeapon):''),true);
 return {ready:true};
}
function describe(actor,options={}){
 if(!actor)return null;
 const {P,point}=options,id=String(actor.GetName()),p=point?.(actor.K2_GetActorLocation());
 if(!R.finite(p))return null;
 if(actor.DoorOpen===true)return null;
 if(typeof actor.GetCheckItems==='function'){
  const out=P.$ref(undefined);if(actor.NeedCheckLockItems!==false)actor.GetCheckItems(out);const map=P.$unref(out),requirements=[];
  for(let i=0;i<Math.min(16,map?.Num?.()||0);i++){
   const key=map.GetKey?.(i);if(key===undefined)continue;
   const id=String(key),count=Math.max(1,Number(map.Get(key))||1),detail=options.item?.(id);
   requirements.push({id,count,...detail});
  }
  const names=requirements.map(r=>(r.name||r.id)+(Number.isFinite(r.owned)?' '+r.owned+'/'+r.count:r.count>1?' ×'+r.count:''));
  return {id,p,source:'door-actor',unknown:false,locked:true,icon:requirements.length?'keylock':'locked',requirements,
   label:requirements.length?'门未开启 · 需要 '+names.join('、'):'门未开启 · 需交互或从另一侧开启'};
 }
 if(typeof actor.GetNeedShaChiWeaponID==='function'&&actor.bBroken!==true){
  const state=inspect(actor,{kind:'blocker',guid:id},options);
  if(!state.ready)return state.block;
  const weapon=String(actor.GetNeedShaChiWeaponID()||'');
  if(weapon&&!/^none$/i.test(weapon))return {id,p,source:'live-mechanism',unknown:false,locked:true,icon:'mechanism',requiredWeapons:[weapon],
   label:'障碍未破除 · 使用影之武装 '+(options.weapon?.(weapon)?.name||weapon)};
 }
 return null;
}
exports.inspect=inspect;exports.describe=describe;
