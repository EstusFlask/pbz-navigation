'use strict';
const R=require('./PBZRouteCore');
class Queue{
 constructor(){this.rows=[];}
 push(row){const a=this.rows;let i=a.length;a.push(row);while(i){const p=(i-1)>>1;if(a[p].score<=row.score)break;a[i]=a[p];i=p;}a[i]=row;}
 pop(){const a=this.rows,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].score<a[j].score)j++;if(a[j].score>=last.score)break;a[i]=a[j];i=j;}a[i]=last;}return first;}
}
// The finite author graph is a proposal, never a collision certificate. Search
// its geometry first, then check only the proposed directed edges. A failed
// edge is removed for this job and the cheap graph is searched again. Physical
// results are not cached across requests, worlds, streaming or lock changes.
function* searchOne(world,start,goal,options={}){
 const hints=options.hints,clock=options.clock||Date.now;
 if(!hints?.near||!world?.floorAt||!world.step||!R.finite(start)||!R.finite(goal)||R.dist(start,goal)>(options.maxDistance||12000))return null;
 const began=clock(),limit=options.maxMs||200,span=350;
 const graphLimit=Math.max(1,Math.min(1024,options.maxGraphNodes||768)),checkLimit=Math.max(1,Math.min(128,options.maxChecks||64));
 const stats={hintsOnly:true,lazy:true,direction:'forward',graphLimit,checkLimit,expanded:0,probes:0,proposals:0,rejected:[]};
 let frontier=null,frontierDistance=Infinity,goalSupported=false;
 const finish=(route,reason)=>{options.report?.('scene walking result',{...stats,reason,start,goal,goalSupported});return route||frontier;};
 const first=world.floorAt(start,true);yield;
 if(!first||Math.abs(first.z-start.z)>200)return finish(null,'start floor missing');
 let goals=options.goals?.filter(R.finite).slice(0,16);
 if(!goals?.length){const last=world.floorAt(goal,true);yield;goals=last&&Math.abs(last.z-goal.z)<=125?[last]:[];}
 goalSupported=!!goals.length;
 if(!goals.length&&options.allowFrontier&&hints.near(goal,span,16).length)goals=[{...goal}];
 if(!goals.length)return finish(null,'goal floor missing');
 const key=p=>[p.x,p.y,p.z].join(','),nodes=new Map(),adjacency=new Map(),banned=new Set(),checked=new Map();
 const add=(p,id=key(p))=>{if(!nodes.has(id))nodes.set(id,{id,p:{...p}});return nodes.get(id);};
 const initial=add(first,'@start'),ends=goals.map((p,i)=>add(p,'@goal'+i));
 const rise=Number(world.rise)||50,slope=Number(world.slope)||1.5;
 const shortDrop=(a,b)=>!!options.allowDrops&&a.z-b.z>=100&&a.z-b.z<=310&&R.xy(a,b)<=315;
 const possible=(a,b)=>R.dist(a,b)<=span&&Math.abs(a.z-b.z)<=rise+R.xy(a,b)*slope+8||shortDrop(a,b);
 const neighbours=node=>{
  if(!adjacency.has(node.id)){
   const rows=[];
   // Short descents retain the existing horizontal/drop envelope and require
   // the outward/descent capsule checks below; samples never certify a jump.
   for(const p of hints.near(node.p,options.allowDrops?450:span,16))if(R.finite(p)&&R.dist(node.p,p)>1&&possible(node.p,p))rows.push(add(p));
   for(const end of ends)if(possible(node.p,end.p))rows.push(end);
   adjacency.set(node.id,rows);
  }
  return adjacency.get(node.id);
 };
 const heuristic=p=>Math.min(...goals.map(q=>R.dist(p,q)));let graphReason='no candidate chain';
 const proposal=function*(){
  const open=new Queue(),best=new Map(),closed=new Set();
  const estimate=heuristic;
  for(const node of [initial]){const row={node,cost:0,score:estimate(node.p),parent:null};open.push(row);best.set(node.id,row);}
  // This cap bounds cheap graph work, not live physics probes. The graph must
  // be allowed to traverse its finite candidates rather than repeat a small
  // truncated physical search from scratch on every attempt.
  while(open.rows.length&&stats.expanded<graphLimit){
   const row=open.pop(),id=row.node.id;if(closed.has(id)||best.get(id)!==row)continue;
   if(id.startsWith('@goal')){const chain=[];for(let n=row;n;n=n.parent)chain.push(n.node);return chain.reverse();}
   if(clock()-began>=limit){graphReason='time budget';return null;}
   closed.add(id);stats.expanded++;if((stats.expanded&7)===0)yield;
   const adjacent=neighbours(row.node);
   for(const next of adjacent){
    if(closed.has(next.id)||banned.has(id+'>'+next.id))continue;
    const cost=row.cost+R.dist(row.node.p,next.p),old=best.get(next.id);
    if(old&&old.cost<=cost)continue;
    const value={node:next,cost,score:cost+estimate(next.p),parent:row};best.set(next.id,value);open.push(value);
   }
  }
  graphReason=open.rows.length?'graph node budget':'no candidate chain';return null;
 };
 const offerFrontier=(points,walks,moves,checks,failure={})=>{
  if(!options.allowFrontier||points.length<2||R.extent(points)<280||failure.locked)return;
  const end=points.at(-1),distance=heuristic(end);
  if(goalSupported&&distance>span||distance>frontierDistance+.1)return;
  frontierDistance=distance;
  frontier={provider:'hint-roadmap',searchDirection:stats.direction,points:points.map(p=>({...p})),walks:walks.slice(),moves:moves.slice(),checks:checks.slice(),gates:[],
   partial:true,scenePartial:true,localWalk:true,physicalVerified:true,meters:R.extent(points)/100,
   frontierFailure:{why:failure.why||'endpoint awaiting scene verification',p:failure.hit||end,unknown:!failure.hit}};
 };
 for(let attempt=0;attempt<16&&clock()-began<limit;attempt++){
  const chain=yield* proposal();
  if(!chain)return finish(null,clock()-began>=limit?'time budget':graphReason);
  stats.proposals++;const points=[first],walks=[],moves=[],checks=[];let failed=false;
  for(let i=1;i<chain.length;i++){
   if(clock()-began>=limit)return finish(null,'time budget');
   const from=points.at(-1),target=chain[i].p,id=chain[i-1].id+'>'+chain[i].id;
   let row=checked.get(id);
   if(!row||R.dist(row.from,from)>.1){
    if(stats.probes>=checkLimit)return finish(null,'physical check budget');
    let result=world.step(from,target,true);stats.probes++;yield;
    if(!result?.p&&!result?.locked&&shortDrop(from,target)&&typeof world.hit==='function'){
     const drop=yield* require('./PBZRouteDrops').inspect(world,from,target);
     if(drop.ok)result={p:drop.points.at(-1),points:drop.points,drop:true};
    }
    const p=result?.p;
    if(!R.finite(p)||R.xy(p,target)>10||Math.abs(p.z-target.z)>(chain[i].id.startsWith('@goal')?25:125)){
     if(result?.locked){frontier=null;frontierDistance=Infinity;}
     else offerFrontier(points,walks,moves,checks,result||{});
     banned.add(id);failed=true;
     if(stats.rejected.length<8){
      const rejection={from,target,why:result?.why||'candidate endpoint is on another floor',
       ...(result?.locked?{locked:true}:{}),...(R.finite(result?.hit)?{hit:result.hit}:{})};
      if(result?.collision&&world.describeTrace)try{rejection.trace=world.describeTrace(result.collision);}catch(_){}
      stats.rejected.push(rejection);
     }
     break;
    }
    const via=result.points?.slice()||[];if(R.dist(via.at(-1)||from,p)>.1)via.push(p);
    row={from:{...from},points:via,drop:!!result.drop};checked.set(id,row);
   }
   const fromIndex=points.length-1;
   for(const p of row.points){const a=points.at(-1);if(R.dist(a,p)<=.1)continue;const n=points.length;points.push(p);if(!row.drop)walks.push({a,b:p,from:n-1,to:n,edge:-1});}
   if(row.drop){const to=points.length-1;
    moves.push({kind:'fall',drop:true,p:points[fromIndex],end:points[to],from:fromIndex,to,edge:-1});
    checks.push({kind:12,a:points[fromIndex],b:points[to],from:fromIndex,to,edge:-1,verified:true});
   }
   if(!goalSupported)offerFrontier(points,walks,moves,checks);
  }
  if(!failed){
   const last=points.at(-1);
   if(points.length<2||!goals.some(p=>R.xy(p,last)<10&&Math.abs(p.z-last.z)<25))return finish(null,'goal endpoint mismatch');
   return finish({provider:'hint-roadmap',searchDirection:stats.direction,points,walks,moves,checks,gates:[],partial:false,localWalk:true,physicalVerified:true,
    meters:R.extent(points)/100},'complete');
  }
 }
 return finish(null,clock()-began>=limit?'time budget':'candidate repair budget');
}
exports.search=searchOne;
