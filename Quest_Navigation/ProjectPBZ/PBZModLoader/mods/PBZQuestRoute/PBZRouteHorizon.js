'use strict';
const R=require('./PBZRouteCore'),Local=require('./PBZRouteLocalWalk'),Surface=require('./PBZRouteSurface'),Blocked=require('./PBZRouteBlocked');

// This is a topology witness for a pending suffix, never a collision proof.
function matches(leg,a,b,world){
 if(!leg||leg.partial||(leg.moves||[]).length||(leg.checks||[]).length||(leg.gates||[]).length||!leg.points?.length||!leg.points.every(R.finite))return false;
 const first=leg.points[0],last=leg.points.at(-1);
 if(R.xy(first,a)>140||Math.abs(first.z-a.z)>110||R.xy(last,b)>140||Math.abs(last.z-b.z)>110)return false;
 for(let i=1;i<leg.points.length;i++)if(world.blockAt?.(leg.points[i-1],leg.points[i]))return false;
 return true;
}
function* suffix(g,world,a,b,native,clock,deadline,banned){
 const leg=native(a,b,true);
 if(matches(leg,a,b,world))return {provider:'native',end:{...leg.points.at(-1)}};
 yield;
 if(!g.routeJob||!g.bin||!g.pt||clock()>=deadline||R.dist(a,b)>12000)return null;
 const starts=(yield* Surface.anchorsJob(g,a)).filter(p=>p.r<=140&&Math.abs(p.dz)<=110);
 const ends=(yield* Surface.anchorsJob(g,b,true)).filter(p=>p.r<=140&&Math.abs(p.dz)<=110);
 const forbidden={has:k=>banned?.has(k)||(k<(g.e?.length||0)/6?[2,3,5,6,7,8].includes(g.e[k*6+2]):!g.liveEdges?.[k-(g.e?.length||0)/6]?.move.walk)};
 let attempts=0;
 for(const start of starts)for(const end of ends){
  if(++attempts>3||clock()>=deadline)return null;
  if(!g.sameComponent(start.id,end.id))continue;
  const job=g.routeJob(a,b,{startNode:start.id,endNode:end.id,banned:forbidden});let row,steps=0;
  try{while(clock()<deadline&&steps++<512){row=job.next();if(row.done)break;yield;}}
  finally{if(!row?.done)job.return?.();}
  if(row?.done&&matches(row.value,a,b,world))return {provider:'atlas-ground',end:{...row.value.points.at(-1)}};
 }
 return null;
}
function* preview(g,world,start,goal,native,features,options={}){
 // Nearby routes, including the accepted A-02, retain their existing planner.
 if(R.dist(start,goal)<=12000||!options.onHorizon)return null;
 const clock=options.clock||Date.now,deadline=clock()+250;
 const hints=require('./PBZRouteWalkHints').reviewedForWorld(g.name);if(!hints)return null;
 const floor=world.floorAt(goal,true);yield;
 if(floor&&Math.abs(floor.z-goal.z)<=125||clock()>=deadline)return null;
 const rows=[];
 for(const feature of features){
  if(feature.state?.ready===false||!g.canTraverse(feature))continue;
  if(!['ascent','mantle','wallrun','walljump','pole','ladder','swing','hook','rappel','zipline','drop','slide'].includes(feature.kind))continue;
  for(const reverse of feature.both?[false,true]:[false]){
   const path=reverse?feature.runtimePath.slice().reverse():feature.runtimePath,a=path[0],b=path.at(-1);
   if(R.dist(start,a)>12000||R.dist(b,goal)>12000)continue;
   rows.push({feature,a,b,score:R.dist(start,a)+R.extent(path)+R.dist(b,goal)});
  }
 }
 let proofs=0;
 for(const row of rows.sort((a,b)=>a.score-b.score).slice(0,12)){
  if(clock()>=deadline||proofs>=4)break;
  const route=yield* Local.search(world,start,row.a,{hints,hintsOnly:true,allowDrops:true,allowFrontier:true,
   maxDistance:12000,maxGraphNodes:768,maxChecks:64,maxMs:Math.max(1,Math.min(120,deadline-clock())),clock});
  if(!route||R.extent(route.points)<280)continue;
  proofs++;
  const proof=yield* suffix(g,world,row.b,goal,native,clock,deadline,options.banned);if(!proof)continue;
  const end=route.points.at(-1),failure=route.frontierFailure||{};
  const source={...route,world:g.name,provider:'scene',goalTopology:{action:row.feature.guid,kind:row.feature.kind,provider:proof.provider,goal:proof.end}};
  const leg=Blocked.fromFailure(source,{prefix:route.points,prefixLeg:route,segment:route.points.length-1,
   p:failure.p||end,unknown:failure.unknown!==false,why:failure.why||'future action awaiting scene verification'},goal);
  if(!leg)continue;
  leg.scenePartial=true;
  options.report?.('pending action corridor',{guid:row.feature.guid,kind:row.feature.kind,prefixMeters:leg.meters,suffix:proof.provider,partial:true});
  return {legs:[leg],transfer:null};
 }
 return null;
}
exports.preview=preview;
