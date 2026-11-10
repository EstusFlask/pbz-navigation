"use strict";
const UE=require('ue'),P=require('puerts'),T=require('Library/TsHelper').default,Groups=require('Library/MapAreaGroups');
const R=require('./PBZRouteCore'),Surface=require('./PBZRouteSurface'),W=require('./PBZRouteWorld');
const {Threads}=require('./PBZPrivateRibbon'),{Ink}=require('./PBZRouteInk'),{Picker}=require('./PBZRoutePicker');
const {pickItem,mapIntent}=require('./PBZRouteItems'),{Arrival}=require('./PBZRouteArrival');
const {Tracker}=require('./PBZRouteTracker'),{Pointer}=require('./PBZRoutePointer');
const Passages=require('./PBZRoutePassages'),Obstacles=require('./PBZRouteObstacles'),Drops=require('./PBZRouteDrops');
const planning=new (require('./PBZRouteJobs').Planner)(log);
const auditor=new Obstacles.Auditor();let guardedLeg=null,guardRetry=0,guardBudget=null,blockedTrip=null,nativeRepairKey='',lastGuardVersion=-1;
const {questIdentity,QuestGate}=require('./PBZRouteSelection');
const questGate=new QuestGate();
const {ItemConfirm}=require('./PBZRouteConfirm'),{MinimapRoute}=require('./PBZRouteMinimap');
const {MapPress}=require('./PBZRouteControls'),{Scout}=require('./PBZRouteScout'),tables=require('./PBZRouteTables').data,BUILD='0.8.5-menu-test1';
const S={cfg:{LargeItemIcons:true,AutoAccessory:true,MapRoute:true,MinimapRoute:true,WorldThread:true,FogBellSense:true,DisplayMode:'Always'},pawn:null,world:null,level:'',area:'',trip:null,line:[],manual:null,scout:null,version:0,lockVersion:0,expires:0,active:0,contextEpoch:0,arrival:new Arrival()};
const atlas=new (require('./PBZRouteAtlas').AtlasCache)(id=>require(id),(data,faces)=>new R.Graph(data,faces),log);
const graphs=atlas.graphs,maps=new WeakMap(),forbidden={},passed={},notes=[],history=new Map();
let dir='',logPath='',mousePath='',ink,threads,previous=null,lastPoll=0,lastCfg=0,lastBells=0,permitted=[],lastSolve=0,oldWorld='',oldLocks='',lockRows=[],menu=false,serial=0;
let previousID=null,pending=null,epoch=0,listenerSource=null,listener=null,scout,lastScout=0,retry=0;
let deviationSince=0,corridor=null;
const failedEdges=new Map();
const provenJoins=new Map();
const confirmations=new WeakMap();let mini=null;
const pointers=new WeakMap(),pads=new WeakMap();let tracker=null,waitingTracker=null,gameContext=null,lastPlayerCheck=0;
const low=v=>String(v||'').toLowerCase(),xyz=p=>({x:p.X,y:p.Y,z:p.Z}),toPoint=a=>({x:a[0],y:a[1],z:a[2]});
function log(k,s){if(history.get(k)===s)return;history.set(k,s);notes.push(new Date().toISOString()+' '+k+' '+s);if(notes.length>130)notes.shift();console.log('[PBZQuestRoute] '+k+' '+s);
 if(logPath)try{UE.EasyCsv.SaveStringToFileWithFullPath(notes.join('\n')+'\n',logPath);}catch(_){}}
function safe(k,fn){try{return fn();}catch(e){log('error '+k,String(e)+' '+String(e.stack||'').split('\n').slice(1,2).join(''));}}
function textFile(path){const out=P.$ref('');return UE.BlueprintPathsLibrary.FileExists(path)&&UE.EasyCsv.LoadStringFromLocalFile(path,out)?String(P.$unref(out)):'';}
function settings(force=false){const now=Date.now();if(!force&&now-lastCfg<900)return;lastCfg=now;const old=S.cfg,cfg={...old};
 for(const line of textFile(dir+'Paks/~mods/PBZQuestRoute.txt').split(/\r?\n/)){const m=/^\s*(LargeItemIcons|AutoAccessory|MapRoute|MinimapRoute|WorldThread|DisplayMode|FogBellSense)\s*=\s*(\w+)/.exec(line);if(m)cfg[m[1]]=m[1]==='DisplayMode'?(/^Sense30$/i.test(m[2])?'Sense30':'Always'):/^(on|1|true)$/i.test(m[2]);}
 S.cfg=cfg;if(JSON.stringify(old)!==JSON.stringify(cfg))log('settings',JSON.stringify(cfg));}
function show(){return S.cfg.DisplayMode==='Always'||Date.now()<S.expires;}
function graph(world){return tables.worlds.includes(world)?atlas.get(world,[S.level,S.manual?.world]):null;}
function worldOf(area){const row=tables.areas[low(area)];if(row?.world)return row.world;if(low(area)===S.area)return S.level;return W.norm(UE.BellManager.GetMapData(area)?.LevelName);}
function narrative(){return UE.PBZBlueprintFunctionLibrary.GetPBZNarrativeComp(S.pawn);}
function questID(n){const q=n?.GetTrackedQuest();return W.alive(q)?questIdentity(q,n.GetTrackedPointTaskID()):'';}
function tracked(n){
 const identity=questID(n);if(!identity)return null;
 const id=P.$ref(''),loc=P.$ref(undefined);if(!n.GetActiveTrackingPointResolved(id,loc))return null;
 const p=W.plain(P.$unref(loc)),area=low(P.$unref(id));return R.finite(p)?{p,area,world:worldOf(area),key:'task:'+identity,identity}:null;
}
function bind(n){
 if(listenerSource===n)return;unbind();
 if(W.alive(n)&&n.OnQuestTrackingChanged){
  listenerSource=n;listener=()=>safe('quest changed',()=>{
   const key=questID(n),stale=pending&&pending.epoch!==epoch;
   const changed=questGate.observe(key);
   if(!stale&&key&&(pending||changed)){tracker?.clear('quest selected');S.manual=null;S.scout=null;previous=null;}
   previousID=key;pending=null;if(S.world)observe();
  });n.OnQuestTrackingChanged.Add(listener);
 }
}
function unbind(){if(W.alive(listenerSource)&&listener){listenerSource.OnQuestTrackingChanged.Remove(listener);}listenerSource=null;listener=null;}
function chooseUI(proto,method,journal){
 const orig=proto?.[method];if(typeof orig!=='function')return;
 proto[method]=function(...args){
  if(journal&&this.questTrackToggleTimer!==undefined)return orig.apply(this,args);
  let handled=false;
  safe('quest selection',()=>{
   const data=journal?this.findQuestHit(this.questHoveredSlotID):args[0];if(!data?.questObjName||data.isAcceptPoint)return;
   const n=UE.PBZBlueprintFunctionLibrary.GetPBZNarrativeComp(this);
   if(!W.alive(n))return;let q=journal?this.findQuestByObjName(n,data.questObjName):null;
   if(!q)for(const item of n.QuestList){if(item?.GetName()===data.questObjName){q=item;break;}}
   if(!q)return;
   const same=n.IsPointTracked(q,data.branchID||'',data.taskPointID||'');
   const wasPaused=questGate.paused;questGate.choose(questID(n));
   S.arrival.restart();
   tracker?.clear('quest selected');
   if(!S.manual&&!S.scout&&!wasPaused){pending={epoch,at:Date.now()};return;}
   epoch++;pending=null;S.manual=null;S.scout=null;previous=null;
   // A pin temporarily takes ownership, even when the game still tracks this
   // very point. Adopt the point explicitly instead of invoking vanilla toggle.
   if(!same)n.SetTrackedPoint(q,data.branchID||'',data.taskPointID||'');
   handled=true;previousID=questID(n);if(S.world)observe();
   if(journal){this.playQuestPointClickSound?.();this.updateQuestActionPrompt?.(data);}
   else{this.refreshTrackedHighlight?.();this.refreshQuestActionPrompt?.(true);}
  });
  if(!handled)return orig.apply(this,args);
 };
}
function bellList(force=false){if(!S.world)return [];if(!force&&Date.now()-lastBells<1800)return permitted;lastBells=Date.now();
 const bm=T.getWorldSubsystem(S.pawn,UE.BellManager.StaticClass()),ids=[],disabled=new Set();
 for(const [v,callback] of [[bm.ActivateBellIDs,s=>ids.push(s)],[bm.DisableTeleportBellIDs,s=>disabled.add(s)]]){const n=v?.Num()||0;for(let i=0;i<n;i++)callback(low(v.Get(i)));}
 permitted=ids.filter(k=>!disabled.has(k)&&!k.startsWith('brokenbell')).map(k=>tables.bells[k]).filter(Boolean);return permitted;}
