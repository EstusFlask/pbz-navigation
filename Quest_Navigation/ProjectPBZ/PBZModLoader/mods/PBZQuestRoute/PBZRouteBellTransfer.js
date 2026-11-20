'use strict';
const R=require('./PBZRouteCore');
const point=b=>({x:b.at[0],y:b.at[1],z:b.at[2]});
// Prefer checked access, then a continuous atlas corridor, then proximity only.
// Atlas lengths are estimates: small differences must not outweigh the bell's
// proximity to the item. A large detour still counts against that bell.
const rank=(a,b)=>b.evidence-a.evidence||a.cost-b.cost||a.estimate-b.estimate||a.bell.id.localeCompare(b.bell.id);
function reaches(route,start,goal){
 const first=route?.points?.[0],last=route?.points?.[route.points.length-1];
 return !route?.partial&&R.finite(first)&&R.finite(last)&&Number.isFinite(route.meters)&&route.meters>=R.dist(first,last)/100-.01&&
  R.xy(first,start)<=185&&Math.abs(first.z-start.z)<=200&&R.xy(last,goal)<=185&&Math.abs(last.z-goal.z)<=200;
}
// The far side is used to choose a bell, never drawn as a certified walking
// line. Streaming that scene must happen before its item approach is displayed.
function* plan(startGraph,goalGraph,start,goal,bells,options={}){
 const from=bells.filter(b=>b.world===startGraph.name).sort((a,b)=>R.dist(start,point(a))-R.dist(start,point(b))).slice(0,4);
 const to=bells.filter(b=>b.world===goalGraph.name).sort((a,b)=>R.dist(goal,point(a))-R.dist(goal,point(b))).slice(0,6);
 if(!from.length||!to.length)return null;
 const arrivals=[];
 for(const bell of to){
  const at=point(bell),banned=options.banned?.[goalGraph.name]||new Set();
  const route=yield* goalGraph.routeJob(at,goal,{banned});
  // A route removed by a measured obstruction or an unavailable traversal
  // must not return as a straight-distance fallback. Relax only for diagnosis;
  // the resulting corridor is never offered, and cancellation restores flags.
  if(!route&&(banned.size||goalGraph.foldedPassages?.size||
   [...(goalGraph.passageStates?.values()||[])].some(s=>s.ready===false))){
   const previous=goalGraph.allowBlockedTraverse;
   try{
    goalGraph.allowBlockedTraverse=true;
    const excluded=yield* goalGraph.routeJob(at,goal,{banned:new Set()});
    if(reaches(excluded,at,goal))continue;
   }finally{goalGraph.allowBlockedTraverse=previous;}
  }
  const walking=reaches(route,at,goal),access=!walking&&options.arrivalAccess?(yield* options.arrivalAccess(at,goal,bell)):null;
  const connected=walking||Number.isFinite(access?.meters)&&access.meters>=R.dist(at,goal)/100-.01;
  const inspection=walking&&options.inspectArrival?(yield* options.inspectArrival(route,bell)):null;
  if(inspection?.blocked||options.connectedArrivalsOnly&&!connected)continue;
  const distance=R.dist(at,goal)/100,estimate=walking?route.meters:connected?access.meters:distance*1.8+50;
  arrivals.push({bell,estimate,evidence:inspection?.verified?2:connected?1:0,
   cost:distance+Math.max(0,estimate-(distance*2.5+50)),source:access?.evidence});yield;
 }
 if(!arrivals.length)return null;
 arrivals.sort(rank);
 const departures=[];let localAttempts=0;
 for(const bell of from){
  const at=point(bell);
  if(R.dist(start,at)>12000)continue;
  const goals=options.approaches?(yield* options.approaches(at,bell)):[at];
  goals.sort((p,q)=>R.dist(start,p)-R.dist(start,q));
  // Proximity alone cannot establish access across a wall or another floor.
  // Even a stationary transfer needs a checked join to a visible approach.
  let leg;
  if(R.xy(start,at)<185&&Math.abs(start.z-at.z)<125&&options.ready&&(yield* options.ready(start,goals))){
   leg={world:startGraph.name,points:[start,{...start}],meters:0,walks:[],moves:[],checks:[],gates:[],waitingTransfer:true,physicalVerified:true};
  }else{
   for(const end of goals.slice(0,3)){
    const authored=yield* startGraph.routeJob(start,end,{banned:options.banned?.[startGraph.name]||new Set()});
    if(authored&&!authored.provider)authored.provider='atlas';
    const candidates=[()=>authored,()=>options.native?.(start,end)];
    if(R.dist(start,end)<3000)candidates.push(()=>({world:startGraph.name,provider:'direct',points:[start,end],
     meters:R.dist(start,end)/100,walks:[{a:start,b:end,from:0,to:1,edge:-1}],moves:[],checks:[],gates:[]}));
    for(const get of candidates){const candidate=get();
     if(!candidate||options.verify&&!(yield* options.verify(candidate))||!reaches(candidate,start,end))continue;
     leg=candidate;break;
    }
    if(leg&&!leg.partial)break;
   }
   // One search per bell uses all checked approaches, with a shared attempt
   // cap. It cannot turn a blocked straight chord into an accepted shortcut.
   if(!leg&&goals.length&&options.local&&R.dist(start,at)<=6000&&localAttempts<2){
    localAttempts++;const candidate=yield* options.local(at,goals);if(candidate)candidate.world=startGraph.name;
    if(candidate&&!candidate.partial&&goals.some(end=>reaches(candidate,start,end))&&
     (!options.verify||(yield* options.verify(candidate)))){candidate.world=startGraph.name;leg=candidate;}
   }
   if(!leg)continue;
  }
  departures.push({bell,leg});
 }
 const occupied=arrivals.filter(a=>startGraph===goalGraph&&R.dist(start,point(a.bell))<750&&departures.some(d=>d.bell.id===a.bell.id)).sort(rank)[0];
 let best=null,bestArrival=null;
 for(const {bell,leg} of departures){
  for(const arrival of arrivals){
   if(occupied&&rank(occupied,arrival)<=0)continue;
   if(bell.id===arrival.bell.id)continue;
   // A transfer to the bell the player already occupies cannot help.
   if(startGraph===goalGraph&&R.dist(start,point(arrival.bell))<750)continue;
   const score=leg.meters+arrival.estimate+120;
   if(best&&(rank(bestArrival,arrival)<0||rank(bestArrival,arrival)===0&&best.transfer.estimatedMeters<=score))continue;
   const end=point(arrival.bell);
   best={legs:[leg,{world:goalGraph.name,points:[end],meters:0,walks:[],moves:[],checks:[],gates:[],
    partial:true,arrivalPending:true}],transfer:{from:bell,to:arrival.bell,estimatedMeters:score,
     evidence:arrival.source||['proximity',options.connectedEvidence||'atlas','checked'][arrival.evidence],arrivalPending:true}};
   bestArrival=arrival;
  }
 }
 return best;
}
function prefer(transfer,direct){
 if(!transfer)return direct;
 if(!direct||direct.legs.some(l=>l.partial||l.diagnostic))return transfer;
 return transfer.transfer.estimatedMeters<direct.legs.reduce((n,l)=>n+l.meters,0)*.85?transfer:direct;
}
exports.plan=plan;exports.prefer=prefer;
