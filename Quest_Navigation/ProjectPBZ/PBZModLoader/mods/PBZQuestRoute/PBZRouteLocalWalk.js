'use strict';
const R=require('./PBZRouteCore');
class Queue{
 constructor(){this.rows=[];}
 push(row){const a=this.rows;let i=a.length;a.push(row);while(i){const p=(i-1)>>1;if(a[p].score<=row.score)break;a[i]=a[p];i=p;}a[i]=row;}
 pop(){const a=this.rows,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].score<a[j].score)j++;if(a[j].score>=last.score)break;a[i]=a[j];i=j;}a[i]=last;}return first;}
}
// Recover a nearby walkable staircase when the cooked atlas and live navmesh
// disagree. Every edge uses the same floor/capsule checks as route auditing.
// One neighbour is processed per yield; never invent a vertical connection.
function* searchGrid(world,start,goal,options={}){
 const spacing=options.spacing||70,maxNodes=options.maxNodes||4500,clock=options.clock||Date.now;
 if(!world?.step||!world.floorAt||!R.finite(start)||!R.finite(goal)||R.dist(start,goal)>(options.maxDistance||12000))return null;
 const began=clock(),limit=options.maxMs||7000;
 let expanded=0,probes=0,refined=0,hintProbes=0,hintAccepted=0,bestPoint=start;const rejected=new Map();
 const finish=(route,reason)=>{options.report?.('scene walking result',{reason,direction:'forward',hintsOnly:!!options.hintsOnly,expanded,probes,refined,start:first,goalSupported:supportedGoal,
  best:bestPoint,hintProbes,hintAccepted,rejected:[...rejected].sort((a,b)=>b[1]-a[1]).slice(0,6)});return route;};
 const first=world.floorAt(start,true);yield;
 const last=options.goals?.length?options.goals[0]:world.floorAt(goal,true);yield;
 const supportedGoal=!!last&&(!!options.goals?.length||Math.abs(last.z-goal.z)<=125);
 const goals=options.goals?.length?options.goals:supportedGoal?[last]:options.onProgress?[goal]:[];
 if(!first||!goals.length||Math.abs(first.z-start.z)>200)return finish(null,!first?'start floor missing':!goals.length?'goal floor missing':'start floor mismatch');
 const margin=3000,lo={x:Math.min(start.x,goal.x)-margin,y:Math.min(start.y,goal.y)-margin,z:Math.min(first.z,goal.z)-margin};
 const hi={x:Math.max(start.x,goal.x)+margin,y:Math.max(start.y,goal.y)+margin,z:Math.max(first.z,goal.z)+margin};
 const key=p=>Math.round(p.x*10)+','+Math.round(p.y*10)+','+Math.round(p.z/35);
 const waypoints=[];
 for(const p of (options.waypoints||[]).slice(0,96)){
  if(!R.finite(p)||R.dist(first,p)>12000)continue;
  const q=world.floorAt(p,true);yield;
  if(q&&Math.abs(q.z-p.z)<=200)waypoints.push(q);
 }
 const heuristic=p=>Math.min(...goals.map(q=>R.dist(p,q)));
 const open=new Queue(),best=new Map(),closed=new Set();
 const initial={p:first,cost:0,parent:null,key:key(first),score:heuristic(first)};
 best.set(initial.key,initial);open.push(initial);
 const directions=[];if(!options.hintsOnly)for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)if(x||y)directions.push([x,y]);
 const result=row=>{
   const chain=[];for(let n=row;n;n=n.parent)chain.push(n);chain.reverse();const points=[first],moves=[],checks=[],walks=[];
   for(const n of chain.slice(1)){
    const from=points.length-1;
    for(const p of n.via||[n.p])if(R.dist(points[points.length-1],p)>.1)points.push(p);
    if(n.drop){moves.push({kind:'fall',drop:true,p:points[from],end:n.p,from,to:points.length-1,edge:-1});
     checks.push({kind:12,a:points[from],b:n.p,from,to:points.length-1,edge:-1,verified:true});
    }else for(let i=from;i<points.length-1;i++)walks.push({a:points[i],b:points[i+1],from:i,to:i+1,edge:-1});
   }
   return {points,searchDirection:'forward',partial:false,localWalk:true,physicalVerified:true,checks,gates:[],moves,walks,meters:R.extent(points)/100};
 };
 let published=heuristic(first),progress=initial;
 const publish=()=>{if(options.onProgress&&heuristic(progress.p)<published-280){published=heuristic(progress.p);options.onProgress(result(progress));return true;}return false;};
 while(open.rows.length&&closed.size<maxNodes){
  const row=open.pop();if(closed.has(row.key)||best.get(row.key)!==row)continue;
  if(row.key==='@goal')return finish(result(row),'complete');
  if(heuristic(row.p)<heuristic(progress.p)){progress=row;bestPoint=row.p;}
  closed.add(row.key);expanded=closed.size;if(clock()-began>limit){publish();return finish(null,'time budget');}
  if(closed.size%16===0&&publish())yield;
  for(const target of goals)if(supportedGoal&&R.xy(row.p,target)<=spacing*(options.hintsOnly?3:1.5)&&Math.abs(row.p.z-target.z)<100){
   const join=world.step(row.p,target,true);yield;
   if(join.p&&R.xy(join.p,target)<10&&Math.abs(join.p.z-target.z)<25){
    const via=join.points||[join.p],cost=row.cost+R.extent([row.p,...via]),old=best.get('@goal');
    if(!old||cost<old.cost){const end={p:join.p,cost,parent:row,key:'@goal',score:cost,via};best.set('@goal',end);open.push(end);}
   }
  }
  const candidates=directions.map(([dx,dy])=>({x:row.p.x+dx*spacing,y:row.p.y+dy*spacing,z:row.p.z}));
  for(const p of waypoints)if(R.xy(row.p,p)>1&&R.dist(row.p,p)<=spacing*3)candidates.push(p);
  // Author observations supply candidate positions, never unchecked edges.
  // Defer their physical queries until nearby; avoid projecting a whole trace.
  const hintStart=candidates.length;
  for(const p of options.hints?.near(row.p,spacing*3,12)||[])if(R.finite(p)&&R.dist(row.p,p)>1&&R.dist(row.p,p)<=spacing*3)candidates.push(p);
  const hintEnd=candidates.length;
  const blockedCoarse=[];let coarseSupported=false;
  for(let candidate=0;;candidate++){
   // A wholly trapped coarse row may sit on a small bell landing. Keep the
   // large open corridors coarse so fine-grid variants cannot exhaust them.
   if(candidate===directions.length&&!coarseSupported&&spacing>70)for(const q of blockedCoarse)for(const stride of [70,35]){
    if(stride>=spacing)continue;candidates.push(R.lerp(row.p,q,stride/spacing));refined++;
   }
   if(candidate>=candidates.length)break;const expected=candidates[candidate];
   if(expected.x<lo.x||expected.x>hi.x||expected.y<lo.y||expected.y>hi.y)continue;
   const hinted=candidate>=hintStart&&candidate<hintEnd;if(hinted)hintProbes++;
   let step=world.step(row.p,expected,true);probes++;yield;
   if(!step.p&&!step.locked&&options.allowDrops&&typeof world.hit==='function'&&R.xy(row.p,expected)<=315){
    const down=world.floorAt(expected,true);yield;
    if(down&&row.p.z-down.z>=100&&row.p.z-down.z<=310){
     const drop=yield* require('./PBZRouteDrops').inspect(world,row.p,down);
     if(drop.ok)step={p:down,points:drop.points,drop:true};
    }
   }
   if(!step.p){
    const why=step.why||'no checked step';rejected.set(why,(rejected.get(why)||0)+1);
    if(candidate<directions.length&&!step.locked)blockedCoarse.push(expected);
    continue;
   }
   if(hinted)hintAccepted++;
   if(candidate<directions.length)coarseSupported=true;
   const p=step.p;if(!R.finite(p)||p.z<lo.z||p.z>hi.z||R.xy(p,expected)>10)continue;
   const id=key(p);if(closed.has(id))continue;
   const via=step.points||[p],cost=row.cost+R.extent([row.p,...via]),old=best.get(id);
   if(old&&old.cost<=cost)continue;
   const next={p,cost,key:id,parent:row,score:cost+heuristic(p),via,drop:step.drop};best.set(id,next);open.push(next);
  }
 }
 publish();return finish(null,closed.size>=maxNodes?'node budget':'no checked neighbours');
}
function* search(world,start,goal,options={}){
 if(options.hintsOnly)return yield* require('./PBZRouteHintWalk').search(world,start,goal,options);
 return yield* searchGrid(world,start,goal,options);
}
exports.search=search;
