'use strict';
const R=require('./PBZRouteCore');
const key=s=>String(s||'').toLowerCase();
const cached=new WeakMap();
const active=(c,i)=>c.actions.some(m=>m.start<=i&&m.end>i);
function index(courses){
 if(cached.has(courses))return cached.get(courses);
 const ids=new Set(),out=new Map(),rows=[];
 for(const c of courses){
  if(ids.has(c.id)||!c.id||!c.world||!c.sourceBell||!c.targetBell||!R.finite(c.target)||
   c.points.length<2||c.points.some(p=>!R.finite(p)))throw Error('invalid authored bell course: '+c.id);
  for(const m of c.actions)if(!Number.isInteger(m.start)||!Number.isInteger(m.end)||m.start<0||m.start>=m.end||m.end>=c.points.length)
   throw Error('invalid authored bell action: '+c.id);
  ids.add(c.id);const s=[0];for(let i=1;i<c.points.length;i++)s.push(s[i-1]+R.dist(c.points[i-1],c.points[i]));
  const row={c,s,n:rows.length},k=key(c.world)+'/'+key(c.sourceBell),links=out.get(k)||[];
  links.push(row);out.set(k,links);rows.push(row);
 }
 const result={rows,out};cached.set(courses,result);return result;
}
const progress=(r,p)=>r.s[p.i]+(r.s[p.i+1]-r.s[p.i])*p.t;
const terminal=r=>({i:r.c.points.length-2,t:1,p:r.c.points.at(-1)});
function* unavailableJob(row,w,options){
 const moves=row.c.actions.map(m=>({kind:m.kind,guid:m.guid,from:m.start,to:m.end,
  p:row.c.points[m.start],end:row.c.points[m.end]}));
 options.refreshActions?.({guide:true,moves,points:row.c.points},options.graph);
 const ranges=moves.filter(m=>m.block).map(m=>[m.from,m.to]);
 if(w.blockAt)for(let i=0;i<row.c.points.length-1;i++){
  if(w.blockAt(row.c.points[i],row.c.points[i+1]))ranges.push([i,i+1]);
  if((i&127)===0)yield;
 }
 return ranges;
}
const available=(ranges,entry,exit)=>!ranges.some(([a,b])=>a<exit.i+exit.t-1e-6&&b>entry.i+entry.t+1e-6);
function* nearJob(row,p){
 const result=[];
 for(let i=0;i<row.c.points.length-1;i++){
  if(active(row.c,i))continue;
  const near=R.nearestOnLine(p,row.c.points,i,i+1);
  if(near.d<=760&&Math.abs(near.p.z-p.z)<=75)result.push(near);
  if((i&127)===0)yield;
 }
 result.sort((a,b)=>a.d-b.d);
 const picked=[];for(const p of result){if(picked.some(q=>Math.abs(q.i-p.i)<3))continue;picked.push(p);if(picked.length===12)break;}
 return picked;
}
function slice(row,entry,exit){
 const c=row.c,lo=entry.i+entry.t,hi=exit.i+exit.t,points=[{...entry.p}],moves=[];
 const positions=new Map();
 // Integer vertices retain the original action indices after trimming a
 // course midway. A shared bell can only join through a measured/checked gap.
 if(entry.t<1e-6)positions.set(entry.i,0);
 else if(entry.t>1-1e-6)positions.set(entry.i+1,0);
 for(let i=Math.floor(lo)+1;i<=Math.floor(hi+1e-6);i++){
  if(R.dist(points.at(-1),c.points[i])>.1)points.push({...c.points[i]});positions.set(i,points.length-1);
 }
 if(R.dist(points.at(-1),exit.p)>.1)points.push({...exit.p});
 for(const m of c.actions){
  if(m.start<lo-1e-6||m.end>hi+1e-6)continue;
  const from=positions.get(m.start),to=positions.get(m.end);
  if(from===undefined||to===undefined)throw Error('lost authored action vertices');
  moves.push({kind:m.kind,guid:m.guid,from,to,p:{...c.points[m.start]},end:{...c.points[m.end]},edge:-1,guide:true});
 }
 return {points,moves};
}
function append(target,part){
 let offset=target.points.length;
 if(offset&&part.points.length&&R.dist(target.points.at(-1),part.points[0])<.1){offset--;target.points.pop();}
 target.points.push(...part.points.map(p=>({...p})));
 target.moves.push(...(part.moves||[]).map(m=>({...m,from:m.from+offset,to:m.to+offset})));
}
function build(state,finish,world,options){
 const chain=[];for(let s=state;s;s=s.previous)chain.push(s);chain.reverse();
 const leg={world,provider:'guide',points:[],moves:[],checks:[],gates:[],obstacles:[],walks:[]};
 const ids=[],names=[],bells=[];
 for(let i=0;i<chain.length;i++){
  const node=chain[i],row=node.row,exit=i===chain.length-1?finish.exit:terminal(row);
  append(leg,{points:node.join,moves:[]});append(leg,slice(row,node.entry,exit));
  ids.push(row.c.id);names.push(row.c.name);
  if(node.entry.i+node.entry.t<1e-6)bells.push(row.c.sourceBell);
  if(exit.i+exit.t>=row.c.points.length-1-1e-6)bells.push(row.c.targetBell);
 }
 if(finish.tail)append(leg,{points:finish.tail,moves:[]});
 leg.guide={id:ids.join('+'),name:names.join(' → '),courses:ids,bells:[...new Set(bells)],egress:finish.item?'item':'bell'};
 leg.partial=leg.scenePartial=leg.endpointPending=!!finish.pending;
 if(finish.pending){const p=leg.points.at(-1);leg.obstacles.push({id:'route:guide-end',world,p,approach:p,
  unknown:true,icon:'mechanism',label:'路书末段 · 接近后确认铃铛站位'});}
 for(let i=0;i<leg.points.length-1;i++)if(!leg.moves.some(m=>m.from<=i&&m.to>i))
  leg.walks.push({a:leg.points[i],b:leg.points[i+1],edge:-1,from:i,to:i+1});
 leg.meters=R.extent(leg.points)/100;options.refreshActions?.(leg,options.graph);
 return {legs:[leg],transfer:null};
}
function* plan(w,world,dest,start,options){
 if(dest.world!==world||!R.finite(dest.p)||!R.finite(start))return null;
 const net=index(options.courses),rows=net.rows.filter(r=>r.c.world===world),seeds=[],goals=new Map(),unavailable=new Map();
 if(!rows.length)return null;
 for(const row of rows){
  unavailable.set(row.n,yield* unavailableJob(row,w,options));
  for(const near of yield* nearJob(row,start))seeds.push({row,entry:near,join:null,cost:near.d,previous:null});
  if(dest.bell){if(key(dest.bell)===key(row.c.targetBell)&&R.dist(dest.p,row.c.target)<250)goals.set(row.n,[terminal(row)]);}
  else {const exits=yield* nearJob(row,dest.p);if(exits.length)goals.set(row.n,exits);}
 }
 if(!goals.size)return null;
 seeds.sort((a,b)=>a.cost-b.cost);const queue=[],bestAt=new Map();
 // Probe the closest approaches first, not every course on the map. Joins
 // are transient checks; only the authored topology is cached between plans.
 for(const seed of seeds.slice(0,24)){
  seed.join=yield* options.joinJob(w,start,seed.entry.p);if(!seed.join)continue;
  seed.cost=R.extent(seed.join);queue.push(seed);
 }
 let best=null,bestCost=Infinity,work=0;
 while(queue.length){
  queue.sort((a,b)=>a.cost-b.cost);const state=queue.shift(),row=state.row,at=progress(row,state.entry);
  if(state.cost>=bestCost)continue;
  if((++work&7)===0)yield;
  for(const exit of goals.get(row.n)||[]){
   if(progress(row,exit)<at-.1)continue;
   if(!available(unavailable.get(row.n),state.entry,exit))continue;
   let tail=null,pending=false;
   if(!dest.bell){tail=yield* options.joinJob(w,exit.p,dest.p,0);if(!tail)continue;}
   else {
    pending=R.xy(exit.p,dest.p)>170||Math.abs(exit.p.z-dest.p.z)>125;
    if(pending&&R.dist(start,exit.p)<1800){
     const distance=R.xy(exit.p,dest.p),approach=R.lerp(exit.p,dest.p,Math.max(0,(distance-110)/(distance||1)));
     tail=yield* options.joinJob(w,exit.p,approach,0);if(tail)pending=false;
    }
   }
   const cost=state.cost+progress(row,exit)-at+(tail?R.extent(tail):0)+(pending?5000:0);
   if(cost<bestCost){bestCost=cost;best={state,finish:{exit,tail,pending,item:!dest.bell}};}
  }
  const end=row.c.points.at(-1),cost=state.cost+row.s.at(-1)-at;
  if(!available(unavailable.get(row.n),state.entry,terminal(row)))continue;
  for(const next of net.out.get(key(world)+'/'+key(row.c.targetBell))||[]){
   if(next===row)continue;
   // Remote holes in the authored data cannot be certified by traces in an
   // unloaded scene. Tiny endpoint corrections share the bell footprint.
   if(R.dist(end,next.c.points[0])>65&&R.dist(start,end)>1800)continue;
   const join=yield* options.joinJob(w,end,next.c.points[0]);if(!join)continue;
   const score=cost+R.extent(join);
   if(score>=bestCost||bestAt.has(next.n)&&bestAt.get(next.n)<=score)continue;
   bestAt.set(next.n,score);queue.push({row:next,entry:{i:0,t:0,p:next.c.points[0]},join,cost:score,previous:state});
  }
 }
 if(!best){options.report?.('bell spine unavailable',{reason:'no checked directed connection or item spur'});return null;}
 const trip=build(best.state,best.finish,world,options);
 options.report?.('fixed bell spine',{courses:trip.legs[0].guide.courses,egress:trip.legs[0].guide.egress,endpointPending:trip.legs[0].endpointPending});
 return trip;
}
exports.plan=plan;exports.index=index;
