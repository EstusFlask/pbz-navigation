"use strict";
// Typed arrays contain only cooked routes, portal lips and known interactions.
const b64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const chars=new Uint8Array(128);for(let j=0;j<64;j++)chars[b64.charCodeAt(j)]=j;
function decode(value,Type){
 const parts=typeof value==='string'?[value]:value;
 if(!Array.isArray(parts)||!parts.length||parts.some(s=>typeof s!=='string'||s.length%4))throw Error('invalid atlas data chunks');
 const sizes=parts.map((s,i)=>{
  if(i<parts.length-1&&s.includes('='))throw Error('padding inside atlas data');
  return s.length/4*3-(s.endsWith('==')?2:s.endsWith('=')?1:0);
 });
 const count=sizes.reduce((a,b)=>a+b,0);if(count%Type.BYTES_PER_ELEMENT)throw Error('misaligned atlas data');
 const bytes=new Uint8Array(count);let j=0;
 for(let k=0;k<parts.length;k++){
  const s=parts[k],end=j+sizes[k];
  for(let i=0;i<s.length;i+=4){const a=chars[s.charCodeAt(i)],b=chars[s.charCodeAt(i+1)],c=chars[s.charCodeAt(i+2)],d=chars[s.charCodeAt(i+3)];
   bytes[j++]=(a<<2)|(b>>4);if(j<end)bytes[j++]=(b<<4)|(c>>2);if(j<end)bytes[j++]=(c<<6)|d;}
 }
 return new Type(bytes.buffer);
}
function* decodeJob(value,Type,read){
 const streamed=value&&typeof value==='object'&&!Array.isArray(value)&&value.stream;
 const parts=streamed?null:typeof value==='string'?[value]:value;
 if(!streamed&&(!Array.isArray(parts)||!parts.length))throw Error('invalid atlas chunks');
 const count=streamed?value.bytes:parts.reduce((n,s)=>n+s.length/4*3-(s.endsWith('==')?2:s.endsWith('=')?1:0),0);
 if(!Number.isSafeInteger(count)||count<0||count%Type.BYTES_PER_ELEMENT)throw Error('misaligned streamed atlas');
 const bytes=new Uint8Array(count);let j=0;yield;
 for(let k=0;k<(streamed?value.chunks:parts.length);k++){
  const s=streamed?read(value.stream+'/'+k):parts[k];yield;
  if(typeof s!=='string'||s.length%4)throw Error('invalid atlas chunk');
  const size=s.length/4*3-(s.endsWith('==')?2:s.endsWith('=')?1:0),end=j+size;
  if(end>count)throw Error('oversized atlas chunk');
  for(let block=0;block<s.length;block+=65536){
   for(let i=block;i<Math.min(s.length,block+65536);i+=4){
    const a=chars[s.charCodeAt(i)],b=chars[s.charCodeAt(i+1)],c=chars[s.charCodeAt(i+2)],d=chars[s.charCodeAt(i+3)];
    bytes[j++]=(a<<2)|(b>>4);if(j<end)bytes[j++]=(b<<4)|(c>>2);if(j<end)bytes[j++]=(c<<6)|d;
   }yield;
  }
 }
 if(j!==count)throw Error('incomplete atlas column');return new Type(bytes.buffer);
}
function* graphJob(data,faces,read){
 const decoded={faces:faces?yield* decodeJob(faces,Int32Array,read):null};
 for(const k of ['p','v','e','arc','lab','cells','strong','dag'])decoded[k]=yield* decodeJob(data[k],Int32Array,read);
 for(const k of ['off','weight','sizes','order'])decoded[k]=yield* decodeJob(data[k],Uint32Array,read);
 decoded.metric=yield* decodeJob(data.metric,Uint16Array,read);yield;
 return new Graph(data,faces,decoded);
}
const point=(a,i)=>({x:a[i*3],y:a[i*3+1],z:a[i*3+2]});
const xy=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const append=(v,p)=>{if(!v.length||dist(v[v.length-1],p)>1)v.push(p);};
const clamp=(t,a=0,b=1)=>Math.max(a,Math.min(b,t));
function nearestOnLine(p,line,lo=0,hi=line.length-1){let r={i:0,d:Infinity,t:0};for(let i=Math.max(0,lo);i<Math.min(line.length-1,hi);i++){const a=line[i],b=line[i+1],x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,t=clamp(((p.x-a.x)*x+(p.y-a.y)*y+(p.z-a.z)*z)/(x*x+y*y+z*z||1));const v=lerp(a,b,t),d=dist(v,p);if(d<r.d)r={i,t,p:v,d};}return r;}
function extent(ps){let l=0;for(let i=1;i<ps.length;i++)l+=dist(ps[i-1],ps[i]);return l;}
class Heap{
 constructor(){this.f=[];this.id=[];}
 add(f,id){let p=this.id.length;this.id.push(0);this.f.push(0);while(p){const q=(p-1)>>1;if(this.f[q]<=f)break;this.f[p]=this.f[q];this.id[p]=this.id[q];p=q;}this.f[p]=f;this.id[p]=id;}
 pop(){const id=this.id[0],l=this.id.pop(),f=this.f.pop();if(this.id.length){let p=0;while(p*2+1<this.id.length){let q=p*2+1;if(q+1<this.id.length&&this.f[q+1]<this.f[q])q++;if(this.f[q]>=f)break;this.f[p]=this.f[q];this.id[p]=this.id[q];p=q;}this.id[p]=l;this.f[p]=f;}return id;}
}
class Graph{
 constructor(data,faces,decoded){if(!data||!data.world||!Number.isInteger(data.n)||data.n<1)throw Error('invalid route atlas');this.faces=decoded?decoded.faces:faces?decode(faces,Int32Array):null;this.name=data.world;this.n=data.n;this.walkNodes=data.walkNodes||data.n;this.actors=data.actors;this.cache=new Map();this.bells=new Map();
  for(const k of ['p','v','e','arc','lab','cells','strong','dag'])this[k]=decoded?decoded[k]:decode(data[k],Int32Array);
  for(const k of ['off','weight','sizes','order'])this[k]=decoded?decoded[k]:decode(data[k],Uint32Array);this.metric=decoded?decoded.metric:decode(data.metric,Uint16Array);
  this.bin=new Map();for(let i=0;i<this.cells.length;i+=4)this.bin.set(this.cells[i]+','+this.cells[i+1],i);
  this.nextStrong=new Map();for(let i=0;i<this.dag.length;i+=2){const k=this.dag[i],a=this.nextStrong.get(k)||[];a.push(this.dag[i+1]);this.nextStrong.set(k,a);}
  this.g=new Float64Array(this.n);this.seen=new Uint32Array(this.n);this.closed=new Uint32Array(this.n);this.parent=new Int32Array(this.n);this.gen=0;
  this.reachMemo=new Map();this.liveStrongLinks=new Map();this.liveEdges=[];this.liveAdj=new Map();this.liveKeys=new Set();this.liveStrong=new Map();this.liveWeak=new Map();this.observedPassages=new Map();
  this.foldedPassages=new Set(this.actors.filter(a=>a.fold).map(a=>a.guid.toLowerCase()));
  this.openPassages=new Set();this.passageRevision=0;
 }
 canTraverse(feature){
  const key=String(feature?.guid||'').toLowerCase();
  if(!feature?.fold&&!this.foldedPassages.has(key))return true;
  return this.openPassages.has(key);
 }
 weakRoot(id){while(this.liveWeak.has(id))id=this.liveWeak.get(id);return id;}
 sameComponent(a,b){return this.lab[a]===this.lab[b]||this.weakRoot(this.lab[a])===this.weakRoot(this.lab[b]);}
 addLiveEdge(from,to,points,move){
  const key=move.guid+'/'+from+'/'+to;
  if(from===to||this.liveKeys.has(key)||points.length<2||this.liveEdges.length>=65536)return false;
  const k=this.e.length/6+this.liveEdges.length,rows=this.liveAdj.get(from)||[];
  this.liveKeys.add(key);this.liveEdges.push({from,to,points,move,cost:Math.max(extent(points),dist(this.pt(from),this.pt(to)))+(move.seam?8000:110)});
  rows.push(k);this.liveAdj.set(from,rows);const links=this.liveStrongLinks.get(this.strong[from])||[];links.push(k);this.liveStrongLinks.set(this.strong[from],links);this.reachMemo.clear();
  const a=this.weakRoot(this.lab[from]),b=this.weakRoot(this.lab[to]);if(a!==b)this.liveWeak.set(b,a);
  const strong=this.liveStrong.get(this.strong[from])||new Set();strong.add(this.strong[to]);this.liveStrong.set(this.strong[from],strong);
  return true;
 }
 clearLiveEdges(){this.dropCursor=0;this.seamCursor=0;this.liveStrongLinks.clear();this.reachMemo.clear();this.dropsInstalled=false;this.seamsInstalled=false;this.liveEdges=[];this.liveAdj.clear();this.liveKeys.clear();this.liveStrong.clear();this.liveWeak.clear();this.observedPassages.clear();}
 pt(i){return point(this.p,i);}
 reachable(nodes){const queue=[],result=new Set();const visit=c=>{if(!result.has(c)){result.add(c);queue.push(c);}};
  for(const i of nodes)if(i>=0)visit(this.strong[i]);for(let j=0;j<queue.length;j++){for(const c of this.nextStrong.get(queue[j])||[])visit(c);for(const c of this.liveStrong.get(queue[j])||[])visit(c);}return result;}
 node(p,mode='actor'){let best=-1,ds=Infinity;const quest=mode==='quest',maxXY=quest?540:680,cx=Math.floor(p.x/3200),cy=Math.floor(p.y/3200);
  for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){const b=this.bin.get(x+','+y);if(b===undefined)continue;
   for(let j=this.cells[b+2];j<this.cells[b+3];j++){const i=this.order[j];if(i>=this.walkNodes)continue;const o=i*3,dx=this.p[o]-p.x,dy=this.p[o+1]-p.y,dz=this.p[o+2]-p.z;
    if(Math.abs(dx)>maxXY||Math.abs(dy)>maxXY||dz>(quest?150:180)||dz<-(quest?340:230))continue;
    const hz=quest?dz+65:dz,d=dx*dx+dy*dy+hz*hz*3+(this.sizes[this.lab[i]]<3?4800:0);if(d<ds){best=i;ds=d;}}}return best;
 }
 h(i,j){if(this.liveEdges.length)return dist(this.pt(i),this.pt(j));let n=this.n,m=this.metric,x=0;for(let t=0;t<4;t++)x=Math.max(x,Math.abs(m[t*n+i]-m[t*n+j])*20-20);return Math.max(0,x);}
 *canReachJob(start,goal){
  const source=this.strong[start],target=this.strong[goal];if(source===target)return true;
  const key=source+'/'+!!this.allowDrops+'/'+!!this.allowSeams+'/'+!!this.allowBlockedTraverse+'/'+this.passageRevision+'/'+this.liveEdges.length;
  if(this.reachMemo.has(key))return this.reachMemo.get(key).has(target);
  const queue=[source],seen=new Set(queue);let work=0;
  const visit=n=>{if(!seen.has(n)){seen.add(n);queue.push(n);}};
  for(let i=0;i<queue.length;i++){
   if((++work&63)===0)yield;
   const from=queue[i];for(const next of this.nextStrong.get(from)||[]){if((++work&63)===0)yield;visit(next);}
   for(const k of this.liveStrongLinks.get(from)||[]){if((++work&63)===0)yield;
    const edge=this.liveEdges[k-this.e.length/6],m=edge.move;
    if(m.drop&&!this.allowDrops||m.seam&&!this.allowSeams||!this.canTraverse(m)&&!this.allowBlockedTraverse)continue;
    visit(this.strong[edge.to]);
   }
  }
  this.reachMemo.set(key,seen);if(this.reachMemo.size>12)this.reachMemo.delete(this.reachMemo.keys().next().value);
  return seen.has(target);
 }
 path(...args){const task=this.pathJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
 *pathJob(start,goal,banned=new Set()){
  if(start<0||goal<0||!this.sameComponent(start,goal))return null;if(start===goal)return [];
  if(!(yield* this.canReachJob(start,goal)))return null;
  const source=this.pt(start),target=this.pt(goal);
  const localGaps=this.name==='pbz_zhengdaodaying_wp'&&[source,target].every(p=>p.x>900&&p.x<15500&&p.y>75000&&p.y<91000);
  const lookout=localGaps&&xy(target,{x:6907,y:79331})<420&&Math.abs(target.z-7805)<230;
  const id=++this.gen;const heap=new Heap();heap.add(this.h(start,goal),start);this.seen[start]=id;this.g[start]=0;
  const e=this.e;let work=0;while(heap.id.length){if((++work&63)===0)yield;const from=heap.pop();if(this.closed[from]===id)continue;this.closed[from]=id;
   if(from===goal){const path=[];let at=goal;while(at!==start){const a=this.parent[at],k=a<0?~a:a;path.push(a);if((path.length&127)===0)yield;at=k>=e.length/6?this.liveEdges[k-e.length/6].from:e[k*6+(a<0?1:0)];}path.reverse();return path;}
   for(let j=this.off[from];j<this.off[from+1];j++){const a=this.arc[j],k=a<0?~a:a,to=e[k*6+(a<0?0:1)];
    if(this.closed[to]===id||banned.has(k))continue;
    const type=e[k*6+2];if(type===8&&!localGaps||type===1&&lookout)continue;
    if((type===2||type===7)&&!this.canTraverse(this.actors[e[k*6+5]-1])&&!this.allowBlockedTraverse)continue;
    const closed=(type===2||type===7)&&!this.canTraverse(this.actors[e[k*6+5]-1]);const d=this.g[from]+this.weight[k]+(closed?50000:0);if(this.seen[to]===id&&this.g[to]<=d)continue;
    this.seen[to]=id;this.g[to]=d;this.parent[to]=a;heap.add(d+this.h(to,goal),to);}
   for(const k of this.liveAdj.get(from)||[]){const link=this.liveEdges[k-e.length/6],to=link.to,d=this.g[from]+link.cost+(!this.canTraverse(link.move)?50000:0);
    if(link.move.drop&&!this.allowDrops||link.move.seam&&!this.allowSeams||!this.canTraverse(link.move)&&!this.allowBlockedTraverse)continue;
    if(banned.has(k)||this.closed[to]===id||this.seen[to]===id&&this.g[to]<=d)continue;
    this.seen[to]=id;this.g[to]=d;this.parent[to]=k;heap.add(d+this.h(to,goal),to);}
  }
  return null;
 }
 route(...args){const task=this.routeJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
 *routeJob(start,goal,{startNode=this.node(start),endNode=this.node(goal,'quest'),banned=new Set()}={}){
  const arcs=yield* this.pathJob(startNode,endNode,banned);if(!arcs)return null;
  const pp=[start],checks=[],gates=[],moves=[],walks=[];let ports=[],here=start,lastEdge=-1;
  const walk=(p,edge=lastEdge)=>{const a=pp[pp.length-1],from=pp.length-1;append(pp,p);if(pp.length>from+1)walks.push({a,b:p,edge,from,to:pp.length-1});};
  const flush=function*(to){let count=0;for(const row of yield* followPortalsJob(here,ports,to,true)){walk(row.p,row.edge??lastEdge);if((++count&127)===0)yield;}ports=[];here=to;};
  let converted=0;for(const a of arcs){if((++converted&31)===0)yield;const k=a<0?~a:a;lastEdge=k;
   if(k>=this.e.length/6){
    const link=this.liveEdges[k-this.e.length/6];yield* flush(link.points[0]);const from=pp.length-1,indices=[];
    for(let j=0;j<link.points.length;j++){const p=link.points[j];if(link.move.walk||link.move.seam||j<=link.move.walkIn||j>link.move.walkOut)walk(p,k);else append(pp,p);indices.push(pp.length-1);}
    here=link.points[link.points.length-1];
    if(link.move.seam)checks.push({edge:k,kind:10,a:link.points[0],b:here,from,to:pp.length-1});
    else if(!link.move.walk){if(link.move.drop)checks.push({edge:k,kind:12,a:link.move.p,b:link.move.end,from:indices[link.move.walkIn],to:indices[link.move.walkOut]});moves.push({...link.move,edge:k,from:indices[link.move.walkIn]??from,to:indices[link.move.walkOut]??pp.length-1,fold:link.move.fold&&!this.openPassages.has(link.move.guid.toLowerCase())});if(!this.canTraverse(link.move))checks.push({edge:k,kind:11,a:link.move.p||link.points[0],b:link.move.end||here,from,to:pp.length-1});}continue;
   }
   const ix=k*6,type=this.e[ix+2],to=this.pt(this.e[ix+(a<0?0:1)]);
   if(type===0){ports.push([point(this.v,this.e[ix+3]),point(this.v,this.e[ix+4]),k]);continue;}
   if(type===1){yield* flush(this.pt(this.e[ix+(a<0?1:0)]));walk(to,k);here=to;continue;}
   if(type===7||type===8){
    const entry=point(this.v,this.e[ix+(a<0?4:3)]),exit=point(this.v,this.e[ix+(a<0?3:4)]);yield* flush(entry);
    if(type===8){checks.push({edge:k,kind:8,a:entry,b:exit,from:pp.length-1});walk(exit,k);}
    else{
     const actor=this.actors[this.e[ix+5]-1],path=a<0?actor.path.slice().reverse():actor.path,from=pp.length-1;
     for(let j=0;j<path.length;j++){const p=arr(path[j]);if(actor.kind==='lift'&&j>0)p.liftTravel=true;append(pp,p);}
     moves.push({kind:actor.kind,edge:k,p:entry,end:exit,guid:actor.guid,fold:actor.fold&&!this.openPassages.has(actor.guid.toLowerCase()),scripted:actor.kind==='lift'&&!actor.both,from,to:pp.length-1});
     if(!this.canTraverse(actor))checks.push({edge:k,kind:11,a:entry,b:exit,from,to:pp.length-1});
     const first=arr(path[0]),last=arr(path[path.length-1]),reach=actor.kind==='lift'?210:300;
     if(actor.conditional||xy(entry,first)>reach||xy(exit,last)>reach)checks.push({edge:k,kind:9,a:entry,b:exit,first,last,mode:actor.kind,guid:actor.guid,from});
     append(pp,exit);
    }
    here=exit;continue;
   }
   let begin,end;const actor=this.actors[this.e[ix+5]-1];
   if(type===5){begin=point(this.v,this.e[ix+(a<0?4:3)]);end=point(this.v,this.e[ix+(a<0?3:4)]);checks.push({edge:k,kind:type,a:begin,b:end});}
   else if(type===4){begin=arr(actor.at);end=begin;gates.push({id:actor.guid,p:begin});}
   else{const reverse=type===6||a<0;begin=arr(reverse?actor.top:actor.at);end=arr(reverse?actor.at:actor.top);}
   yield* flush(begin);const from=pp.length-1;
   if(type===4||type===5)walk(end,k);
   else{append(pp,end);moves.push({kind:type,edge:k,p:begin,end,from,to:pp.length-1});if(type===6)checks.push({edge:k,kind:type,a:begin,b:end});if(type===2&&!this.canTraverse(actor))checks.push({edge:k,kind:11,a:begin,b:end,from,to:pp.length-1});}
   here=end;walk(to,k);here=to;
  }
  const lastFace=this.faces?require('./PBZRouteSurface').surface(this,endNode,goal):this.pt(endNode);
  yield* flush(lastFace);
  if(xy(pp[pp.length-1],goal)<240)walk({x:goal.x,y:goal.y,z:pp[pp.length-1].z});
  return {world:this.name,points:pp,checks,gates,moves,walks,meters:extent(pp)/100};
 }
}
const arr=a=>({x:a[0],y:a[1],z:a[2]});
function intersect(a,b,c,d){const X=b.x-a.x,Y=b.y-a.y,U=d.x-c.x,V=d.y-c.y,den=X*V-Y*U;if(Math.abs(den)<.01)return null;
 const A=c.x-a.x,B=c.y-a.y,t=(A*V-B*U)/den,u=(A*Y-B*X)/den;return t<-.001||t>1.001||u<-.001||u>1.001?null:{t,p:lerp(c,d,clamp(u))};}
function followPortals(...args){const task=followPortalsJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function* followPortalsJob(a,ports,b,tagged=false){if(!ports.length)return tagged?[{p:a},{p:b}]:[a,b];const mids=[a,...ports.map(p=>lerp(p[0],p[1],.5)),b],out=[a],edges=[undefined];let i=0,work=0;
 const add=(p,index)=>{if(dist(out[out.length-1],p)>1){out.push(p);edges.push(ports[Math.min(index,ports.length-1)][2]);}};
 while(i<mids.length-1){for(let j=Math.min(mids.length-1,i+32);j>i;j--){let last=-1,cross=[],ok=true;
   for(let k=i+1;k<j;k++){if((++work&127)===0)yield;const p=intersect(mids[i],mids[j],...ports[k-1]);if(!p||p.t+.0001<last){ok=false;break;}last=p.t;cross.push({p:p.p,index:k-1});}
   if(ok){for(const row of cross)add(row.p,row.index);add(mids[j],j-1);i=j;break;}}}return tagged?out.map((p,j)=>({p,edge:edges[j]})):out;}
function itinerary(...args){const task=itineraryJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function* itineraryJob(startGraph,goalGraph,start,goal,bells,bannedByWorld={},fixedEnd,fixedStart){
 const nodes=(g,id,p)=>{if(!g.bells.has(id))g.bells.set(id,g.node(p));return g.bells.get(id);};
 const s=fixedStart??startGraph.node(start),t=fixedEnd??goalGraph.node(goal,'quest');if(s<0||t<0)return null;
 const leg=(g,a,b,x,y)=>g.routeJob(a,b,{startNode:x,endNode:y,banned:bannedByWorld[g.name]||new Set()});
 if(startGraph===goalGraph){const path=yield* leg(startGraph,start,goal,s,t);if(path)return {legs:[path],transfer:null};}
 function candidates(g,node,p){const sets=[];for(const bell of bells){if(bell.world!==g.name)continue;const at=arr(bell.at),id=nodes(g,bell.id,at);
   if(id>=0&&g.sameComponent(node,id))sets.push({bell,at,id,h:g.h(node,id)+xy(at,p)*.15});}return sets.sort((a,b)=>a.h-b.h);}
 const from=candidates(startGraph,s,start),to=candidates(goalGraph,t,goal);let depart,arrival,bestA=Infinity,bestB=Infinity;
 for(const b of from){if(b.h>bestA*150+500)break;const r=yield* leg(startGraph,start,b.at,s,b.id);if(r&&r.meters<bestA){bestA=r.meters;depart={b,r};}}
 for(const b of to){if(b.h>bestB*150+500)break;const r=yield* leg(goalGraph,b.at,goal,b.id,t);if(r&&r.meters<bestB){bestB=r.meters;arrival={b,r};}}
 if(!depart||!arrival||depart.b.bell.id===arrival.b.bell.id)return null;
 return {legs:[depart.r,arrival.r],transfer:{from:depart.b.bell,to:arrival.b.bell}};
}
exports.Graph=Graph;exports.itinerary=itinerary;exports.dist=dist;exports.xy=xy;exports.lerp=lerp;exports.clamp=clamp;exports.extent=extent;exports.nearestOnLine=nearestOnLine;
exports.finite=p=>!!p&&[p.x,p.y,p.z].every(x=>Number.isFinite(x)&&Math.abs(x)<2e9);
exports.markLocks=function(trip,reported,context){for(const leg of trip.legs){leg.locks=(leg.obstacles||[]).slice();const seen=new Set(leg.locks.map(r=>r.id));
 for(const r of reported){if(r.world!==leg.world||r.open||seen.has(r.id))continue;const match=leg.gates.some(g=>String(r.id).toLowerCase().includes(String(g.id).toLowerCase()));
  if(match||nearestOnLine(r.p,leg.points).d<215){leg.locks.push(r);seen.add(r.id);}}
 const feet=context&&(!context.world||context.world===leg.world)?context.p||context:null;
 leg.locks=require('./PBZRouteObstacles').visibleMarkers(leg,feet,leg.locks);
}};

exports.decode=decode;
exports.decodeJob=decodeJob;exports.graphJob=graphJob;

exports.itineraryJob=itineraryJob;