function locks(){const ms=T.getWorldSubsystem(S.pawn,UE.MapSubsystem.StaticClass()),mp=ms.LockObjectInfos,objs=[];
 for(const area of Object.keys(tables.areas)){const groups=mp.GetRef(area)?.MapLockGroups;if(!groups)continue;
  for(const layer of [0,1,2,3]){const list=groups.GetRef(layer)?.LockObjArray;for(let j=0;j<(list?.Num()||0);j++){const o=list.Get(j);if(o)objs.push([area,o]);}}}
 const out=[];for(const [area,o] of objs){if(!W.alive(o))continue;
  const guid=String(o.GuidString);if(o.bUnLocked)continue;
  const p=xyz(o.ActorLocation);if(!R.finite(p))continue;
  const door=/door|gate|men_|shanzhai/i.test(guid),mech=/blocker|chain|switch|barrier/i.test(guid);if(!door&&!mech)continue;
  const directional=!!UE.DoorDirLockObject&&o.IsA(UE.DoorDirLockObject.StaticClass());
  const keyed=!!UE.SwitchLockObject&&o.IsA(UE.SwitchLockObject.StaticClass())&&(o.NeedItems?.Num()||0)>0;
  out.push({id:guid,p,world:worldOf(area),icon:directional?'locked':keyed?'keylock':'mechanism',label:directional?'单向门':keyed?'需解锁物品':door?'门闩未开':'机关待解锁'});}
 const tag=out.map(x=>x.id).sort().join('|');if(tag!==oldLocks){oldLocks=tag;S.lockVersion++;}lockRows=out;return out;}
