'use strict';
const R=require('./PBZRouteCore');
// Provider paths, including "complete" native navmesh paths, are candidates.
// Certify floor support and capsule clearance before accepting walking legs.
function* check(world,leg,origin,radius=12000){
 const raw=leg.points;if(!raw||raw.length<2)return {ok:false,edge:-1,why:'empty walking route',p:origin};
 const first=world.floorAt(raw[0],true);yield;
 if(!first||Math.abs(first.z-raw[0].z)>200)return {ok:false,edge:-1,why:'start has no matching floor',p:raw[0],unknown:true};
 const points=[first],walks=[],indices=[0];let previous=first,afterAction=false;
 const finish=partial=>({ok:true,leg:{...leg,points,walks,checks:(leg.checks||[]).filter(c=>c.from===undefined||indices[c.from]!==undefined).map(c=>({...c,
  ...(c.from===undefined?{}:{from:indices[c.from],to:indices[c.to??c.from+1]??points.length-1})})),
  moves:(leg.moves||[]).filter(m=>indices[m.from]!==undefined&&indices[m.to]!==undefined).map(m=>({...m,from:indices[m.from],to:indices[m.to]})),
  obstacles:partial?[...(leg.obstacles||[]),{id:'scene-frontier',world:leg.world,p:points[points.length-1],unknown:true,icon:'mechanism',label:'前方路线待确认'}]:(leg.obstacles||[]),
  partial:!!leg.partial||partial,scenePartial:partial,physicalVerified:true,meters:R.extent(points)/100}});
 const frontier=segment=>{
  const result=finish(true);
  if(leg.provider==='atlas')result.leg={...require('./PBZRouteBlocked').fromFailure(leg,{prefix:points,prefixLeg:result.leg,segment,
   p:previous,unknown:true,why:'scene is not loaded'},raw[raw.length-1]),scenePartial:true,physicalVerified:true};
  return result;
 };
 const pendingLanding=action=>{
  const n=indices[action.from]??0,meta=finish(false).leg;
  return {ok:false,edge:action.edge??-1,why:'traversal landing is not supported',p:raw[action.to],unknown:true,
   segment:action.from,prefix:points.slice(0,n+1),prefixLeg:{...meta,points:points.slice(0,n+1),
    walks:meta.walks.filter(w=>w.to<=n),moves:meta.moves.filter(m=>m.to<=n)}};
 };
 for(let i=0;i<raw.length-1;i++){
  const a=raw[i],b=raw[i+1],edge=(leg.walks||[]).find(c=>c.from<=i&&c.to>=i+1)?.edge??-1;
  const action=(leg.moves||[]).find(m=>m.from!==undefined&&m.to!==undefined&&m.from<=i&&m.to>=i+1);
  if(action&&!(leg.walks||[]).some(w=>w.from<=i&&w.to>=i+1)){
   const lock=world.blockAt?.(a,b);
   if(lock)return {ok:false,edge:action.edge??-1,why:'locked passage',p:lock.p,a,b,locked:true,block:lock,
    segment:i,prefix:points.slice(),prefixLeg:finish(false).leg};
   if(action.fold||action.block)return {ok:false,edge:action.edge??-1,why:'closed authored traversal',p:previous,a,b,locked:!action.block?.unknown,unknown:!!action.block?.unknown,block:action.block,
    segment:i,prefix:points.slice(),prefixLeg:finish(false).leg};
   if(R.dist(origin,raw[action.to])>radius)return frontier(i);
   previous={...b};points.push(previous);indices[i+1]=points.length-1;afterAction=action;yield;continue;
  }
  if(afterAction){const landed=world.floorAt(previous,true);yield;
   if(!landed||Math.abs(landed.z-previous.z)>200)return pendingLanding(afterAction);
   previous=landed;points[points.length-1]=landed;afterAction=false;
  }
  const n=Math.max(1,Math.ceil(R.xy(a,b)/35));
  for(let j=1;j<=n;j++){
   const q=R.lerp(a,b,j/n);
   if(R.dist(origin,q)>radius){if(points.length>1)return frontier(i);return {ok:false,edge,why:'scene is not loaded',p:previous,unknown:true,segment:i,prefix:points};}
   const row=world.step(previous,q,false);yield;
   // Follow the connected physical floor, not the height of a straight chord
   // between sparse navmesh endpoints. Keep the endpoint's floor constraint.
   if(!row.p||j===n&&Math.abs(row.p.z-b.z)>200)return {ok:false,edge,why:row.why||'destination is on another floor',p:row.hit||previous,a,b,
    unknown:!row.hit,locked:row.locked,block:row.block,segment:i,fraction:(j-1)/n,prefix:points.slice(),prefixLeg:finish(false).leg};
   for(const p of row.points||[row.p])if(R.dist(previous,p)>.1){const from=points.length-1;points.push(p);walks.push({a:previous,b:p,from,to:from+1,edge});previous=p;}
  }
  indices[i+1]=points.length-1;
 }
 if(afterAction){
  const landed=world.floorAt(previous,true);yield;
  if(!landed||Math.abs(landed.z-previous.z)>200)return pendingLanding(afterAction);
  points[points.length-1]=landed;
 }
 return points.length>1?finish(false):{ok:false,edge:-1,why:'no walking progress',p:previous};
}
exports.check=check;
