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
function* search(world,start,goal,options={}){
 const spacing=options.spacing||70,maxNodes=options.maxNodes||4500,clock=options.clock||Date.now;
 if(!world?.step||!world.floorAt||!R.finite(start)||!R.finite(goal)||R.dist(start,goal)>12000)return null;
 const began=clock(),limit=options.maxMs||7000;
 const first=world.floorAt(start,true);yield;
 const last=options.goals?.length?options.goals[0]:world.floorAt(goal,true);yield;
 const goals=options.goals?.length?options.goals:last?[last]:[];
 if(!first||!goals.length||Math.abs(first.z-start.z)>200||!options.goals&&Math.abs(last.z-goal.z)>125)return null;
 const margin=3000,lo={x:Math.min(start.x,goal.x)-margin,y:Math.min(start.y,goal.y)-margin,z:Math.min(first.z,last.z)-margin};
 const hi={x:Math.max(start.x,goal.x)+margin,y:Math.max(start.y,goal.y)+margin,z:Math.max(first.z,last.z)+margin};
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
 const directions=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)if(x||y)directions.push([x,y]);
 while(open.rows.length&&closed.size<maxNodes){
  const row=open.pop();if(closed.has(row.key)||best.get(row.key)!==row)continue;
  if(row.key==='@goal'){
   const chain=[];for(let n=row;n;n=n.parent)chain.push(n);chain.reverse();const points=[first];
   for(const n of chain.slice(1))for(const p of n.via||[n.p])if(R.dist(points[points.length-1],p)>.1)points.push(p);
   return {points,partial:false,localWalk:true,physicalVerified:true,checks:[],gates:[],moves:[],
    walks:points.slice(1).map((b,i)=>({a:points[i],b,from:i,to:i+1,edge:-1})),meters:R.extent(points)/100};
  }
  closed.add(row.key);if(clock()-began>limit)return null;
  for(const target of goals)if(R.xy(row.p,target)<=spacing*1.5&&Math.abs(row.p.z-target.z)<100){
   const join=world.step(row.p,target,true);yield;
   if(join.p&&R.xy(join.p,target)<10&&Math.abs(join.p.z-target.z)<25){
    const via=join.points||[join.p],cost=row.cost+R.extent([row.p,...via]),old=best.get('@goal');
    if(!old||cost<old.cost){const end={p:join.p,cost,parent:row,key:'@goal',score:cost,via};best.set('@goal',end);open.push(end);}
   }
  }
  const candidates=directions.map(([dx,dy])=>({x:row.p.x+dx*spacing,y:row.p.y+dy*spacing,z:row.p.z}));
  for(const p of waypoints)if(R.xy(row.p,p)>1&&R.dist(row.p,p)<=spacing*3)candidates.push(p);
  for(const expected of candidates){
   if(expected.x<lo.x||expected.x>hi.x||expected.y<lo.y||expected.y>hi.y)continue;
   const step=world.step(row.p,expected,true);yield;
   const p=step.p;if(!p||!R.finite(p)||p.z<lo.z||p.z>hi.z||R.xy(p,expected)>10)continue;
   const id=key(p);if(closed.has(id))continue;
   const via=step.points||[p],cost=row.cost+R.extent([row.p,...via]),old=best.get(id);
   if(old&&old.cost<=cost)continue;
   const next={p,cost,key:id,parent:row,score:cost+heuristic(p),via};best.set(id,next);open.push(next);
  }
 }
 return null;
}
exports.search=search;
