'use strict';
const R=require('./PBZRouteCore'),LocalWalk=require('./PBZRouteLocalWalk');
// A target may stand just outside the eroded mesh. Keep its identity and
// connect a nearby mesh point with ordinary, scene-checked walking only.
function* route(provider,name,world,start,goal,goals,options={}){
 if(!provider.endpointCandidates||!provider.routeLocal||!world.step)return null;
 const clock=options.clock||Date.now,deadline=clock()+400;
 const starts=yield* provider.endpointCandidates(name,start),ends=yield* provider.endpointCandidates(name,goal);
 options.onCandidates?.({starts:starts.length,ends:ends.length});
 if(!starts.length||!ends.length)return null;
 const targets=goals?.length?goals:[goal],near=(p,list)=>Math.min(...list.map(q=>R.dist(p,q)));
 const pairs=starts.flatMap(a=>ends.map(b=>({a,b,cost:R.dist(start,a)+near(b,targets)}))).sort((a,b)=>a.cost-b.cost).slice(0,12);
 const memo=new Map(),connect=function*(a,b){
  const key=[a.x,a.y,a.z,b.x,b.y,b.z].join('/');if(memo.has(key))return memo.get(key);
  if(R.dist(a,b)>900||Math.abs(a.z-b.z)>160||clock()>=deadline)return null;
  const leg=R.dist(a,b)<.1?{points:[a,b]}:yield* LocalWalk.search(world,a,b,{clock,maxMs:Math.max(1,Math.min(100,deadline-clock())),maxNodes:192,maxDistance:900,spacing:70,report:options.report});
  const good=leg&&!leg.partial&&!(leg.moves||[]).length&&R.dist(leg.points.at(-1),b)<=30?leg:null;memo.set(key,good);return good;
 };
 for(const {a,b}of pairs){
  if(clock()>=deadline)break;
  let middle=yield* provider.routeLocal(name,a,b);
  if((!middle||middle.partial&&!middle.conditionalCandidate||middle.points.length<2)&&provider.routeEndpointLocal)middle=yield* provider.routeEndpointLocal(name,a,b);
  if(!middle||middle.partial&&!middle.conditionalCandidate||middle.points.length<2)continue;
  const first=yield* connect(start,middle.points[0]);if(!first)continue;
  for(const end of targets.slice().sort((a,b)=>R.dist(a,middle.points.at(-1))-R.dist(b,middle.points.at(-1))).slice(0,4)){
   const last=yield* connect(middle.points.at(-1),end);if(!last)continue;
   const points=[];for(const part of [first,middle,last])for(const p of part.points)if(!points.length||R.dist(points.at(-1),p)>.1)points.push(p);
   if(points.length<2)continue;
   return{...middle,points,checks:[],moves:[],gates:[],walks:points.slice(1).map((b,i)=>({a:points[i],b,from:i,to:i+1,edge:-1})),meters:R.extent(points)/100,endpointConnectors:true,physicalVerified:false};
  }
 }
 return null;
}
exports.route=route;
