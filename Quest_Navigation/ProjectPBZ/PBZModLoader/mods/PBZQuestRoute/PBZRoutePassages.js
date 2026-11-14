'use strict';
const R = require('./PBZRouteCore');
const W = require('./PBZRouteWorld');
const UE = require('ue');
const LiveLinks = require('./PBZLiveLinks');
const Transitions=require('./PBZRouteTransitions'),Feasible=require('./PBZRouteFeasibility'),Local=require('./PBZRouteLocalWalk');
const classCatalog = require('./PBZPassageClasses').classes;
const Mechanisms=require('./PBZRouteMechanisms');
const TraversalGeometry=require('./PBZRouteTraversalGeometry');
const ladderStates = new WeakMap();
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
  const key=({2:'ladder',3:'ascent',6:'drop'})[move.kind]||move.kind;
  if(key==='ladder'&&move.p&&move.end&&move.end.z<move.p.z-80)return english?'Descend the ladder':'沿梯下降';
  return labels[key]?.[english ? 1 : 0] || '';
}
function support(world,p,below=105) {
  if(world.floorAt){const q=world.floorAt(p,true);if(q&&q.z-p.z<=180&&p.z-q.z<=below)return q;}
  const hit=world.hit({...p,z:p.z+68},{...p,z:p.z-below});
  return hit&&!hit.penetrating&&hit.nz>=world.normal-.025?hit.point:null;
}
function landing(world,p,kind) {
  const below=['hook','swing','rappel','zipline','wallrun','pole','walljump','boarding'].includes(kind)?475:kind==='lift'?100:240;
  const q=support(world,p,below);
  return q&&p.z-q.z<=below&&q.z-p.z<=180?q:null;
}
function sweep(...args){const task=sweepJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function approach(...args){const task=approachJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function check(...args){const task=checkJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function* sweepJob(world,a,b) {
  const start=support(world,a),end=support(world,b);
  if(!start||!end||Math.abs(start.z-a.z)>200||Math.abs(end.z-b.z)>200)return null;
  const count=Math.max(1,Math.ceil(R.dist(start,end)/52)),points=[start];let last=start;
  for(let i=1;i<=count;i++){yield;
    const expected=R.lerp(start,end,i/count),step=world.step(last,expected,false);
    if(!step.p)return null;
    points.push(step.p);last=step.p;
  }
  return Math.abs(last.z-end.z)<52?points:null;
}
function* approachJob(world,pad,anchor,mode) {
  const run=R.xy(pad,anchor);
  const handleHeight=['hook','swing','rappel','zipline','wallrun','pole','walljump','boarding'].includes(mode)?475:240;
  // A distant fallback pad must actually lead to the interaction's approach.
  // Sample on the player's side of the wall, not inside an authored wall face.
  const reach=['wallrun','ascent','mantle','ladder','swing','hook','vault','walljump','pole','boarding'].includes(mode)?90:35;
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
   const points=checked.leg.points,end=points[points.length-1];
   if(R.dist(end,b)>1){const join=yield* sweepJob(world,end,b);if(!join)return null;return [...points,...join.slice(1)];}
   return points;
  };
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
function placedCurve(actor,kind){
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
   case 'wallrun':result=curve('LowSpline');if(result.length<2)result=TraversalGeometry.extract(actor,kind,{location,curve,point:W.plain});break;
   case 'ascent':result=[location('BoxA')||location('Box')||root,...curve('EdgeSpline',true)];
    if(result.length<2){const end=location('EndPositionStatic');if(end)result=[location('Box')||root,end];}break;
   case 'mantle':result=[location('FrontCollision')||root,...curve('FrontEdgeSpline',true),...curve('BackEdgeSpline',true)];break;
   case 'drop':{const top=location('TopCollision');result=[...(top?[top]:[]),...curve('EdgeSpline',true),...curve('EndEdgeSpline',true)];break;}
   case 'ladder':result=[location('BottomCollision'),location('TopCollision')];break;
   case 'swing':result=[location('ASide')||location('BoxA'),location('BSide')||location('BoxB')];break;
   case 'hook':result=[location('TriggerSphere')||location('TriggerBox'),location('GrabPoint'),location('LandArea')];break;
   default:result=TraversalGeometry.extract(actor,kind,{location,curve,point:W.plain});
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
    cache={graph:g,classes:[...byClass],index:0,next:0,paths:new Map(),tried:new Map(),actors:new Map(),nextStates:0,known};liveWorlds.set(world,cache);
  }
  return cache;
}
function readState(g,cache,actor,item,pawn,world){
 const key=String(item.guid).toLowerCase(),states=g.passageStates||=new Map();
 if(item.kind==='ladder'&&typeof actor.bFold==='boolean'&&item.fold!==actor.bFold){
  item.fold=actor.bFold;if(item.fold)g.foldedPassages?.add(key);else g.foldedPassages?.delete(key);
  g.passageRevision=(g.passageRevision||0)+1;
 }
 cache.actors.set(key,{actor,item});
 const state=Mechanisms.inspect(actor,item,{UE,pawn,point:W.plain,...world.requirements}),old=states.get(key);
 if((old&&JSON.stringify(old)!==JSON.stringify(state))||(!old&&!state.ready))g.passageRevision=(g.passageRevision||0)+1;
 states.set(key,state);return state;
}
function retainPlacedObservation(g,item,path){
 if(item.source!=='game-placement')return;
 const key=String(item.guid).toLowerCase();
 if(g.observedPassages.has(key)||g.observedPassages.size<240)
  g.observedPassages.set(key,{...item,path:path.map(p=>[p.x,p.y,p.z])});
}
function refreshStates(g,world,pawn,force=false){
 const cache=liveWorlds.get(world?.sourceWorld||world);if(!g||!cache||cache.graph!==g)return false;
 const now=Date.now();if(!force&&now<cache.nextStates)return false;cache.nextStates=now+900;
 const before=g.passageRevision,feet=world.feet(),rows=[...cache.actors.values()];let count=0;
 for(let i=0;i<Math.min(256,rows.length);i++){
  const index=(cache.stateCursor||0)%rows.length,{actor,item}=rows[index];cache.stateCursor=(index+1)%rows.length;
  if(!W.alive(actor))continue;
  const path=cache.paths.get(item.guid)?.path;
  if(path&&R.dist(feet,path[0])>16000)continue;
  readState(g,cache,actor,item,pawn,world);if(++count>=64)break;
 }
 return before!==g.passageRevision;
}
function* refreshLoadedJob(g,world,pawn,start,goal,options={}){
 if(!g||!world||!pawn||!UE.Class||!UE.GameplayStatics?.GetAllActorsOfClass)return;
 const cache=liveCache(g,world),now=Date.now();
 const rank=row=>Math.min(50000,...[...row[1].items.values()].map(a=>{
  const p=a.path?.[0]||a.at;if(!p)return 50000;const q={x:p[0],y:p[1],z:p[2]};return Math.min(R.dist(start,q),R.dist(goal,q));}));
 const classes=cache.classes.slice().sort((a,b)=>rank(a)-rank(b));
 const summary={resident:0,nearby:0,paths:0,kinds:{},missing:[]},seen=new Set();
 const P=require('puerts');
 for(const [asset,{definition,items}] of classes){
  let cls=classObjects.get(asset);
  if(!cls){try{cls=UE.Class.Find?.(asset);}catch(_){}
   if(cls)classObjects.set(asset,cls);yield;}
  if(!cls)continue;
  summary.resident++;
  const out=P.$ref(undefined);UE.GameplayStatics.GetAllActorsOfClass(pawn,cls,out);yield;
  const actors=P.$unref(out);
  for(let i=0;i<Math.min(256,actors?.Num()||0);i++){
   const actor=actors.Get(i);if(!W.alive(actor))continue;
   const guid=String(actor.GetName()),key=guid.toLowerCase(),location=W.plain(actor.K2_GetActorLocation());yield;
   if(seen.has(key))continue;seen.add(key);
   if(!R.finite(location)||Math.min(R.dist(start,location),R.dist(goal,location))>14000)continue;
   summary.nearby++;summary.kinds[definition.kind]=(summary.kinds[definition.kind]||0)+1;
   let item=items.get(key)||cache.known.get(key)||g.observedPassages.get(key);
   const cached=cache.paths.get(item?.guid||guid);if(cached&&now-cached.at<5000){summary.paths++;if(item)readState(g,cache,actor,item,pawn,world);continue;}
   let path=placedCurve(actor,definition.kind);
   if(!path&&item?.source==='game-placement'&&item.origin&&R.dist(location,{x:item.origin[0],y:item.origin[1],z:item.origin[2]})<25)
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
   cache.paths.set(item.guid,{path,at:now});items.set(key,item);yield;
   readState(g,cache,actor,item,pawn,world);retainPlacedObservation(g,item,path);
   if(item.fold){
    g.foldedPassages?.add(key);
    try{if(typeof actor.bTriggered==='boolean'){
     const moving=[actor.HookTimelineComponent,actor.LadderTimelineComponent].some(t=>W.alive(t)&&t.IsPlaying?.());
     const opened=actor.bTriggered&&!moving,old=g.openPassages.has(key);
     if(opened)g.openPassages.add(key);else g.openPassages.delete(key);
     if(old!==opened)g.passageRevision=(g.passageRevision||0)+1;
    }}catch(_){}
   }
  }
 }
 options.report?.('loaded actions',summary);
}
function updateLoaded(g,world,pawn,nativeWalk) {
  if(!g||!world||!pawn||!UE.Class?.Find||!UE.GameplayStatics?.GetAllActorsOfClass)return;
  const cache=liveCache(g,world);
  const now=Date.now();
  if(now<cache.next||!cache.classes.length)return;
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
  const found=P.$unref(out);
  let sampled=false;
  for(let i=0;i<(found?.Num()||0);i++){
    const actor=found.Get(i);if(!W.alive(actor))continue;
    const guid=String(actor.GetName()),key=guid.toLowerCase();let item=items.get(key)||cache.known.get(key)||g.observedPassages.get(key);
    if(sampled||(cache.tried.get(guid)||0)>now||R.dist(world.feet(),W.plain(actor.K2_GetActorLocation()))>16000)continue;
    sampled=true;cache.tried.set(guid,now+25000);
    let path=placedCurve(actor,definition.kind);
    if(!path&&item?.local){const transform=actor.GetTransform?.()||actor.K2_GetActorTransform?.();
     if(transform)path=item.local.map(q=>W.plain(UE.KismetMathLibrary.TransformLocation(transform,new UE.Vector(...q))));}
    if(!path||!path.every(R.finite))continue;
    if(!item){
     let folded=!!definition.fold;
     if(definition.kind==='ladder'&&typeof actor.bFold==='boolean')folded=actor.bFold;
     item={...definition,guid,fold:folded,conditional:true,path:path.map(p=>[p.x,p.y,p.z])};
     if(g.observedPassages.size>=240)continue;g.observedPassages.set(key,item);
    }
    if(!cache.paths.has(item.guid))g.passageRevision=(g.passageRevision||0)+1;
    cache.paths.set(item.guid,{path,at:now});
    readState(g,cache,actor,item,pawn,world);retainPlacedObservation(g,item,path);
    // Attachment runs in liveRouteJob after standing-pad and action checks;
    // a timer discovery must not install an unchecked movement arc.
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
  if(R.dist(start,goal)>19000)return null;
  const clock=options.clock||Date.now;
  const candidates=[],cache=liveWorlds.get(world.sourceWorld||world);
  const features=new Map([...g.actors,...(cache?.known.values()||[]),...g.observedPassages.values()].map(f=>[String(f.guid).toLowerCase(),f]));
  let work=0;for(const feature of features.values()) {if((++work&7)===0)yield;
    if(!feature.path)continue;
    const live=liveWorlds.get(world.sourceWorld||world)?.paths.get(feature.guid);
    if((feature.requiresLoaded||feature.conditional&&feature.local||feature.kind==='hook')&&(!live||Date.now()-live.at>=30000))continue;
    const path=live&&Date.now()-live.at<30000?live.path:feature.path.map(v=>({x:v[0],y:v[1],z:v[2]}));
    if(path.length<2||!path.every(R.finite))continue;
    const forward=R.dist(start,path[0])+R.dist(goal,path[path.length-1]);
    const backward=feature.both?R.dist(start,path[path.length-1])+R.dist(goal,path[0]):Infinity;
    const score=Math.min(forward,backward);if(score<26000)candidates.push({...feature,state:g.passageStates?.get(String(feature.guid).toLowerCase()),runtimePath:path,score});
  }
  options.report?.('action candidates',{count:candidates.length,start,goal});
  return yield* Transitions.route({name:g.name,world,start,goal,goals:options.goals,clock,deadline:options.deadline,maxConnectors:options.maxConnectors,
   allowPartial:options.allowPartial,onPartial:options.onPartial,
   onAction:function*(action,settings){
    const linked=yield* LiveLinks.attachCheckedJob(g,action,(a,b)=>checkedWalkJob(world,a,b,nativeWalk,{graph:g,clock,deadline:settings.deadline}),{clock,deadline:settings.deadline});
    if(linked)options.report?.('action attached',{guid:action.feature.guid,kind:action.feature.kind,entry:action.entry,exit:action.exit});
   },
   features:candidates.sort((a,b)=>a.score-b.score),canTraverse:f=>f.state?.ready!==false&&g.canTraverse(f),onClosed:options.onClosed,report:options.report,
   landing:function*(feature,p,side){
    const direct=landing(world,p,feature.kind);yield;if(direct&&!world.hit?.(direct,direct,true))return direct;
    for(const row of feature[side]||[]){const raw=row[1],q=world.floorAt({x:raw[0],y:raw[1],z:raw[2]},true);yield;
     if(q&&!world.hit?.(q,q,true)&&R.dist(q,p)<2000&&(feature.kind==='lift'||(yield* approachJob(world,q,p,feature.kind))))return q;}
    for(let i=0;i<8;i++){const angle=i*Math.PI/4;
     const q=landing(world,{x:p.x+Math.cos(angle)*90,y:p.y+Math.sin(angle)*90,z:p.z},feature.kind);yield;
     if(q&&!world.hit?.(q,q,true)&&(yield* approachJob(world,q,p,feature.kind)))return q;}
    return null;
   },
   validate:function*(a){return yield* checkJob(world,{kind:9,mode:a.feature.kind,guid:a.feature.guid,a:a.entry,b:a.exit,first:a.path[0],last:a.path[a.path.length-1]});},
   walk:function*(a,b,settings){
    const samples={graph:g,clock,deadline:settings.deadline};let points=yield* checkedWalkJob(world,a,b,nativeWalk,samples);
    if(points)return {points,meters:R.extent(points)/100};
    if(!settings.local||R.dist(a,b)>4500)return null;
    const vertical=Math.abs(a.z-b.z)>200;
    const local=yield* Local.search(world,a,b,{clock,maxMs:Math.max(1,Math.min(vertical?2400:1200,settings.deadline-clock())),
     maxNodes:vertical?1800:1000,waypoints:samples.waypoints});
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
 if(!live||Date.now()-live.at>=30000||state?.ready!==true)return {ready:false,block:{unknown:true,icon:'mechanism',label:'路书动作 · 等待读取当前机关',source:'roadbook-action'}};
 let path=live.path;
 const feature=cache.known.get(key)||g.observedPassages?.get(key);
 if(feature?.both&&R.dist(move.p,path.at(-1))+R.dist(move.end,path[0])<R.dist(move.p,path[0])+R.dist(move.end,path.at(-1)))path=path.slice().reverse();
 const match=(raw,p)=>!raw||R.dist({x:raw[0],y:raw[1],z:raw[2]},p)<=200;
 if(!match(move.referenceFirst,path[0])||!match(move.referenceLast,path.at(-1)))
  return {ready:false,block:{unknown:true,icon:'mechanism',label:'路书动作入口或落点已改变 · 需重新确认',source:'roadbook-action'}};
 return {...state,path};
};

exports.checkJob=checkJob;exports.liveRouteJob=liveRouteJob;
