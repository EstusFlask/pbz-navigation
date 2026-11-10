"use strict";
const UE=require("ue"),T=require("Library/TsHelper").default,W=require("./PBZRouteWorld"),F=require("./PBZRouteFog");
const list=v=>{const out=[];for(let i=0;i<(v?.Num()||0);i++)out.push(String(v.Get(i)).toLowerCase());return out;};
const position=b=>({x:b.at[0],y:b.at[1],z:b.at[2]});
class Scout{
 constructor(tables,log){this.tables=tables;this.log=log;this.masks=new Map();this.aspects=new Map();}
 status(S,force=false){
  if(!force&&this.snapshot&&Date.now()-this.stamp<450&&S.area===this.snapshot.area)return this.snapshot;
  const chart=F.chart(S.area),ms=T.getWorldSubsystem(S.pawn,UE.MapSubsystem.StaticClass()),bm=T.getWorldSubsystem(S.pawn,UE.BellManager.StaticClass());
  if(!ms||!bm)return null;
  const group=Object.keys(this.tables.areas).filter(k=>F.chart(k)===chart),cleared=new Set(),valid=new Set();
  for(const area of group)for(const mask of list(ms.GetUnLockMaskIDs(area,0)))cleared.add(mask);
  const rung=new Set(list(bm.ActivateBellIDs)),local=[];
  for(const b of Object.values(this.tables.bells)){
   if(F.chart(b.area)!==chart||/^brokenbell/i.test(b.id))continue;
   if(!this.masks.has(b.id)){const v=UE.BellManager.GetBellData(b.id);if(v?.MaskIDs)this.masks.set(b.id,list(v.MaskIDs));}
   const masks=this.masks.get(b.id)||[];const active=rung.has(b.id.toLowerCase());
   for(const m of masks){valid.add(m);if(active)cleared.add(m);}
   if(b.world===S.level)local.push({b,masks,active});
  }
  if(!this.aspects.has(chart)){const row=UE.BellManager.GetMapData(chart),texture=row?.MapTextures?.Num()?row.MapTextures.Get(0):null;
   const size=texture?UE.PBZBlueprintFunctionLibrary.GetImportedSizeNoLoad(texture):null;const w=Number(size?.X),h=Number(size?.Y);
   this.aspects.set(chart,w>0&&h>0?h/w:1);}
  const ratio=this.aspects.get(chart);
  const project=p=>{const u=ms.ProjectWorldLocationToMap(W.vec(p),chart);return {x:Number(u.X),y:Number(u.Y)*ratio};};
  this.stamp=Date.now();return this.snapshot={area:S.area,chart,local,rung,patch:p=>F.locate(chart,project(p),cleared,valid)};
 }
 begin(S,walk){const self=this,task=this.beginJob(S,function*(p){return walk(p);});let row;do{row=task.next();}while(!row.done);return row.value;}
 *beginJob(S,walk){
  const s=this.status(S,true),foot=S.world.feet(),patch=s?.patch(foot);
  if(!patch){this.log('sense','outside known uncleared fog');return null;}
  const candidates=s.local.map(x=>({...x,p:position(x.b),same:x.masks.includes(patch)}));
  for(const group of [candidates.filter(c=>!c.active&&c.same),candidates.filter(c=>!c.active&&!c.same&&s.patch(c.p)),candidates.filter(c=>!c.active&&!c.same&&!s.patch(c.p)),candidates.filter(c=>c.active)]){
   let best=null;
   for(const c of group.sort((a,b)=>Math.hypot(a.p.x-foot.x,a.p.y-foot.y)-Math.hypot(b.p.x-foot.x,b.p.y-foot.y))){
    if(best&&Math.hypot(c.p.x-foot.x,c.p.y-foot.y)>best.leg.meters*100+400)continue;
    yield;const leg=yield* walk(c.p);if(leg&&(!best||leg.meters<best.leg.meters))best={...c,leg};}
   if(best){const {b,p,active,leg}=best;this.log('sense',patch+' -> '+b.id+' '+b.name+' '+Math.round(leg.meters)+'m');
    return {key:'sense:'+b.id,world:b.world,area:b.area,p,bell:b.id,wasActive:active,until:Date.now()+30000,trip:{legs:[leg],transfer:null}};}
  }
  this.log('sense',patch+' no reachable local bell');return null;
 }
 canContinue(S,target){
  if(!S.cfg.FogBellSense||target.until<=Date.now()||S.level!==target.world||F.chart(S.area)!==F.chart(target.area))return false;
  const s=this.status(S);if(!s||!target.wasActive&&s.rung.has(target.bell.toLowerCase()))return false;
  const feet=S.world.feet();
  return !!s.patch(feet)&&Math.hypot(feet.x-target.p.x,feet.y-target.p.y,feet.z-target.p.z)>200;
 }
}
exports.Scout=Scout;