function markLocks(trip){R.markLocks(trip,lockRows);}
function* proofJob(leg,lookout){
 const weak=leg.checks.filter(c=>c.kind===8||c.kind===9||lookout&&c.kind===5);
 if(leg.world!==S.level)return weak.length?weak[0].edge:null;
 const w=S.world,foot=w.feet(),good=passed[leg.world]||=new Set();let count=0;
 const reject=(c,hit,unknown)=>{Obstacles.obstacle(leg,Obstacles.mark(leg,c,'passage check',hit,unknown));return c.edge;};
 // Verify every conditional connection before displaying the leg. The older
 // 85 m / 12-check streaming budget does not certify one of these gaps.
 const replacements=[];
 for(const c of weak){yield;
  const key=leg.world+'/'+c.edge, cached=provenJoins.get(key),now=Date.now();
  let value=cached&&cached.until>now?cached.value:null;
  if(!value){value=yield* Passages.checkJob(w,c);if(!value)return reject(c,null,true);
   provenJoins.set(key,{value,until:now+15000});}
  if(c.kind===8&&Array.isArray(value)){
   const points=R.dist(value[0],c.a)<=R.dist(value[0],c.b)?value:value.slice().reverse();
   replacements.push({from:c.from,points});
  }
 }
 for(const r of replacements.sort((a,b)=>b.from-a.from)){
  const extra=r.points.slice(1,-1),at=r.from+1;
  leg.points.splice(at,0,...extra);
  for(const c of [...(leg.moves||[]),...leg.checks]){
   if(c.from!==undefined&&c.from>=at)c.from+=extra.length;
   if(c.to!==undefined&&c.to>=at)c.to+=extra.length;
  }
 }
 if(replacements.length){leg.meters=R.extent(leg.points)/100;for(const c of leg.walks||[]){c.from=leg.points.indexOf(c.a);c.to=leg.points.indexOf(c.b);}}
 for(const c of leg.checks)if(c.kind===12){
  if(R.dist(foot,c.a)>6000){Obstacles.obstacle(leg,Obstacles.mark(leg,c,'drop landing pending',c.a,true));continue;}
  const result=yield* Drops.inspect(w,c.a,c.b);
  if(!result.ok){Obstacles.obstacle(leg,Obstacles.mark(leg,c,result.why,result.p,result.unknown));return c.edge;}
  c.verified=true;
 }
 for(const cross of leg.checks){yield;if(cross.kind===8||cross.kind===9||cross.kind===10||cross.kind===11||cross.kind===12||lookout&&cross.kind===5||good.has(cross.edge)||R.dist(foot,cross.a)>8500||count>=12)continue;count++;
  if(lockRows.some(r=>r.world===leg.world&&R.dist(r.p,cross.a)<230)){good.add(cross.edge);continue;}
  const a=w.floorAt(cross.a,true),b=w.floorAt(cross.b,true);if(!a||!b)continue;
  if(Math.abs(a.z-cross.a.z)>140||Math.abs(b.z-cross.b.z)>150)continue;
  if(cross.kind===5){const steps=Math.max(1,Math.ceil(R.xy(a,b)/58));let p=a;
   for(let j=1;j<=steps;j++){yield;const next=w.step(p,R.lerp(a,b,j/steps),true);if(!next.p){return reject(cross,next.hit,!next.hit);}p=next.p;}
  }else{
   // Only an authored traversal has a descending counterpart. Verify body
   // clearance through the outward movement and the descent onto its landing.
   const mid={x:b.x,y:b.y,z:a.z+24};const hit=w.hit(a,mid,true)||w.hit(mid,b,true);if(hit)return reject(cross,hit.point,false);
  }good.add(cross.edge);}
 return null;
}
function reset(){planning.clear('world reset');auditor.reset();guardedLeg=null;blockedTrip=null;S.threadEnd=null;S.trip=null;S.line=[];S.scout=null;previous=null;S.version++;S.contextEpoch++;threads?.clear();ink?.clearAll();mini?.clearAll();S.arrival.probe=null;previousID=null;pending=null;lastScout=0;retry=0;deviationSince=0;corridor=null;for(const g of graphs.values())Passages.resetLadders(g);}
function setTrip(trip,dest,start,why){
 S.arrival.select(dest);deviationSince=0;corridor=null;
 if(S.targetKey!==dest.key){guardBudget=null;nativeRepairKey='';blockedTrip=null;}auditor.reset();guardedLeg=null;S.threadEnd=null;
 S.trip=trip;S.targetKey=dest.key;S.active=0;S.line=trip?.legs[0].points||[];S.version++;
 previous={key:dest.key,p:dest.p,site:start,level:S.level};lastSolve=Date.now();
 if(!trip){threads.hide();retry=Math.min(retry+1,4);log('route status',why+' '+dest.key+' from '+[start.x,start.y,start.z].map(Math.round).join(','));return;}
 retry=0;for(const leg of trip.legs)for(const c of leg.checks||[])if((c.kind===10||c.kind===11||c.kind===12)&&!c.verified)Obstacles.obstacle(leg,Obstacles.mark(leg,c,c.kind===11?'folded ladder':c.kind===12?'drop landing pending':'atlas seam',null,c.kind!==11));markLocks(trip);log('route '+S.version,why+' '+dest.key+' legs='+trip.legs.map(l=>l.world+':'+Math.round(l.meters)+'m').join(' + ')+' transfer='+(trip.transfer?trip.transfer.from.name+' -> '+trip.transfer.to.name:'walk')+' actions='+trip.legs.map(l=>(l.moves||[]).map(m=>m.kind).join('>')).filter(Boolean).join('/'));
}
function noRoute(){planning.cancel('no target');auditor.reset();guardedLeg=null;S.threadEnd=null;if(S.trip||S.line.length){S.trip=null;S.line=[];S.version++;threads.hide();}previous=null;}
function nativeWalk(start,goal,allowPartial=false){
 if(R.dist(start,goal)>20000)return null;
 const nav=UE.NavigationSystemV1;if(typeof nav?.FindPathToLocationSynchronously!=='function')return null;
 const path=nav.FindPathToLocationSynchronously(S.pawn,W.vec(start),W.vec(goal),S.pawn);
 if(!W.alive(path)||!path.IsValid())return null;const partial=path.IsPartial();if(partial&&!allowPartial)return null;
 const arr=path.PathPoints,points=[];for(let i=0;i<(arr?.Num()||0);i++)points.push(W.plain(arr.Get(i)));
 if(points.length<2||points.some(p=>!R.finite(p))||R.dist(start,points[0])>140||!partial&&(R.xy(goal,points[points.length-1])>140||Math.abs(goal.z-points[points.length-1].z)>110))return null;
 if(blockedTrip?.world===S.level&&blockedTrip.until>Date.now()&&Obstacles.crossesBlock(points,blockedTrip.p,blockedTrip.normal))return null;
 const leg={world:S.level,points,checks:[],gates:[],moves:[],walks:points.slice(1).map((b,i)=>({a:points[i],b,edge:-1,from:i,to:i+1})),meters:R.extent(points)/100,partial};
 if(partial)Obstacles.obstacle(leg,{id:'native-frontier',world:S.level,p:points[points.length-1],unknown:true,icon:'mechanism',label:'前方通路待确认'});return leg;
}
function* makePlan(dest,walkOnly=false,seams=false,drops=false){
 const a=graph(S.level),b=graph(dest.world),start=S.world.feet();if(!a||!b||!R.finite(dest.p))return null;
 safe('ladder state',()=>Passages.refreshLadders(a,S.pawn));if(b!==a)safe('ladder state',()=>Passages.refreshLadders(b,S.pawn,false));
 const starts=(yield* Surface.anchorsJob(a,start)),ends=dest.node!==undefined?[{id:dest.node,q:dest.p}]:(yield* Surface.anchorsJob(b,dest.p,true));
 const legs=new Map(),lookout=Passages.isLookout(S.level,start,dest);let fallback=null;
 yield;
 if(a===b&&!seams){const landing=dest.item&&ends.length?ends[0].q:dest.p;const local=safe('current scene route',()=>nativeWalk(start,landing));if(local)return {legs:[local],transfer:null};}
 const getJoin=s=>{if(!legs.has(s.id))legs.set(s.id,Surface.join(S.world,start,s));return legs.get(s.id);};
 const plan=function*(s,e,entry,nearPads=false){
  const restrictions=nearPads?{...forbidden,[a.name]:{has:k=>forbidden[a.name]?.has(k)||
   (a.e[k*6+2]===7&&a.actors[a.e[k*6+5]-1]?.conditional)}}:forbidden;
  for(let attempt=0;attempt<(nearPads?3:lookout?9:4);attempt++){
  const r=yield* R.itineraryJob(a,b,s.q,dest.item?e.q:dest.p,entry,restrictions,e.id,s.id);if(!r)return null;let rejected=false;
  const lead=getJoin(s);if(!lead)return null;const first=r.legs[0];first.points=[...lead.slice(0,-1),...first.points];first.meters=R.extent(first.points)/100;
  for(const c of first.checks)if(c.from!==undefined){c.from+=lead.length-1;if(c.to!==undefined)c.to+=lead.length-1;}
  for(const c of [...(first.walks||[]),...(first.moves||[])]){c.from+=lead.length-1;c.to+=lead.length-1;}
  first.walks=[...lead.slice(1).map((b,i)=>({a:lead[i],b,edge:-1,from:i,to:i+1})),...(first.walks||[])];
  for(const leg of r.legs){yield;const bad=yield* proofJob(leg,lookout);if(bad!==null){if(!leg.obstacles?.length){const c=leg.checks.find(c=>c.edge===bad);if(c)Obstacles.obstacle(leg,Obstacles.mark(leg,c,'unverified passage',null,true));}if(!fallback)fallback=r;(forbidden[leg.world]||=new Set()).add(bad);const special=leg.checks.some(c=>c.edge===bad&&(c.kind===8||c.kind===9||lookout&&c.kind===5));failedEdges.set(leg.world+'/'+bad,Date.now()+(special?45000:5500));rejected=true;break;}}
  if(!rejected)return r;}return null;
 };
 if(a===b){for(const s of starts)for(const e of ends){if(!a.sameComponent(s.id,e.id))continue;
  if(lookout){const near=yield* plan(s,e,[],true);if(near)return near;}
  const route=yield* plan(s,e,[]);if(route)return route;}
  const landing=dest.item&&ends.length?ends[0].q:dest.p;
  const live=safe('local navigation',()=>nativeWalk(start,landing));if(live)return {legs:[live],transfer:null};
  yield;const via=yield* Passages.liveRouteJob(a,S.world,start,landing,nativeWalk);if(via)return via;}
 if(walkOnly&&!dest.key)return null;
 if(!drops){
  yield* Drops.installJob(a);if(b!==a)yield* Drops.installJob(b);a.allowDrops=b.allowDrops=true;
  try{const lowered=yield* makePlan(dest,walkOnly,seams,true);if(lowered)return lowered;}finally{a.allowDrops=b.allowDrops=false;}
 }
 if(!walkOnly){const entry=bellList();for(const s of starts)for(const e of ends){const route=yield* plan(s,e,entry);if(route)return route;}}
 if(!seams){
  yield* Obstacles.installSeamsJob(a);if(b!==a)yield* Obstacles.installSeamsJob(b);a.allowSeams=b.allowSeams=true;a.allowBlockedTraverse=b.allowBlockedTraverse=true;
  try{const repaired=yield* makePlan(dest,walkOnly,true,drops);if(repaired)return repaired;}finally{a.allowSeams=b.allowSeams=false;a.allowBlockedTraverse=b.allowBlockedTraverse=false;}
 }
 if(fallback)return fallback;
 const partial=a===b?safe('partial navigation',()=>nativeWalk(start,dest.p,true)):null;
 return partial?{legs:[partial],transfer:null}:null;
}
function routeRequest(dest,start=S.world.feet()){
 return {key:dest.key,world:dest.world,level:S.level,p:dest.p,start,revision:(graphs.get(S.level)?.passageRevision||0)+'/'+S.lockVersion};
}
function solve(dest,reason){
 if(!S.world||!R.finite(dest.p)||!S.cfg.MapRoute&&!S.cfg.MinimapRoute&&!S.cfg.WorldThread)return;
 const start=S.world.feet(),request=routeRequest(dest,start),force=!previous;
 S.lookoutHint=Passages.isLookout(S.level,start,dest);
 const accepted=planning.request(request,()=>makePlan(dest,!!dest.bell),(trip,selected,metrics)=>{
  const current=S.manual||(!questGate.paused&&tracked(narrative()))||S.scout;
  if(!current||current.key!==selected.key||S.level!==selected.level||R.dist(current.p,selected.p)>190)return;
  // A failed route is a result. It stays stopped until selection, region,
  // destination, door/ladder state, or substantial movement actually changes.
  if(!trip&&blockedTrip?.key===dest.key&&blockedTrip.world===S.level)trip=blockedTrip.trip;
  setTrip(trip,dest,start,reason+' async cpu='+metrics.cpu+'ms wall='+metrics.wall+'ms');
  if(!trip&&planning.failed)planning.failed.revision=routeRequest(dest,start).revision;
 },force);
 if(accepted){
  previous={key:dest.key,p:{...dest.p},site:{...start},level:S.level};lastSolve=Date.now();
  if(!S.trip||S.targetKey!==dest.key){S.trip=null;S.line=[];S.targetKey=dest.key;S.version++;threads.hide();}
 }
}

