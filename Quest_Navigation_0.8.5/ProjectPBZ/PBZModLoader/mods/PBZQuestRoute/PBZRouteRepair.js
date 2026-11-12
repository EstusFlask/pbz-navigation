'use strict';
const R=require('./PBZRouteCore'),Local=require('./PBZRouteLocalWalk'),Feasible=require('./PBZRouteFeasibility');
function anchor(raw,failure,distance){
 let previous=R.lerp(raw[failure.segment],raw[failure.segment+1],failure.fraction||0);
 for(let i=failure.segment+1;i<raw.length;i++){
  const length=R.dist(previous,raw[i]);
  if(distance<=length)return {p:R.lerp(previous,raw[i],distance/(length||1)),tail:raw.slice(i),tailIndex:i};
  distance-=length;previous=raw[i];
 }return {p:raw[raw.length-1],tail:[],tailIndex:raw.length};
}
// Repair only the measured neighbourhood, rather than searching an entire
// 90+ metre route again because of one small rock.
function* repair(world,source,failure,origin,options={}){
 if(failure.segment===undefined||!failure.prefix?.length||failure.locked)return null;
 if((source.moves||[]).some(m=>m.from<=failure.segment&&m.to>failure.segment))return null;
 const clock=options.clock||Date.now,deadline=options.deadline||clock()+3500;
 const prefix=failure.prefix;let from=prefix.length-1,back=0;
 while(from>0&&back<180){back+=R.dist(prefix[from],prefix[from-1]);from--;}
 const meta=failure.prefixLeg||{};
 for(const m of meta.moves||[])if(m.to<prefix.length)from=Math.max(from,m.to);
 for(const distance of [400,800,1400]){
  if(clock()>=deadline)return null;
  const join=anchor(source.points,failure,distance);
  if((source.moves||[]).some(m=>m.from<join.tailIndex&&m.to>=join.tailIndex))continue;
  const p=world.floorAt(join.p,true);yield;
  if(!p||Math.abs(p.z-join.p.z)>200||world.hit?.(p,p,true))continue;
  let detour=null;
  if(options.traverse&&Math.abs(prefix[from].z-p.z)>120)detour=yield* options.traverse(prefix[from],p,{deadline});
  if(!detour)detour=yield* Local.search(world,prefix[from],p,{maxNodes:700,maxMs:Math.min(1200,deadline-clock()),clock});
  if(!detour&&options.traverse&&clock()<deadline)detour=yield* options.traverse(prefix[from],p,{deadline});
  if(!detour)continue;
  const points=prefix.slice(0,from+1),moves=(meta.moves||[]).filter(m=>m.to<=from).map(m=>({...m})),walks=[],indices=new Map();
  const append=q=>{if(R.dist(points[points.length-1],q)>.1)points.push({...q});return points.length-1;};
  const ds=detour.points.map(append);
  for(const m of detour.moves||[])moves.push({...m,from:ds[m.from],to:ds[m.to]});
  const tailStart=points.length-1;
  for(let i=0;i<join.tail.length;i++)indices.set(join.tailIndex+i,append(join.tail[i]));
  for(const m of source.moves||[])if(indices.has(m.from)&&indices.has(m.to))moves.push({...m,from:indices.get(m.from),to:indices.get(m.to)});
  const known=[...(meta.walks||[]).filter(w=>w.to<=from),...(detour.walks||[]).map(w=>({...w,from:ds[w.from],to:ds[w.to]})),
   ...(source.walks||[]).filter(w=>indices.has(w.from)&&indices.has(w.to)).map(w=>({...w,from:indices.get(w.from),to:indices.get(w.to)}))];
  for(let i=0;i+1<points.length;i++)if(!moves.some(m=>m.from<=i&&m.to>i))walks.push({a:points[i],b:points[i+1],from:i,to:i+1,
   edge:known.find(w=>w.from<=i&&w.to>i)?.edge??(i===tailStart?failure.edge:-1)});
  const checks=[...(meta.checks||[]).filter(c=>c.to<=from),...(detour.checks||[]).map(c=>({...c,from:ds[c.from],to:ds[c.to]})),
   ...(source.checks||[]).filter(c=>indices.has(c.from)&&indices.has(c.to)).map(c=>({...c,from:indices.get(c.from),to:indices.get(c.to)}))];
  const candidate={...source,points,moves,checks,obstacles:[],partial:false,scenePartial:false,repaired:true,walks,meters:R.extent(points)/100};
  const verdict=yield* Feasible.check(world,candidate,origin);
  return {candidate,verdict};
 }
 return null;
}
exports.repair=repair;
