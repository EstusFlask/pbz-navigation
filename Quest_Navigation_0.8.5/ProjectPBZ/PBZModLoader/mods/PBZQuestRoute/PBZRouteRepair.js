'use strict';
const R=require('./PBZRouteCore'),Local=require('./PBZRouteLocalWalk'),Feasible=require('./PBZRouteFeasibility');
function anchor(raw,failure,distance){
 let previous=R.lerp(raw[failure.segment],raw[failure.segment+1],failure.fraction||0);
 for(let i=failure.segment+1;i<raw.length;i++){
  const length=R.dist(previous,raw[i]);
  if(distance<=length)return {p:R.lerp(previous,raw[i],distance/(length||1)),tail:raw.slice(i)};
  distance-=length;previous=raw[i];
 }return {p:raw[raw.length-1],tail:[]};
}
// Repair only the measured neighbourhood, rather than searching an entire
// 90+ metre route again because of one small rock.
function* repair(world,source,failure,origin,options={}){
 if(source.moves?.length||failure.segment===undefined||!failure.prefix?.length)return null;
 const clock=options.clock||Date.now,deadline=options.deadline||clock()+3500;
 const prefix=failure.prefix;let from=prefix.length-1,back=0;
 while(from>0&&back<180){back+=R.dist(prefix[from],prefix[from-1]);from--;}
 for(const distance of [400,800,1400]){
  if(clock()>=deadline)return null;
  const join=anchor(source.points,failure,distance),p=world.floorAt(join.p,true);yield;
  if(!p||Math.abs(p.z-join.p.z)>200||world.hit?.(p,p,true))continue;
  const detour=yield* Local.search(world,prefix[from],p,{maxNodes:700,maxMs:Math.min(1200,deadline-clock()),clock});
  if(!detour)continue;
  const points=[...prefix.slice(0,from+1),...detour.points.slice(1)];
  for(const q of join.tail)if(R.dist(points[points.length-1],q)>.1)points.push(q);
  const candidate={...source,points,moves:[],checks:[],obstacles:[],partial:false,repaired:true,
   walks:points.slice(1).map((b,i)=>({a:points[i],b,from:i,to:i+1,edge:-1})),meters:R.extent(points)/100};
  const verdict=yield* Feasible.check(world,candidate,origin);
  return {candidate,verdict};
 }
 return null;
}
exports.repair=repair;
