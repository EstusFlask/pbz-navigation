'use strict';
const UE=require('ue'),P=require('puerts'),R=require('./PBZRouteCore'),W=require('./PBZRouteWorld'),B=require('./PBZRibbonMath'),Fiber=require('./PBZRouteFiber'),{Arrival}=require('./PBZRouteArrival');
const WORLD=UE.ESplineCoordinateSpace.World;
const fx=(kind)=>'/Game/PBZContent/VFX/SceneFX/'+(kind==='001_Player'?'Sequence/Seq_009_FirstBell/':'Bell/')+'NS_BellRedString_'+kind+'.NS_BellRedString_'+kind;
const asset=(path)=>{const a=UE.Object.Load(path);if(a)return a;const soft=UE.KismetSystemLibrary.Conv_SoftObjPathToSoftObjRef(UE.KismetSystemLibrary.MakeSoftObjectPath(path));return UE.KismetSystemLibrary.LoadAsset_Blocking(soft);},zero=()=>new UE.Rotator(0,0,0);
const tr=p=>UE.KismetMathLibrary.MakeTransform(W.vec(p),zero(),new UE.Vector(1,1,1));
class Threads{
 constructor(log){this.log=log;this.pool=[];this.version=-1;this.mark=-1;}
 clear(){for(const r of this.pool)if(r&&W.alive(r.a))r.a.K2_DestroyActor();this.pool=[];this.version=-1;this.last=null;this.hint=0;this.attachment=null;this.motion=null;this.clip=null;}
 vis(r,on){if(!r||r.on===on)return;r.a.SetActorHiddenInGame(!on);
  r.n?.SetVisibility?.(on,true);r.n?.SetHiddenInGame?.(!on,true);r.fiber?.SetVisibility?.(on,true);r.fiber?.SetHiddenInGame?.(!on,true);
  if(on){if(!r.lit&&r.sys){r.n.Activate(true);r.lit=true;}}
  else{if(r.n?.DeactivateImmediate)r.n.DeactivateImmediate();else r.n?.Deactivate?.();r.lit=false;}
  r.on=on;}
 hide(){for(const r of this.pool)this.vis(r,false);}
 make(i,pawn,at){let row=this.pool[i];if(row&&W.alive(row.a))return row;
  const hd=i===0;let sys;try{sys=hd?(this.playerFX ||=asset(fx('001_Player'))):(this.roadFX ||=asset(fx('002_Bell')));if(!sys)sys=(this.roadFX ||=asset(fx('002_Bell')));}catch(e){this.log('thread asset',String(e));}
  // A private stock NiagaraActor: no Bell blueprint, checkpoint component,
  // dynamic-guide registration, attachment to a bell or shared system edits.
  const template=this.template===true;
  const cls=template?UE.Class.Load('/Game/PBZContent/Blueprint/Item/BP_BellGuideLine.BP_BellGuideLine_C'):UE.NiagaraActor.StaticClass();
  const a=UE.GameplayStatics.BeginDeferredActorSpawnFromClass(pawn,cls,tr(at),UE.ESpawnActorCollisionHandlingMethod.AlwaysSpawn,undefined);
  if(!W.alive(a))throw Error('private FX holder unavailable');
  try{a.SetActorHiddenInGame(true);UE.GameplayStatics.FinishSpawningActor(a,tr(at));a.SetDestroyOnSystemFinish?.(false);a.SetActorEnableCollision(false);a.SetActorTickEnabled(false);
   const n=template?a.Niagara:(a.GetNiagaraComponent?.()||a.NiagaraComponent||a.GetComponentByClass(UE.NiagaraComponent.StaticClass()));
   const spl=template?a.Spline:a.AddComponentByClass(UE.SplineComponent.StaticClass(),false,tr({x:0,y:0,z:0}),false);if(template){if(typeof a.UseDistanceCheck==='boolean')a.UseDistanceCheck=false;sys=sys||n.GetAsset?.();}
   if(!W.alive(n)||!W.alive(spl))throw Error('private spline / emitter unavailable');
   n.SetAutoDestroy?.(false);n.SetAllowScalability?.(false);n.SetPaused?.(false);if(sys)n.SetAsset(sys,false);
   n.SetVariableObject('User.UE_SplineObject',a);n.SetVariableFloat('User.UE_ForceStraight',0);n.SetVariableBool('User.UE_BurnBegin',false);
   n.DeactivateImmediate?.();n.SetVisibility(false,true);n.SetHiddenInGame(true,true);spl.SetClosedLoop(false,false);
   row=this.pool[i]={a,n,spl,sys,head:hd,on:false,lit:false,tag:-1};try{Fiber.add(row,tr({x:0,y:0,z:0}));}catch(e){this.log('fiber setup',String(e));}return row;
  }catch(e){a.K2_DestroyActor();if(!template){this.template=true;this.log('private spline holder',String(e)+'; use owned spline template');return this.make(i,pawn,at);}throw e;}
 }
 shape(r,ps,before,after){if(ps.length<2)return;const arr=UE.NewArray(UE.Vector);let lo={x:Infinity,y:Infinity,z:Infinity},hi={x:-Infinity,y:-Infinity,z:-Infinity};
  const o=W.plain(r.n.K2_GetComponentLocation());
  for(const p of ps){arr.Add(W.vec(p));for(const k of ['x','y','z']){lo[k]=Math.min(lo[k],p[k]-o[k]);hi[k]=Math.max(hi[k],p[k]-o[k]);}}
  // All holder transforms use identity rotation and unit scale. Expand exactly
  // this segment's local bounds to include the visible animated strands.
  for(const k of ['x','y','z']){lo[k]-=180;hi[k]+=180;}if(typeof r.n.SetSystemFixedBounds==='function'&&typeof UE.KismetMathLibrary.MakeBox==='function')r.n.SetSystemFixedBounds(UE.KismetMathLibrary.MakeBox(W.vec(lo),W.vec(hi)));else r.n.SetBoundsScale?.(8);
  r.spl.SetSplinePoints(arr,WORLD,false);
  for(let i=0;i<ps.length;i++){
   const a=i?ps[i-1]:before||ps[0],b=i+1<ps.length?ps[i+1]:after||ps[i],p=ps[i];
   if(typeof r.spl.SetTangentsAtSplinePoint==='function'){
    const d=B.unit(a,b),incoming=R.dist(a,p)||R.dist(p,b),outgoing=R.dist(p,b)||R.dist(a,p);
    const tangent=n=>W.vec({x:d.x*n,y:d.y*n,z:d.z*n});
    r.spl.SetTangentsAtSplinePoint(i,tangent(incoming),tangent(outgoing),WORLD,false);
   }else r.spl.SetSplinePointType(i,UE.ESplinePointType.CurveClamped,false);
  }r.spl.UpdateSpline();
  Fiber.draw(r,r.head,this.log);this.vis(r,true);
 }
 maintainFloor(w,m,now){
  if(now<this.nextFloor)return;this.nextFloor=now+125;
  const r=this.route;let probes=0;
  const sample=(s,terminal=false)=>{
   const i=terminal?r.points.length-1:B.index(r,s),key=i;
   if(this.seenFloor.has(key)||probes>=7)return;probes++;const p=r.points[i];
   const hit=w.hit({...p,z:p.z+79},{...p,z:p.z-80});if(!hit||hit.penetrating||hit.nz<w.normal-.03)return;
   this.seenFloor.add(key);const dz=hit.point.z-p.z;if(Math.abs(dz)>78)return;
   const center=r.arc[i],lo=B.index(r,Math.max(0,center-165)),hi=Math.min(r.points.length-1,B.index(r,Math.min(r.length,center+165))+1);
   for(let j=lo;j<=hi;j++){const gap=Math.abs(r.arc[j]-center),old=this.floorDistance[j];if(gap>=old||gap>160)continue;
    this.floorDistance[j]=gap;this.floorGoal[j]=dz;if(Math.abs(r.offset[j]-dz)>.5)this.adjusting.add(j);}
  };
  if(r.length-m.arc<2000)sample(r.length,true);
  const begin=Math.max(0,Math.floor(m.arc/125)*125);
  for(let s=begin;s<=Math.min(r.length,m.arc+1450);s+=125)sample(s);
 }
 section(i,S,f,a,b,shapeKey){
  const present=this.pool[i];if(present?.on&&shapeKey!==null&&present.tag===shapeKey)return;
  const slice=B.section(this.route,f,a,b);if(!slice){this.vis(present,false);return;}
  const row=this.make(i,S.pawn,slice.ps[0]);this.shape(row,slice.ps,slice.before,slice.after);row.tag=shapeKey;
 }
 show(S){
  if(S.line.length<2){this.hide();return;}
  const now=Date.now(),w=S.world,feet=w.feet();
  if(this.version!==S.version){
   const newKey=(S.trip?.legs[S.active]?.world||'')+'/'+(S.targetKey||'')+'/'+S.active;
   const same=this.routeKey===newKey,old=this.route;
   if(!same){this.motion=null;this.attachment=null;}this.routeKey=newKey;this.version=S.version;
   this.route=B.road(S.line);
   // A necessary replan may keep the same corridor. Carry the already applied
   // near-floor correction across it instead of dropping the rope then raising it.
   if(same&&old&&this.route.points.length>1){const m=B.match(old,this.route.points[0],this.hint);
    if(m?.d<100)for(let i=0;i<this.route.points.length&&this.route.arc[i]<1600;i++){
     const p=this.route.points[i],q=B.floor(old,Math.min(old.length,m.arc+this.route.arc[i]));
     if(R.xy(p,q)<55&&Math.abs(q.z-p.z)<78)this.route.offset[i]=q.z-p.z;
    }}
   this.hint=0;this.nextFloor=0;this.seenFloor=new Set();this.adjusting=new Set();
   this.floorDistance=new Float64Array(this.route.points.length).fill(Infinity);this.floorGoal=new Float64Array(this.route.points.length);
   this.tileVersion=[];for(const r of this.pool){if(r){r.tag=null;this.vis(r,false);}}
  }
  const r=this.route;if(r.points.length<2){this.hide();return;}
  const arrival=S.arrival||=new Arrival();
  if(arrival.check(S,feet,B.floor(r,r.length),now)){
   if(this.arrivalLog!==arrival.key(S)){this.arrivalLog=arrival.key(S);this.log('arrived',this.arrivalLog+'; owned emitters stopped');}
   this.hide();return;
  }
  const end=B.floor(r,r.length),wait=arrival.key(S)+'/'+arrival.status;
  if(R.xy(feet,end)<250&&Math.abs(feet.z-end.z)<450&&this.waitLog!==wait){
   this.waitLog=wait;this.log('arrival wait',arrival.status+' xy='+Math.round(R.xy(feet,end))+'cm z='+Math.round(feet.z-end.z)+'cm');}
  const m=B.match(r,feet,this.hint);if(!m||m.d>950){this.hide();return;}
  if(m.d>32){
   if(!this.branch||this.branchVer!==S.version||R.dist(feet,this.branch)>40||this.branchAt!==m.i){
    const n=Math.ceil(m.d/62);let p=feet;this.branchOK=true;
    for(let j=1;j<=n;j++){const h=w.step(p,R.lerp(feet,m.p,j/n),true);if(!h.p){this.branchOK=false;break;}p=h.p;}
    this.branch=feet;this.branchVer=S.version;this.branchAt=m.i;
   }
   if(!this.branchOK){this.hide();return;}
  }
  const limit=S.threadEnd?B.match(r,S.threadEnd,m.i)?.arc:0;
  if(limit===undefined||limit<=m.arc+8){this.hide();return;}
  let drawEnd=Math.min(r.length,limit);
  this.hint=m.i;this.maintainFloor(w,m,now);
  const dt=this.motion?Math.min(.1,Math.max(.001,(now-this.motion.now)/1000)):.03;
  for(const j of this.adjusting){const delta=this.floorGoal[j]-r.offset[j];r.offset[j]+=delta*(1-Math.exp(-dt/.18));
   if(Math.abs(delta)<.6){r.offset[j]=this.floorGoal[j];this.adjusting.delete(j);}
   const k=Math.floor(r.arc[j]/1100);this.tileVersion[k]=(this.tileVersion[k]||0)+1;
   if(k>0&&r.arc[j]-1100*k<65)this.tileVersion[k-1]=(this.tileVersion[k-1]||0)+1;
  }
  this.motion=B.animate(this.motion,feet,now);this.attachment=B.attachment(this.attachment,w.anchor(),feet,now);
  const anchor=this.attachment.p,f=B.frame(r,m,anchor,this.motion);
  if(typeof w.threadHit==='function'){
   const reach=Math.min(drawEnd,m.arc+B.influence),stamp=this.clip;
   if(!stamp||stamp.version!==S.version||now-stamp.at>90||R.dist(anchor,stamp.anchor)>20||Math.abs(m.arc-stamp.arc)>20||reach>stamp.reach+10){
    let last=B.at(r,m.arc,f),safeEnd=Infinity;const steps=Math.max(1,Math.ceil((reach-m.arc)/55));
    for(let i=1;i<=steps;i++){const s=m.arc+(reach-m.arc)*i/steps,p=B.at(r,s,f),hit=w.threadHit(last,p);
     if(hit){safeEnd=Math.max(m.arc,s-(reach-m.arc)/steps-12);break;}last=p;}
    this.clip={version:S.version,at:now,anchor:{...anchor},arc:m.arc,reach,end:safeEnd};
   }
   drawEnd=Math.min(drawEnd,this.clip.end);
   if(drawEnd<=m.arc+8){this.hide();return;}
  }
  const front=Math.min(drawEnd,m.arc+B.influence);
  // The same 10 m interval follows the character. Its endpoint slides through
  // the stationary spline with a zero displacement and zero slope.
  const key=[S.version,m.arc,front,anchor.x,anchor.y,anchor.z,this.motion.vx*.035,this.motion.vy*.035,
   this.adjusting.size?now:0,this.tileVersion[Math.floor(m.arc/1100)]||0].map(x=>Math.round(x*5)).join('/');
  this.section(0,S,f,m.arc,front,key);
  const tiles=Math.ceil(drawEnd/1100),first=Math.floor(front/1100);let built=0;
  for(let k=0;k<Math.max(tiles,this.pool.length-1);k++){
   const row=this.pool[k+1];if(k<first||k>=tiles||front>=drawEnd-.3){this.vis(row,false);continue;}
   const a=Math.max(front,k*1100),b=Math.min((k+1)*1100,drawEnd);
   const shapeKey=S.version+'/'+(this.tileVersion[k]||0)+'/'+a.toFixed(2)+'/'+b.toFixed(2);
   if(k!==first&&(!row?.on||row.tag!==shapeKey)&&built++>=3){this.vis(row,false);continue;}
   this.section(k+1,S,null,a,b,shapeKey);
  }
  if(this.ann!==this.version){this.ann=this.version;this.log('thread','knee='+Math.round(anchor.z-feet.z)+'cm rise=10m tip=-13cm path='+Math.round(r.length/100)+'m');}
 }
}
exports.Threads=Threads;
