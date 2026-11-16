"use strict";
const UE=require('ue'),P=require('puerts'),T=require('Library/TsHelper').default,Groups=require('Library/MapAreaGroups');
const R=require('./PBZRouteCore'),Surface=require('./PBZRouteSurface'),W=require('./PBZRouteWorld');
const {Threads}=require('./PBZPrivateRibbon'),{Ink}=require('./PBZRouteInk'),{Picker}=require('./PBZRoutePicker');
const ThreadColor=require('./PBZRouteColor');
const {pickItem,mapIntent,pickTrackerItem,pickBell,directionalItems,readItem,findRow}=require('./PBZRouteItems'),{Arrival}=require('./PBZRouteArrival');
const {PadFocus,directions:padDirections}=require('./PBZRoutePadFocus'),padFocus=new PadFocus();
const {Tracker}=require('./PBZRouteTracker'),{Pointer}=require('./PBZRoutePointer');
const Passages=require('./PBZRoutePassages'),Obstacles=require('./PBZRouteObstacles'),Drops=require('./PBZRouteDrops');
const LocalWalk=require('./PBZRouteLocalWalk');
const Guides=require('./PBZRouteGuides');
const Roadbook=require('./PBZRouteRoadbook');
const TravelMode=require('./PBZRouteTravelMode');
const BellTransfer=require('./PBZRouteBellTransfer');
const BellIdentity=require('./PBZRouteBellIdentity');
const RouteStatus=require('./PBZRouteStatus');
const Feasibility=require('./PBZRouteFeasibility');
const Blocked=require('./PBZRouteBlocked'),Repair=require('./PBZRouteRepair'),Goals=require('./PBZRouteGoals');
const Locks=require('./PBZRouteLocks');
const Connectivity=require('./PBZRouteConnectivity');
const planning=new (require('./PBZRouteJobs').Planner)(log);
const recast=new (require('./PBZRouteRecast').RecastCache)(id=>require(id),{UE,P,T,alive:W.alive},log,()=>{
 planning.clear('collision state changed');previous=null;guardedLeg=null;S.trip=null;S.line=[];S.threadEnd=null;S.version++;threads?.hide();
});
const auditor=new Obstacles.Auditor();let guardedLeg=null,guardRetry=0,guardBudget=null,blockedTrip=null,nativeRepairKey='',lastGuardVersion=-1;
const {questIdentity,QuestGate}=require('./PBZRouteSelection');
const questGate=new QuestGate();
const {ItemConfirm}=require('./PBZRouteConfirm'),{MinimapRoute}=require('./PBZRouteMinimap');
const {MapPress}=require('./PBZRouteControls'),{Scout}=require('./PBZRouteScout'),tables=require('./PBZRouteTables').data,BUILD='1.9.2';
const Build=require('./PBZRouteBuild');
let diagnostics=null,developerAPI=null,developerPC=null,developerPawn=null,developerWorld=null,developerKeys=null,surveyTracker=null;
const S={cfg:{LargeItemIcons:true,AutoAccessory:true,MapRoute:true,MinimapRoute:true,WorldThread:true,FogBellSense:true,DisplayMode:'Always'},pawn:null,world:null,level:'',area:'',trip:null,line:[],manual:null,scout:null,routeStatus:'',routeWork:null,version:0,lockVersion:0,expires:0,active:0,contextEpoch:0,arrival:new Arrival()};
const atlas=new (require('./PBZRouteAtlas').AtlasCache)(id=>require(id),(data,faces,read)=>R.graphJob(data,faces,read),log);
const graphs=atlas.graphs,maps=new WeakMap(),forbidden={},passed={},notes=[],history=new Map();
let dir='',logPath='',mousePath='',ink,threads,previous=null,lastPoll=0,lastCfg=0,lastBells=0,lastLocks=0,permitted=[],lastSolve=0,oldWorld='',oldLocks='',lockRows=[],menu=false,serial=0;
let previousID=null,pending=null,epoch=0,listenerSource=null,listener=null,scout,lastScout=0,retry=0;
let deviationSince=0,corridor=null;
let nextClearance=0;
let statusHud=null,lastStatusPoll=0,lastStatusCulture=0,statusEnglish=false;
let stanceEpoch=0,wasGrounded=null,lastFoot=null,lastGroundFoot=null,poseReady=true,groundedNow=true;
const failedEdges=new Map();
const provenJoins=new Map();
const confirmations=new WeakMap();let mini=null;
const pointers=new WeakMap(),pads=new WeakMap();let tracker=null,waitingTracker=null,gameContext=null,lastPlayerCheck=0;
const low=v=>String(v||'').toLowerCase(),xyz=p=>({x:p.X,y:p.Y,z:p.Z}),toPoint=a=>({x:a[0],y:a[1],z:a[2]});
function log(k,s){if(history.get(k)===s)return;history.set(k,s);notes.push(new Date().toISOString()+' '+k+' '+s);if(notes.length>130)notes.shift();diagnostics?.event(k,s);console.log('[PBZQuestRoute] '+k+' '+s);
 if(logPath)try{UE.EasyCsv.SaveStringToFileWithFullPath(notes.join('\n')+'\n',logPath);}catch(_){}}
function safe(k,fn){try{return fn();}catch(e){log('error '+k,String(e)+' '+String(e.stack||'').split('\n').slice(1,2).join(''));}}
function textFile(path){const out=P.$ref('');return UE.BlueprintPathsLibrary.FileExists(path)&&UE.EasyCsv.LoadStringFromLocalFile(path,out)?String(P.$unref(out)):'';}
function settings(force=false){const now=Date.now();if(!force&&now-lastCfg<900)return;lastCfg=now;const old=S.cfg,cfg={...old};
 for(const line of textFile(dir+'Paks/~mods/PBZQuestRoute.txt').split(/\r?\n/)){const m=/^\s*(LargeItemIcons|AutoAccessory|MapRoute|MinimapRoute|WorldThread|DisplayMode|FogBellSense)\s*=\s*(\w+)/.exec(line);if(m)cfg[m[1]]=m[1]==='DisplayMode'?(/^Sense30$/i.test(m[2])?'Sense30':'Always'):/^(on|1|true)$/i.test(m[2]);}
 let configFile=dir+'../Saved/PBZQuestRoute-settings.json';
 try{const k=UE.KismetSystemLibrary,root=k.ConvertToAbsolutePath(k.GetProjectSavedDirectory());
  if(root)configFile=String(root).replace(/[\\/]+$/,'')+'/PBZQuestRoute-settings.json';
 }catch(_){}
 const saved=textFile(configFile);
 Object.assign(cfg,ThreadColor.read(saved,{
  ThreadColor:old.ThreadColor||ThreadColor.defaults.ThreadColor,ThreadCustomColor:old.ThreadCustomColor||ThreadColor.defaults.ThreadCustomColor}));
 S.cfg=cfg;
 if(JSON.stringify(old)!==JSON.stringify(cfg))log('settings',JSON.stringify(cfg));}
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
function locks(){const ms=T.getWorldSubsystem(S.pawn,UE.MapSubsystem.StaticClass());
 lastLocks=Date.now();let backpack;const names=new Map();const item=id=>{
  if(names.has('item/'+id))return names.get('item/'+id);
  backpack||=UE.PBZBackPackSubsystem?.GetBackPackSubsytemByContextObject?.(S.pawn);
  const data=UE.PBZBackPackSubsystem?.GetPropData?.(id),name=data?.ItemName?.Key;
  const out={};if(name)out.name=String(UE.PBZBlueprintFunctionLibrary.MakeTextByKey(name));
  if(backpack?.GetItemNumInfo){const owned=P.$ref(0),max=P.$ref(0);backpack.GetItemNumInfo(id,owned,max);out.owned=Number(P.$unref(owned));}
  names.set('item/'+id,out);return out;
 };
 const weapon=id=>{
  if(names.has('weapon/'+id))return names.get('weapon/'+id);
  backpack||=UE.PBZBackPackSubsystem?.GetBackPackSubsytemByContextObject?.(S.pawn);
  const row=backpack?.GetShaqiWeaponTableData?.(id),key=row?.WeaponName?.Key;
  const detail=key?{name:String(UE.PBZBlueprintFunctionLibrary.MakeTextByKey(key))}:{};
  names.set('weapon/'+id,detail);return detail;
 };
 const tag=value=>{
  backpack||=UE.PBZBackPackSubsystem?.GetBackPackSubsytemByContextObject?.(S.pawn);
  if(!backpack?.FindShaChiWeaponByTag)return null;
  const id=P.$ref(''),snap=P.$ref(false);if(!backpack.FindShaChiWeaponByTag(value,id,snap))return null;
  const key=String(P.$unref(id));return {id:key,...weapon(key)};
 };
 if(S.world)S.world.requirements={item,weapon};
 const out=Locks.read(ms?.LockObjectInfos,tables.areas,{UE,alive:W.alive,point:xyz,worldOf,item,weapon,tag});
 const signature=Locks.signature(out);if(signature!==oldLocks){oldLocks=signature;S.lockVersion++;auditor.cache.clear();guardedLeg=null;}
 lockRows=out;return out;}
