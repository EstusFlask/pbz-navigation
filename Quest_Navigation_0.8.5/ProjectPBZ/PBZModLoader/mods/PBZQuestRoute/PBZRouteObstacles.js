'use strict';
const R=require('./PBZRouteCore');
const key=p=>[p.x,p.y,p.z].map(x=>Math.round(x/6)).join(',');
const id=(a,b)=>key(a)+'>'+key(b);
function mark(leg,c,reason,hit,unknown=false,block){
 block||=c.block;if(c.unknown!==undefined)unknown=c.unknown;
 const p=hit||R.lerp(c.a,c.b,.5);
 return {id:'route:'+c.edge+':'+id(c.a,c.b),world:leg.world,p,approach:c.a,edge:c.edge,
  icon:c.kind===11?'locked':unknown?'mechanism':'barrier',label:c.kind===11?'折梯未放下，需从另一侧解锁':c.kind===12&&unknown?'跳落通道，落点待确认':unknown?'此段通路待确认':'道路受阻，需绕行',reason,unknown,
  a:c.a,b:c.b,condition:c.kind,...block};
}
function obstacle(leg,value){
 if(value.transient){leg.obstacles=(leg.obstacles||[]).filter(r=>!r.transient);value={...value,id:'route:audit:current'};}
 const rows=leg.obstacles||=([]),i=rows.findIndex(r=>r.id===value.id);
 if(i>=0)rows[i]=value;else rows.push(value);
}
function visibleMarkers(leg,feet,rows=leg.locks||leg.obstacles||[]){
 const arc=[0];for(let i=1;i<leg.points.length;i++)arc.push(arc[i-1]+R.dist(leg.points[i-1],leg.points[i]));
 const at=p=>{const q=R.nearestOnLine(p,leg.points);return q.p?arc[q.i]+q.t*(arc[q.i+1]-arc[q.i]):0;};
 const here=feet?at(feet):0,known=[],unknown=[];
 for(const row of rows){if(!R.finite(row.p))continue;const distance=at(row.approach||row.p)-here;
  if(row.unknown){if(distance>=-25)unknown.push({row,distance});}
  else if(!row.transient||distance>=-25)known.push(row);
 }
 unknown.sort((a,b)=>a.distance-b.distance);
 if(unknown.length)known.push(unknown[0].row);
 return known;
}
exports.visibleMarkers=visibleMarkers;
function clear(leg,edge,end){
 leg.obstacles=(leg.obstacles||[]).filter(r=>r.edge!==edge||[6,8,9,11,12].includes(r.condition)||r.b&&(!end||R.dist(r.b,end)>30));
 for(const c of leg.checks||[])if(c.kind===10&&c.edge===edge&&end&&R.dist(c.b,end)<30)c.verified=true;
}
function* sweep(w,a,b){
 const first=w.floorAt(a,true);
 if(!first||Math.abs(first.z-a.z)>125)return {ok:false,unknown:true,p:a,why:'support not loaded or another floor'};
 let p=first;const n=Math.max(1,Math.ceil(R.xy(a,b)/62));
 for(let j=1;j<=n;j++){
  const row=w.step(p,R.lerp(a,b,j/n),true);
  if(!row.p)return {ok:false,unknown:!row.hit,p:row.hit||p,safe:p,normal:row.normal,why:row.why,block:row.block};
  p=row.p;yield p;
 }
 if(Math.abs(p.z-b.z)>125)return {ok:false,unknown:true,p,why:'destination is on another floor'};
 return {ok:true,p};
}
// Each pump has both a step limit and a wall-clock limit. Scene traces never
// run inside the whole-world graph search or the map's drawing callback.
class Auditor{
 constructor(){this.cache=new Map();this.reset();}
 reset(){this.leg=null;this.job=null;this.safe=null;this.result=null;this.started=0;this.nextPump=0;}
 begin(leg,w,feet,now){
  this.leg=leg;this.started=now;this.result=null;this.origin={...feet};
  const near=R.nearestOnLine(feet,leg.points);this.safe={...feet};
  const self=this;
  this.job=(function*(){
   if(!near.p)return {complete:true};
   const join={a:feet,b:near.p,edge:-1,from:near.i,to:near.i+near.t};
   if(near.d>18){
    if(leg.guide){
     if(!require('./PBZRouteGuides').attachment(leg,w,feet,near))return {mark:{...mark(leg,join,'fixed route join pending',feet,true),approach:feet}};
    }else{
    const check=sweep(w,feet,near.p);let row;
    do{row=check.next();if(!row.done)yield;}while(!row.done);
    if(!row.value.ok)return {mark:{...mark(leg,join,row.value.why,row.value.p,row.value.unknown,row.value.block),approach:feet},normal:row.value.normal};
    }
   }
   self.safe=near.p;
   for(let i=near.i;i<leg.points.length-1;i++){
    const a=i===near.i?near.p:leg.points[i],b=leg.points[i+1];
    if(R.dist(feet,a)>6000||R.dist(feet,b)>6500)return {range:true};
    const walking=(leg.walks||[]).find(c=>c.from<=i&&c.to>=i+1);
    const move=(leg.moves||[]).find(c=>c.from!==undefined&&c.to!==undefined&&c.from<=i&&c.to>=i+1);
    const cross=(leg.checks||[]).find(c=>c.from!==undefined&&c.from<=i&&(c.to??c.from+1)>=i+1);
    const c={...(walking||cross||{}),a,b,edge:walking?.edge??cross?.edge??move?.edge??-1,from:i,to:i+1};
    if(move?.drop&&cross?.kind===12&&!cross.verified){
     const test=require('./PBZRouteDrops').inspect(w,cross.a,cross.b);let row;
     do{row=test.next();if(!row.done)yield;}while(!row.done);
     if(!row.value.ok)return {mark:{...mark(leg,cross,row.value.why,row.value.p,row.value.unknown),approach:cross.a},normal:row.value.normal};
     cross.verified=true;leg.obstacles=(leg.obstacles||[]).filter(x=>x.edge!==cross.edge||x.condition!==12);
    }
    if(move&&!walking){
     if(move.block)return {mark:{...mark(leg,c,'closed traversal',a,!!move.block.unknown,move.block),approach:a}};
     const lock=w.blockAt?.(a,b);if(lock)return {mark:{...mark(leg,c,'locked passage',lock.p,false,lock),approach:a}};
     const closed=(leg.obstacles||[]).find(x=>[6,8,9,11,12].includes(x.condition)&&(
      x.edge>=0&&x.edge===cross?.edge||R.dist(x.approach||x.p,move.p||a)<80));
     if(move.fold||closed)return {mark:closed||mark(leg,{...c,kind:11},'folded ladder',a,false)};
     // These are explicitly authored actions (ladder/wall run/lift/drop),
     // not an inferred straight connection across an absent walking edge.
     if(leg.guide)clear(leg,c.edge,b);self.safe=b;yield;continue;
    }
    if(leg.guide){
     const lock=w.blockAt?.(a,b),hit=lock?null:w.hit?.(a,b,true),block=lock||w.describeBlocker?.(hit?.actor);
     if(lock||hit)return {mark:{...mark(leg,c,lock?'locked passage':'blocked guide clearance',lock?.p||hit.point,false,block),approach:self.safe},normal:hit?.normal};
     clear(leg,c.edge,b);self.safe=b;yield;continue;
    }
    const cacheKey=leg.world+'/'+id(a,b),cached=self.cache.get(cacheKey);
    if(cached&&now-cached.at<1800){self.safe=cached.p;yield;continue;}
    const test=sweep(w,a,b);let row;
    do{row=test.next();if(!row.done){self.safe=row.value;yield;}}while(!row.done);
    if(!row.value.ok){
     self.cache.delete(cacheKey);
     return {mark:{...mark(leg,c,row.value.why,row.value.p,row.value.unknown,row.value.block),approach:row.value.safe||self.safe},normal:row.value.normal};
    }
    clear(leg,c.edge,b);self.safe=b;self.cache.set(cacheKey,{at:now,p:b});
    if(self.cache.size>1800)self.cache.delete(self.cache.keys().next().value);
   }
   return {complete:true};
  })();
 }
 pump(clock=Date.now,maxSteps=12,maxMs=3){
  if(!this.job)return this.result;
  const started=clock();if(started<this.nextPump)return null;this.nextPump=started+16;
  for(let i=0;i<maxSteps;i++){
   const row=this.job.next();if(row.done){this.result=row.value;this.job=null;return this.result;}
   if(clock()-started>=maxMs)break;
  }return null;
 }
}
function installSeams(g){const task=installSeamsJob(g);while(!task.next().done){}}
function* installSeamsJob(g){
 if(g.seamsInstalled)return;
 const rows=require('./PBZRouteSeamsData').data[g.name]||[];
 for(let i=g.seamCursor||0;i<rows.length;i++){const [a,b]=rows[i];
  const move={guid:'atlas-seam:'+a+':'+b,kind:'gap',seam:true};
  g.addLiveEdge(a,b,[g.pt(a),g.pt(b)],move);g.addLiveEdge(b,a,[g.pt(b),g.pt(a)],move);
  g.seamCursor=i+1;if((g.seamCursor&127)===0)yield;
 }
 g.seamsInstalled=true;g.seamCursor=0;
}
// Only remove walking arcs at the measured collision, never all links on a
// neighbouring floor and never authored ladders/wall-runs.
function nearbyEdges(g,block,normal){
 const out=new Set(),p=block.p,cx=Math.floor(p.x/3200),cy=Math.floor(p.y/3200);
 for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){
  const b=g.bin.get(x+','+y);if(b===undefined)continue;
  for(let j=g.cells[b+2];j<g.cells[b+3];j++){
   const node=g.order[j],at=g.pt(node);if(R.xy(p,at)>700||Math.abs(p.z-at.z)>240)continue;
   for(let i=g.off[node];i<g.off[node+1];i++){
    const arc=g.arc[i],k=arc<0?~arc:arc,type=g.e[k*6+2];if(type!==0&&type!==1&&type!==5)continue;
    const a=g.pt(g.e[k*6]),b=g.pt(g.e[k*6+1]),q=R.nearestOnLine(p,[a,b]);
    if(q.p&&R.xy(q.p,p)<145&&Math.abs(q.p.z-p.z)<190){
     if(normal&&Math.abs(normal.z)<.55){const side=v=>(v.x-p.x)*normal.x+(v.y-p.y)*normal.y;if(side(a)*side(b)>0)continue;}
     out.add(k);
    }
   }
  }
 }
 const live=block.edge>=g.e.length/6?g.liveEdges?.[block.edge-g.e.length/6]:null;
 if(live?.move?.seam&&R.nearestOnLine(p,live.points).d<190)out.add(block.edge);
 return out;
}
// A complete native navmesh path can still cross a dynamic door or fence.
// Do not immediately choose that same corridor again after a measured hit.
function crossesBlock(points,p,normal){
 if(!p)return false;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],q=R.nearestOnLine(p,[a,b]);
  if(!q.p||R.xy(q.p,p)>150||Math.abs(q.p.z-p.z)>200)continue;
  if(normal&&Math.abs(normal.z)<.55){
   const side=v=>(v.x-p.x)*normal.x+(v.y-p.y)*normal.y;
   if(side(a)*side(b)>0&&Math.min(Math.abs(side(a)),Math.abs(side(b)))>45)continue;
  }
  return true;
 }
 return false;
}
exports.crossesBlock=crossesBlock;
// Map gaps retain the planned route on both sides. An unverified seam is
// dashed until scene collision checks certify it; a physical blocker is red.
function intervals(leg){
 const cuts=[];
 if(leg.guide)cuts.push({lo:0,hi:R.extent(leg.points)+1,unknown:true});
 if(leg.diagnostic){const n=leg.verifiedEndIndex??0;cuts.push({lo:R.extent(leg.points.slice(0,n+1)),hi:R.extent(leg.points)+1,unknown:true});}
 const at=p=>{const q=R.nearestOnLine(p,leg.points);let s=0;for(let i=0;i<q.i;i++)s+=R.dist(leg.points[i],leg.points[i+1]);return s+(q.p?R.dist(leg.points[q.i],q.p):0);};
 for(const c of leg.checks||[])if((c.kind===10||c.kind===11||c.kind===12)&&!c.verified){const a=at(c.a),b=at(c.b);cuts.push({lo:Math.min(a,b),hi:Math.max(a,b),unknown:c.kind!==11});}
 for(const b of leg.obstacles||[]){const s=at(b.p);cuts.push({lo:Math.max(0,s-85),hi:s+85,unknown:!!b.unknown});}
 return cuts;
}
function portions(rows,skip,cuts){
 if(rows.length<2)return [];
 const out=[];
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i],lo=Math.max(skip,a.s),hi=b.s;if(hi<=lo)continue;
  const marks=[lo,hi];for(const c of cuts)for(const s of [c.lo,c.hi])if(s>lo&&s<hi)marks.push(s);marks.sort((x,y)=>x-y);
  const uv=s=>{const t=R.clamp((s-a.s)/(b.s-a.s||1));return {x:a.uv.x+(b.uv.x-a.uv.x)*t,y:a.uv.y+(b.uv.y-a.uv.y)*t};};
  for(let j=1;j<marks.length;j++){
   const x=marks[j-1],y=marks[j],mid=(x+y)/2,inside=cuts.filter(c=>mid>=c.lo&&mid<=c.hi),style=inside.some(c=>!c.unknown)?'blocked':inside.length?'unknown':'walk';
   const last=out[out.length-1],p=uv(x),q=uv(y);
   if(last&&last.style===style&&R.xy(last.points[last.points.length-1],p)<1e-6)last.points.push(q);
   else out.push({style,points:[p,q]});
  }
 }return out;
}
exports.Auditor=Auditor;exports.sweep=sweep;exports.installSeams=installSeams;exports.mark=mark;exports.obstacle=obstacle;exports.clear=clear;exports.nearbyEdges=nearbyEdges;exports.intervals=intervals;exports.portions=portions;

exports.installSeamsJob=installSeamsJob;
