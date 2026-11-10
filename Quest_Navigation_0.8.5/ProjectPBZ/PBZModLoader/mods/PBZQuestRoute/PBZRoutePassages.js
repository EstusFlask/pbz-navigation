'use strict';
const R = require('./PBZRouteCore');
const W = require('./PBZRouteWorld');
const UE = require('ue');
const LiveLinks = require('./PBZLiveLinks');
const classCatalog = require('./PBZPassageClasses').classes;
const ladderStates = new WeakMap();
function resetLadders(g) {
  ladderStates.delete(g);g.openPassages.clear();g.passageRevision++;
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
      if(typeof actor.bTriggered!=='boolean')continue;
      const moving=[actor.HookTimelineComponent,actor.LadderTimelineComponent]
        .some(t=>W.alive(t)&&typeof t.IsPlaying==='function'&&t.IsPlaying());
      state.observed.set(key,actor.bTriggered&&!moving);
    }
  }
  const opened=new Set(state.saved);
  for(const [key,ready] of state.observed){if(ready)opened.add(key);else opened.delete(key);}
  if(opened.size===g.openPassages.size&&[...opened].every(key=>g.openPassages.has(key)))return false;
  g.openPassages=opened;g.passageRevision++;return true;
}
const labels = {
  lift: ['乘升降梯', 'Ride lift'], wallrun: ['沿墙跑到对面', 'Run along wall'],
  ascent: ['向上攀跑', 'Run up wall'], mantle: ['翻上平台', 'Climb onto ledge'],
  fall: ['跳下', 'Drop down'], ladder: ['攀梯', 'Use ladder'], drop: ['沿壁滑下', 'Slide down wall'],
  slide: ['沿坡滑下', 'Slide down slope'], zipline: ['滑索', 'Ride zipline'],
  rappel: ['沿绳下降', 'Rappel'], swing: ['抓绳荡过', 'Swing across']
};
function title(move) {
  const english = /^en/i.test(String(UE.KismetInternationalizationLibrary?.GetCurrentLanguage?.() || 'zh'));
  if(move.fold) return english ? 'Folding ladder · lower first' : '折梯 · 需先放下';
  if(move.scripted) return english ? 'Transport · requires activation' : '升降装置 · 需触发';
  const key=({2:'ladder',3:'ascent',6:'drop'})[move.kind]||move.kind;
  return labels[key]?.[english ? 1 : 0] || '';
}
function support(world,p,below=105) {
  const hit=world.hit({...p,z:p.z+68},{...p,z:p.z-below});
  return hit&&!hit.penetrating&&hit.nz>=world.normal-.025?hit.point:null;
}
function landing(world,p,kind) {
  const below=['swing','rappel','zipline','wallrun'].includes(kind)?475:kind==='lift'?100:240;
  const q=support(world,p,below);
  return q&&p.z-q.z<=below&&q.z-p.z<=68?q:null;
}
function sweep(...args){const task=sweepJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function approach(...args){const task=approachJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function check(...args){const task=checkJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function* sweepJob(world,a,b) {
  const start=support(world,a),end=support(world,b);
  if(!start||!end||Math.abs(start.z-a.z)>85||Math.abs(end.z-b.z)>85)return null;
  const count=Math.max(1,Math.ceil(R.dist(start,end)/52)),points=[start];let last=start;
  for(let i=1;i<=count;i++){yield;
    const expected=R.lerp(start,end,i/count),step=world.step(last,expected,true);
    if(!step.p||Math.abs(step.p.z-expected.z)>82)return null;
    points.push(step.p);last=step.p;
  }
  return Math.abs(last.z-end.z)<52?points:null;
}
function* approachJob(world,pad,anchor,mode) {
  const run=R.xy(pad,anchor);
  const handleHeight=['swing','rappel','zipline','wallrun'].includes(mode)?475:240;
  // A distant fallback pad must actually lead to the interaction's approach.
  // Sample on the player's side of the wall, not inside an authored wall face.
  const reach=['wallrun','ascent','mantle','ladder','swing'].includes(mode)?90:35;
  const near=R.lerp(anchor,pad,Math.min(1,reach/(run||1)));
  const end=support(world,near,handleHeight);
  if(!end||Math.abs(near.z-end.z)>handleHeight||Math.abs(pad.z-end.z)>100+run*.85)return false;
  return !!(yield* sweepJob(world,pad,end));
}
function* checkJob(world,edge) {
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
function* checkedWalkJob(world,a,b,nativeWalk){
  if(R.dist(a,b)<1)return [a,b];
  if(R.dist(a,b)<850){const direct=yield* sweepJob(world,a,b);if(direct)return direct;}
  yield;const leg=nativeWalk(a,b);yield;
  if(!leg||!leg.points.length)return null;
  const first=leg.points[0],last=leg.points[leg.points.length-1];
  return R.xy(first,a)<80&&R.xy(last,b)<90&&Math.abs(first.z-a.z)<105&&Math.abs(last.z-b.z)<110?leg.points:null;
}
function placedCurve(actor,kind){
  const worldSpace=UE.ESplineCoordinateSpace.World;
  function component(name){const c=actor[name];return W.alive(c)?c:null;}
  function location(name){const c=component(name);return c?W.plain(c.K2_GetComponentLocation()):null;}
  function curve(name,midpoint=false){
    const c=component(name);if(!c||typeof c.GetSplineLength!=='function')return [];
    const length=c.GetSplineLength();if(!Number.isFinite(length)||length<1||length>180000)return [];
    if(midpoint)return [W.plain(c.GetLocationAtDistanceAlongSpline(length*.5,worldSpace))];
    const count=Math.min(420,Math.max(1,Math.ceil(length/120))),points=[];
    for(let i=0;i<=count;i++)points.push(W.plain(c.GetLocationAtDistanceAlongSpline(length*i/count,worldSpace)));
    return points;
  }
  const root=W.plain(actor.K2_GetActorLocation());let result;
  switch(kind){
   case 'lift':case 'slide':result=curve('Spline');break;
   case 'rappel':case 'zipline':result=curve('RopeSpline');if(!result.length)result=curve('RopeSplineComponent');break;
   case 'wallrun':result=curve('LowSpline');break;
   case 'ascent':result=[root,...curve('EdgeSpline',true)];break;
   case 'mantle':result=[root,...curve('FrontEdgeSpline',true),...curve('BackEdgeSpline',true)];break;
   case 'drop':result=[...curve('EdgeSpline',true),...curve('EndEdgeSpline',true)];break;
   case 'ladder':result=[location('BottomCollision'),location('TopCollision')];break;
   case 'swing':result=[location('BoxA'),location('BoxB')];break;
   default:return null;
  }
  if(result.length<2||!result.every(R.finite)||R.dist(result[0],result[result.length-1])<36)return null;
  if(['rappel','zipline','drop','slide'].includes(kind)&&result[0].z<result[result.length-1].z)result.reverse();
  return result;
}
function updateLoaded(g,world,pawn,nativeWalk) {
  if(!g||!world||!pawn||!UE.Class?.Load||!UE.GameplayStatics?.GetAllActorsOfClass)return;
  let cache=liveWorlds.get(world);
  if(!cache){
    const byClass=new Map(classCatalog.map(c=>[c.classPath,{definition:c,items:new Map()}]));
    for(const item of g.actors){
      if(!item.classPath||!byClass.has(item.classPath))continue;
      byClass.get(item.classPath).items.set(item.guid.toLowerCase(),item);
    }
    cache={classes:[...byClass],index:0,next:0,paths:new Map(),tried:new Map()};liveWorlds.set(world,cache);
  }
  const now=Date.now();
  if(now<cache.next||!cache.classes.length)return;
  cache.next=now+(cache.index===cache.classes.length-1?2500:650);
  const [asset,{items,definition}]=cache.classes[cache.index];cache.index=(cache.index+1)%cache.classes.length;
  if(!classObjects.has(asset)){
    // Only request a class package if this map actually places that class.
    // Additional subclasses of an already loaded family can still be discovered.
    let resident=null;
    try{resident=UE.Class.Find?.(asset);}catch(_){}
    if(!resident&&!items.size)return;
    const resolved=resident||UE.Class.Load(asset);
    if(!resolved)return;
    classObjects.set(asset,resolved);
  }
  const cls=classObjects.get(asset);if(!cls)return;
  const P=require('puerts'),out=P.$ref(undefined);
  UE.GameplayStatics.GetAllActorsOfClass(pawn,cls,out);
  const found=P.$unref(out);
  let sampled=false;
  for(let i=0;i<(found?.Num()||0);i++){
    const actor=found.Get(i);if(!W.alive(actor))continue;
    const guid=String(actor.GetName()),key=guid.toLowerCase();let item=items.get(key)||g.observedPassages.get(key);
    if(item&&!item.conditional)continue;
    if(sampled||(cache.tried.get(guid)||0)>now||R.dist(world.feet(),W.plain(actor.K2_GetActorLocation()))>16000)continue;
    sampled=true;cache.tried.set(guid,now+25000);
    let path=placedCurve(actor,definition.kind);
    if(!path&&item?.local){const transform=actor.GetTransform?.()||actor.K2_GetActorTransform?.();
     if(transform)path=item.local.map(q=>W.plain(UE.KismetMathLibrary.TransformLocation(transform,new UE.Vector(...q))));}
    if(!path||!path.every(R.finite))continue;
    if(!item){
     item={...definition,guid,fold:definition.kind==='ladder'||definition.fold,conditional:true,path:path.map(p=>[p.x,p.y,p.z])};
     if(g.observedPassages.size>=240)continue;g.observedPassages.set(key,item);
    }
    cache.paths.set(item.guid,{path,at:now});
    if(nativeWalk)LiveLinks.attach(g,item,path,p=>landing(world,p,item.kind),(a,b)=>checkedWalk(world,a,b,nativeWalk));
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
function* liveRouteJob(g,world,start,goal,nativeWalk) {
  if(R.dist(start,goal)>19000)return null;
  const candidates=[];
  let work=0;for(const feature of [...g.actors,...g.observedPassages.values()]) {if((++work&7)===0)yield;
    if(!feature.conditional||!feature.path)continue;
    if(!g.canTraverse(feature))continue;
    for(const reverse of feature.both?[false,true]:[false]){
      const live=liveWorlds.get(world)?.paths.get(feature.guid);
      const original=live&&Date.now()-live.at<20000?live.path:feature.path.map(v=>({x:v[0],y:v[1],z:v[2]}));
      const path=reverse?original.slice().reverse():original;
      const score=R.dist(start,path[0])+R.dist(goal,path[path.length-1]);
      if(score<22000)candidates.push({feature,path,score});
    }
  }
  for(const {feature,path} of candidates.sort((a,b)=>a.score-b.score).slice(0,6)) {
    const entry=landing(world,path[0],feature.kind),exit=landing(world,path[path.length-1],feature.kind);
    if(!entry||!exit)continue;
    yield;const first=yield* checkedWalkJob(world,start,entry,nativeWalk);if(!first)continue;
    const last=yield* checkedWalkJob(world,exit,goal,nativeWalk);if(!last)continue;
    const actorPath=path.map((p,i)=>feature.kind==='lift'&&i?{...p,liftTravel:true}:p);
    const points=[...first,...actorPath,...last],move={kind:feature.kind,p:entry,end:exit,guid:feature.guid,fold:feature.fold&&!g.openPassages.has(feature.guid.toLowerCase()),scripted:feature.kind==='lift'&&!feature.both};
    const walks=[];for(let i=1;i<points.length;i++)if(i<first.length||i>=first.length+actorPath.length)walks.push({a:points[i-1],b:points[i],from:i-1,to:i,edge:-1});
    return {legs:[{world:g.name,points,moves:[move],gates:[],checks:[],walks,meters:R.extent(points)/100}],transfer:null};
  }
  return null;
}
exports.title=title;
exports.check=check;
exports.isLookout=isLookout;
exports.liveRoute=liveRoute;
exports.updateLoaded=updateLoaded;
exports.refreshLadders=refreshLadders;
exports.resetLadders=resetLadders;

exports.checkJob=checkJob;exports.liveRouteJob=liveRouteJob;