function observe(){
 const foot=S.world.feet(),ms=T.getWorldSubsystem(S.pawn,UE.MapSubsystem.StaticClass());
 S.level=W.norm(UE.GameplayStatics.GetCurrentLevelName(S.pawn,true));
 const locID=low(ms.GetMapIDByLocation(W.vec(foot)));S.area=locID&&locID!=='none'?locID:low(ms.GetCurrentMapID());
 if(oldWorld!==S.level){planning.clear('region changed');oldWorld=S.level;previous=null;lastBells=0;scout.snapshot=null;for(const k of Object.keys(forbidden))delete forbidden[k];for(const k of Object.keys(passed))delete passed[k];failedEdges.clear();provenJoins.clear();graph(S.level)?.clearLiveEdges();safe('locks',locks);}
 const activeGraph=graph(S.level);
 if(activeGraph&&safe('ladder state',()=>Passages.refreshLadders(activeGraph,S.pawn))){previous=null;provenJoins.clear();log('ladder state','ready='+activeGraph.openPassages.size+' revision='+activeGraph.passageRevision);}
 const now=Date.now();for(const [key,t] of failedEdges){if(t>now)continue;const [world,id]=key.split('/');forbidden[world]?.delete(Number(id));failedEdges.delete(key);}
 const n=narrative();bind(n);const id=questID(n),native=tracked(n);
 if(questGate.observe(id)&&!(pending&&pending.epoch!==epoch)){tracker?.clear('quest selected');S.manual=null;S.scout=null;}
 previousID=id;if(pending&&now-pending.at>2000)pending=null;
 if(S.scout&&(!questGate.paused&&id||!S.cfg.FogBellSense||S.scout.until<=now||now-lastScout>400&&!scout.canContinue(S,S.scout))){S.scout=null;}
 if(now-lastScout>400)lastScout=now;
 const target=S.manual||(!questGate.paused&&native)||S.scout;
 // A streamed-out marker may temporarily have no coordinates. Retain the
 // completed selection until the player chooses again or the goal changes.
 if(!target||!target.p){S.lookoutHint=false;if(planning.job?.request.key.startsWith('fog:'))return;noRoute();return;}
 S.arrival.select(target);
 if(S.arrival.completedTarget===target.key){noRoute();return;}
 if(!menu&&!planning.pending)safe('loaded passage anchors',()=>Passages.updateLoaded(graphs.get(S.level),S.world,S.pawn,nativeWalk));
 if(!previous||previous.key!==target.key||previous.level!==S.level||R.dist(previous.p,target.p)>190){solve(target,'selection');return;}
 if(S.trip){const tr=S.trip.transfer;
  if(tr&&S.active===0&&S.level===tr.to.world&&R.dist(foot,toPoint(tr.to.at))<750&&(S.level!==tr.from.world||R.dist(foot,toPoint(tr.from.at))>1300)){S.active=1;S.line=S.trip.legs[1].points;S.version++;return;}
  if(S.arrival.isDone(S))return;
  // Also visit arrival when a route has collapsed to one point or its FX is off.
  // A physical arrival remains a gameplay state independently of what gets drawn.
  const end=S.line[S.line.length-1];
  if(end&&S.arrival.check(S,foot,end,now)){
   threads.hide();log('arrived',S.arrival.key(S)+'; route reached');return;
  }
  const near=R.nearestOnLine(foot,S.line);
  if(near.d<260){deviationSince=0;corridor=null;return;}
  // Navmesh centre lines are not the whole walkable road. Keep this route if
  // the player still has a short, physically checked join to its corridor.
  if(near.p&&near.d<760&&Math.abs(near.p.z-foot.z)<80){
   if(!corridor||now-corridor.at>450||R.dist(foot,corridor.foot)>90){
    corridor={at:now,foot:{...foot},clear:!!Surface.join(S.world,foot,{q:near.p,r:R.xy(foot,near.p),dz:near.p.z-foot.z})};}
   if(corridor.clear){deviationSince=0;return;}
  }
  if(!deviationSince)deviationSince=now;
  if(now-deviationSince>650&&now-lastSolve>1000&&R.dist(foot,previous.site)>140)solve(target,'off route');
 }else if(!planning.pending&&!planning.blocked(routeRequest(target,foot)))solve(target,'context changed');
}
function guardRoute(now){
 const leg=S.trip?.legs[S.active];if(!leg||leg.world!==S.level)return;
 const feet=S.world.feet();
 // Never release all of a provider's untested line just because it omitted
 // walking metadata. Missing segments are audited as walking below.
 if(!planning.pending&&guardRetry&&now>=guardRetry){
  guardRetry=0;const target=S.manual||(!questGate.paused&&tracked(narrative()))||S.scout;
  if(target?.key===S.targetKey&&!S.arrival.isDone(S)){solve(target,'blocked detour');return;}
 }
 if(guardedLeg!==leg){guardedLeg=leg;auditor.begin(leg,S.world,feet,now);S.threadEnd=auditor.safe;lastGuardVersion='';}
 else if(!auditor.job&&(now-auditor.started>1800||R.dist(feet,auditor.origin)>140))auditor.begin(leg,S.world,feet,now);
 const hadJob=!!auditor.job,result=auditor.pump();
 S.threadEnd=auditor.safe||feet;
 if(hadJob&&result?.mark){
  Obstacles.obstacle(leg,result.mark);
  log('blocked '+result.mark.edge,(result.mark.unknown?'pending ':'collision ')+result.mark.reason+' @'+[result.mark.p.x,result.mark.p.y,result.mark.p.z].map(Math.round).join(','));
  if(!result.mark.unknown){
   const g=graph(leg.world),banned=forbidden[leg.world]||=new Set();let added=0;
   if(g)for(const edge of Obstacles.nearbyEdges(g,result.mark,result.normal)){
    if(!banned.has(edge))added++;banned.add(edge);failedEdges.set(leg.world+'/'+edge,now+30000);
   }
   // A local retry window prevents spinning, but is not a four-obstacle
   // lifetime limit. A new blocker later in the journey still gets a detour.
   if(!guardBudget||now-guardBudget.at>5000||R.dist(feet,guardBudget.p)>600)guardBudget={at:now,p:{...feet},count:0};
   const key=leg.world+'/'+result.mark.edge+'/'+Math.round(result.mark.p.x/240)+','+Math.round(result.mark.p.y/240);
   if(guardBudget.count<3&&(added||key!==nativeRepairKey)){
    blockedTrip={key:S.targetKey,world:S.level,trip:S.trip,blockKey:key,p:{...result.mark.p},normal:result.normal,until:now+30000};guardBudget.count++;guardRetry=now+180;
   }
  }
 }
 // Every obstacle clips the 3D rope. A completed/cached sweep on its far
 // side must never expose a line through the obstruction in between.
 const near=R.nearestOnLine(feet,leg.points);
 for(const block of leg.obstacles||[]){
  const stop=R.nearestOnLine(block.approach||block.p,leg.points),end=R.nearestOnLine(S.threadEnd||feet,leg.points);
  if(stop.i+stop.t>=near.i+near.t-.02&&stop.i+stop.t<end.i+end.t)S.threadEnd=stop.p;
 }
 const sig=(leg.obstacles||[]).map(r=>r.id+'/'+r.unknown).join('|')+';'+(leg.checks||[]).filter(c=>(c.kind===10||c.kind===12)&&c.verified).map(c=>c.edge).join(',');
 if(sig!==lastGuardVersion){lastGuardVersion=sig;markLocks(S.trip);S.version++;}
}

