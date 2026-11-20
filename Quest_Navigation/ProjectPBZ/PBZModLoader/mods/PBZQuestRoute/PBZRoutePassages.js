'use strict';
const R = require('./PBZRouteCore');
const W = require('./PBZRouteWorld');
const UE = require('ue');
const LiveLinks = require('./PBZLiveLinks');
const Transitions=require('./PBZRouteTransitions'),Feasible=require('./PBZRouteFeasibility'),Local=require('./PBZRouteLocalWalk');
const classCatalog = require('./PBZPassageClasses').classes;
const Mechanisms=require('./PBZRouteMechanisms');
const TraversalGeometry=require('./PBZRouteTraversalGeometry');
const TriggerVolume=require('./PBZRouteHookVolume');
const WallrunRelays=require('./PBZRouteWallrunRelays');
const SlideRelay=require('./PBZRouteSlideRelay');
const ladderStates = new WeakMap();
const recastContexts=new Map();
function recastContext(name){
 if(!recastContexts.has(name))recastContexts.set(name,{name,actors:[],observedPassages:new Map(),foldedPassages:new Set(),openPassages:new Set(),passageStates:new Map(),passageRevision:0,
  canTraverse:R.Graph.prototype.canTraverse,clearLiveEdges(){this.observedPassages.clear();this.foldedPassages.clear();this.openPassages.clear();this.passageStates.clear();this.passageRevision++;}});
 return recastContexts.get(name);
}
function resetLadders(g) {
  ladderStates.delete(g);g.openPassages.clear();g.passageStates?.clear();g.passageRevision++;
}
function refreshLadders(g,pawn,loaded=true) {
  if(!g||!pawn)return false;
  const now=Date.now();
  let state=ladderStates.get(g);
  if(!state){state={next:0,savedAt:0,saved:new Set(),observed:new Map()};ladderStates.set(g,state);}
  if(now<state.next)return false;
  state.next=now+450;
  const P=require('puerts'),T=require('Library/TsHelper').default;
  if(now>=state.savedAt && UE.PBZLevelActorManager?.StaticClass && UE.JsonObjectWrapper && UE.JSONUtility?.TryGetBoolField){
    state.savedAt=now+1600;
    const manager=T.getWorldSubsystem(pawn,UE.PBZLevelActorManager.StaticClass());
    if(W.alive(manager)){
      for(const item of g.actors){
        if(!item.fold||!item.classPath)continue;
        const key=item.guid.toLowerCase(),out=P.$ref(new UE.JsonObjectWrapper());
        manager.GetSaveData(g.name+'-'+item.guid,out);
        const value=P.$ref(false),success=P.$ref(false);
        UE.JSONUtility.TryGetBoolField(P.$unref(out),'Triggered',value,success);
        // Both outputs must be true, including the native field-present flag.
        if(P.$unref(value)===true&&P.$unref(success)===true)state.saved.add(key);
        else state.saved.delete(key);
      }
    }
  }
  if(loaded&&UE.PBZSpecialMoveClimLadderBase?.StaticClass&&UE.GameplayStatics?.GetAllActorsOfClass){
    const out=P.$ref(undefined);
    UE.GameplayStatics.GetAllActorsOfClass(pawn,UE.PBZSpecialMoveClimLadderBase.StaticClass(),out);
    const actors=P.$unref(out);
    for(let i=0;i<Math.min(256,actors?.Num()||0);i++){
      const actor=actors.Get(i);if(!W.alive(actor))continue;
      const key=String(actor.GetName()).toLowerCase();
      if(!g.foldedPassages.has(key)&&!g.observedPassages.get(key)?.fold)continue;
      if(g.passageStates?.has(key))continue;
      if(typeof actor.bTriggered!=='boolean')continue;
      const moving=[actor.HookTimelineComponent,actor.LadderTimelineComponent]
        .some(t=>W.alive(t)&&typeof t.IsPlaying==='function'&&t.IsPlaying());
      state.observed.set(key,actor.bTriggered&&!moving);
    }
  }
  const opened=new Set(state.saved);
  for(const [key,ready] of state.observed){if(ready)opened.add(key);else opened.delete(key);}
  for(const [key,live] of g.passageStates||[]){
    if(live.ready&&g.foldedPassages.has(key)&&g.openPassages.has(key))opened.add(key);
    else opened.delete(key);
  }
  if(opened.size===g.openPassages.size&&[...opened].every(key=>g.openPassages.has(key)))return false;
  g.openPassages=opened;g.passageRevision++;return true;
}
const labels = {
  lift: ['乘升降梯', 'Ride lift'], wallrun: ['沿墙跑到对面', 'Run along wall'],
  ascent: ['向上攀跑', 'Run up wall'], mantle: ['翻上平台', 'Climb onto ledge'],
  fall: ['跳下', 'Drop down'], ladder: ['攀梯', 'Use ladder'], drop: ['沿壁滑下', 'Slide down wall'],
  slide: ['沿坡滑下', 'Slide down slope'], zipline: ['滑索', 'Ride zipline'],
  rappel: ['沿绳下降', 'Rappel'], swing: ['抓绳荡过', 'Swing across'],
  hook:['使用钩索到达落地区','Grapple to the landing area'],crawl:['穿过低洞','Crawl through'],vault:['翻越障碍','Vault over'],jump:['跳跃到对面','Jump across'],
  walljump:['蹬墙跳至下一处落点','Wall-jump to the next landing'],pole:['沿立柱连接跳跃','Jump along the linked poles'],
  boarding:['到登船点后乘船','Board at the wharf'],boat:['按航线行船','Sail to the destination'],ride:['按剧情完成骑乘','Continue the scripted ride'],
  chase:['按剧情完成追逐','Continue the scripted chase'],portal:['触发场景通道','Use the scene passage']
};
function title(move) {
  const english = /^en/i.test(String(UE.KismetInternationalizationLibrary?.GetCurrentLanguage?.() || 'zh'));
  if(move.fold) return english ? 'Folding ladder · lower first' : '折梯 · 需先放下';
  if(move.scripted) return english ? 'Transport · requires activation' : '升降装置 · 需触发';
  if(move.wallrunRelay) return english ? 'Run along the wall, then switch walls' : '沿墙跑，中途换到下一面墙';
  if(move.slideRelay) return english ? 'Enter the slope to slide through both sections' : '踏上坡面，两段会自动滑过';
 if(move.launch==='jump'&&['fall','drop'].includes(move.kind))return english?'Run forward and jump down to the platform':'向前助跑跳落到平台';
 if(move.kind==='fall'&&move.launch==='runoff')return english?'Step off the ledge':'向前走出平台边缘';
 const key=({2:'ladder',3:'ascent',6:'drop',fall:'drop'})[move.kind]||move.kind;
 if(key==='jump')return english?'Jump to the platform':'向前跳到落脚平台';
  if(key==='ladder'&&move.p&&move.end&&move.end.z<move.p.z-80)return english?'Descend the ladder':'沿梯下降';
  return labels[key]?.[english ? 1 : 0] || '';
}
function support(world,p,below=105) {
  if(world.floorAt){const q=world.floorAt(p,true);if(q&&q.z-p.z<=180&&p.z-q.z<=below)return q;}
  const hit=world.hit({...p,z:p.z+68},{...p,z:p.z-below});
  return hit&&!hit.penetrating&&hit.nz>=world.normal-.025?hit.point:null;
}
const LandingLimits=require('./PBZRouteLandingLimits');
function landing(world,p,kind) {
  const q=support(world,p,LandingLimits.below(kind));
  return q&&LandingLimits.contains(kind,p.z,q.z)?q:null;
}
function sweep(...args){const task=sweepJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function approach(...args){const task=approachJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function check(...args){const task=checkJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function* sweepJob(world,a,b,onFailure) {
  const start=support(world,a),end=support(world,b);
  if(!start||!end||Math.abs(start.z-a.z)>200||Math.abs(end.z-b.z)>200)return null;
  const count=Math.max(1,Math.ceil(R.dist(start,end)/52)),points=[start];let last=start;
  for(let i=1;i<=count;i++){yield;
    const expected=R.lerp(start,end,i/count),step=world.step(last,expected,false);
    if(!step.p){onFailure?.(step,expected);return null;}
    points.push(...(step.points||[step.p]));last=step.p;
  }
  return Math.abs(last.z-end.z)<52?points:null;
}
function* actionPadJoin(world,pad,candidates,entering){
 for(const mesh of yield* candidates(pad)){
  if(!R.finite(mesh)||R.xy(pad,mesh)>750||Math.abs(pad.z-mesh.z)>120)continue;
  // Floor, slope and obstruction tests depend on which way the player walks.
  const points=entering?yield* sweepJob(world,mesh,pad):yield* sweepJob(world,pad,mesh);
  if(!points)continue;
  const first=points[0],last=points.at(-1);
  const standing=entering?last:first,anchor=entering?first:last;
  if(R.xy(standing,pad)>1||Math.abs(standing.z-pad.z)>1||R.xy(anchor,mesh)>1||Math.abs(anchor.z-mesh.z)>35||
     points.some(p=>Math.abs(p.z-pad.z)>120))continue;
  return {points,anchor};
 }
 return null;
}
function* approachJob(world,pad,anchor,mode) {
  const run=R.xy(pad,anchor);
  const handleHeight=['hook','swing','rappel','zipline','wallrun','pole','walljump','boarding'].includes(mode)?475:240;
  // A distant fallback pad must actually lead to the interaction's approach.
  // Sample on the player's side of the wall, not inside an authored wall face.
  const reach=['wallrun','ascent','mantle','ladder','swing','hook','vault','walljump','pole','boarding'].includes(mode)?90:35;
  const near=R.lerp(anchor,pad,Math.min(1,reach/(run||1)));
  // An elevated anchor can see the floor above its actual approach first.
  // Also probe at the standing pad height and walk to the same XY position.
  const probes=handleHeight===475&&Math.abs(near.z-pad.z)>1?[near,{...near,z:pad.z}]:[near];
  let previous=null;
  for(const probe of probes){
   const end=support(world,probe,handleHeight);yield;
   if(!end||Math.abs(near.z-end.z)>handleHeight||Math.abs(pad.z-end.z)>100+run*.85)continue;
   if(previous&&R.dist(previous,end)<1)continue;
   previous=end;
   if(yield* sweepJob(world,pad,end))return true;
  }
  return false;
}
function* checkJob(world,edge) {
  if(edge.mode==='fall'||edge.mode==='jump')return(yield* require('./PBZRouteDrops').inspect(world,edge.a,edge.b,edge.mode)).ok;
  if(edge.mode==='hook'){
   const actor=liveWorlds.get(world.sourceWorld||world)?.actors.get(String(edge.guid).toLowerCase())?.actor;
   const box=triggerBoxVolume(componentByName(actor,'TriggerBox'));
   if(!box||!TriggerVolume.contains(box,[edge.a.x,edge.a.y,edge.a.z],Number(world.h)||96))return false;
   return yield* approachJob(world,edge.b,edge.last,'hook');
  }
  if(edge.mode==='ladder'){
   const actor=liveWorlds.get(world.sourceWorld||world)?.actors.get(String(edge.guid).toLowerCase())?.actor;
   if(W.alive(actor)&&!Mechanisms.allowsDirection(actor,'ladder',edge.a,edge.b))return false;
  }
  if(edge.mode==='wallrun'){
   const actors=liveWorlds.get(world.sourceWorld||world)?.actors;
   const actor=actors?.get(String(edge.guid).toLowerCase())?.actor;
   if(edge.wallrunRelay){
    const boxes=edge.wallrunRelay.map(step=>relayLaunchBox(actors,step));
    if(boxes.some(box=>!box))return false;
    const stood=landing(world,edge.a,'wallrun');yield;
    if(!stood||Math.abs(stood.z-edge.a.z)>55||!standsInBox(world,boxes[0],stood,true))return false;
    return yield* approachJob(world,edge.b,edge.last,'wallrun');
   }
   if(edge.requiresLaunchBox||nativeWallrun(actor)){
    if(!nativeWallrun(actor))return false;
    const sides=wallrunBoxes(actor,edge.first,edge.last);
    if(!sides||wallrunDirections(actor,sides)?.noForward)return false;
    const box=triggerBoxVolume(sides.first);
    if(!box)return false;
    const stood=landing(world,edge.a,'wallrun');yield;
    if(!stood||Math.abs(stood.z-edge.a.z)>55||!standsInBox(world,box,stood,true))return false;
    return yield* approachJob(world,edge.b,edge.last,'wallrun');
   }
  }
  if(edge.slideRelay){
   const [entry,exit]=edge.slideRelay.map(guid=>liveWorlds.get(world.sourceWorld||world)?.actors.get(guid.toLowerCase())?.actor);
   const entryBoxes=yield* slideBoxes(entry);
   if(!entryBoxes.length||!(yield* slideBoxes(exit,1)).length)return false;
   const first=landing(world,edge.a,'slide');yield;
   if(!first||Math.abs(first.z-edge.a.z)>55||!entryBoxes.some(box=>standsInBox(world,box,first,true)))return false;
   const last=landing(world,edge.b,'slide');yield;
   return !!last&&Math.abs(last.z-edge.b.z)<=55&&!world.hit?.(last,last,true);
  }
  if(edge.mode==='drop'){
   const actor=liveWorlds.get(world.sourceWorld||world)?.actors.get(String(edge.guid).toLowerCase())?.actor;
   if(edge.requiresLaunchBox||nativeDownSlide(actor)){
    const box=downSlideBox(actor,world);
    if(!box||edge.b.z>=edge.a.z)return false;
    const entry=landing(world,edge.a,'drop');yield;
    if(!entry||Math.abs(entry.z-edge.a.z)>55||!standsInBox(world,box,entry,true))return false;
    return yield* approachJob(world,edge.b,edge.last,'drop');
   }
  }
  if(edge.mode==='ascent'){
   const cache=liveWorlds.get(world.sourceWorld||world),actor=cache?.actors.get(String(edge.guid).toLowerCase())?.actor;
   if(edge.requiresLaunchBox||nativeAscent(actor)){
    if(!nativeAscent(actor))return false;
    const box=triggerBoxVolume(componentByName(actor,'BoxA')||componentByName(actor,'Box'));
    if(!box)return false;
    const entry=landing(world,edge.a,'ascent');yield;
    const exit=landing(world,edge.b,'ascent');yield;
    if(!entry||!exit||Math.abs(entry.z-edge.a.z)>55||Math.abs(exit.z-edge.b.z)>55)return false;
    const clear=!world.hit?.(exit,exit,true);yield;
    return clear&&ascentPads(actor,entry,exit,world,box);
   }
   if(ascentPads(actor,edge.a,edge.b,world)){yield;return true;}
  }
  if(edge.kind===8||edge.kind===5)return yield* sweepJob(world,edge.a,edge.b);
  if(edge.mode==='lift'&&R.xy(edge.first,edge.last)<85&&Math.abs(edge.first.z-edge.last.z)>170){
   const low=Math.min(edge.first.z,edge.last.z),high=Math.max(edge.first.z,edge.last.z);
   function* dock(pad,stop){
    const n=Math.max(1,Math.ceil(R.xy(pad,stop)/45));let previous=null;
    for(let i=0;i<=n;i++){yield;
     const p=R.lerp(pad,stop,i/n);let floor=support(world,p,68);
     if(!floor||Math.abs(p.z-floor.z)>60){
      // The car may be at the opposite stop. Its actual collision footprint
      // covers the same XY column at both stops of a vertical elevator.
      const car=world.hit({...p,z:high+100},{...p,z:low-140},false,true);
      if(!car||car.penetrating||car.nz<world.normal-.025||!car.owners?.includes(String(edge.guid).toLowerCase()))return false;
      floor=p;
     }
     if(previous&&(Math.abs(previous.z-floor.z)>world.rise+R.xy(previous,floor)*world.slope+6||world.hit(previous,floor,true)))return false;
     previous=floor;
    }
    return true;
   }
   return (yield* dock(edge.a,edge.first))&&(yield* dock(edge.b,edge.last));
  }
  return (yield* approachJob(world,edge.a,edge.first,edge.mode))&&(yield* approachJob(world,edge.b,edge.last,edge.mode));
}
const liveWorlds = new WeakMap();
const classObjects = new Map();
function checkedWalk(...args){const task=checkedWalkJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function* checkedWalkJob(world,a,b,nativeWalk,options={}){
  const firstFloor=support(world,a,240),lastFloor=support(world,b,240);yield;
  if(!firstFloor||!lastFloor||Math.abs(firstFloor.z-a.z)>200||Math.abs(lastFloor.z-b.z)>200)return null;
  a=firstFloor;b=lastFloor;
  if(R.dist(a,b)<1)return [a,b];
  if(R.dist(a,b)<850){const direct=yield* sweepJob(world,a,b);if(direct)return direct;}
  const verify=function*(leg){
   if(!leg||leg.partial||!leg.points?.length||(leg.moves||[]).length)return null;
   const first=leg.points[0],last=leg.points[leg.points.length-1];
   if(R.xy(first,a)>=80||R.xy(last,b)>=90||Math.abs(first.z-a.z)>=105||Math.abs(last.z-b.z)>=110)return null;
   const checked=yield* Feasible.check(world,{...leg,world:'connector',checks:leg.checks||[],gates:[],moves:[],walks:leg.walks||[]},a);
   if(!checked.ok||checked.leg.partial)return null;
   let points=checked.leg.points;
   if(R.dist(a,points[0])>1){
    const departure=yield* sweepJob(world,a,points[0]);if(!departure||R.dist(departure.at(-1),points[0])>1)return null;
    points=[...departure.slice(0,-1),...points];
   }
   const end=points.at(-1);
   if(R.dist(end,b)>1){const arrival=yield* sweepJob(world,end,b);if(!arrival||R.dist(arrival.at(-1),b)>1)return null;points=[...points,...arrival.slice(1)];}
   return points;
  };
  if(options.providerWalk){const provider=yield* options.providerWalk(a,b);const checked=yield* verify(provider);if(checked)return checked;}
  yield;const leg=nativeWalk(a,b,true);options.waypoints=leg?.points;yield;
  const native=yield* verify(leg);if(native)return native;
  // A streamed native navmesh can stop between two valid actions even when
  // the shipped atlas contains their complete ground corridor. Use only its
  // walking edges, then check every floor and capsule segment in the scene.
  const g=options.graph;
  if(!g?.routeJob||R.dist(a,b)>12000)return null;
  const banned={has:k=>{
   if(k<g.e?.length/6)return [2,3,6,7].includes(g.e[k*6+2]);
   const move=g.liveEdges?.[k-(g.e?.length||0)/6]?.move;
   return !!move&&!move.walk;
  }};
  const clock=options.clock||Date.now,deadline=Math.min(options.deadline??Infinity,clock()+750);
  const task=g.routeJob(a,b,{banned});let row,steps=0;
  try{
   while(clock()<=deadline&&steps++<512){row=task.next();if(row.done)break;yield;}
  }finally{if(!row?.done)task.return?.();}
  const corridor=row?.done?row.value:null;
  if(corridor?.points?.length)options.waypoints=[...(options.waypoints||[]),...corridor.points];
  return yield* verify(corridor);
}
function sceneComponents(actor){
  const read=actor.K2_GetComponentsByClass||actor.GetComponentsByClass;
  return read?.call(actor,UE.SceneComponent.StaticClass());
}
function componentByName(actor,name){
 if(!W.alive(actor))return null;
 try{const direct=actor?.[name];if(W.alive(direct))return direct;}catch(_){}
 try{const list=sceneComponents(actor);for(let i=0;i<Math.min(128,list?.Num()||0);i++){
  const value=list.Get(i),actual=String(value.GetName()).replace(/_GEN_VARIABLE(?:_\d+)?$/,'');
  if(W.alive(value)&&actual===name)return value;
 }}catch(_){}
 return null;
}
function nativeWallrun(actor){
 return W.alive(actor)&&(typeof actor.bEnableAToB==='boolean'||typeof actor.bEnableBToA==='boolean');
}
function nativeAscent(actor){
 return W.alive(actor)&&(typeof actor.UpRunningTargetHeight==='number'||typeof actor.GetUpRunningTargetHeight==='function');
}
function nativeDownSlide(actor){
 return W.alive(actor)&&typeof actor.GetDownSlidingDepth==='function';
}
function downSlideBox(actor,world){
 if(!nativeDownSlide(actor))return null;
 try{
  // The native class resolves the inherited trigger, including instances
  // whose cooked export has only the ledge splines and root component.
  const component=typeof actor.GetCollisionComponent==='function'?
   actor.GetCollisionComponent(world.pawn):componentByName(actor,'TopCollision');
  return triggerBoxVolume(component);
 }catch(_){return null;}
}
function wallrunBoxes(actor,first,last){
 try{
  const boxA=componentByName(actor,'BoxA'),boxB=componentByName(actor,'BoxB');
  const a=W.plain(boxA?.K2_GetComponentLocation?.()),b=W.plain(boxB?.K2_GetComponentLocation?.());
  if(![a,b,first,last].every(R.finite))return null;
  const firstA=R.dist(first,a),firstB=R.dist(first,b),lastA=R.dist(last,a),lastB=R.dist(last,b);
  // Spline point order is independent of the native trigger labels.
  if(firstA<firstB&&lastB<lastA)return {first:boxA,last:boxB,firstIsA:true};
  if(firstB<firstA&&lastA<lastB)return {first:boxB,last:boxA,firstIsA:false};
 }catch(_){}
 return null;
}
function wallrunDirections(actor,sides){
 const aToB=actor.bEnableAToB,bToA=actor.bEnableBToA;
 const [forward,reverse]=sides.firstIsA?[aToB,bToA]:[bToA,aToB];
 return {noForward:forward!==true,noReverse:reverse!==true};
}
function triggerBoxVolume(component){
 try{
  if((component.GetGenerateOverlapEvents?.()??component.bGenerateOverlapEvents)===false)return null;
  const mode=component.GetCollisionEnabled?.(),collision=UE.ECollisionEnabled;
  if(mode!==undefined&&(mode===collision?.NoCollision||mode===collision?.PhysicsOnly||mode===collision?.ProbeOnly))return null;
  return TriggerVolume.live(component,UE,W.plain);
 }catch(_){return null;}
}
function relayLaunchBox(actors,step){
 const actor=actors?.get(step.guid.toLowerCase())?.actor;
 if(!nativeWallrun(actor))return null;
 const sides=wallrunBoxes(actor,step.first,step.last);
 if(!sides||sides.firstIsA!==step.wallrunAToB||wallrunDirections(actor,sides).noForward)return null;
 return triggerBoxVolume(sides.first);
}
function* slideBoxes(actor,limit=64){
 if(!W.alive(actor)||actor.bAutoStartOnOverlap===false)return [];
 const boxes=[];
 try{
  const triggers=actor.GeneratedSlideTriggers;
  for(let i=0;i<Math.min(64,triggers?.Num()||0)&&boxes.length<limit;i++){
   const box=triggerBoxVolume(triggers.Get(i));
   if(box)boxes.push(box);
   yield;
  }
 }catch(_){}
 return boxes;
}
function standsInBox(world,box,p,capsule=false){
 const feet=[p.x,p.y,p.z],height=Number(world.h)||96;
 const inside=capsule?TriggerVolume.overlapsCapsule(box,feet,height,Number(world.r)||35):TriggerVolume.contains(box,feet,height);
 return inside&&!world.hit?.(p,p,true);
}
function* launchPadsJob(world,feature,box,near,hint,limit=1){
 if(!box)return[];
 const pads=[],separation=2*(Number(world.r)||35),position=[near.x,near.y,near.z];
 const volumeSamples=TriggerVolume.samples(box,position,Number(world.h)||96);
 const upper=feature.kind==='wallrun'&&feature.launchBox?TriggerVolume.upperFootSamples(box,position):[];
 function* addPad(raw,minZ=-Infinity){
  const q=landing(world,{x:raw[0],y:raw[1],z:raw[2]},feature.kind);yield;
  if(!q||q.z<minZ||pads.some(p=>R.xy(p,q)<separation&&Math.abs(p.z-q.z)<50)||!standsInBox(world,box,q,!!feature.launchBox))return false;
  pads.push(q);return true;
 }
 if(hint)yield* addPad(hint);
 // The bottom cap can overlap a wallrun trigger from a ledge above its
 // interior probe heights. Reserve one alternate for that upper surface.
 if(limit>1&&pads.length<limit)for(const raw of upper){if(yield* addPad(raw,raw[2]-55))break;}
 for(const raw of volumeSamples){
  if(pads.length>=limit)break;
  yield* addPad(raw);
 }
 if(limit===1&&!pads.length)for(const raw of upper){if(yield* addPad(raw,raw[2]-55))break;}
 return pads;
}
function triggerContains(actor,p,world){
 try{
  const box=componentByName(actor,'BoxA')||componentByName(actor,'Box'),transform=box?.K2_GetComponentToWorld?.()||box?.GetComponentTransform?.();if(!W.alive(box)||!transform||!box.GetUnscaledBoxExtent||!UE.KismetMathLibrary?.InverseTransformLocation)return false;
  const extent=box.GetUnscaledBoxExtent(),local=UE.KismetMathLibrary.InverseTransformLocation(transform,new UE.Vector(p.x,p.y,p.z+(Number(world.h)||96)));
  return Math.abs(local.X)<=extent.X&&Math.abs(local.Y)<=extent.Y&&Math.abs(local.Z)<=extent.Z+(Number(world.h)||96);
 }catch(_){return false;}
}
function ascentLedge(actor,exit){
 if(!W.alive(actor))return false;
 const edge=componentByName(actor,'EdgeSpline');
 if(!edge?.FindLocationClosestToWorldLocation)return false;
 try{const position=W.vec?W.vec(exit):new UE.Vector(exit.x,exit.y,exit.z);
  const ledge=W.plain(edge.FindLocationClosestToWorldLocation(position,UE.ESplineCoordinateSpace.World));
  return R.finite(ledge)&&R.xy(ledge,exit)<=180&&Math.abs(ledge.z-exit.z)<=180;
 }catch(_){return false;}
}
function ascentPads(actor,entry,exit,world,box){
 if(!W.alive(actor))return false;
 box??=triggerBoxVolume(componentByName(actor,'BoxA')||componentByName(actor,'Box'));
 if(box?!standsInBox(world,box,entry,true):!triggerContains(actor,entry,world))return false;
 return exit.z>entry.z+60&&ascentLedge(actor,exit);
}
function* placedCurveJob(actor,kind){
  const worldSpace=UE.ESplineCoordinateSpace.World;
  let components;
  function component(name){
   try{const c=actor[name];if(W.alive(c))return c;}catch(_){}
   // Inherited native subobjects need not have a Puerts property accessor.
   // Match the actual component name, never an arbitrary nearby spline.
   if(components===undefined){components=new Map();try{
    const list=sceneComponents(actor);
    for(let i=0;i<Math.min(128,list?.Num()||0);i++){
     const c=list.Get(i);if(W.alive(c))components.set(String(c.GetName()).replace(/_GEN_VARIABLE(?:_\d+)?$/,''),c);
    }
   }catch(_){}}
   return components.get(name)||null;
  }
  function location(name){const c=component(name);return typeof c?.K2_GetComponentLocation==='function'?W.plain(c.K2_GetComponentLocation()):null;}
  function* curve(name,midpoint=false){
    const c=component(name);if(!c||typeof c.GetSplineLength!=='function')return [];
    const length=c.GetSplineLength();if(!Number.isFinite(length)||length<1||length>180000)return [];
    if(midpoint)return [W.plain(c.GetLocationAtDistanceAlongSpline(length*.5,worldSpace))];
    const count=Math.min(420,Math.max(1,Math.ceil(length/120))),points=[];
    for(let i=0;i<=count;i++){
     if(i&&(i&7)===0){
      yield;
      if(!W.alive(actor)||!W.alive(c))return [];
     }
     points.push(W.plain(c.GetLocationAtDistanceAlongSpline(length*i/count,worldSpace)));
    }
    return points;
  }
  const root=W.plain(actor.K2_GetActorLocation());let result;
  switch(kind){
   case 'lift':case 'slide':result=yield* curve('Spline');break;
   case 'rappel':case 'zipline':
    result=yield* curve('RopeSpline');
    if(!result.length&&W.alive(actor))result=yield* curve('RopeSplineComponent');
    break;
   case 'wallrun':
    result=yield* curve('LowSpline');
    if(result.length<2&&W.alive(actor))result=TraversalGeometry.extract(actor,kind,{location,point:W.plain});
    break;
   case 'ascent':result=[location('BoxA')||location('Box')||root,...(yield* curve('EdgeSpline',true))];
    if(result.length<2){const end=location('EndPositionStatic');if(end)result=[location('Box')||root,end];}break;
   case 'mantle':result=[location('FrontCollision')||root,...(yield* curve('FrontEdgeSpline',true)),...(yield* curve('BackEdgeSpline',true))];break;
   case 'drop':{const top=location('TopCollision');result=[...(top?[top]:[]),...(yield* curve('EdgeSpline',true)),...(yield* curve('EndEdgeSpline',true))];break;}
   case 'ladder':result=[location('BottomCollision'),location('TopCollision')];break;
   case 'ladder-guide':{
    const bottom=location('BottomMeshComponent')||location('BottomLadder'),top=location('TopMeshComponent')||location('TopLadder');
    if(bottom&&top)result=[bottom,top];
    else {
     // Cooked ladders may have baked meshes and null runtime mesh components.
     // The native vertical ladder's base still defines its axis; never use
     // the two-metre upper interaction-box offset as the descent column.
     const base=location('BottomCollision'),upper=location('TopCollision');let up;
     try{if(typeof actor.GetActorUpVector==='function')up=W.plain(actor.GetActorUpVector());}catch(_){}
     if(base&&upper&&up?.z>.995&&upper.z-base.z>36&&R.xy(base,upper)<=600)
      result=[base,{x:base.x,y:base.y,z:upper.z}];
    }
    break;
   }
   case 'swing':result=[location('ASide')||location('BoxA'),location('BSide')||location('BoxB')];break;
   // The sphere is the broad aiming/detection region and may be centred on
   // the airborne grab mesh. The box is the authored player launch region.
   // Keep the grab anchor inside the action, separate from its standing entry.
   case 'hook':result=[location('TriggerBox'),location('GrabPoint'),location('LandArea')];break;
   default:result=TraversalGeometry.extract(actor,kind,{location,point:W.plain});
  }
  if(!result||result.length<2||!result.every(R.finite)||R.dist(result[0],result[result.length-1])<36)return null;
  if(['rappel','zipline','drop','slide'].includes(kind)&&result[0].z<result[result.length-1].z)result.reverse();
  if(kind==='rappel')try{
   const transform=actor.GetRappellingLandTargetWorldTransform?.(),end=W.plain(transform?.Translation);
   if(R.finite(end)&&end.z<=result[0].z&&R.dist(end,result[result.length-1])>1)result.push(end);
  }catch(_){}
  return result;
}
function liveCache(g,world){
  world=world.sourceWorld||world;
  let cache=liveWorlds.get(world);
  if(!cache||cache.graph!==g){
    const byClass=new Map(classCatalog.map(c=>[c.classPath,{definition:c,items:new Map()}]));
    const known=new Map(g.actors.map(a=>[String(a.guid).toLowerCase(),a]));
    for(const item of require('./PBZRoutePlacedPassages').forWorld(g.name))known.set(String(item.guid).toLowerCase(),{...item,path:item.path.map(p=>p.slice())});
    for(const item of known.values()){
      if(!item.classPath||!byClass.has(item.classPath))continue;
      byClass.get(item.classPath).items.set(item.guid.toLowerCase(),item);
    }
    cache={graph:g,classes:[...byClass],index:0,next:0,paths:new Map(),tried:new WeakMap(),actors:new Map(),nextStates:0,known};liveWorlds.set(world,cache);
  }
  return cache;
}
function placementBlock(world,edge,pawn){
 if(edge.source!=='game-placement'||!edge.requiresLoaded)return null;
 const actors=liveWorlds.get(world.sourceWorld||world)?.actors;
 const steps=edge.slideRelay?.map(guid=>({guid}))||edge.wallrunRelay||[edge];
 for(const step of steps){
  const record=actors?.get(String(step.guid).toLowerCase());
  if(!W.alive(record?.actor))return {unknown:true,icon:'mechanism',label:'机关未加载 · 靠近后确认',source:'live-mechanism'};
  const state=Mechanisms.inspect(record.actor,record.item,{UE,pawn,point:W.plain,...world.requirements});
  if(!state.ready)return state.block;
  if(edge.wallrunRelay&&!relayLaunchBox(actors,step))
   return {icon:'locked',label:'跑墙当前方向不可用',source:'live-mechanism',locked:true};
 }
 return null;
}
function readState(g,cache,actor,item,pawn,world){
 const key=String(item.guid).toLowerCase(),states=g.passageStates||=new Map();
 const wasFolded=item.fold;
 if(item.kind==='ladder'&&typeof actor.bFold==='boolean')item.fold=actor.bFold;
 cache.actors.set(key,{actor,item});
 const state=Mechanisms.inspect(actor,item,{UE,pawn,point:W.plain,...world.requirements}),old=states.get(key);
 let ladderChanged=false;
 if(item.kind==='ladder'){
  const wasOpen=g.openPassages.has(key),open=!!item.fold&&state.ready&&actor.bTriggered===true;
  if(item.fold)g.foldedPassages?.add(key);else g.foldedPassages?.delete(key);
  if(open)g.openPassages.add(key);else g.openPassages.delete(key);
  ladderChanged=wasFolded!==item.fold||wasOpen!==open;
  if(ladderChanged)cache.paths.delete(item.guid);
 }
 if(ladderChanged||(old&&JSON.stringify(old)!==JSON.stringify(state))||(!old&&!state.ready))g.passageRevision=(g.passageRevision||0)+1;
 states.set(key,state);return state;
}
function retainPlacedObservation(g,item,path){
 if(item.source!=='game-placement')return;
 const key=String(item.guid).toLowerCase();
 if(g.observedPassages.has(key)||g.observedPassages.size<240)
  g.observedPassages.set(key,{...item,path:path.map(p=>[p.x,p.y,p.z])});
}
function forgetReplacedActor(g,cache,key,item,actor){
 const previous=cache.actors.get(key);
 if(!previous||previous.actor===actor)return;
 cache.actors.delete(key);
 cache.paths.delete(item?.guid||previous.item.guid);
 g.openPassages.delete(key);
 if(g.passageStates)g.passageStates.set(key,{ready:false,block:{unknown:true,icon:'mechanism',label:'机关重新加载 · 等待确认',source:'live-mechanism'}});
 g.passageRevision=(g.passageRevision||0)+1;
}
function refreshStates(g,world,pawn,force=false){
 const cache=liveWorlds.get(world?.sourceWorld||world);if(!g||!cache||cache.graph!==g)return false;
 const now=Date.now();if(!force&&now<cache.nextStates)return false;cache.nextStates=now+900;
 const before=g.passageRevision,feet=world.feet(),rows=[...cache.actors.values()];let count=0;
 for(let i=0;i<Math.min(256,rows.length);i++){
  const index=(cache.stateCursor||0)%rows.length,{actor,item}=rows[index];cache.stateCursor=(index+1)%rows.length;
  if(!W.alive(actor)){
   const key=String(item.guid).toLowerCase();
   const wasOpen=item.kind==='ladder'&&g.openPassages.delete(key);
   if(wasOpen||g.passageStates?.get(key)?.ready!==false){g.passageStates.set(key,{ready:false,block:{unknown:true,icon:'mechanism',label:'机关未加载',source:'live-mechanism'}});g.passageRevision++;}
   cache.paths.delete(item.guid);continue;
  }
  const path=cache.paths.get(item.guid)?.path;
  if(path&&R.dist(feet,path[0])>16000)continue;
  readState(g,cache,actor,item,pawn,world);if(++count>=64)break;
 }
 return before!==g.passageRevision;
}
function* refreshLoadedJob(g,world,pawn,start,goal,options={}){
 if(!g||!world||!pawn||!UE.Class||!UE.GameplayStatics?.GetAllActorsOfClass)return;
 const cache=liveCache(g,world),now=Date.now();
 cache.background?.return();
 cache.background=null;
 const requested=options.corridorActions?new Map():null;
 const relays=requested?new Map(WallrunRelays.forWorld(g.name).map(relay=>[relay.guid.toLowerCase(),relay.steps.map(step=>step.guid)])):null;
 const slide=SlideRelay.forWorld(g.name);
 if(requested&&slide)relays.set(slide.guid.toLowerCase(),slide.steps);
 if(requested)for(const guid of options.corridorActions.flatMap(guid=>relays.get(String(guid).toLowerCase())||[guid])){
  const key=String(guid).toLowerCase(),item=cache.known.get(key);
  if(!item?.classPath||options.refreshedActions?.has(key))continue;
  if(!requested.has(item.classPath))requested.set(item.classPath,new Set());
  requested.get(item.classPath).add(key);
 }
 const rank=row=>Math.min(50000,...[...row[1].items.values()].map(a=>{
  const p=a.path?.[0]||a.at;if(!p)return 50000;const q={x:p[0],y:p[1],z:p[2]};return Math.min(R.dist(start,q),R.dist(goal,q));}));
 const classes=requested?cache.classes.filter(([asset])=>requested.has(asset)):cache.classes.slice().sort((a,b)=>rank(a)-rank(b));
 if(!classes.length)return;
 const summary={resident:0,nearby:0,paths:0,kinds:{},missing:[]},seen=new Set();
 const P=require('puerts');
 for(const [asset,{definition,items}] of classes){
  const wanted=requested?.get(asset);
  let cls=classObjects.get(asset);
  if(!cls){try{cls=UE.Class.Find?.(asset);}catch(_){}
   if(cls)classObjects.set(asset,cls);yield;}
  if(!cls)continue;
  summary.resident++;
  const out=P.$ref(undefined);UE.GameplayStatics.GetAllActorsOfClass(pawn,cls,out);yield;
  const actors=P.$unref(out);
  const actorLimit=Math.min(256,actors?.Num()||0);
  for(let i=0;i<actorLimit&&(!wanted||wanted.size);i++){
   const actor=actors.Get(i);if(!W.alive(actor)){yield;continue;}
   const guid=String(actor.GetName()),key=guid.toLowerCase();
   if(seen.has(key)||wanted&&!wanted.delete(key)){yield;continue;}seen.add(key);
   const location=W.plain(actor.K2_GetActorLocation());yield;
   if(!R.finite(location)||!wanted&&Math.min(R.dist(start,location),R.dist(goal,location))>14000)continue;
   summary.nearby++;summary.kinds[definition.kind]=(summary.kinds[definition.kind]||0)+1;
   let item=items.get(key)||cache.known.get(key)||g.observedPassages.get(key);
   forgetReplacedActor(g,cache,key,item,actor);
   const stateRead=item?.kind==='ladder';
   if(stateRead)readState(g,cache,actor,item,pawn,world);
   const cached=cache.paths.get(item?.guid||guid);if(cached&&now-cached.at<5000){
    summary.paths++;if(item){if(!stateRead)readState(g,cache,actor,item,pawn,world);options.refreshedActions?.add(key);}continue;
   }
   let path=yield* placedCurveJob(actor,definition.kind);
   if(!W.alive(actor))continue;
   if(!path&&item?.source==='game-placement'&&!item.requiresLiveEndpoints&&item.origin&&R.dist(location,{x:item.origin[0],y:item.origin[1],z:item.origin[2]})<25)
    path=item.path.map(q=>({x:q[0],y:q[1],z:q[2]}));
   if(!path&&item?.local){const transform=actor.GetTransform?.()||actor.K2_GetActorTransform?.();
    if(transform)path=item.local.map(q=>W.plain(UE.KismetMathLibrary.TransformLocation(transform,new UE.Vector(...q))));}
   if(!path){if(summary.missing.length<4){
    const components=[];try{const list=sceneComponents(actor);for(let n=0;n<Math.min(24,list?.Num()||0);n++)components.push(String(list.Get(n).GetName()));}catch(_){}
    summary.missing.push({guid,kind:definition.kind,components,reason:definition.entryOnly?'scripted entry; no static movement corridor':'no confirmed entry and exit'});
   }continue;}
   summary.paths++;
   if(!item){
    let folded=!!definition.fold;
    if(definition.kind==='ladder'&&typeof actor.bFold==='boolean')folded=actor.bFold;
    item={...definition,guid,fold:folded,conditional:true,path:path.map(p=>[p.x,p.y,p.z])};
    if(g.observedPassages.size>=240)continue;g.observedPassages.set(key,item);
   }
   if(!stateRead)readState(g,cache,actor,item,pawn,world);
   if(!cached||now-cached.at>=30000||R.dist(cached.path[0],path[0])>15||R.dist(cached.path.at(-1),path.at(-1))>15)g.passageRevision=(g.passageRevision||0)+1;
   const guidePath=definition.kind==='ladder'?yield* placedCurveJob(actor,'ladder-guide'):null;
   cache.paths.set(item.guid,{path,guidePath,at:Date.now()});items.set(key,item);yield;
   options.refreshedActions?.add(key);retainPlacedObservation(g,item,path);
  }
 }
 options.report?.('loaded actions',summary);
}
function updateLoaded(g,world,pawn) {
  if(!g||!world||!pawn||!UE.Class?.Find||!UE.GameplayStatics?.GetAllActorsOfClass)return;
  const cache=liveCache(g,world);
  const now=Date.now();
  if(!cache.background){
   if(now<cache.next||!cache.classes.length)return;
   cache.background=scanLoadedJob(cache,g,world,pawn,now);
  }
  try{
   for(let step=0;step<4;step++){
    if(cache.background.next().done){cache.background=null;break;}
    if(Date.now()-now>=2)break;
   }
  }catch(error){cache.background=null;throw error;}
}
function* scanLoadedJob(cache,g,world,pawn,now){
  cache.next=now+(cache.index===cache.classes.length-1?2500:650);
  const [asset,{items,definition}]=cache.classes[cache.index];cache.index=(cache.index+1)%cache.classes.length;
  if(!classObjects.has(asset)){
    // Enumerate resident actors only. Loading a package does not stream its map
    // instances, and can block the game thread for hundreds of milliseconds.
    let resident=null;
    try{resident=UE.Class.Find?.(asset);}catch(_){}
    const resolved=resident;
    if(!resolved)return;
    classObjects.set(asset,resolved);
  }
  const cls=classObjects.get(asset);if(!cls)return;
  const P=require('puerts'),out=P.$ref(undefined);
  UE.GameplayStatics.GetAllActorsOfClass(pawn,cls,out);
  yield;
  const found=P.$unref(out);
  const foot=world.feet();
  for(let i=0;i<(found?.Num()||0);i++){
    if(i&&(i&7)===0)yield;
    const actor=found.Get(i);if(!W.alive(actor))continue;
    const guid=String(actor.GetName()),key=guid.toLowerCase();let item=items.get(key)||cache.known.get(key)||g.observedPassages.get(key);
    if((cache.tried.get(actor)||0)>now||R.dist(foot,W.plain(actor.K2_GetActorLocation()))>16000)continue;
    cache.tried.set(actor,now+25000);
    forgetReplacedActor(g,cache,key,item,actor);
    let path=yield* placedCurveJob(actor,definition.kind);
    if(!W.alive(actor))return;
    if(!path&&item?.local){const transform=actor.GetTransform?.()||actor.K2_GetActorTransform?.();
     if(transform)path=item.local.map(q=>W.plain(UE.KismetMathLibrary.TransformLocation(transform,new UE.Vector(...q))));}
    if(!path||!path.every(R.finite))return;
    if(!item){
     let folded=!!definition.fold;
     if(definition.kind==='ladder'&&typeof actor.bFold==='boolean')folded=actor.bFold;
     item={...definition,guid,fold:folded,conditional:true,path:path.map(p=>[p.x,p.y,p.z])};
     if(g.observedPassages.size>=240)return;g.observedPassages.set(key,item);
    }
    readState(g,cache,actor,item,pawn,world);
    if(!cache.paths.has(item.guid))g.passageRevision=(g.passageRevision||0)+1;
    const guidePath=definition.kind==='ladder'?yield* placedCurveJob(actor,'ladder-guide'):null;
    cache.paths.set(item.guid,{path,guidePath,at:Date.now()});
    retainPlacedObservation(g,item,path);
    // Attachment runs in liveRouteJob after standing-pad and action checks;
    // a timer discovery must not install an unchecked movement arc.
    return;
  }
}
function isLookout(world,start,dest) {
  return world==='pbz_zhengdaodaying_wp'&&dest.world===world&&
    R.xy(dest.p,{x:6907,y:79331})<230&&Math.abs(dest.p.z-7805)<180&&
    start.x>800&&start.x<15500&&start.y>75000&&start.y<91000&&start.z>3950&&start.z<8800;
}
// Read room navigation in the live game for placed interactions with no safe
// connection to the offline walking mesh. No actor is moved or activated.
function liveRoute(...args){const task=liveRouteJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function* liveRouteJob(g,world,start,goal,nativeWalk,options={}) {
  if(!options.recast&&R.dist(start,goal)>19000)return null;
  const clock=options.clock||Date.now;
  const priority=new Set((options.priorityActions||[]).map(v=>String(v).toLowerCase()));
  const candidates=[],cache=liveWorlds.get(world.sourceWorld||world);
  const relays=options.recast?WallrunRelays.forWorld(g.name):[];
  const relayActors=new Set(relays.flatMap(relay=>relay.steps.map(step=>step.guid.toLowerCase())));
  const directedWallruns=new Map();
  const maximumScore=options.recast?Math.max(26000,R.dist(start,goal)+6000):26000;
  const offer=(feature,key,state,path,guidePath,launch)=>{
   const both=!launch&&feature.both,first=path[0],last=path.at(-1),reverseView=launch?.wallrunReverse===true;
   const excluded=feature.source==='game-placement'?options.excludedPlacements?.get(key)??0:0;
   const noForward=!!(reverseView?feature.noReverse:feature.noForward)||!!(excluded&(reverseView?2:1));
   const noReverse=!!(reverseView?feature.noForward:feature.noReverse)||!!(excluded&(reverseView?1:2));
   if(noForward&&(!both||noReverse))return;
   const forward=noForward?Infinity:R.dist(start,first)+R.dist(goal,last);
   const backward=both&&!noReverse?R.dist(start,last)+R.dist(goal,first):Infinity,score=Math.min(forward,backward);
   const candidate={...feature,...launch,both,state,runtimePath:path,runtimeGuidePath:guidePath,score,
    ...(excluded||feature.noForward||feature.noReverse?{noForward,noReverse}:{})};
   if(launch?.launchBox&&feature.kind==='wallrun'&&relayActors.has(key)&&g.canTraverse(feature))
    directedWallruns.set(key+'/'+Number(reverseView),candidate);
   if(priority.has(key)&&(feature.wallrunRelay||feature.slideRelay))candidates.unshift(candidate);
   else if(priority.has(key)||score<maximumScore)candidates.push(candidate);
  };
 const features=new Map();let work=0;
 for(const group of [g.actors,cache?.known.values()||[],g.observedPassages.values(),options.features||[]])for(const f of group){features.set(String(f.guid).toLowerCase(),f);if((++work&63)===0)yield;}
  for(const feature of features.values()) {if((++work&7)===0)yield;
    if(!feature.path)continue;
    const live=liveWorlds.get(world.sourceWorld||world)?.paths.get(feature.guid);
    const missing=(feature.requiresLoaded||feature.conditional&&feature.local||feature.kind==='hook')&&(!live||Date.now()-live.at>=30000||!W.alive(cache?.actors.get(String(feature.guid).toLowerCase())?.actor));
    const path=live&&Date.now()-live.at<30000?live.path:feature.path.map(v=>({x:v[0],y:v[1],z:v[2]}));
    if(path.length<2||!path.every(R.finite))continue;
    const key=String(feature.guid).toLowerCase(),observed=g.passageStates?.get(key);
    const state=observed?.ready===false?observed:missing?{ready:false,block:{unknown:true,icon:'mechanism',label:'机关未加载 · 靠近后确认',source:'live-mechanism'}}:observed;
    const selectedPlacement=priority.has(key)&&feature.source==='game-placement';
    if(selectedPlacement&&(state?.ready===false||!g.canTraverse(feature)))options.onUnavailable?.(key,3);
    const guidePath=live&&Date.now()-live.at<30000?live.guidePath:null;
    const actor=cache?.actors.get(key)?.actor;
    if(feature.kind==='wallrun'&&state?.ready!==false&&nativeWallrun(actor)){
     const at=([x,y,z])=>({x,y,z}),authoredFirst=at(feature.path[0]),authoredLast=at(feature.path.at(-1)),first=path[0],last=path.at(-1);
     const ordered=R.dist(first,authoredLast)+R.dist(last,authoredFirst)<R.dist(first,authoredFirst)+R.dist(last,authoredLast)?path.slice().reverse():path;
     const sides=wallrunBoxes(actor,ordered[0],ordered.at(-1));yield;
     if(!sides){if(selectedPlacement)options.onUnavailable?.(key,3);continue;}
     const {noForward,noReverse}=wallrunDirections(actor,sides);
     const forward=noForward?null:triggerBoxVolume(sides.first);
     const reverse=feature.both&&!noReverse?triggerBoxVolume(sides.last):null;
     if(forward)offer(feature,key,state,ordered,null,{launchBox:forward,wallrunAToB:sides.firstIsA});
     if(reverse)offer(feature,key,state,ordered.slice().reverse(),null,{launchBox:reverse,wallrunReverse:true,wallrunAToB:!sides.firstIsA});
     const unavailable=(forward?0:1)|(feature.both&&!reverse?2:0);
     if(unavailable&&selectedPlacement)options.onUnavailable?.(key,unavailable);
    }else if(feature.kind==='drop'&&state?.ready!==false&&nativeDownSlide(actor)){
     const box=downSlideBox(actor,world);yield;
     if(box)offer(feature,key,state,path,guidePath,{launchBox:box});
     else if(selectedPlacement)options.onUnavailable?.(key,1);
    }else if(feature.kind==='ascent'&&state?.ready!==false&&nativeAscent(actor)){
     const box=triggerBoxVolume(componentByName(actor,'BoxA')||componentByName(actor,'Box'));yield;
     if(box)offer(feature,key,state,path,guidePath,{launchBox:box});
     else if(selectedPlacement)options.onUnavailable?.(key,3);
    }else offer(feature,key,state,path,guidePath);
  }
  for(const relay of relays){
   const key=relay.guid.toLowerCase();
   const directed=relay.steps.map(step=>directedWallruns.get(step.guid.toLowerCase()+'/'+Number(step.reverse)));
   if(directed.some(step=>!step)){
    if(priority.has(key))options.onUnavailable?.(key,1);
    continue;
   }
   const [first,second]=directed;
   const wallrunRelay=directed.map(step=>({guid:step.guid,first:step.runtimePath[0],last:step.runtimePath.at(-1),wallrunAToB:step.wallrunAToB}));
   offer({guid:relay.guid,kind:'wallrun',source:'game-placement',requiresLoaded:true,wallrunRelay},
    key,first.state,[...first.runtimePath,...second.runtimePath],null,{launchBox:first.launchBox});
  }
  const slide=options.recast?SlideRelay.forWorld(g.name):null;
  const slideKey=slide?.guid.toLowerCase(),slideHint=options.actionPads?.get(slideKey);
  if(slideHint){
   const steps=[];
   for(const [index,guid] of slide.steps.entries()){
    const key=guid.toLowerCase(),record=cache?.actors.get(key),track=cache?.paths.get(guid);
    const state=g.passageStates?.get(key);
    if(!record||state?.ready!==true||!track||Date.now()-track.at>=30000||
     (options.excludedPlacements?.get(key)&1)||!g.canTraverse(record.item))break;
    const boxes=yield* slideBoxes(record.actor,index===0?64:1);
    if(!boxes.length)break;
    steps.push({track,boxes});
   }
   if(steps.length===slide.steps.length){
    const [first,second]=steps;
    const toPoint=([x,y,z])=>({x,y,z});
    const entry=toPoint(slideHint.entry),end=toPoint(slideHint.exit),lip=second.track.path.at(-1);
    const box=first.boxes.find(b=>TriggerVolume.overlapsCapsule(b,slideHint.entry,Number(world.h)||96,Number(world.r)||35));
    if(box&&R.dist(entry,first.track.path[0])<=480&&end.z<lip.z-150&&R.dist(end,lip)<=1300)
     offer({guid:slide.guid,kind:'slide',source:'game-placement',requiresLoaded:true,slideRelay:slide.steps},
      slideKey,null,[...first.track.path,...second.track.path,end],null,{launchBox:box});
    else options.onUnavailable?.(slideKey,1);
   }else options.onUnavailable?.(slideKey,1);
  }
  options.report?.('action candidates',{count:candidates.length,start,goal});
  if(options.onHorizon){
   const horizon=yield* require('./PBZRouteHorizon').preview(g,world,start,goal,nativeWalk,candidates,options);
   if(horizon)options.onHorizon(horizon);
  }
  const standingPads=new Map();
  const corridorPadFor=(feature,entry)=>options.actionPads?.get(String(feature.guid).toLowerCase())?.[entry!==!!feature.wallrunReverse?'entry':'exit'];
  const landingJob=function*(feature,p,side){
   const entry=side==='left'||String(side).endsWith('entry');
   if((feature.kind==='wallrun'||feature.kind==='drop')&&feature.launchBox){
    const pad=entry?feature.standingEntry:feature.standingExit;
    if(pad!==undefined)return pad;
   }
   const key=String(feature.guid).toLowerCase()+(feature.wallrunReverse?'/reverse/':'/')+side;
   if(standingPads.has(key))return standingPads.get(key);
   const value=yield* (function*(){
    const actor=cache?.actors.get(String(feature.guid).toLowerCase())?.actor;
    const validExit=q=>!feature.launchBox||feature.kind!=='ascent'||entry||ascentLedge(actor,q);
    const authoredSide=feature.wallrunReverse?(entry?'right':'left'):side;
    const corridorPad=corridorPadFor(feature,entry);
    if(entry&&(feature.kind==='hook'||feature.launchBox)){
     const box=feature.launchBox||triggerBoxVolume(componentByName(actor,'TriggerBox'));
     return (yield* launchPadsJob(world,feature,box,start,corridorPad))[0]||null;
    }
    if(Array.isArray(corridorPad)&&corridorPad.length===3&&corridorPad.every(Number.isFinite)){
     const q=landing(world,{x:corridorPad[0],y:corridorPad[1],z:corridorPad[2]},feature.kind);yield;
     if(q&&validExit(q)&&!world.hit?.(q,q,true)&&R.dist(q,p)<2000&&(feature.kind==='lift'||(yield* approachJob(world,q,p,feature.kind))))return q;
    }
    const direct=landing(world,p,feature.kind);yield;if(direct&&validExit(direct)&&!world.hit?.(direct,direct,true))return direct;
    for(const row of feature[authoredSide]||[]){const raw=row[1],q=world.floorAt({x:raw[0],y:raw[1],z:raw[2]},true);yield;
     if(q&&validExit(q)&&!world.hit?.(q,q,true)&&R.dist(q,p)<2000&&(feature.kind==='lift'||(yield* approachJob(world,q,p,feature.kind))))return q;}
    const radii=feature.kind==='ascent'?[90,180,270,360]:[90];
    const radial=function*(radius,directions,offset=0){
     for(let i=0;i<directions;i++){
      const angle=offset+i*2*Math.PI/directions;
      const q=landing(world,{x:p.x+Math.cos(angle)*radius,y:p.y+Math.sin(angle)*radius,z:p.z},feature.kind);yield;
      if(!q||!validExit(q)||world.hit?.(q,q,true))continue;
      if(feature.kind==='ascent'&&entry&&triggerContains(actor,q,world))return q;
      if(yield* approachJob(world,q,p,feature.kind))return q;
     }
     return null;
    };
    for(const radius of radii){const q=yield* radial(radius,8);if(q)return q;}
    if(!entry&&feature.kind==='wallrun'&&feature.launchBox){
     // Narrow landing shelves can be between the original 45 degree samples.
     // Keep the first successful original pad and the same height/scene checks.
     const diagonal=yield* radial(90,8,Math.PI/8);
     if(diagonal)return diagonal;
     return yield* radial(135,16);
    }
    return null;

   })();standingPads.set(key,value);return value;
  };
  const launchAlternatives=new Map();
  if(options.recast){let prepared=0;for(const feature of candidates){if((++work&63)===0)yield;if(feature.source==='recast-boundary'||feature.state?.ready===false)continue;
   // Keep the trigger and landing points separate from the walking mesh.
   const canJoin=(feature.launchBox||feature.kind==='hook'&&!feature.both)&&world.step&&options.topologyJob&&options.actionPadCandidates;
   const varyingPads=feature.kind==='wallrun'||feature.kind==='drop';
   const pads=canJoin&&varyingPads?yield* launchPadsJob(world,feature,feature.launchBox,start,corridorPadFor(feature,true),4):null;
   const entry=feature.standingEntry=pads?pads[0]||null:yield* landingJob(feature,feature.runtimePath[0],'left');
   const exit=feature.standingExit=yield* landingJob(feature,feature.runtimePath.at(-1),'right');
   if(canJoin&&entry&&exit){
    const continuation=yield* actionPadJoin(world,exit,options.actionPadCandidates,false);
    if(continuation){feature.exitJoin=continuation.points;feature.meshExit=continuation.anchor;}
    // One trigger box can span disconnected ground. Each standing choice
    // keeps its own walking approach and the original actor/direction.
    const otherPads=pads?.slice(1).map(standingEntry=>({...feature,standingEntry}))||[];
    if(otherPads.length)launchAlternatives.set(feature,otherPads);
    for(const choice of [feature,...otherPads]){
     const approach=yield* actionPadJoin(world,choice.standingEntry,options.actionPadCandidates,true);
     if(approach){choice.entryJoin=approach.points;choice.meshEntry=approach.anchor;}
    }
   }
   if(++prepared>=96)break;
  }}
  let topology=null;
  if(options.topologyJob){
   const inputs=[],addFeature=f=>{
    const first=f.meshEntry||f.standingEntry||f.runtimePath[0],last=f.meshExit||f.standingExit||f.runtimePath.at(-1),path=f.source==='recast-boundary'&&!f.standingEntry&&!f.standingExit?f.path:[[first.x,first.y,first.z],[last.x,last.y,last.z]];
    const excluded=f.source==='recast-boundary'?options.excludedDirections?.get(String(f.guid).toLowerCase())??0:0;
    const noForward=!!f.noForward||!!(excluded&1),noReverse=!!f.noReverse||!!(excluded&2);
    if(!noForward||f.both&&!noReverse)inputs.push({guid:f.guid,kind:f.kind,source:f.source,both:f.both,noForward,noReverse,topologyClosed:f.state?.ready===false||!g.canTraverse(f),path,sourceFeature:f});
   };
   for(const f of candidates){
    addFeature(f);
    const alternatives=launchAlternatives.get(f);
    if(alternatives)for(const alternative of alternatives)addFeature(alternative);
    if((++work&31)===0)yield;
   }
   topology=yield* options.topologyJob(inputs);
   // Callback providers may return their endpoint views unchanged. Restore
   // the exact live action before running direction/condition/physics checks.
   if(topology?.features)for(let i=0;i<topology.features.length;i++){const f=topology.features[i];if(f.sourceFeature)topology.features[i]=f.sourceFeature;if((i&63)===63)yield;}
  }
  const canConnect=topology?((a,b)=>topology.canConnect([a.x,a.y,a.z],[b.x,b.y,b.z])):null;
  return yield* Transitions.route({name:g.name,world,start,goal,goals:options.goals,canConnect,componentConnectors:topology?.componentConnectors,component:topology?(p=>topology.component([p.x,p.y,p.z])):null,clock,deadline:options.deadline,maxConnectors:options.maxConnectors,excludedDirections:options.excludedDirections,
   lazyActions:options.recast,allowPartial:options.allowPartial,onPartial:options.onPartial,stagedWalk:true,pendingAction:topology?.pendingAction,
   onAction:function*(action,settings){
    if(options.recast)return;
    const linked=yield* LiveLinks.attachCheckedJob(g,action,(a,b)=>checkedWalkJob(world,a,b,nativeWalk,{graph:g,clock,deadline:settings.deadline}),{clock,deadline:settings.deadline});
    if(linked)options.report?.('action attached',{guid:action.feature.guid,kind:action.feature.kind,entry:action.entry,exit:action.exit});
   },
   features:topology?.features||candidates.sort((a,b)=>a.score-b.score),canTraverse:f=>f.state?.ready!==false&&g.canTraverse(f),onClosed:options.onClosed,report:options.report,
   landing:landingJob,
   validate:function*(a){
    if(a.feature.kind==='ladder'){
     const actor=cache?.actors.get(String(a.feature.guid).toLowerCase())?.actor;
     if(W.alive(actor)&&!Mechanisms.allowsDirection(actor,'ladder',a.entry,a.exit))return false;
    }
    if(['surface','fall'].includes(a.feature.kind)){
     const surface=a.feature.kind==='surface',mode=surface?'jump':'fall';
     if(a.feature.source==='recast-boundary'&&options.airborneDirections?.size&&
        (options.airborneDirections.get(String(a.feature.guid).toLowerCase())&(a.reverse?2:1)))
      return yield* require('./PBZRouteDrops').inspect(world,a.entry,a.exit,mode);
     let walkingFailure;
     const points=yield* sweepJob(world,a.entry,a.exit,surface?(step,expected)=>{
      walkingFailure={ok:false,p:step.hit||expected,why:step.why||'walking support unavailable',
       unknown:!step.hit&&!step.locked,obstructed:!!step.hit&&!step.locked&&step.why==='blocked body clearance'};
     }:undefined);
     if(points)return {points,walking:true};
     const airborne=yield* require('./PBZRouteDrops').inspect(world,a.entry,a.exit,mode);
     if(!surface||airborne?.ok)return airborne;
     // Only exclude this direction when both strategies are resolved. Retain
     // the walking contact if the jump fails on capability rather than impact.
     if(airborne?.unknown!==false)return airborne;
     if(!walkingFailure||walkingFailure.unknown)return walkingFailure||{ok:false,p:a.entry,why:'walking support unavailable',unknown:true};
     return walkingFailure.obstructed&&!airborne.obstructed?walkingFailure:airborne;
    }
    if(a.feature.kind==='ascent'){
     const actor=cache?.actors.get(String(a.feature.guid).toLowerCase())?.actor;
     // The climb trigger is a volume, not its centre inside the wall. The
     // standing exit must adjoin the actor's actual authored upper ledge.
     if(!a.feature.launchBox&&ascentPads(actor,a.entry,a.exit,world)){yield;return true;}
    }
    return yield* checkJob(world,{kind:9,mode:a.feature.kind,guid:a.feature.guid,a:a.entry,b:a.exit,first:a.path[0],last:a.path[a.path.length-1],
     requiresLaunchBox:!!a.feature.launchBox,wallrunRelay:a.feature.wallrunRelay,slideRelay:a.feature.slideRelay});
   },
   walk:function*(a,b,settings){
    const walkDeadline=settings.quick?Math.min(settings.deadline,clock()+200):settings.deadline;
    const samples={graph:g,clock,deadline:walkDeadline,providerWalk:options.walkJob};let points=yield* checkedWalkJob(world,a,b,nativeWalk,samples);
    if(points)return {points,meters:R.extent(points)/100};
    if(!settings.local)return null;
    const distance=R.dist(a,b),vertical=Math.abs(a.z-b.z)>200;
    const until=Math.min(walkDeadline,clock()+(vertical?2400:1200)),H=require('./PBZRouteWalkHints'),hints=options.recast?null:H.forWorld(g.name);
    const report=options.report?(phase,data)=>options.report('action '+phase,{...data,goal:b}):undefined;
    // Check the finite author candidates first. Sprouting another offset grid
    // at every hint needlessly multiplies the nodes in a narrow stair corridor.
    // These edges still use the exact same live floor/body/lock step checks.
    // The 45m limit bounds expensive grid exploration, not traversal of a
    // finite author graph. A bell can be farther from its first usable action.
    // Retain the graph's 120m endpoint range and all per-edge live checks.
    if(hints&&distance<=12000&&clock()<until){
     const hinted=yield* Local.search(world,a,b,{clock,hints,hintsOnly:true,allowDrops:true,maxDistance:12000,maxGraphNodes:768,maxChecks:64,maxMs:Math.min(200,until-clock()),report});
     if(hinted)return hinted;
    }
    if(settings.quick||distance>4500||clock()>=until)return null;
    const local=yield* Local.search(world,a,b,{clock,hints,maxMs:Math.max(1,until-clock()),
     maxNodes:vertical?1800:1000,waypoints:samples.waypoints,
     report});
    return local;
   }});
}
exports.title=title;
exports.check=check;
exports.isLookout=isLookout;
exports.liveRoute=liveRoute;
exports.updateLoaded=updateLoaded;
exports.refreshLoadedJob=refreshLoadedJob;
exports.refreshLadders=refreshLadders;
exports.refreshStates=refreshStates;
exports.resetLadders=resetLadders;

// A baked route cannot promote a raw placement into an open interaction.
// Read the same resident cache/state used by ordinary action-chain planning.
exports.referenceState=function(g,world,move){
 const key=String(move.guid||'').toLowerCase(),state=g.passageStates?.get(key);
 if(state?.ready===false)return state;
 const cache=liveWorlds.get(world.sourceWorld||world),live=cache?.graph===g&&cache.paths.get(move.guid);
 if(!live||Date.now()-live.at>=30000||!W.alive(cache?.actors.get(key)?.actor)||state?.ready!==true)return {ready:false,block:{unknown:true,icon:'mechanism',label:'路书动作 · 等待读取当前机关',source:'roadbook-action'}};
 let path=live.path;
 const feature=cache.known.get(key)||g.observedPassages?.get(key);
 if(feature?.both&&R.dist(move.p,path.at(-1))+R.dist(move.end,path[0])<R.dist(move.p,path[0])+R.dist(move.end,path.at(-1)))path=path.slice().reverse();
 const match=(raw,p)=>!raw||R.dist({x:raw[0],y:raw[1],z:raw[2]},p)<=200;
 if(!match(move.referenceFirst,path[0])||!match(move.referenceLast,path.at(-1)))
  return {ready:false,block:{unknown:true,icon:'mechanism',label:'路书动作入口或落点已改变 · 需重新确认',source:'roadbook-action'}};
 const actor=cache.actors.get(key)?.actor;
 if(feature?.kind==='wallrun'&&nativeWallrun(actor)){
  const sides=wallrunBoxes(actor,path[0],path.at(-1));
  if(!sides||wallrunDirections(actor,sides).noForward||!triggerBoxVolume(sides.first))
   return {ready:false,block:{icon:'locked',label:'跑墙当前方向不可用',source:'live-mechanism'}};
 }
 return {...state,path};
};

exports.checkJob=checkJob;exports.liveRouteJob=liveRouteJob;
exports.recastContext=recastContext;exports.resetRecast=()=>{for(const g of recastContexts.values()){resetLadders(g);g.clearLiveEdges();}recastContexts.clear();};
exports.placementBlock=placementBlock;
exports.loadedEndpoints=function(g,world){const cache=liveWorlds.get(world.sourceWorld||world);if(!cache||cache.graph!==g)return[];const out=[];
 for(const row of cache.paths.values())if(Date.now()-row.at<30000)out.push(row.path[0],row.path.at(-1));return out;
};
exports.placementEndpoints=function(g,world,start,goal){const cache=liveCache(g,world),distance=R.dist(start,goal);return[...cache.known.values()].filter(f=>f.path?.length>=2&&Math.min(...f.path.map(p=>R.dist(start,{x:p[0],y:p[1],z:p[2]}))+R.dist(goal,{x:f.path.at(-1)[0],y:f.path.at(-1)[1],z:f.path.at(-1)[2]}))<distance+6000).slice(0,32).flatMap(f=>[f.path[0],f.path.at(-1)].map(p=>({x:p[0],y:p[1],z:p[2]})));};
