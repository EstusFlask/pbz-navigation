'use strict';
// A sailing/riding actor moves the player outside the ground-walking graph.
// Detect only real native state / known attached cinematic vehicles; never
// infer a chase from disabled input, a camera, or a nearby enemy horse.
const rideClasses=[
 '/HuaShira/Animation/Seqs/ActorForSeqs/BP_Seq_HorseCart_Horse01.BP_Seq_HorseCart_Horse01_C',
 '/HuaShira/Animation/Seqs/ActorForSeqs/BP_Seq_HorseCart_Horse02.BP_Seq_HorseCart_Horse02_C',
 '/HuaShira/Animation/Seqs/ActorForSeqs/BP_Seq_HorseCart_ZuoShang.BP_Seq_HorseCart_ZuoShang_C'
];
function read(pawn,UE,T){
 try{
  const cls=UE.ShipNavigationSystem?.StaticClass?.();
  if(cls&&T.getWorldSubsystem(pawn,cls)?.IsInNavigation?.()===true)return {kind:'boat'};
 }catch(_){}
 try{
  let parent=pawn.GetAttachParentActor?.();
  for(let i=0;parent&&i<3;i++){
   for(const path of rideClasses){const cls=UE.Class?.Find?.(path);if(cls&&parent.IsA?.(cls))return {kind:'ride'};}
   const next=parent.GetAttachParentActor?.();if(next===parent)break;parent=next;
  }
 }catch(_){}
 return null;
}
function message(phase,english=false){
 if(phase?.kind==='boat')return english?'Sailing · target retained; resume after disembarking':'乘船中 · 已保留目标，靠岸下船后继续导航';
 if(phase?.kind==='ride')return english?'Scripted ride · target retained; resume afterwards':'剧情骑乘中 · 已保留目标，结束后继续导航';
 return '';
}
exports.read=read;exports.message=message;