function onSense(){
 if(!this.senseActive||!S.world)return;S.expires=Date.now()+30000;
 if(!S.cfg.FogBellSense||!S.cfg.MapRoute&&!S.cfg.MinimapRoute&&!S.cfg.WorldThread||S.manual||!questGate.paused&&questID(narrative()))return;
 const foot=S.world.feet(),request={key:'fog:'+S.area,world:S.level,level:S.level,p:foot,start:foot,revision:S.lockVersion};
 planning.request(request,()=>scout.beginJob(S,function*(p){const trip=yield* makePlan({p,world:S.level},true);return trip?.legs[0];}),(pin,selected)=>{
  if(S.level!==selected.level||S.manual||!questGate.paused&&questID(narrative()))return;
  S.scout=pin;if(pin){S.arrival.restart();setTrip(pin.trip,pin,S.world.feet(),'fog sense');}else noRoute();
 },true);
}

function tick(){settings();const sampleTime=Date.now();
 if(gameContext&&(sampleTime-lastPlayerCheck>=300||!W.alive(S.pawn))){lastPlayerCheck=sampleTime;const p=UE.GameplayStatics.GetPlayerCharacter(gameContext,0);
  if(W.alive(p)&&p!==S.pawn){unbind();reset();S.pawn=p;S.world=null;oldWorld='';lastPoll=0;log('player','rebound after travel');}}
 if(!W.alive(S.pawn)){planning.cancel('no player');threads.hide();return;}if(!S.cfg.MapRoute&&!S.cfg.MinimapRoute&&!S.cfg.WorldThread){planning.cancel('disabled');threads.hide();return;}
 if(!S.world)S.world=new W.Ground(S.pawn);const now=Date.now();
 if(now-lastPoll>=105){lastPoll=now;safe('tracking',observe);safe('tracker',()=>{tracker?.poll();if(waitingTracker){const item=waitingTracker;waitingTracker=null;trackerChanged(item,'restore');}});const router=T.getlocalPlayerSubsystem(S.pawn,UE.PBZUIActionRouterBase.StaticClass());menu=!!router&&router.GetActiveInputMode()===UE.ECommonInputMode.Menu;}
 safe('planning slice',()=>planning.pump());
 if(S.trip)safe('route clearance',()=>guardRoute(now));
 if(show()&&!menu&&S.cfg.WorldThread&&S.trip)safe('thread',()=>threads.show(S));else threads.hide();}