function markLocks(trip){R.markLocks(trip,lockRows,S.world?{p:S.world.feet(),world:S.level}:undefined);}
function rememberCollision(leg,failure){
 if(failure.unknown||failure.edge<0||failure.edge===undefined)return;
 const banned=forbidden[leg.world]||=new Set();
 banned.add(failure.edge);failedEdges.set(leg.world+'/'+failure.edge,Date.now()+30000);
}
function* proofJob(leg,lookout,context,options={}){
 const weak=leg.checks.filter(c=>c.kind===8||c.kind===9||lookout&&c.kind===5);
 if(leg.world!==S.level)return weak.length?weak[0].edge:null;
 const w=context?.world||Locks.constrain(S.world,lockRows,leg.world),foot=w.feet(),good=passed[leg.world]||=new Set();let count=0;
 const reject=(c,hit,unknown)=>{rememberCollision(leg,{edge:c.edge,unknown});context?.report?.('passage rejected',{world:leg.world,edge:c.edge,kind:c.kind,guid:c.guid,p:hit||c.a,unknown});Obstacles.obstacle(leg,Obstacles.mark(leg,c,'passage check',hit,unknown));return c.edge;};
 // Verify every conditional connection before displaying the leg. The older
 // 85 m / 12-check streaming budget does not certify one of these gaps.
 const replacements=[];
 for(const c of weak){yield;
  if(leg.roadbook&&R.dist(foot,c.a)>12000)continue;
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
 let physical=yield* Feasibility.check(w,leg,foot);
 if(!physical.ok)rememberCollision(leg,physical);
 if(!physical.ok)context?.report?.('walking rejected',{world:leg.world,edge:physical.edge,why:physical.why,p:physical.p,
  a:physical.a,b:physical.b,locked:!!physical.locked,segment:physical.segment,
  ...(physical.collision&&w.describeTrace?{trace:w.describeTrace(physical.collision)}:{}),
  actions:leg.moves?.map(m=>({edge:m.edge,kind:m.kind,guid:m.guid}))});
 if(!physical.ok&&context){
  const previewGoal=context.goalWorld===leg.world?context.goal:leg.points[leg.points.length-1];
  Blocked.offer(context,Blocked.fromFailure(leg,physical,previewGoal),context.start,previewGoal);
  let candidate=leg;
  while(!physical.ok&&!options.deferRepair&&(context.repairs||0)<2){
   context.repairs=(context.repairs||0)+1;
   const clock=context.clock||Date.now;context.repairDeadline??=clock()+3500;
   const fixed=yield* Repair.repair(w,candidate,physical,foot,{clock,deadline:context.repairDeadline,
    traverse:['atlas','roadbook'].includes(leg.provider)?context.repairTraversal:undefined,report:context.report});if(!fixed)break;
   candidate=fixed.candidate;physical=fixed.verdict;
   if(!physical.ok){rememberCollision(candidate,physical);Blocked.offer(context,Blocked.fromFailure(candidate,physical,previewGoal),context.start,previewGoal);}
   else Object.assign(leg,candidate);
  }
 }
 if(!physical.ok){
  const c={edge:physical.edge,a:physical.a||foot,b:physical.b||physical.p||foot};
  Obstacles.obstacle(leg,Obstacles.mark(leg,c,physical.why,physical.p,!!physical.unknown,physical.block));return physical.edge;
 }
 Object.assign(leg,physical.leg);
 return null;
}
function atArrivalBell(dest){
 const arrival=S.bellArrival;
 return !!arrival&&arrival.key===dest.key&&arrival.world===dest.world&&R.dist(arrival.goal,dest.p)<=190;
}
function clearRouteStatus(){S.routeStatus='';S.routeWork=null;statusHud?.clear();lastStatusPoll=0;}
function updateRouteStatus(force=false){
 const now=Date.now();if(!force&&now-lastStatusPoll<200)return;lastStatusPoll=now;
 if(now-lastStatusCulture>=1000){lastStatusCulture=now;statusEnglish=/^en/i.test(String(UE.KismetInternationalizationLibrary?.GetCurrentLanguage?.()||'zh'));}
 const enabled=W.alive(S.pawn)&&S.world&&(S.cfg.MapRoute||S.cfg.MinimapRoute||S.cfg.WorldThread)&&S.arrival.completedTarget!==S.routeWork?.key;
 S.routeStatus=enabled?(TravelMode.message(S.travelPhase,statusEnglish)||RouteStatus.message(planning,atlas,S.routeWork,now,statusEnglish)):'';
 if(enabled&&recast.error&&S.routeWork?.revision?.startsWith('recast/'))S.routeStatus=statusEnglish?'Navigation unavailable in this region':'该区域导航暂不可用';
 else if(enabled&&!recast.ready&&recast.loading&&S.routeWork?.revision?.startsWith('recast/')){
  const progress=recast.loading.total>1?' '+recast.loading.completed+'/'+recast.loading.total:'';
  S.routeStatus=(statusEnglish?'Loading navigation…':'正在加载导航…')+progress;
 }
 const notice=[diagnostics?.notice(now),diagnostics?.survey?.notice(now)].filter(Boolean).join('\n');if(notice&&W.alive(S.pawn)&&!menu)S.routeStatus=notice+(S.routeStatus?'\n'+S.routeStatus:'');
 statusHud?.update(gameContext||S.pawn,S.routeStatus,now);
}
function reset(){diagnostics?.survey?.finish('player context reset');S.travelPhase=null;clearRouteStatus();S.bellArrival=null;guardRetry=0;planning.clear('world reset');auditor.reset();guardedLeg=null;blockedTrip=null;S.threadEnd=null;S.trip=null;S.line=[];S.scout=null;previous=null;S.version++;S.contextEpoch++;threads?.clear();ink?.clearAll();mini?.clearAll();S.arrival.probe=null;previousID=null;pending=null;lastScout=0;retry=0;deviationSince=0;corridor=null;for(const g of graphs.values())Passages.resetLadders(g);}
function setTrip(trip,dest,start,why,requestContext){
 if(trip?.legs.some(l=>l.diagnostic))why+=' [blocked preview]';
 else if(trip?.legs.some(l=>l.partial))why+=' [partial]';else if(trip)why+=' [complete]';
 S.arrival.select(dest);deviationSince=0;corridor=null;guardRetry=0;
 if(S.targetKey!==dest.key){guardBudget=null;nativeRepairKey='';blockedTrip=null;}auditor.reset();guardedLeg=null;S.threadEnd=null;
 S.trip=trip;S.targetKey=dest.key;S.active=0;S.line=Blocked.canGuide(trip?.legs[0])?trip.legs[0].points:[];S.version++;
 const snapshot=requestContext||routeRequest(dest,start);
 previous={key:dest.key,p:dest.p,site:start,level:S.level,revision:snapshot.revision,originRevision:snapshot.originRevision};lastSolve=Date.now();
 if(!trip){threads.hide();retry=Math.min(retry+1,4);log('route status',why+' '+dest.key+' from '+[start.x,start.y,start.z].map(Math.round).join(','));return;}
 retry=0;for(const leg of trip.legs)for(const c of leg.checks||[])if((c.kind===10||c.kind===11||c.kind===12)&&!c.verified)Obstacles.obstacle(leg,Obstacles.mark(leg,c,c.kind===11?'folded ladder':c.kind===12?'drop landing pending':'atlas seam',null,c.kind!==11));markLocks(trip);log('route '+S.version,why+' '+dest.key+' legs='+trip.legs.map(l=>l.world+':'+Math.round(l.meters)+'m').join(' + ')+' transfer='+(trip.transfer?trip.transfer.from.name+' -> '+trip.transfer.to.name:'walk')+' actions='+trip.legs.map(l=>(l.moves||[]).map(m=>m.kind).join('>')).filter(Boolean).join('/'));
}
function noRoute(){S.travelPhase=null;clearRouteStatus();S.bellArrival=null;guardRetry=0;planning.cancel('no target');auditor.reset();guardedLeg=null;S.threadEnd=null;if(S.trip||S.line.length){S.trip=null;S.line=[];S.version++;threads.hide();}previous=null;}
function sampledPath(points){
 const indices=points.length<=32?points.map((p,i)=>i):[...Array.from({length:16},(_,i)=>i),...Array.from({length:16},(_,i)=>points.length-16+i)];
 return {pointCount:points.length,first:points.length?{...points[0]}:null,last:points.length?{...points.at(-1)}:null,
  points:indices.map(i=>({i,p:{...points[i]}})),truncated:points.length>32};
}
function nativeWalk(start,goal,allowPartial=false,report){
 const unavailable=reason=>{const data={direction:'forward',status:'unavailable',reason,start:{...start},goal:{...goal}};report?.(data);diagnostics?.event('native query',data);return null;};
 if(R.dist(start,goal)>20000)return unavailable('query range');
 const nav=UE.NavigationSystemV1;if(typeof nav?.FindPathToLocationSynchronously!=='function')return unavailable('API missing');
 const path=nav.FindPathToLocationSynchronously(S.pawn,W.vec(start),W.vec(goal),S.pawn);
 if(!W.alive(path)||!path.IsValid())return unavailable('invalid path');const partial=path.IsPartial();if(partial&&!allowPartial)return unavailable('partial not permitted');
 const arr=path.PathPoints,points=[];for(let i=0;i<(arr?.Num()||0);i++)points.push(W.plain(arr.Get(i)));
 const reason=points.length<2?'too few points':points.some(p=>!R.finite(p))?'non-finite points':R.dist(start,points[0])>140?'start mismatch':
  !partial&&(R.xy(goal,points.at(-1))>140||Math.abs(goal.z-points.at(-1).z)>110)?'goal mismatch':'';
 if(report)report({direction:'forward',status:reason?'rejected':partial?'partial':'complete',reason,partial,start:{...start},goal:{...goal},...sampledPath(points)});
 if(diagnostics)diagnostics.event('native full candidate',{direction:'forward',reason,partial,start:{...start},goal:{...goal},points:points.slice(0,12000).map(p=>({...p})),total:points.length});
 if(reason)return null;
 // Partial paths may supply doorway samples to checked local search, but
 // makePlan never presents one as a complete route to the selected item.
 const leg={world:S.level,provider:'native',searchDirection:'forward',points,checks:[],gates:[],moves:[],walks:points.slice(1).map((b,i)=>({a:points[i],b,edge:-1,from:i,to:i+1})),meters:R.extent(points)/100,partial};
 if(partial)Obstacles.obstacle(leg,{id:'native-frontier',world:S.level,p:points[points.length-1],unknown:true,icon:'mechanism',label:'前方通路待确认'});return leg;
}
function* makePlan(dest,walkOnly=false,seams=false,drops=false,context={},depth=0){
 if(depth===0&&dest.world===S.level&&recast.covers(S.level,S.world.feet(),dest.p)){
  const start=S.world.feet();context.start||={...start};context.goal||={...dest.p};context.goalWorld||=dest.world;
  if(S.world.refreshRulesJob)yield* S.world.refreshRulesJob();
  const leg=yield* recast.route(S.level,start,dest.p);if(!leg)return null;
  context.report?.('recast candidate',{points:leg.points.length,partial:leg.partial,generation:leg.recastGeneration});
  // Never splice old atlas/recorded guides into a covered Recast result.
  const rejected=yield* proofJob(leg,false,context,{deferRepair:true});
  return rejected===null?{legs:[leg],transfer:null}:Blocked.finish(context);
 }
 if(dest.noTransfer)walkOnly=true;
 const bellApproach=atArrivalBell(dest);
 const inactiveBell=!!dest.bell&&!bellList().some(b=>low(b.id)===low(dest.bell));
 if(depth===0){
  const guide=yield* Guides.plan(Locks.constrain(S.world,lockRows,S.level),S.level,dest,S.world.feet(),{graph:graphs.get(S.level),report:context.report});
  if(guide){const g=graph(S.level);if(g&&Passages.refreshLoadedJob)yield* Passages.refreshLoadedJob(g,S.world,S.pawn,S.world.feet(),dest.p,{report:context.report});Guides.refreshActions(guide.legs[0],g);return guide;}
 }
 const a=graph(S.level),b=graph(dest.world),start=S.world.feet();if(!a||!b||!R.finite(dest.p))return null;
 if(depth===0&&S.world.refreshRulesJob)yield* S.world.refreshRulesJob();
 const routeWorld=context.world||=Locks.constrain(S.world,lockRows,S.level);
 const clock=context.clock||Date.now;
 context.start||={...start};context.goal||={...dest.p};context.goalWorld||=dest.world;
 safe('ladder state',()=>Passages.refreshLadders(a,S.pawn));if(b!==a)safe('ladder state',()=>Passages.refreshLadders(b,S.pawn,false));
 const starts=(yield* Surface.anchorsJob(a,start)),ends=dest.node!==undefined?[{id:dest.node,q:dest.p}]:(yield* Surface.anchorsJob(b,dest.p,true));
 if(depth===0)context.report?.('atlas endpoints',{direction:'forward',start,goal:dest.p,starts:starts.map(r=>r.id),ends:ends.map(r=>r.id),
  sharedComponent:starts.some(s=>ends.some(e=>a===b&&a.sameComponent(s.id,e.id)))});
 if(depth===0&&S.world.snapshot)context.report?.('ground origin',S.world.snapshot(start));
 const targetFloor=dest.item&&dest.world===S.level?S.world.floorAt(dest.p,true):null;yield;
 const approachGoals=(dest.provider==='187'||dest.bell)&&dest.world===S.level?(yield* Goals.approaches(S.world,dest.p,140,{targetKey:dest.key})):[];
 const matchesGoal=leg=>!approachGoals.length?(!targetFloor||Math.abs(leg.points[leg.points.length-1].z-targetFloor.z)<=90):
  approachGoals.some(p=>R.xy(p,leg.points[leg.points.length-1])<185&&Math.abs(p.z-leg.points[leg.points.length-1].z)<=90);
 // A loaded nearby collectible need not wait for far-side bell estimates or
 // an atlas component search. Native output remains only a candidate until
 // the same floor/capsule/lock audit has accepted its complete endpoint.
 if(depth===0&&a===b&&dest.item&&!dest.bell&&dest.provider==='187'&&!context.nearItemTried&&R.dist(start,dest.p)<=6000){
  context.nearItemTried=true;
  context.preferLoadedItem=true;
  const landing=approachGoals.length?approachGoals.slice().sort((p,q)=>R.dist(start,p)-R.dist(start,q))[0]:targetFloor||dest.p;
  const native=safe('near item native',()=>nativeWalk(start,landing,true,context.report?data=>context.report('near item native query',data):undefined));yield;
  if(native&&!native.partial&&native.meters<=120){
   const checked=yield* Feasibility.check(routeWorld,native,start);
   if(checked.ok&&!checked.leg.partial&&matchesGoal(checked.leg)){
    context.report?.('near item complete',{provider:'native',meters:checked.leg.meters});
    return {legs:[checked.leg],transfer:null};
   }
  }
  if(R.dist(start,landing)<=2500&&Math.abs(start.z-landing.z)<=200){
   const local=yield* LocalWalk.search(routeWorld,start,landing,{clock,maxDistance:2500,maxNodes:256,maxMs:80,
    hints:require('./PBZRouteWalkHints').forWorld(S.level),...(approachGoals.length?{goals:approachGoals}:{}),
    report:context.report?(phase,data)=>context.report('near item '+phase,data):undefined});
   if(local&&!local.partial&&matchesGoal(local)){
    local.world=S.level;context.report?.('near item complete',{provider:'scene',meters:local.meters});
    return {legs:[local],transfer:null};
   }
  }
 }
 const legs=new Map(),lookout=Passages.isLookout(S.level,start,dest);
 context.repairTraversal||=function*(from,to,settings){
  if(typeof Passages.refreshLoadedJob==='function')yield* Passages.refreshLoadedJob(a,S.world,S.pawn,from,to,{report:context.report});
  const trip=yield* Passages.liveRouteJob(a,routeWorld,from,to,nativeWalk,{clock,deadline:settings.deadline,maxConnectors:32,report:context.report});
  return trip?.legs[0]||null;
 };
 const actionRoute=function*(landing){
  if(context.actionsTried||a!==b)return null;context.actionsTried=true;
  context.report?.('action search',{start,landing});
  if(typeof Passages.refreshLoadedJob==='function')yield* Passages.refreshLoadedJob(a,S.world,S.pawn,start,landing,{report:context.report});
  return yield* Passages.liveRouteJob(a,routeWorld,start,landing,nativeWalk,{clock,goals:approachGoals,allowPartial:true,report:context.report,banned:forbidden[a.name],onHorizon:trip=>{
   context.topologyPrefix=trip;
   Blocked.offer(context,trip.legs[0],start,dest.p);
  },onPartial:trip=>{
   context.partial=trip;context.actionPartial=trip;const leg=trip.legs[0];
   Blocked.offer(context,Blocked.fromFailure(leg,{prefix:leg.points,prefixLeg:leg,segment:leg.points.length-1,unknown:true,
    p:leg.points[leg.points.length-1],why:'traversal chain continues'},dest.p),start,dest.p);
  },onClosed:(first,action)=>{
   const source={world:S.level,points:[...first.points,...action.path,action.exit,dest.p],walks:[],moves:[],checks:[],gates:[]};
   const block=action.feature.state?.block;
   const failure={prefix:first.points,p:action.entry,segment:first.points.length-1,locked:!block?.unknown,unknown:!!block?.unknown,block,why:'closed traversal',prefixLeg:first};
   Blocked.offer(context,Blocked.fromFailure(source,failure,dest.p),start,dest.p);
  }});
 };
 yield;
 const getJoin=s=>{if(!legs.has(s.id))legs.set(s.id,Surface.join(routeWorld,start,s));return legs.get(s.id);};
 if(depth===0&&!context.roadbookTried&&inactiveBell&&a===b){
  context.roadbookTried=true;
  if(Passages.refreshLoadedJob)yield* Passages.refreshLoadedJob(a,S.world,S.pawn,start,dest.p,{report:context.report});
  const reference=yield* Roadbook.plan(routeWorld,S.level,dest,start,{graph:a,report:context.report});
  if(reference){
   const leg=reference.legs[0];
   Roadbook.prepare(leg,a,S.world,Passages);
   if((yield* proofJob(leg,false,context))===null)return reference;
  }
 }
 const transferEligible=depth===0&&!walkOnly&&!bellApproach&&!inactiveBell&&dest.item&&R.dist(start,dest.p)>2500;
 const prepareTransfer=function*(){
  if(!transferEligible||context.bellTransferTried)return context.bellTransfer;
  context.bellTransferTried=true;
  context.bellTransfer=yield* BellTransfer.plan(a,b,start,dest.p,bellList(),{banned:forbidden,
   approaches:function*(at,bell){return yield* Goals.approaches(routeWorld,at,140,{targetKey:'bell:'+bell.id});},
   ready:function*(p,goals){
    if(!routeWorld.floorAt(p))return false;yield;
    for(const q of goals){
     const r=R.xy(p,q),dz=q.z-p.z;if(r>90||Math.abs(dz)>68)continue;
     const join=Surface.join(routeWorld,p,{q,r,dz});yield;if(join)return true;
    }
    return false;
   },native:(p,q)=>nativeWalk(p,q),verify:function*(leg){return (yield* proofJob(leg,false))===null&&!leg.partial;},
   local:function*(at,goals){return yield* LocalWalk.search(routeWorld,start,at,{clock,goals,hints:require('./PBZRouteWalkHints').forWorld(S.level),maxDistance:6000,maxNodes:1600,maxMs:900});},
   inspectArrival:function*(route,bell){
    if((route.moves||[]).some(m=>m.fold||m.block))return {blocked:true};
    for(let i=1;i<route.points.length;i++){
     if(Locks.crossing(lockRows,b.name,route.points[i-1],route.points[i]))return {blocked:true};
     if(i%32===0)yield;
    }
    if(a!==b)return null;
    const goals=yield* Goals.approaches(routeWorld,toPoint(bell.at),140,{targetKey:'bell:'+bell.id});
    if(!goals.length)return null;
    let blocked=false;
    const next=route.points[1]||route.points[0];
    for(const p of goals.sort((p,q)=>R.dist(p,next)-R.dist(q,next)).slice(0,2)){
     const candidate={...route,points:[p,...route.points.slice(1)]};
     const checked=yield* Feasibility.check(routeWorld,candidate,p);
     if(checked.ok)return {verified:!checked.leg.partial&&!(route.moves||[]).length&&!(route.checks||[]).some(c=>!c.verified)};
     if(checked.unknown&&!checked.locked)return null;
     blocked=true;
    }
    return {blocked};
   }});
  if(context.bellTransfer){
   context.report?.('bell transfer',{from:context.bellTransfer.transfer.from.id,to:context.bellTransfer.transfer.to.id,
    estimatedMeters:context.bellTransfer.transfer.estimatedMeters,evidence:context.bellTransfer.transfer.evidence,arrival:'replan after teleport'});
   context.onDiagnostic?.(context.bellTransfer);
  }
  return context.bellTransfer;
 };
 // Nearby items can still need a real floor-changing action. Give their
 // native/atlas/action routes a turn before optional far-side bell estimates.
 if(transferEligible&&(a!==b||R.dist(start,dest.p)>6000))yield* prepareTransfer();
 const choose=route=>BellTransfer.prefer(context.bellTransfer,route);
 const plan=function*(s,e,entry,nearPads=false){
  const restrictions=nearPads?{...forbidden,[a.name]:{has:k=>forbidden[a.name]?.has(k)||
   (a.e[k*6+2]===7&&a.actors[a.e[k*6+5]-1]?.conditional)}}:forbidden;
  for(let attempt=0;attempt<(nearPads?3:lookout?9:4);attempt++){
  const r=yield* R.itineraryJob(a,b,s.q,dest.item?e.q:dest.p,entry,restrictions,e.id,s.id);if(!r)return null;let rejected=false;
  for(const l of r.legs)l.provider='atlas';
  context.report?.('atlas candidate',{direction:'forward',legs:r.legs.map(l=>({world:l.world,meters:l.meters,search:graphs.get(l.world)?.lastSearch,actions:l.moves?.map(m=>({kind:m.kind,guid:m.guid})),checks:l.checks?.length}))});
  const lead=getJoin(s);if(!lead)return null;const first=r.legs[0];first.points=[...lead.slice(0,-1),...first.points];first.meters=R.extent(first.points)/100;
  for(const c of first.checks)if(c.from!==undefined){c.from+=lead.length-1;if(c.to!==undefined)c.to+=lead.length-1;}
  for(const c of [...(first.walks||[]),...(first.moves||[])]){c.from+=lead.length-1;c.to+=lead.length-1;}
  first.walks=[...lead.slice(1).map((b,i)=>({a:lead[i],b,edge:-1,from:i,to:i+1})),...(first.walks||[])];
  context.atlasSeeds=first.points.slice();
  Blocked.offer(context,Blocked.fromFailure(first,{prefix:[first.points[0]],segment:0,unknown:true,why:'checking authored corridor'},dest.p),start,dest.p);
  for(const leg of r.legs){yield;const bad=yield* proofJob(leg,lookout,context);if(bad!==null){if(!leg.obstacles?.length){const c=leg.checks.find(c=>c.edge===bad);if(c)Obstacles.obstacle(leg,Obstacles.mark(leg,c,'unverified passage',null,true));}(forbidden[leg.world]||=new Set()).add(bad);const special=leg.checks.some(c=>c.edge===bad&&(c.kind===8||c.kind===9||lookout&&c.kind===5));const key=leg.world+'/'+bad;failedEdges.set(key,Math.max(failedEdges.get(key)||0,Date.now()+(special?45000:5500)));rejected=true;break;}}
  if(!rejected){const last=r.legs[r.legs.length-1];
   if(last.world===S.level&&!last.partial&&!matchesGoal(last))return null;
   if(Blocked.regressesFromActions(context.actionPartial?.legs[0],r.legs[0],dest.p))return null;
   return r;}}return null;
 };
 // Inspect the authored corridor before the costly scene-grid searches. A
 // moving player must not have to stand still until a failed chord is repaired.
 if(a===b&&!context.atlasTried&&!context.preferLoadedItem){
  context.atlasTried=true;
  for(const s of starts)for(const e of ends){
   if(!a.sameComponent(s.id,e.id))continue;
   const route=yield* plan(s,e,[]);
   if(route){if(!route.legs.some(l=>l.partial))return choose(route);context.partial=route;}
  }
 }
 if(a===b&&!seams&&!drops){
  const linkedBefore=a.liveEdges?.length||0;
  const landing=approachGoals.length?approachGoals.slice().sort((p,q)=>R.dist(start,p)-R.dist(start,q))[0]:targetFloor||(dest.item&&ends.length?ends[0].q:dest.p);
  let native=safe('current scene route',()=>nativeWalk(start,landing,true,context.report?data=>context.report('native query',data):undefined));
  if(!native&&R.dist(start,landing)<=16000){const points=[start,landing];
   native={world:S.level,provider:'direct',points,checks:[],gates:[],moves:[],obstacles:[],partial:false,
    walks:[{a:start,b:landing,from:0,to:1,edge:-1}],meters:R.dist(start,landing)/100};}
  if(native&&context.report){
   context.report('native candidate',{provider:native.provider,partial:!!native.partial,goal:{...landing},target:{...dest.p},...sampledPath(native.points)});
  }
  // A native frontier at the target's XY but on another floor is a search
  // clue, not guidance to that upstairs destination. Keep its original points
  // for connector seeds; never invent a walking edge up to the goal.
  const wrongFloorFrontier=!!native?.partial&&R.xy(native.points.at(-1),landing)<=300&&Math.abs(native.points.at(-1).z-landing.z)>200;
  if(wrongFloorFrontier)context.report?.('native frontier search only',{end:native.points.at(-1),goal:landing,reason:'projected endpoint on another floor'});
  // A short same-level remainder may still be certified by the ordinary
  // physical audit. Do not extend a partial path across a vertical gap.
  if(native?.partial&&!wrongFloorFrontier&&R.xy(native.points.at(-1),landing)<=850&&Math.abs(native.points.at(-1).z-landing.z)<=75){
   const points=native.points.slice();if(R.dist(points.at(-1),landing)>1)points.push(landing);
   native={...native,points,partial:false,obstacles:[],walks:points.slice(1).map((b,i)=>({a:points[i],b,from:i,to:i+1,edge:-1}))};
  }
  const goalSamples=typeof Surface.samplesJob==='function'?(yield* Surface.samplesJob(b,landing)):[];
  const doorSamples=(b.actors||[]).filter(f=>f.kind==='gate'&&f.at&&R.dist(toPoint(f.at),landing)<1800).slice(0,16).map(f=>toPoint(f.at));
  const seeds=[...goalSamples,...doorSamples,...(native?.points||[]),...(context.atlasSeeds||[])];
  // A rejected vertical chord can spend the whole wall-time budget in local
  // repair before an already resident climb is even considered. Certify the
  // native candidate first, but give actions a turn before its costly repair.
  const deferNativeRepair=Math.abs(start.z-landing.z)>200;
  let accepted=null,nativeRejected=false;
  if(native&&!wrongFloorFrontier){nativeRejected=(yield* proofJob(native,lookout,context,{deferRepair:deferNativeRepair}))!==null;if(!nativeRejected)accepted=native;}
  if(accepted&&!accepted.partial&&!matchesGoal(accepted))accepted=null;
  // A nearby higher floor can be an ordinary staircase, even when the live
  // navmesh projects the destination onto a lower deck. Try a small checked
  // walking search before action entry probes can consume the wall deadline.
  // This is only a preflight: an exhausted search leaves the existing action
  // and larger walking fallbacks available, with no unverified preview.
  if((!accepted||accepted.partial)&&!context.nearbyWalkTried&&R.dist(start,landing)<=4500){
   context.nearbyWalkTried=true;
   const hints=require('./PBZRouteWalkHints').forWorld(S.level);
   const limits=hints?{maxGraphNodes:768,maxChecks:64}:{maxNodes:192};
   context.report?.('nearby walking search',{start,goal:landing,...limits,maxMs:200});
   const nearby=yield* LocalWalk.search(routeWorld,start,landing,{clock,maxDistance:4500,...limits,maxMs:200,
    hints,hintsOnly:!!hints,...(approachGoals.length?{goals:approachGoals}:{}),
    report:context.report?(phase,data)=>context.report('nearby '+phase,data):undefined});
   if(nearby&&!nearby.partial&&matchesGoal(nearby)){nearby.world=S.level;return choose({legs:[nearby],transfer:null});}
  }
  let assisted=null;
  // Same-height gaps can require a rope or a climb/down-climb chain too.
  // Discover resident interactions before spending the local walking budget.
  if(!accepted||accepted.partial){
   const via=yield* actionRoute(landing);if(via){let valid=true;for(const leg of via.legs)if((yield* proofJob(leg,lookout,context))!==null){valid=false;break;}if(valid)assisted=via.legs[0];}}
  // The complete action chain has already passed the full physical audit.
  // Deliver it before optional atlas/grid shortening can consume the request.
  if(assisted&&!assisted.partial&&matchesGoal(assisted))return choose({legs:[assisted],transfer:null});
  if(assisted&&(!accepted||accepted.partial||assisted.meters<accepted.meters))accepted=assisted;
  // If actions did not finish the route, the original checked walking repair
  // remains available under its original deadline, limits and physical rules.
  if(deferNativeRepair&&nativeRejected&&(!accepted||accepted.partial)){
   const repaired=(yield* proofJob(native,lookout,context))===null?native:null;
   if(repaired&&(repaired.partial||matchesGoal(repaired))&&(!accepted||!repaired.partial))accepted=repaired;
  }
  if((a.liveEdges?.length||0)>linkedBefore){
   for(const s of starts)for(const e of ends){
    if(!a.sameComponent(s.id,e.id))continue;
    const linked=yield* plan(s,e,[]);if(!linked)continue;
    if(!linked.legs.some(l=>l.partial))return choose(linked);
    context.partial=linked;
   }
  }
  if((!accepted||accepted.partial)&&!context.endpointRepair){
   context.endpointRepair=true;
   yield* Connectivity.installJob(a,routeWorld,starts,ends,start,landing,{clock,report:context.report});
  }
  if(!context.sceneTried&&R.dist(start,landing)<=20000){context.sceneTried=true;
   const broad=R.dist(start,landing)>12000;
   context.report?.('scene walking search',{broad,spacing:broad?140:70});
   const local=yield* LocalWalk.search(routeWorld,start,landing,{clock,hints:require('./PBZRouteWalkHints').forWorld(S.level),report:context.report,waypoints:seeds,allowDrops:true,onProgress:progress=>{
    progress.world=S.level;progress.provider='scene';
    Blocked.offer(context,Blocked.fromFailure(progress,{prefix:progress.points,prefixLeg:progress,segment:progress.points.length-1,
     p:progress.points[progress.points.length-1],unknown:true,why:'scene search continues'}),start,dest.p);
   },
    ...(broad?{maxDistance:20000,spacing:140,maxNodes:6000}:{}),...(approachGoals.length?{goals:approachGoals}:{}),
    ...(accepted?{maxMs:2000,maxNodes:1800}:{})});
   if(local&&(!accepted||accepted.partial||local.meters<accepted.meters)){local.world=S.level;return choose({legs:[local],transfer:null});}}
  if(accepted&&!accepted.partial)return choose({legs:[accepted],transfer:null});
  if(accepted)context.partial={legs:[accepted],transfer:null};
 }
 if(context.bellTransfer)return context.bellTransfer;
 if(a===b){for(const s of starts)for(const e of ends){if(!a.sameComponent(s.id,e.id))continue;
  if(lookout){const near=yield* plan(s,e,[],true);if(near)return near;}
  const route=yield* plan(s,e,[]);if(route)return route;}
  const landing=dest.item&&ends.length?ends[0].q:dest.p;
  yield;const via=yield* actionRoute(landing);
  if(via){let valid=true;for(const leg of via.legs)if((yield* proofJob(leg,lookout,context))!==null){valid=false;break;}if(valid)return via;}}
 if(walkOnly&&!dest.key)return null;
 if(!drops){
  yield* Drops.installJob(a);if(b!==a)yield* Drops.installJob(b);a.allowDrops=b.allowDrops=true;
  try{const lowered=yield* makePlan(dest,walkOnly,seams,true,context,depth+1);if(lowered)return lowered;}finally{a.allowDrops=b.allowDrops=false;}
 }
 if(!walkOnly&&!dest.item&&!bellApproach&&!inactiveBell){const entry=bellList();for(const s of starts)for(const e of ends){const route=yield* plan(s,e,entry);if(route)return route;}}
 if(!seams){
  yield* Obstacles.installSeamsJob(a);if(b!==a)yield* Obstacles.installSeamsJob(b);a.allowSeams=b.allowSeams=true;
  try{const repaired=yield* makePlan(dest,walkOnly,true,drops,context,depth+1);if(repaired)return repaired;}finally{a.allowSeams=b.allowSeams=false;a.allowBlockedTraverse=b.allowBlockedTraverse=false;}
 }
 if(depth===0&&transferEligible&&!context.bellTransferTried){const transfer=yield* prepareTransfer();if(transfer)return transfer;}
 return depth===0?context.topologyPrefix||context.partial||Blocked.finish(context):null;
}
function routeRequest(dest,start=S.world.feet()){
 const covered=dest.world===S.level&&recast.covers(S.level,start,dest.p);
 return {key:dest.key,world:dest.world,level:S.level,p:dest.p,start,revision:covered?'recast/'+recast.revision+'/'+S.lockVersion:(graphs.get(S.level)?.passageRevision||0)+'/'+S.lockVersion+'/'+atlas.revision,
  originRevision:stanceEpoch+'/'+Math.round(S.world?.h||0)+','+Math.round(S.world?.r||0)};
}
function standingAt(p){
 const mode=S.pawn?.CharacterMovement?.MovementMode,modes=UE.EMovementMode;
 if(modes&&[modes.MOVE_Falling,modes.MOVE_Flying,modes.MOVE_Swimming].some(v=>v!==undefined&&v===mode))return false;
 const floor=S.world.floorAt?.(p);return !S.world.floorAt||!!floor&&Math.abs(floor.z-p.z)<=65;
}
function originChanged(old,current,trip){
 if(!planning.changed(old,current))return false;
 if(!planning.same(old,current)||old.revision!==current.revision||old.originRevision!==current.originRevision)return true;
 const leg=trip?.legs[S.active];
 // A short connected slope can be checked without retaining player history.
 // A vertical landing or an intervening wall cannot pass.
 const run=R.xy(old.start,current.start),rise=Number(S.world.rise)||45,slope=Number(S.world.slope)||1;
 if(!leg&&run>20&&run<1200&&Math.abs(old.start.z-current.start.z)<=rise+run*slope){
  const step=S.world.step(old.start,current.start,true);
  if(step.p&&R.dist(step.p,current.start)<50)return false;
 }
 if(leg&&(leg.guide||leg.physicalVerified||leg.diagnostic&&leg.verifiedEndIndex>0)&&leg.world===S.level){
  const corridor=leg.diagnostic?leg.points.slice(0,leg.verifiedEndIndex+1):leg.points;
  const near=R.nearestOnLine(current.start,corridor);
  if(near.p&&near.d<260&&Math.abs(near.p.z-current.start.z)<75)return false;
 }
 return true;
}
function movedForRetry(a,b){return R.xy(a,b)>=600||Math.abs(a.z-b.z)>=75;}
function solve(dest,reason){
 if(!S.world||!R.finite(dest.p)||!S.cfg.MapRoute&&!S.cfg.MinimapRoute&&!S.cfg.WorldThread)return;
 if(!atArrivalBell(dest))S.bellArrival=null;
 const start=S.world.feet(),request=routeRequest(dest,start),force=!previous||reason==='blocked approach changed'||reason==='loaded frontier'||reason==='player context changed'||reason==='destination bell reached';
 const retained={trip:S.trip,key:S.targetKey,active:S.active,request:previous};
 const keepExisting=(now,candidate)=>retained.trip&&S.trip===retained.trip&&retained.key===dest.key&&
  retained.request?.revision===now.revision&&retained.trip.legs.every(l=>!l.partial&&!l.diagnostic)&&
  Blocked.keepComplete(retained.trip.legs[retained.active],S.world,now.start,candidate?.legs[0]);
 S.lookoutHint=Passages.isLookout(S.level,start,dest);
 const context={report:(phase,detail)=>log('route search',phase+' '+JSON.stringify(detail)),onDiagnostic:trip=>{
  if(!Blocked.canGuide(trip?.legs[0]))return;
  const current=S.manual||(!questGate.paused&&tracked(narrative()))||S.scout;
  if(current?.key===dest.key&&S.level===request.level&&R.dist(current.p,dest.p)<190){
   const now=routeRequest(current);if(keepExisting(now,trip))return;
   if(originChanged(request,now,trip)&&standingAt(now.start)&&poseReady)return;
   setTrip(trip,dest,now.start,reason+(trip.transfer?' bell candidate':' blocked; searching detour'),now);
  }
 }};
 const accepted=planning.request(request,clock=>{context.clock=clock;return makePlan(dest,!!dest.bell&&dest.provider!=='187',false,false,context);},(trip,selected,metrics)=>{
  const current=S.manual||(!questGate.paused&&tracked(narrative()))||S.scout;
  if(!current||current.key!==selected.key||S.level!==selected.level||R.dist(current.p,selected.p)>190)return;
  const now=routeRequest(current);
  if((!trip||trip.legs.some(l=>l.partial||l.diagnostic))&&keepExisting(now,trip)){
   S.routeWork=null;updateRouteStatus(true);return;
  }
  if(originChanged(selected,now,trip||S.trip)){
   if(standingAt(now.start)&&poseReady)solve(current,'player context changed');
   return;
  }
  // A failed route is a result. It stays stopped until selection, region,
  // destination, door/ladder state, or substantial movement actually changes.
  if(!trip&&(metrics.timeout||metrics.paused||metrics.error))trip=Blocked.finish(context);
  setTrip(trip,dest,now.start,reason+' async cpu='+metrics.cpu+'ms wall='+metrics.wall+'ms',now);
  if(trip)S.routeWork=null;
  updateRouteStatus(true);
  if(!trip&&planning.failed)planning.failed.revision=routeRequest(dest,start).revision;
 },force);
 if(accepted){
  S.routeWork={...request,started:Date.now()};
  previous={key:dest.key,p:{...dest.p},site:{...start},level:S.level,revision:request.revision,originRevision:request.originRevision};lastSolve=Date.now();
  if(!S.trip||S.targetKey!==dest.key){S.trip=null;S.line=[];S.targetKey=dest.key;S.version++;threads.hide();}
  updateRouteStatus(true);
 }
}

function observe(){
 const foot=S.world.feet(),ms=T.getWorldSubsystem(S.pawn,UE.MapSubsystem.StaticClass());
 S.level=W.norm(UE.GameplayStatics.GetCurrentLevelName(S.pawn,true));
 const locID=low(ms.GetMapIDByLocation(W.vec(foot)));S.area=locID&&locID!=='none'?locID:low(ms.GetCurrentMapID());
 if(oldWorld!==S.level){wasGrounded=null;lastFoot=null;lastGroundFoot=null;S.world.resetRules?.();stanceEpoch++;}
 if(oldWorld!==S.level){planning.clear('region changed');oldWorld=S.level;previous=null;lastBells=0;scout.snapshot=null;for(const k of Object.keys(forbidden))delete forbidden[k];for(const k of Object.keys(passed))delete passed[k];failedEdges.clear();provenJoins.clear();graphs.get(S.level)?.clearLiveEdges();safe('locks',locks);}
 const activeGraph=recast.covers(S.level,foot)?graphs.get(S.level):graph(S.level);
 groundedNow=standingAt(foot);
 poseReady=groundedNow&&(!lastFoot||Math.abs(lastFoot.z-foot.z)<20);
 if(wasGrounded===false&&groundedNow&&lastGroundFoot){
  const run=R.xy(lastGroundFoot,foot),height=Math.abs(lastGroundFoot.z-foot.z);
  // A small ordinary hop returns to the same walking context. A landing
  // across a gap (even at the same height) must release the old origin.
  if(height>=75||run>=600)stanceEpoch++;
  else if(run>90){const join=S.world.step(lastGroundFoot,foot,true);if(!join.p||R.dist(join.p,foot)>50)stanceEpoch++;}
 }
 if(groundedNow)lastGroundFoot={...foot};
 wasGrounded=groundedNow;lastFoot={...foot};
 if(activeGraph&&safe('ladder state',()=>Passages.refreshLadders(activeGraph,S.pawn))){previous=null;provenJoins.clear();log('ladder state','ready='+activeGraph.openPassages.size+' revision='+activeGraph.passageRevision);}
 if(activeGraph&&safe('mechanism state',()=>Passages.refreshStates?.(activeGraph,S.world,S.pawn))){provenJoins.clear();guardedLeg=null;log('mechanism state','revision='+activeGraph.passageRevision);}
 const now=Date.now();if(now-lastLocks>=1250)safe('lock refresh',locks);
 for(const [key,t] of failedEdges){if(t>now)continue;const [world,id]=key.split('/');forbidden[world]?.delete(Number(id));failedEdges.delete(key);}
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
 const travel=TravelMode.read(S.pawn,UE,T);
 if(travel){
  if(!S.travelPhase||S.travelPhase.key!==target.key||S.travelPhase.kind!==travel.kind){
   planning.clear('vehicle movement');auditor.reset();guardedLeg=null;S.trip=null;S.line=[];S.threadEnd=null;S.version++;threads?.hide();
  }
  S.travelPhase={...travel,key:target.key};S.routeWork={key:target.key,level:S.level,world:target.world,started:now};
  updateRouteStatus(true);return;
 }
 if(S.travelPhase){
  if(S.travelPhase.kind==='traversal'&&(!groundedNow||!poseReady)){updateRouteStatus(true);return;}
  S.travelPhase=null;previous=null;solve(target,'controlled movement ended');return;
 }
 if(!atArrivalBell(target))S.bellArrival=null;
 const transfer=S.targetKey===target.key?S.trip?.transfer:null;
 // Consume the arrival before origin/revision checks can restart the old
 // transfer. This state belongs only to the selected item and is never saved.
 if(transfer&&S.active===0&&S.level===transfer.to.world&&R.dist(foot,toPoint(transfer.to.at))<750&&
  (S.level!==transfer.from.world||R.dist(foot,toPoint(transfer.from.at))>1300)){
  S.active=1;S.line=S.trip.legs[1].points;S.version++;
  if(transfer.arrivalPending){
   S.bellArrival={key:target.key,world:target.world,goal:{...target.p},bell:transfer.to.id};
   solve(target,'destination bell reached');return;
  }
 }
 const currentRequest=routeRequest(target,foot);
 if(planning.pending&&poseReady&&planning.stale(currentRequest)&&originChanged(planning.job.request,currentRequest,S.trip)){
  solve(target,'player context changed');return;
 }
 if(previous&&!planning.pending&&poseReady&&(previous.revision!==currentRequest.revision||previous.originRevision!==currentRequest.originRevision)){
  solve(target,'player context changed');return;
 }
 if(!menu&&!planning.pending)safe('loaded passage anchors',()=>Passages.updateLoaded(graphs.get(S.level),S.world,S.pawn,nativeWalk));
 if(!previous||previous.key!==target.key||previous.level!==S.level||R.dist(previous.p,target.p)>190){solve(target,'selection');return;}
 if(S.trip){
  if(S.arrival.isDone(S))return;
  // Also visit arrival when a route has collapsed to one point or its FX is off.
  const leg=S.trip.legs[S.active];
  if(leg.diagnostic&&!planning.pending&&poseReady&&now-lastSolve>1500&&movedForRetry(foot,previous.site)){solve(target,'blocked approach changed');return;}
  if(leg.scenePartial&&!planning.pending&&poseReady&&R.dist(foot,leg.points[leg.points.length-1])<600&&now-lastSolve>2000&&movedForRetry(foot,previous.site)){solve(target,'loaded frontier');return;}
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
  if(poseReady&&now-deviationSince>650&&now-lastSolve>1000&&movedForRetry(foot,previous.site))solve(target,'off route');
 }else if(!planning.pending&&!planning.blocked(routeRequest(target,foot)))solve(target,'context changed');
}
function guardRoute(now){
 const leg=S.trip?.legs[S.active];if(!leg||leg.world!==S.level)return;
 if(leg.waitingTransfer){S.threadEnd=S.world.feet();return;}
 if(guardedLeg===leg&&now<nextClearance&&(groundedNow||leg.guide)&&!(leg.diagnostic&&!poseReady))return;
 const feet=S.world.feet();
 if(!leg.guide&&!groundedNow||leg.diagnostic&&!poseReady){S.threadEnd=feet;return;}
 nextClearance=now+34;
 // Never release all of a provider's untested line just because it omitted
 // walking metadata. Missing segments are audited as walking below.
 if(!planning.pending&&guardRetry&&now>=guardRetry){
  guardRetry=0;const target=S.manual||(!questGate.paused&&tracked(narrative()))||S.scout;
  if(target?.key===S.targetKey&&!S.arrival.isDone(S)){solve(target,'blocked detour');return;}
 }
 Guides.refreshActions(leg,graphs.get(leg.world));
 for(const move of leg.moves||[]){
  const state=graphs.get(leg.world)?.passageStates?.get(String(move.stateGuid||move.guid||'').toLowerCase());
  if(state?.ready===false)move.block=state.block;
  else if(move.block?.source==='live-mechanism')delete move.block;
 }
 if(guardedLeg!==leg){guardedLeg=leg;auditor.begin(Blocked.auditLeg(leg),Locks.constrain(S.world,lockRows,S.level),feet,now);S.threadEnd=auditor.safe;lastGuardVersion='';}
 else if(!auditor.job&&(now-auditor.started>10000||R.xy(feet,auditor.origin)>200||Math.abs(feet.z-auditor.origin.z)>=75))auditor.begin(Blocked.auditLeg(leg),Locks.constrain(S.world,lockRows,S.level),feet,now);
 const hadJob=!!auditor.job,result=auditor.pump(Date.now,12,1);
 S.threadEnd=auditor.safe||feet;
 if(hadJob&&result?.mark){
  if(!leg.diagnostic||!result.mark.unknown)Obstacles.obstacle(leg,{...result.mark,transient:true});
  log('blocked '+result.mark.edge,(result.mark.unknown?'pending ':'collision ')+result.mark.reason+' @'+[result.mark.p.x,result.mark.p.y,result.mark.p.z].map(Math.round).join(','));
  if(!result.mark.unknown&&!leg.guide&&leg.provider!=='recast'){
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
 const sig=(leg.obstacles||[]).map(r=>r.id+'/'+r.unknown+'/'+[r.p.x,r.p.y,r.p.z].map(v=>Math.round(v/25)).join(',')).join('|')+';'+(leg.checks||[]).filter(c=>(c.kind===10||c.kind===12)&&c.verified).map(c=>c.edge).join(',');
 if(sig!==lastGuardVersion){lastGuardVersion=sig;markLocks(S.trip);S.version++;}
}

function onSense(){
 if(!this.senseActive||!S.world)return;S.expires=Date.now()+30000;
 if(!S.cfg.FogBellSense||!S.cfg.MapRoute&&!S.cfg.MinimapRoute&&!S.cfg.WorldThread||S.manual||!questGate.paused&&questID(narrative()))return;
 const foot=S.world.feet(),request={key:'fog:'+S.area,world:S.level,level:S.level,p:foot,start:foot,revision:S.lockVersion};
 const accepted=planning.request(request,()=>scout.beginJob(S,function*(p){const trip=yield* makePlan({p,world:S.level},true);return trip?.legs[0];}),(pin,selected)=>{
  if(S.level!==selected.level||S.manual||!questGate.paused&&questID(narrative()))return;
  S.scout=pin;if(pin){S.arrival.restart();setTrip(pin.trip,pin,S.world.feet(),'fog sense');}else noRoute();
 },true);
 if(accepted){S.routeWork={...request,started:Date.now()};updateRouteStatus(true);}
}

function developerTick(now){
 if(!diagnostics||!S.world)return;
 if(developerWorld!==S.world){
  developerWorld=S.world;const world=S.world,step=world.step;
  if(world.threadHit){const trace=world.threadHit;world.threadHit=function(a,b){const hit=trace.call(this,a,b);
   diagnostics.event('guide probe',{from:{...a},to:{...b},hit:!!hit,...(hit?{trace:this.describeTrace(hit)}:{})});return hit;};}
  let lastFailure='';
  world.step=function(a,b,expected){
   const result=step.call(this,a,b,expected);
   if(!result.p){const key=[Math.round(a.x/100),Math.round(a.y/100),Math.round(b.x/100),Math.round(b.y/100),result.why].join('/');
    if(key!==lastFailure){lastFailure=key;diagnostics.event('walking probe rejected',{from:{...a},to:{...b},expected,why:result.why,p:result.hit,
     ...(result.collision?{trace:this.describeTrace(result.collision)}:{})});}}
   return result;
  };
 }
 if(developerPawn!==S.pawn||!W.alive(developerPC)){developerPawn=S.pawn;developerPC=UE.GameplayStatics.GetPlayerController(S.pawn,0);}
 developerKeys||={heavy:['Gamepad_FaceButton_Top','F','Y'],light:['Gamepad_FaceButton_Left','LeftMouseButton'],defense:['Gamepad_LeftShoulder','RightMouseButton']};
 const held=names=>names.some(name=>{const key=developerKeys[name]||=(new UE.Key(name));return !!developerPC?.IsInputKeyDown?.(key);});
 const down=held(developerKeys.heavy);
 const feet=S.world.feet();
 const capture=()=>developerAPI.snapshot({...S,manual:S.manual||planning.job?.request||previous||S.scout,
  captureOrigin:planning.job?.request.start||previous?.start,observedLocks:lockRows},planning,threads,notes);
 if(diagnostics.context!==S.level+'/'+S.contextEpoch||now-diagnostics.lastSample>=100){const sample={context:S.level+'/'+S.contextEpoch,world:S.level,feet,routeVersion:S.version,
  targetKey:S.manual?.key||S.targetKey||planning.job?.request.key||null,searchRequested:'forward',
  physical:S.world.snapshot(feet),travel:S.travelPhase||null};
  diagnostics.sample(sample,now);diagnostics.survey?.sample(sample,!menu,now);
 }
 const result=diagnostics.poll(down,!menu,capture,now);
 const action=diagnostics.survey?.poll({light:held(developerKeys.light),defense:held(developerKeys.defense)},!menu,now);
 if(action?.kind==='player-mistake')diagnostics.mark(capture(),now,'player-mistake');
 if(result||action)updateRouteStatus(true);
}
function tick(){settings();const sampleTime=Date.now();diagnostics?.advance(sampleTime);
 if(gameContext&&(sampleTime-lastPlayerCheck>=300||!W.alive(S.pawn))){lastPlayerCheck=sampleTime;const p=UE.GameplayStatics.GetPlayerCharacter(gameContext,0);
  if(W.alive(p)&&p!==S.pawn){unbind();reset();S.pawn=p;S.world=null;oldWorld='';lastPoll=0;log('player','rebound after travel');}}
 if(!W.alive(S.pawn)){diagnostics?.survey?.finish('player unavailable',sampleTime);planning.cancel('no player');clearRouteStatus();threads.hide();return;}if(!S.cfg.MapRoute&&!S.cfg.MinimapRoute&&!S.cfg.WorldThread){diagnostics?.survey?.finish('navigation disabled',sampleTime);planning.cancel('disabled');clearRouteStatus();threads.hide();return;}
 if(!S.world)S.world=new W.Ground(S.pawn);const now=Date.now();safe('atlas slice',()=>atlas.pump());
 safe('recast slice',()=>recast.pump(W.norm(UE.GameplayStatics.GetCurrentLevelName(S.pawn,true)),S.pawn,S.world.feet()));
 if(now-lastPoll>=105){lastPoll=now;safe('tracking',observe);safe('tracker',()=>{tracker?.poll();if(waitingTracker){const item=waitingTracker;waitingTracker=null;trackerChanged(item,'restore');}});const router=T.getlocalPlayerSubsystem(S.pawn,UE.PBZUIActionRouterBase.StaticClass());menu=!!router&&router.GetActiveInputMode()===UE.ECommonInputMode.Menu;}
 safe('planning slice',()=>planning.pump());
 safe('route status',()=>updateRouteStatus());
 if(S.trip)safe('route clearance',()=>guardRoute(now));
 if(show()&&!menu&&S.cfg.WorldThread&&S.trip)safe('thread',()=>threads.show(S));else threads.hide();
 if(diagnostics)safe('developer capture',()=>developerTick(now));}
function mapAcceptsPins(h){
 return !h.BigMapMode&&h.CanUIInput?.()!==false&&!h.isModalOpen?.()&&!h.isOpenCompletion?.()&&
  !h.IsOpenByBell?.()&&!h.pbzFilterOpen?.()&&!h.__pbzTrackerControls?.open;
}
function trackerChanged(item,reason){
 if(!S.world||!S.level){waitingTracker=item;return;}
 if(!item){
  if(S.manual?.provider!=='187')return;
  if(/collected|acquired/i.test(reason)){S.arrival.completedTarget=S.manual.key;noRoute();threads.hide();return;}
  if(!/untrack|cancel|stop|selected|clear/i.test(reason))return;
  clearManual('tracker '+reason);return;
 }
 if(item.auto&&surveyTracker?.match(item.id))return;
 if(item.auto&&(S.manual?.provider!=='187'&&S.manual||!questGate.paused&&questID(narrative())))return;
 selectItem(item,'tracker',worldOf(item.area),item.area);
}
function selectItem(item,device,displayWorld,displayArea,host){
 const survey=surveyTracker?.match(item.id);if(survey&&!item.auto)diagnostics.survey.select(survey.task.id);
 if(host&&item.provider==='187'&&tracker){
  safe('tracker selection',()=>tracker.choose(host,item));
 }
 if(item.provider!=='187')tracker?.clear('route item selected');
 const bell=BellIdentity.fromItem(item,tables.bells),targetWorld=survey?.task.world||bell?.world||worldOf(item.area)||displayWorld;
 epoch++;questGate.pause(questID(narrative()));S.scout=null;S.bellArrival=null;S.arrival.restart();
 // The item's world comes from its location. Its icon UV is relative to the
 // visible chart, which can group several named subareas together.
 S.manual={p:item.p,uv:item.uv,world:targetWorld,area:displayArea,item:true,provider:item.provider,auto:!!item.auto,key:'item:'+item.area+'/'+item.id,label:String(item.name||item.title||''),
  ...(bell?{bell:bell.id}:{}),...(survey?{survey:survey.task.id,surveyRole:survey.role,noTransfer:true}:{})};
 previous=null;safe('item route',()=>solve(S.manual,device+' item'));
 log('item',device+' '+item.id+' @ '+[item.p.x,item.p.y,item.p.z].map(Math.round).join(','));
}
function mapAcceptsItems(h){
 return !h.BigMapMode&&h.CanUIInput?.()!==false&&!h.isModalOpen?.()&&!h.isOpenCompletion?.()&&
  !h.pbzFilterOpen?.()&&!h.__pbzTrackerControls?.open;
}
function selectionIntent(h,uv,width,height,pad,type){
 const focused=pad&&focusedPadItem(h,width,height);if(focused)return {item:focused,allowed:true,focus:focused.id};
 const intent=mapIntent(h,uv,width,height,pad,type);
 if(intent.item||!mapAcceptsPins(h))return intent;
 const area=low(h.CurrentDisplayMapID),name=worldOf(area),ms=T.getWorldSubsystem(h,UE.MapSubsystem.StaticClass());
 const project=(p,requestedArea)=>{const at=ms.ProjectWorldLocationToMap(W.vec(p),requestedArea||h.CurrentDisplayMapID);return {x:Number(at.X),y:Number(at.Y)};};
 const bells=Object.values(tables.bells).filter(b=>b.world===name&&
  (low(b.area)===area||Groups.isInSameMapGroup(area,low(b.area))||low(h.mapIDToBigMapID(b.area)||b.area)===area));
 const bell=pickBell(h,uv,width,height,bells,project,bellList());
 return bell?{...intent,allowed:true,bell}:intent;
}
function selectBell(hit,device,area){
 const b=hit.bell;
 tracker?.clear('bell selected');epoch++;questGate.pause(questID(narrative()));S.scout=null;S.bellArrival=null;S.arrival.restart();
 S.manual={p:{...hit.p},uv:{...hit.uv},world:b.world,area,bell:b.id,item:true,key:'bell:'+b.world+'/'+low(b.id),label:b.name};
 previous=null;S.version++;solve(S.manual,device+' bell');
 log('selection',JSON.stringify({source:hit.source,bell:b.id,world:b.world,goal:S.manual.p,pixels:hit.distance}));
}
function confirmation(h){let value=confirmations.get(h);if(!value){value=new ItemConfirm();confirmations.set(h,value);}return value;}
function confirmMapItem(h,device='native',repeat=false){
 if(!S.world||!W.alive(S.pawn)||(!S.cfg.MapRoute&&!S.cfg.MinimapRoute&&!S.cfg.WorldThread)||!mapAcceptsItems(h))return false;
 const size=h.CurrentMapSize(),focus=h.FocusPoint;if(!focus||!size)return false;
 const pad=h.getCurrentInputType()===UE.ECommonInputType.Gamepad;
 let uv={x:Number(focus.X),y:Number(focus.Y)};
 if(!pad){const sample=pointerSample(h);if(sample)uv=sample.uv;}
 const intent=selectionIntent(h,uv,Number(size.X),Number(size.Y),pad,h.getCurrentInputType());
 if(!intent.item&&!intent.bell)return false;
 if(repeat)return true;
 if(intent.bell){
  if(!confirmation(h).claim('bell/'+intent.bell.bell.id,Date.now()))return true;
  const state=maps.get(h);if(state)state.press.reset(true);
  selectBell(intent.bell,device,low(h.CurrentDisplayMapID));return true;
 }
 const item=intent.item;
 if(!confirmation(h).claim(item.area+'/'+item.id,Date.now()))return true;
 const area=low(h.CurrentDisplayMapID),state=maps.get(h);if(state)state.press.reset(true);
 safe('selected item route',()=>selectItem(item,device,worldOf(area),area,h));
 log('item confirm',device+' selected='+String(h.SlotWidgetGroup?.GetSelectedSlotID?.())+' snap='+String(h.lastSnappedIconID)+' item='+item.id);
 return true;
}
function clearManual(device){
 // Clear means stop this navigation, not fall back to the still-tracked quest.
 planning.clear('explicit cancel');clearRouteStatus();questGate.pause(questID(narrative()));epoch++;pending=null;
 tracker?.clear('route cleared');S.manual=null;S.scout=null;S.bellArrival=null;S.lookoutHint=false;
 auditor.reset();guardedLeg=null;blockedTrip=null;S.threadEnd=null;S.targetKey='';S.trip=null;S.line=[];previous=null;S.arrival.reset();S.version++;
 threads.hide();ink?.clearAll();mini?.clearAll();log('input',device+' navigation cancelled');
}
function padSample(h){
 const size=h.CurrentMapSize?.(),focus=h.FocusPoint;if(!size||!focus)return null;
 const width=Number(size.X),height=Number(size.Y),uv={x:Number(focus.X),y:Number(focus.Y)};
 if(!(width>0&&height>0))return null;
 const intent=selectionIntent(h,uv,width,height,true,UE.ECommonInputType.Gamepad);
 return {now:Date.now(),area:low(h.CurrentDisplayMapID),width,height,uv,
  allowed:!!S.world&&W.alive(S.pawn)&&(S.cfg.MapRoute||S.cfg.MinimapRoute||S.cfg.WorldThread)&&mapAcceptsPins(h)&&intent.allowed&&!intent.item};
}
function focusedPadItem(h,width,height){
 const item=padFocus.current(h,width,height);if(!item)return null;
 if(!S.world||!mapAcceptsPins(h)||h.getCurrentInputType()!==UE.ECommonInputType.Gamepad){padFocus.release(h);return null;}
 const native=findRow(h,item.slotID||item.id),rows=globalThis.PBZMapTrackerBridge?.target?.markers?.()||[];
 const valid=native?readItem(h,item.slotID||item.id,native,width,height):rows.some(p=>p.key===item.id&&!p.collected&&p.visible!==false&&
  p.location[0]===item.p.x&&p.location[1]===item.p.y&&p.location[2]===item.p.z);
 if(!valid){padFocus.release(h);return null;}
 return item;
}
function movePadFocus(h,key,repeat,source='event'){
 if(!mapAcceptsPins(h)||h.getCurrentInputType()!==UE.ECommonInputType.Gamepad||!S.world||!W.alive(S.pawn)||
  !S.cfg.MapRoute&&!S.cfg.MinimapRoute&&!S.cfg.WorldThread)return false;
 const size=h.CurrentMapSize?.(),width=Number(size?.X),height=Number(size?.Y);if(!(width>0&&height>0))return false;
 const area=low(h.CurrentDisplayMapID),ms=T.getWorldSubsystem(h,UE.MapSubsystem.StaticClass());
 // The displayed chart can include another streamed world (PangZhen/HouJie).
 // Match the game's chart membership, while keeping the item's actual world.
 const belongs=id=>low(id)===area||Groups.isInSameMapGroup(area,low(id))||low(h.mapIDToBigMapID(id)||id)===area;
 const project=(p,id)=>{const at=ms.ProjectWorldLocationToMap(W.vec(p),id||h.CurrentDisplayMapID);return at?{x:Number(at.X),y:Number(at.Y)}:null;};
 const service=globalThis.PBZMapTrackerBridge?.target,markers=service?.markers?.()||[],items=directionalItems(h,width,height,markers,project,belongs);
 const item=padFocus.move(h,items,key,width,height,Date.now(),repeat);
 if(!item){if(!repeat)log('pad focus',JSON.stringify({source,direction:key,chart:area,markers:markers.length,candidates:items.length,selected:null}));return items.length>0;}
 // Suppress the stock bell latch until an actual stick move leaves this UV.
 h.lastSnappedIconID='';h.pushSnapTargetID='';h.timeSinceAxisInput=999;h.SlotWidgetGroup?.ClearSelection?.();
 h.FocusToPoint(new UE.Vector2D(item.uv.x,item.uv.y));
 const row=findRow(h,item.slotID||item.id);if(row)h.selectMapSlot?.(row.widget,row.itemType,true);
 if(item.provider==='187')service?.focus?.(item.tracked);
 log('pad focus',JSON.stringify({source,direction:key,chart:area,markers:markers.length,candidates:items.length,selected:item.id}));
 return true;
}
function padDirection(h,key,down,now,source){
 if(!mapAcceptsPins(h)||h.getCurrentInputType()!==UE.ECommonInputType.Gamepad){padFocus.resetInput(h);return false;}
 const sample=padFocus.input(h,key,down,now);if(!sample)return false;
 if(sample.fire)sample.state.handled=movePadFocus(h,key,sample.repeat,source);
 return sample.state.handled;
}
function pollPadDirections(h,state,now){
 if(!mapAcceptsPins(h)||h.getCurrentInputType()!==UE.ECommonInputType.Gamepad){padFocus.resetInput(h);return;}
 const router=T.getlocalPlayerSubsystem(h,UE.PBZUIActionRouterBase.StaticClass()),pc=h.GetOwningPlayer?.();
 if(typeof router?.IsUIKeyHeld!=='function'&&typeof pc?.IsInputKeyDown!=='function')return;
 const keys=state.directionKeys||=new Map();
 for(const name of Object.keys(padDirections)){
  let key=keys.get(name);if(!key){key=new UE.Key(name);keys.set(name,key);}
  const held=!!router?.IsUIKeyHeld?.(key)||!!pc?.IsInputKeyDown?.(key);
  padDirection(h,name,held,now,'poll');
 }
}
function bindPadTap(proto){
 const original=proto.OnPreviewKeyDown,originalUp=proto.OnKeyUp,originalSnap=proto.updateGamepadSnap;
 if(typeof originalSnap==='function')Object.defineProperty(proto,'updateGamepadSnap',{value:function(...args){
  const size=this.CurrentMapSize?.();if(size&&focusedPadItem(this,Number(size.X),Number(size.Y)))return;
  return originalSnap.apply(this,args);
 },writable:true,configurable:true});
 const onKey=function(geometry,event){
  const name=String(UE.KismetInputLibrary.GetKey(event)?.KeyName||'');
  if(padDirections[name]&&safe('pad directional item',()=>padDirection(this,name,true,Date.now(),'event')))return UE.WidgetBlueprintLibrary.Handled();
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
  const name=String(UE.KismetInputLibrary.GetKey(event)?.KeyName||'');
  if(padDirections[name])padFocus.input(this,name,false,Date.now());
  if(String(UE.KismetInputLibrary.GetKey(event)?.KeyName||'')==='Gamepad_FaceButton_Bottom'){
   const input=pads.get(this),gate=confirmations.get(this);
   if(input?.press){const sample=safe('pad release',()=>padSample(this));if(sample)input.up(sample);else input.cancel();return UE.WidgetBlueprintLibrary.Handled();}
   if(gate?.held){gate.sample(false,Date.now());return UE.WidgetBlueprintLibrary.Handled();}
  }
  return originalUp?originalUp.apply(this,arguments):UE.WidgetBlueprintLibrary.Unhandled();
 };
 Object.defineProperty(proto,'OnPreviewKeyDown',{value:onKey,writable:true,configurable:true});
 Object.defineProperty(proto,'OnKeyUp',{value:onUp,writable:true,configurable:true});
 log('pad input','D-pad nearest directional collectible; A confirm, hold cancel');
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
  const button=String(UE.KismetInputLibrary.PointerEvent_GetEffectingButton(event)?.KeyName);
  if(button!=='MiddleMouseButton')return;
  let input=pointers.get(this);if(!input){input=new Pointer();pointers.set(this,input);}
  if(!input.down(pointerSample(this)))return;
  const reply=UE.WidgetBlueprintLibrary.Handled();
  return UE.WidgetBlueprintLibrary.CaptureMouse?.(reply,this)||reply;
 });
 bind('OnMouseButtonUp',function(geometry,event){
  const button=String(UE.KismetInputLibrary.PointerEvent_GetEffectingButton(event)?.KeyName);
  if(button!=='MiddleMouseButton')return;
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
 if(pad)safe('pad direction poll',()=>pollPadDirections(h,state,now));else padFocus.resetInput(h);
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
   const intent=selectionIntent(h,uv,w,height,pad,type);
   const allowedInput=(intent.item?mapAcceptsItems(h):mapAcceptsPins(h))&&intent.allowed;
   // Fallback for maps whose preview callback is owned by another mod. A
   // snapped item activates on the press edge, before the reticle can drift.
   if(pad&&down&&!pointer?.owns(now)&&!state.press.lastDown&&!state.press.suppress&&allowedInput&&(intent.item||intent.bell)){
    confirmMapItem(h,'pad fallback');state.press.reset(true);
    ink.draw(h,S,project,name,allowed,show());return;
   }
   let action;
   if(pointerAction||pointer?.owns(now)){state.press.reset(down);action=allowedInput?pointerAction:null;}
   else action=state.press.sample({now,down,pulse,device,uv,width:w,height,allowed:allowedInput});
   if(action?.type==='clear')clearManual(device);
   if(action?.type==='pin'&&!pad){
    const item=safe('item hit',()=>{
     const raw=globalThis.PBZMapTrackerBridge?.target?.hovered?.();
     const lua=raw&&worldOf(raw.mapID)===name?pickTrackerItem(raw,action.uv,w,height,project):null;
     return lua||pickItem(h,action.uv,w,height);
    });
    if(item){selectItem(item,'mouse',name,area,h);
     ink.draw(h,S,project,name,allowed,show());return;}
   }
   if(action?.type==='pin'){
    const selected=selectionIntent(h,action.uv,w,height,pad,type);
    if(selected.bell){selectBell(selected.bell,device,area);ink.draw(h,S,project,name,allowed,show());return;}
   }
   if(action?.type==='pin'&&state.picker){
    const at=action.uv,inside=at.x>=0&&at.y>=0&&at.x<=1&&at.y<=1,here=graph(S.level),feet=S.world.feet();
    if(!here){ink.draw(h,S,project,name,allowed,show());return;}
    const snap=state.picker.pick(at,null,w,height,g===here?feet:null);
    const best=snap&&snap.pixels<=13?snap:null;
    if(best||inside){
     tracker?.clear('map pin selected');
     epoch++;questGate.pause(questID(narrative()));S.scout=null;S.arrival.restart();S.manual={p:best?.p,node:best?.id,uv:inside?{...at}:best.uv,world:name,area,key:'pin:'+name+'/'+(++serial)};previous=null;S.version++;
     if(best)solve(S.manual,device+' pin');else noRoute();
     log('pin',JSON.stringify({device,area,uv:at,node:best?.id,goal:best?.p,pixels:snap?.pixels,source:best?'nearest road':'paper only'}));
    }
   }
  }
 }
 ink.draw(h,S,project,name,allowed,show());
}
function wrap(proto,k,fn){const orig=proto?.[k];if(typeof orig!=='function')return false;proto[k]=function(...args){const result=orig.apply(this,args);safe(k,()=>fn.apply(this,args));return result;};return true;}
function menuOptions(){const t=(en,zh)=>({en,'zh-Hans':zh,'zh-Hant':zh});(globalThis.PBZModsMenu||=[]).push({id:'PBZQuestRoute',file:'PBZQuestRoute.txt',version:BUILD,title:t('Quest & Exploration Navigation - Fork','任务与探索导航 - Fork'),description:t('Tracker 1.0.14: left-click or middle-click. Controller: D-pad selects a collectible, A confirms. Blank map: middle-click to pin; hold 0.6 s to cancel. Minimap route, icon size and accessory hints apply to the legacy JS tracker only.','收集1.0.14：左键追踪，或悬停后中键导航。手柄十字键选物品、A确认。地图空白处中键落旗、长按 0.6 秒取消。小地图路线、图标大小及饰品提示仅适用于旧 JS 收集版。'),settings:[
 {key:'MapRoute',type:'toggle',default:true,label:t('Map route','地图路线')},{key:'MinimapRoute',type:'toggle',default:true,label:t('Minimap route','小地图路线')},{key:'WorldThread',type:'toggle',default:true,label:t('Guiding thread','场景引路线')},
 {key:'LargeItemIcons',type:'toggle',default:true,label:t('Large unframed item icons','放大物品图标并移除黑底')},{key:'AutoAccessory',type:'toggle',default:true,label:t('Nearest accessory hint','自动提示最近饰品')},
 {key:'FogBellSense',type:'toggle',default:true,label:t('Sense a bell in fog','迷雾中洞照寻铃')},
 {key:'DisplayMode',type:'choice',default:'Always',label:t('Display mode','显示方式'),options:[{value:'Always',label:t('While tracking','追踪时持续显示')},{value:'Sense30',label:t('30 seconds after Sense','洞照后显示30秒')}]}],onChange:()=>settings(true)});}
exports.install=function(){if(globalThis.__PBZQuestRouteInstalled)return;dir=UE.KismetSystemLibrary.ConvertToAbsolutePath(UE.KismetSystemLibrary.GetProjectContentDirectory()).replace(/[\\/]?$/,'/');
 logPath=dir+'../Saved/PBZQuestRoute-log.txt';mousePath=dir+'../Saved/PBZQuestRoute-middle.txt';ink=new Ink(dir+'Mods/PBZQuestRoute/',log);mini=new MinimapRoute(dir+'Mods/PBZQuestRoute/',log);threads=new Threads(log);statusHud=new RouteStatus.StatusHud(UE,W,log);
 if(Build.development){
  developerAPI=require('./PBZRouteDiagnostics');
  const k=UE.KismetSystemLibrary,root=String(k.ConvertToAbsolutePath(k.GetProjectSavedDirectory())).replace(/[\\/]+$/,'')+'/';
  diagnostics=new developerAPI.Recorder({build:Build,root,report:message=>log('developer',message),write:(path,text)=>{
   if(UE.EasyCsv.SaveStringToFileWithFullPath(text,path)===false)return false;return textFile(path)===text;
  }});
  const {Survey}=require('./PBZRouteSurvey'),tasks=require('./PBZRouteSurveyTasks').resolve(tables);
  const {SurveyTracker}=require('./PBZRouteSurveyTracker');
  diagnostics.survey=new Survey({tasks,build:Build,root,write:diagnostics.write,read:textFile,report:message=>log('developer survey',message),
   capture:()=>developerAPI.snapshot({...S,manual:S.manual||planning.job?.request||previous||S.scout,
    captureOrigin:planning.job?.request.start||previous?.start,observedLocks:lockRows},planning,threads,notes),
   start:task=>{
    tracker?.clear('survey started');epoch++;questGate.pause(questID(narrative()));S.scout=null;S.bellArrival=null;S.arrival.restart();
    S.manual={p:{...task.end.p},world:task.world,area:task.end.area,bell:task.end.id,item:true,
     label:task.end.name,key:'survey:'+task.id,survey:task.id,noTransfer:true};
    previous=null;S.version++;solve(S.manual,'survey start');
   }});
  surveyTracker=new SurveyTracker(tasks);
  diagnostics.observe=(kind,data,now)=>diagnostics.survey.event(kind,data,now);
  const shape=threads.shape;threads.shape=function(row,points,...args){row.__devPoints=points.slice(0,2000).map(p=>({...p}));row.__devTotal=points.length;return shape.call(this,row,points,...args);};
 }
 const player=require('Gameplay/RenewalPlayer').RenewalPlayerinXinInterface.prototype,m=require('UI/Widget/Map').MapInterface.prototype,sense=require('Gameplay/GA_Player_Sense').ga_Player_Sense_MixinInterface.prototype;
 wrap(player,'TsBeginPlay',function(){unbind();reset();S.pawn=this;S.world=null;S.expires=0;oldWorld='';lastPoll=0;log('player','ready '+Date.now());});
 wrap(player,'ReceiveEndPlay',function(){if(S.pawn===this){unbind();reset();S.pawn=null;S.world=null;}});
 wrap(sense,'K2_ActivateAbility',onSense);
 wrap(m,'Tick',function(){try{onMap(this);}catch(e){ink.hide(this);throw e;}});bindPadTap(m);bindMouse(m);chooseUI(m,'toggleTrackQuestPoint',false);
 const journal=require('UI/Widget/DisplayQuest').QuestUIMixinInterface.prototype;chooseUI(journal,'toggleHoveredQuestPoint',true);
 wrap(m,'FinishCurrentWidget',function(){ink.remove(this);maps.delete(this);pointers.delete(this);pads.delete(this);confirmations.delete(this);padFocus.clear(this);});wrap(m,'ReleaseScriptReferences',function(){ink.remove(this);maps.delete(this);pointers.delete(this);pads.delete(this);confirmations.delete(this);padFocus.clear(this);});
 tracker=new Tracker(function(id){const bridge=globalThis.PBZMapTrackerBridge;if(id==='Mods/PbzTrackerTarget'&&bridge?.target)return bridge.target;if(bridge?.load&&id.startsWith('Mods/Pbz'))return bridge.load(id.slice(5));return require(id);},trackerChanged,log);
 globalThis.PBZQuestRouteBridge={
  version:BUILD,
  flavor:Build.flavor,buildLabel:Build.label,sourceSHA256:Build.sourceSHA256||null,
  options:()=>S.cfg,
  confirmMapTarget:h=>!!safe('native item confirmation',()=>confirmMapItem(h,'native confirm')),
  hasExplicitTarget:()=>!!(S.manual&&!S.manual.auto&&S.arrival.completedTarget!==S.manual.key||!questGate.paused&&W.alive(S.pawn)&&questID(narrative())),
  paintMinimap:(view,player,rotation)=>safe('minimap route',()=>mini.draw(view,player,rotation,S,show())),
  removeMinimap:host=>mini.remove(host)
 };
 scout=new Scout(tables,log);const gi=P.argv.getByName('GameInstance');gameContext=gi;const existing=UE.GameplayStatics.GetPlayerCharacter(gi,0);if(W.alive(existing)){S.pawn=existing;S.world=null;}menuOptions();settings(true);globalThis.__PBZQuestRouteInstalled=true;setInterval(()=>safe('tick',tick),16);log('loaded',BUILD+' flavor='+Build.flavor+' built-in atlases='+tables.worlds.length);};
