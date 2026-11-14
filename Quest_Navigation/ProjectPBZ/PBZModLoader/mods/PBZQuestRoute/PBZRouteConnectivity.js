'use strict';
const R=require('./PBZRouteCore'),Surface=require('./PBZRouteSurface'),Local=require('./PBZRouteLocalWalk');
// Recover endpoint islands through measured walking, without adding guessed
// seams to the original atlas or assuming every nearby floor is connected.
function* candidatesJob(g,point,targets,sources){
 if(!g.bin||!g.pt||!g.sameComponent)return [];
 const cx=Math.floor(point.x/3200),cy=Math.floor(point.y/3200),rows=[];let work=0;
 for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){
  const cell=g.bin.get(x+','+y);if(cell===undefined)continue;
  for(let j=g.cells[cell+2];j<g.cells[cell+3];j++){
   if((++work&127)===0)yield;
   const id=g.order[j];if(id>=g.walkNodes||targets.some(t=>g.strong[id]===g.strong[t.id]))continue;
   if(!sources.some(s=>g.sameComponent(s.id,id)))continue;
   const q=Surface.surface(g,id,point),run=R.xy(q,point),rise=Math.abs(q.z-point.z);
   if(run>2200||rise>1400)continue;
   rows.push({id,q,score:run+rise*.8});
  }
 }
 const selected=[],buckets=new Set();
 for(const row of rows.sort((a,b)=>a.score-b.score)){
  const key=g.strong[row.id]+'/'+Math.round(row.q.x/350)+','+Math.round(row.q.y/350);
  if(buckets.has(key))continue;buckets.add(key);selected.push(row);if(selected.length===6)break;
 }
 return selected;
}
function* installJob(g,world,starts,ends,start,goal,options={}){
 if(!starts.length||!ends.length||!g.addLiveEdge||!g.pt||!g.bin)return 0;
 for(const a of starts)for(const b of ends){
  if(g.canReachJob?(yield* g.canReachJob(a.id,b.id)):g.sameComponent(a.id,b.id))return 0;
 }
 const clock=options.clock||Date.now,deadline=options.deadline||clock()+3500;let added=0;
 for(const reverse of [false,true]){
  const targets=reverse?starts:ends,sources=reverse?ends:starts,p=reverse?start:goal;
  const candidates=yield* candidatesJob(g,p,targets,sources);
  options.report?.('endpoint repair candidates',{side:reverse?'start':'goal',count:candidates.length});
  for(const row of candidates){
   if(clock()>=deadline)return added;
   const target=targets[0],from=reverse?p:row.q,to=reverse?row.q:p;
   const route=yield* Local.search(world,from,to,{clock,maxMs:Math.max(1,Math.min(1500,deadline-clock())),maxNodes:1000,
    waypoints:yield* Surface.samplesJob(g,p)});
   if(!route)continue;
   const a=reverse?target.id:row.id,b=reverse?row.id:target.id;
   // Only this direction was checked. The return journey earns its own link.
   if(g.addLiveEdge(a,b,route.points,{kind:'walk',walk:true,guid:'scene-walk:'+a+'>'+b,walkIn:route.points.length-1,walkOut:route.points.length-1}))added++;
   options.report?.('endpoint walking link',{from:a,to:b,meters:route.meters});
   return added;
  }
 }
 return added;
}
exports.candidatesJob=candidatesJob;exports.installJob=installJob;
