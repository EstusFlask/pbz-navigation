'use strict';
const R=require('./PBZRouteCore'), Surface=require('./PBZRouteSurface');
function pads(g,p){
 const rows=new Map(),cx=Math.floor(p.x/3200),cy=Math.floor(p.y/3200);
 for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){
  const cell=g.bin.get(x+','+y);if(cell===undefined)continue;
  for(let j=g.cells[cell+2];j<g.cells[cell+3];j++){
   const id=g.order[j];if(id>=g.walkNodes)continue;
   const q=Surface.surface(g,id,p),run=R.xy(q,p),rise=Math.abs(q.z-p.z);
   if(run>2800||rise>340)continue;
   const cost=run+2*rise,group=g.strong[id];
   if(!rows.has(group)||cost<rows.get(group).cost)rows.set(group,{id,q,cost});
  }
 }
 return [...rows.values()].sort((a,b)=>a.cost-b.cost).slice(0,3);
}
function attach(g,feature,curve,support,walk) {
 if(!g.canTraverse(feature))return;
 for(const backwards of (feature.both?[false,true]:[false])){
  const path=backwards?curve.slice().reverse():curve;
  const entry=support(path[0]),exit=support(path[path.length-1]);if(!entry||!exit)continue;
  let start,end;
  for(const row of pads(g,entry)){const points=walk(row.q,entry);if(points){start={id:row.id,points};break;}}
  if(!start)continue;
  for(const row of pads(g,exit)){const points=walk(exit,row.q);if(points){end={id:row.id,points};break;}}
  if(!end)continue;
  const travel=path.map((p,i)=>i&&feature.kind==='lift'?{...p,liftTravel:true}:p);
  g.addLiveEdge(start.id,end.id,[...start.points,...travel,...end.points],
   {kind:feature.kind,guid:feature.guid,p:entry,end:exit,fold:feature.fold,scripted:feature.kind==='lift'&&!feature.both,walkIn:start.points.length-1,walkOut:start.points.length+travel.length-1});
 }
}
exports.attach=attach;