function mapAcceptsPins(h){
 return !h.BigMapMode&&h.CanUIInput?.()!==false&&!h.isModalOpen?.()&&!h.isOpenCompletion?.()&&
  !h.IsOpenByBell?.()&&!h.pbzFilterOpen?.()&&!h.__pbzTrackerControls?.open;
}
function trackerChanged(item,reason){
 if(!S.world||!S.level){waitingTracker=item;return;}
 if(!item){
  if(S.manual?.provider!=='187')return;
  if(/collected|acquired/i.test(reason)){S.arrival.completedTarget=S.manual.key;noRoute();threads.hide();return;}
  if(!/cancel|stop|selected|clear/i.test(reason))return;
  clearManual('tracker '+reason);return;
 }
 if(item.auto&&(S.manual?.provider!=='187'&&S.manual||!questGate.paused&&questID(narrative())))return;
 selectItem(item,'tracker',worldOf(item.area),item.area);
}
function selectItem(item,device,displayWorld,displayArea,host){
 if(host&&item.provider==='187'&&tracker){
  safe('tracker selection',()=>tracker.choose(host,item));
 }
 if(item.provider!=='187')tracker?.clear('route item selected');
 const targetWorld=worldOf(item.area)||displayWorld;
 epoch++;questGate.pause(questID(narrative()));S.scout=null;S.arrival.restart();
 // The item's world comes from its location. Its icon UV is relative to the
 // visible chart, which can group several named subareas together.
 S.manual={p:item.p,uv:item.uv,world:targetWorld,area:displayArea,item:true,provider:item.provider,auto:!!item.auto,key:'item:'+item.area+'/'+item.id};
 previous=null;safe('item route',()=>solve(S.manual,device+' item'));
 log('item',device+' '+item.id+' @ '+[item.p.x,item.p.y,item.p.z].map(Math.round).join(','));
}
function mapAcceptsItems(h){
 return !h.BigMapMode&&h.CanUIInput?.()!==false&&!h.isModalOpen?.()&&!h.isOpenCompletion?.()&&
  !h.pbzFilterOpen?.()&&!h.__pbzTrackerControls?.open;
}
function confirmation(h){let value=confirmations.get(h);if(!value){value=new ItemConfirm();confirmations.set(h,value);}return value;}
function confirmMapItem(h,device='native',repeat=false){
 if(!S.world||!W.alive(S.pawn)||(!S.cfg.MapRoute&&!S.cfg.MinimapRoute&&!S.cfg.WorldThread)||!mapAcceptsItems(h))return false;
 const size=h.CurrentMapSize(),focus=h.FocusPoint;if(!focus||!size)return false;
 const pad=h.getCurrentInputType()===UE.ECommonInputType.Gamepad;
 let uv={x:Number(focus.X),y:Number(focus.Y)};
 if(!pad){const sample=pointerSample(h);if(sample)uv=sample.uv;}
 const intent=mapIntent(h,uv,Number(size.X),Number(size.Y),pad,h.getCurrentInputType());
 if(!intent.item)return false;
 if(repeat)return true;
 const item=intent.item;
 if(!confirmation(h).claim(item.area+'/'+item.id,Date.now()))return true;
 const area=low(h.CurrentDisplayMapID),state=maps.get(h);if(state)state.press.reset(true);
 safe('selected item route',()=>selectItem(item,device,worldOf(area),area,h));
 log('item confirm',device+' selected='+String(h.SlotWidgetGroup?.GetSelectedSlotID?.())+' snap='+String(h.lastSnappedIconID)+' item='+item.id);
 return true;
}
function clearManual(device){
 // Clear means stop this navigation, not fall back to the still-tracked quest.
 planning.clear('explicit cancel');questGate.pause(questID(narrative()));epoch++;pending=null;
 tracker?.clear('route cleared');S.manual=null;S.scout=null;S.lookoutHint=false;
 auditor.reset();guardedLeg=null;blockedTrip=null;S.threadEnd=null;S.targetKey='';S.trip=null;S.line=[];previous=null;S.arrival.reset();S.version++;
 threads.hide();ink?.clearAll();mini?.clearAll();log('input',device+' navigation cancelled');
}
function padSample(h){
 const size=h.CurrentMapSize?.(),focus=h.FocusPoint;if(!size||!focus)return null;
 const width=Number(size.X),height=Number(size.Y),uv={x:Number(focus.X),y:Number(focus.Y)};
 if(!(width>0&&height>0))return null;
 const intent=mapIntent(h,uv,width,height,true,UE.ECommonInputType.Gamepad);
 return {now:Date.now(),area:low(h.CurrentDisplayMapID),width,height,uv,
  allowed:!!S.world&&W.alive(S.pawn)&&(S.cfg.MapRoute||S.cfg.MinimapRoute||S.cfg.WorldThread)&&mapAcceptsPins(h)&&intent.allowed&&!intent.item};
}
function bindPadTap(proto){
 const original=proto.OnPreviewKeyDown,originalUp=proto.OnKeyUp;
 const onKey=function(geometry,event){
  const name=String(UE.KismetInputLibrary.GetKey(event)?.KeyName||'');
  if(name==='Gamepad_FaceButton_Bottom'){
   const repeat=!!UE.KismetInputLibrary.InputEvent_IsRepeat?.(event);
   if(safe('pad map event',()=>confirmMapItem(this,'pad',repeat)))return UE.WidgetBlueprintLibrary.Handled();
   if(!repeat){const sample=safe('pad sample',()=>padSample(this));
    if(sample?.allowed){let input=pads.get(this);if(!input){input=new Pointer();pads.set(this,input);}
     if(input.down(sample))return UE.WidgetBlueprintLibrary.Handled();}}
   else if(pads.get(this)?.press)return UE.WidgetBlueprintLibrary.Handled();
  }
  return original?original.apply(this,arguments):UE.WidgetBlueprintLibrary.Unhandled();
 };
 const onUp=function(geometry,event){
  if(String(UE.KismetInputLibrary.GetKey(event)?.KeyName||'')==='Gamepad_FaceButton_Bottom'){
   const input=pads.get(this),gate=confirmations.get(this);
   if(input?.press){const sample=safe('pad release',()=>padSample(this));if(sample)input.up(sample);else input.cancel();return UE.WidgetBlueprintLibrary.Handled();}
   if(gate?.held){gate.sample(false,Date.now());return UE.WidgetBlueprintLibrary.Handled();}
  }
  return originalUp?originalUp.apply(this,arguments):UE.WidgetBlueprintLibrary.Unhandled();
 };
 Object.defineProperty(proto,'OnPreviewKeyDown',{value:onKey,writable:true,configurable:true});
 Object.defineProperty(proto,'OnKeyUp',{value:onUp,writable:true,configurable:true});
 log('pad input','event press/release for pins; shared item confirm and hold cancel');
}
function pointerSample(h){
 const size=h.CurrentMapSize?.(),origin=h.PBZMapCanvasSlotWeak?.GetPosition?.(),pos=h.getMouseLocalPosition?.();
 if(!size||!origin||!pos)return null;
 const width=Number(size.X),height=Number(size.Y);
 if(!(width>0&&height>0))return null;
 return {now:Date.now(),area:low(h.CurrentDisplayMapID),width,height,
  uv:{x:(Number(pos.X)-Number(origin.X))/width,y:(Number(pos.Y)-Number(origin.Y))/height},
  allowed:!!S.world&&W.alive(S.pawn)&&(S.cfg.MapRoute||S.cfg.MinimapRoute||S.cfg.WorldThread)&&mapAcceptsPins(h)&&
   h.isMouseInsideMapPage?.()!==false&&!h.wantSystemCursorNow?.()};
}
function bindMouse(proto){
 const bind=(key,fn)=>{const original=proto[key];
  const callback=function(...args){const reply=safe('map pointer '+key,()=>fn.apply(this,args));return reply??(original?original.apply(this,args):UE.WidgetBlueprintLibrary.Unhandled());};
  Object.defineProperty(proto,key,{value:callback,writable:true,configurable:true});};
 bind('OnPreviewMouseButtonDown',function(geometry,event){
  if(String(UE.KismetInputLibrary.PointerEvent_GetEffectingButton(event)?.KeyName)!=='MiddleMouseButton')return;
  let input=pointers.get(this);if(!input){input=new Pointer();pointers.set(this,input);}
  if(!input.down(pointerSample(this)))return;
  const reply=UE.WidgetBlueprintLibrary.Handled();
  return UE.WidgetBlueprintLibrary.CaptureMouse?.(reply,this)||reply;
 });
 bind('OnMouseButtonUp',function(geometry,event){
  if(String(UE.KismetInputLibrary.PointerEvent_GetEffectingButton(event)?.KeyName)!=='MiddleMouseButton')return;
  const input=pointers.get(this),sample=pointerSample(this);
  if(!input?.press)return;
  if(sample)input.up(sample);else input.cancel();
  const reply=UE.WidgetBlueprintLibrary.Handled();
  return UE.WidgetBlueprintLibrary.ReleaseMouseCapture?.(reply)||reply;
 });
 bind('OnMouseMove',function(){const sample=pointerSample(this);if(sample)pointers.get(this)?.move(sample);else pointers.get(this)?.cancel();});
 bind('OnMouseCaptureLost',function(){pointers.get(this)?.cancel();});
}
function onMap(h){
 if(!S.world||!W.alive(S.pawn)){ink.hide(h);return;}
 const area=low(h.CurrentDisplayMapID);if(!area){ink.hide(h);return;}
 const name=worldOf(area),ms=T.getWorldSubsystem(h,UE.MapSubsystem.StaticClass());
 const project=(p,requestedArea)=>{const u=ms.ProjectWorldLocationToMap(W.vec(p),requestedArea||h.CurrentDisplayMapID);return {x:Number(u.X),y:Number(u.Y)};};
 const allowed=p=>{if(name!==S.level||!['pbz_zhengdaodaying_wp','pbz_pangzhen_wp'].includes(name))return true;
  const id=low(ms.GetMapIDByLocation(W.vec(p)));return !id||id==='none'||Groups.isInSameMapGroup(area,id)||low(h.mapIDToBigMapID(id)||id)===area;};
 let state=maps.get(h);if(!state){state={area:'',stamp:textFile(mousePath),press:new MapPress(),read:0,lockTime:0};maps.set(h,state);}
 const now=Date.now();
 const type=h.getCurrentInputType(),pad=type===UE.ECommonInputType.Gamepad,device=pad?'pad':'mouse';
 const pointer=pad?pads.get(h):pointers.get(h),sample=pointer&&(pad?padSample(h):pointerSample(h));
 if(sample)pointer.hold(sample);else pointer?.cancel();
 const eventActions=pointer?.take(area)||[],pointerAction=eventActions[eventActions.length-1];
 if(h.BigMapMode||!name){state.area='';state.press.reset();ink.draw(h,S,project,name,allowed,show());return;}
 if(state.area!==area||state.context!==S.contextEpoch){state.area=area;state.context=S.contextEpoch;state.picker=null;state.press.reset();state.first=true;confirmation(h).sample(false,now);}
 if(now-state.lockTime>1250){state.lockTime=now;safe('lock refresh',()=>{locks();if(S.trip)markLocks(S.trip);});}
 if(S.cfg.MapRoute||S.cfg.MinimapRoute||S.cfg.WorldThread){
  const g=graph(name);if(g&&!state.picker)state.picker=new Picker(g,p=>allowed(p)?project(p):null);
  if(state.picker)state.picker.prepare(1);
  const router=T.getlocalPlayerSubsystem(h,UE.PBZUIActionRouterBase.StaticClass());
  const key=pad?(state.padKey||=new UE.Key('Gamepad_FaceButton_Bottom')):(state.mouseKey||=new UE.Key('MiddleMouseButton'));
  let down=!!router?.IsUIKeyHeld?.(key);
  if(!down){const pc=h.GetOwningPlayer?.();if(pc?.IsInputKeyDown)down=!!pc.IsInputKeyDown(key);}
  let pulse=false;
  if(state.first){state.first=false;state.press.reset(down);pulse=false;}
  if(pad&&confirmation(h).sample(down,now)){clearManual('pad hold');state.press.reset(down);}
  if(pointerAction||down||pulse||state.press.press||state.press.lastDown||state.press.suppress){
   const sz=h.CurrentMapSize(),w=Number(sz.X),height=Number(sz.Y),o=h.PBZMapCanvasSlotWeak?.GetPosition();
   if(!o||!(w>0&&height>0))return;
   const left=Number(o.X),top=Number(o.Y),pos=pad?h.FocusPoint:h.getMouseLocalPosition();
   const uv=pad?{x:Number(pos.X),y:Number(pos.Y)}:{x:(Number(pos.X)-left)/w,y:(Number(pos.Y)-top)/height};
   const intent=mapIntent(h,uv,w,height,pad,type);
   const allowedInput=(intent.item?mapAcceptsItems(h):mapAcceptsPins(h))&&intent.allowed;
   // Fallback for maps whose preview callback is owned by another mod. A
   // snapped item activates on the press edge, before the reticle can drift.
   if(pad&&down&&!pointer?.owns(now)&&!state.press.lastDown&&!state.press.suppress&&allowedInput&&intent.item){
    confirmMapItem(h,'pad fallback');state.press.reset(true);
    ink.draw(h,S,project,name,allowed,show());return;
   }
   let action;
   if(pointerAction||pointer?.owns(now)){state.press.reset(down);action=allowedInput?pointerAction:null;}
   else action=state.press.sample({now,down,pulse,device,uv,width:w,height,allowed:allowedInput});
   if(action?.type==='clear')clearManual(device);
   if(action?.type==='pin'&&!pad){
    const item=safe('item hit',()=>pickItem(h,action.uv,w,height));
    if(item){selectItem(item,'mouse',name,area,h);
     ink.draw(h,S,project,name,allowed,show());return;}
   }
   if(action?.type==='pin'&&state.picker){
    const at=action.uv,inside=at.x>=0&&at.y>=0&&at.x<=1&&at.y<=1,here=graph(S.level),feet=S.world.feet();
    const from=Surface.anchors(here,feet).filter(x=>x.r<80&&Math.abs(x.dz)<75).map(x=>x.id);if(!from.length)from.push(here.node(feet));
    const near=here.reachable(from),bs=bellList();
    const transfer=bs.some(b=>b.world===here.name&&near.has(here.strong[here.node(toPoint(b.at))]));
    const seeds=g===here?from.slice():[];if(transfer)for(const b of bs)if(b.world===name)seeds.push(g.node(toPoint(b.at)));
    const reachable=g.reachable(seeds),snap=state.picker.pick(at,reachable,w,height,g===here?feet:null);
    let best=snap;
    if(inside&&(!snap||snap.pixels>13)){const exact=state.picker.pick(at,null,w,height,g===here?feet:null);if(exact&&(!snap||exact.pixels+8<snap.pixels))best=exact;}
    if(best||inside){
     tracker?.clear('map pin selected');
     epoch++;questGate.pause(questID(narrative()));S.scout=null;S.arrival.restart();S.manual={p:best?.p,node:best?.id,uv:inside?{...at}:best.uv,world:name,area,key:'pin:'+name+'/'+(++serial)};previous=null;S.version++;
     if(best)solve(S.manual,device+' pin');else noRoute();
     log('pin',device+' '+area+' distance '+(best?Math.round(best.pixels)+'px':'paper only'));
    }
   }
  }
 }
 ink.draw(h,S,project,name,allowed,show());
}
function wrap(proto,k,fn){const orig=proto?.[k];if(typeof orig!=='function')return false;proto[k]=function(...args){const result=orig.apply(this,args);safe(k,()=>fn.apply(this,args));return result;};return true;}
function menuOptions(){const t=(en,zh)=>({en,'zh-Hans':zh,'zh-Hant':zh});(globalThis.PBZModsMenu||=[]).push({id:'PBZQuestRoute',file:'PBZQuestRoute.txt',version:BUILD,title:t('Quest & Exploration Navigation','任务与探索导航'),description:t('Middle-click / A: navigate to an item or place a pin. Hold 0.6 s to clear. Tracking a quest replaces the current pin.','中键 / A 寻物或落旗，长按 0.6 秒收旗，追踪任务会接替当前标记'),settings:[
 {key:'MapRoute',type:'toggle',default:true,label:t('Map route','地图路线')},{key:'MinimapRoute',type:'toggle',default:true,label:t('Minimap route','小地图路线')},{key:'WorldThread',type:'toggle',default:true,label:t('Guiding thread','场景引路线')},
 {key:'LargeItemIcons',type:'toggle',default:true,label:t('Large unframed item icons','放大物品图标并移除黑底')},{key:'AutoAccessory',type:'toggle',default:true,label:t('Nearest accessory hint','自动提示最近饰品')},
 {key:'FogBellSense',type:'toggle',default:true,label:t('Sense a bell in fog','迷雾中洞照寻铃')},
 {key:'DisplayMode',type:'choice',default:'Always',label:t('Display mode','显示方式'),options:[{value:'Always',label:t('While tracking','追踪时持续显示')},{value:'Sense30',label:t('30 seconds after Sense','洞照后显示30秒')}]}],onChange:()=>settings(true)});}
exports.install=function(){if(globalThis.__PBZQuestRouteInstalled)return;dir=UE.KismetSystemLibrary.ConvertToAbsolutePath(UE.KismetSystemLibrary.GetProjectContentDirectory()).replace(/[\\/]?$/,'/');
 logPath=dir+'../Saved/PBZQuestRoute-log.txt';mousePath=dir+'../Saved/PBZQuestRoute-middle.txt';ink=new Ink(dir+'Mods/PBZQuestRoute/',log);mini=new MinimapRoute(dir+'Mods/PBZQuestRoute/',log);threads=new Threads(log);
 const player=require('Gameplay/RenewalPlayer').RenewalPlayerinXinInterface.prototype,m=require('UI/Widget/Map').MapInterface.prototype,sense=require('Gameplay/GA_Player_Sense').ga_Player_Sense_MixinInterface.prototype;
 wrap(player,'TsBeginPlay',function(){unbind();reset();S.pawn=this;S.world=null;S.expires=0;oldWorld='';lastPoll=0;log('player','ready '+Date.now());});
 wrap(player,'ReceiveEndPlay',function(){if(S.pawn===this){unbind();reset();S.pawn=null;S.world=null;}});
 wrap(sense,'K2_ActivateAbility',onSense);
 wrap(m,'Tick',function(){try{onMap(this);}catch(e){ink.hide(this);throw e;}});bindPadTap(m);bindMouse(m);chooseUI(m,'toggleTrackQuestPoint',false);
 const journal=require('UI/Widget/DisplayQuest').QuestUIMixinInterface.prototype;chooseUI(journal,'toggleHoveredQuestPoint',true);
 wrap(m,'FinishCurrentWidget',function(){ink.remove(this);maps.delete(this);pointers.delete(this);pads.delete(this);confirmations.delete(this);});wrap(m,'ReleaseScriptReferences',function(){ink.remove(this);maps.delete(this);pointers.delete(this);pads.delete(this);confirmations.delete(this);});
 tracker=new Tracker(function(id){const bridge=globalThis.PBZMapTrackerBridge;if(bridge&&id.startsWith('Mods/Pbz'))return bridge.load(id.slice(5));return require(id);},trackerChanged,log);
 globalThis.PBZQuestRouteBridge={
  version:BUILD,
  options:()=>S.cfg,
  confirmMapTarget:h=>!!safe('native item confirmation',()=>confirmMapItem(h,'native confirm')),
  hasExplicitTarget:()=>!!(S.manual&&!S.manual.auto&&S.arrival.completedTarget!==S.manual.key||!questGate.paused&&W.alive(S.pawn)&&questID(narrative())),
  paintMinimap:(view,player,rotation)=>safe('minimap route',()=>mini.draw(view,player,rotation,S,show())),
  removeMinimap:host=>mini.remove(host)
 };
 scout=new Scout(tables,log);const gi=P.argv.getByName('GameInstance');gameContext=gi;const existing=UE.GameplayStatics.GetPlayerCharacter(gi,0);if(W.alive(existing)){S.pawn=existing;S.world=null;}menuOptions();settings(true);globalThis.__PBZQuestRouteInstalled=true;setInterval(()=>safe('tick',tick),8);log('loaded',BUILD+' built-in atlases='+tables.worlds.length);};
