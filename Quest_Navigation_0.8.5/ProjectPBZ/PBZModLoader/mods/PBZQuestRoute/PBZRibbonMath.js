"use strict";
const R=require("./PBZRouteCore");
const {lerp,dist,nearestOnLine}=R;

function append(out,p){if(!out.length||dist(out[out.length-1],p)>.25)out.push(p);}
function quad(a,b,c,t){return lerp(lerp(a,b,t),lerp(b,c,t),t);}
function unit(a,b){const n=dist(a,b)||1;return {x:(b.x-a.x)/n,y:(b.y-a.y)/n,z:(b.z-a.z)/n};}
function offset(p,d,t){return {x:p.x+d.x*t,y:p.y+d.y*t,z:p.z+d.z*t};}
function decimate(ps,tolerance=8){
 if(ps.length<3)return ps.slice();
 const keep=new Uint8Array(ps.length),stack=[[0,ps.length-1]];keep[0]=keep[ps.length-1]=1;
 while(stack.length){const [a,b]=stack.pop(),span=[ps[a],ps[b]];let at=-1,error=tolerance;
  for(let i=a+1;i<b;i++){const d=nearestOnLine(ps[i],span).d;if(d>error){error=d;at=i;}}
  if(at>=0){keep[at]=1;stack.push([a,at],[at,b]);}}
 return ps.filter((p,i)=>keep[i]);
}
function around(raw){
 const points=decimate(raw,2),curve=[];if(!points.length)return curve;append(curve,points[0]);
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1],left=dist(a,b),right=dist(b,c);
  if(left<.5||right<.5)continue;
  let trim=Math.min(180,left*.46,right*.46);
  let enter=lerp(b,a,trim/left),exit=lerp(b,c,trim/right);
  const err=nearestOnLine(quad(enter,b,exit,.5),[a,b,c]).d;
  if(err>6){trim*=6/err;enter=lerp(b,a,trim/left);exit=lerp(b,c,trim/right);}
  append(curve,enter);
  const samples=Math.max(5,Math.ceil(trim/14));
  for(let k=1;k<=samples;k++)append(curve,quad(enter,b,exit,k/samples));
 }
 append(curve,points[points.length-1]);const out=[curve[0]];
 for(let i=1;i<curve.length;i++){const a=curve[i-1],b=curve[i],n=Math.ceil(dist(a,b)/53);for(let k=1;k<=n;k++)append(out,lerp(a,b,k/n));}
 return out;
}
const influence=1000,farLift=18,kneeLift=48,tailLength=155;
const smooth=x=>{x=R.clamp(x);return x*x*(3-2*x);};
function road(raw){
 const points=around(raw),arc=[0];
 for(let i=1;i<points.length;i++)arc.push(arc[i-1]+dist(points[i-1],points[i]));
 return {points,arc,length:arc[arc.length-1],offset:new Float64Array(points.length)};
}
function index(r,s){
 let a=0,b=r.arc.length-1;while(b-a>1){const m=(a+b)>>1;if(r.arc[m]<=s)a=m;else b=m;}
 return a;
}
function floor(r,s){
 s=R.clamp(s,0,r.length);const i=index(r,s),j=i+1,t=(s-r.arc[i])/(r.arc[j]-r.arc[i]||1),p=lerp(r.points[i],r.points[j],t);
 p.z+=r.offset[i]+(r.offset[j]-r.offset[i])*t;return p;
}
function match(r,foot,hint=0){
 let q=nearestOnLine(foot,r.points,Math.max(0,hint-30),Math.min(r.points.length-1,hint+90));
 if(q.d>160)q=nearestOnLine(foot,r.points);
 return q.p?{...q,arc:r.arc[q.i]+q.t*(r.arc[q.i+1]-r.arc[q.i])}:null;
}
function animate(prev,foot,now){
 if(!prev||now<=prev.now||now-prev.now>300||dist(foot,prev.foot)>280)return {foot,now,vx:0,vy:0,phase:0};
 const dt=(now-prev.now)*.001,k=1-Math.exp(-dt/.16),vx=R.clamp((foot.x-prev.foot.x)/dt,-900,900),vy=R.clamp((foot.y-prev.foot.y)/dt,-900,900);
 const dx=prev.vx+(vx-prev.vx)*k,dy=prev.vy+(vy-prev.vy)*k;
 return {foot,now,vx:dx,vy:dy,phase:(prev.phase+Math.min(900,Math.hypot(dx,dy))*dt/93)%(2*Math.PI)};
}
function attachment(prev,anchor,foot,now){
 const local={x:anchor.x-foot.x,y:anchor.y-foot.y,z:anchor.z-foot.z};
 if(prev&&now>prev.now&&now-prev.now<300&&dist(foot,prev.foot)<280){
  const dt=(now-prev.now)*.001;for(const k of ['x','y','z'])local[k]=prev.local[k]+(local[k]-prev.local[k])*(1-Math.exp(-dt/(k==='z'?.14:.09)));
 }
 return {foot:{...foot},now,local,p:{x:foot.x+local.x,y:foot.y+local.y,z:foot.z+local.z}};
}
function frame(r,m,anchor,motion){
 const origin=floor(r,m.arc),ahead=floor(r,Math.min(r.length,m.arc+35));
 const planar=Math.hypot(ahead.x-origin.x,ahead.y-origin.y)||1;
 const startTail=smooth((r.length-m.arc)/tailLength),nearHeight=R.clamp(anchor.z-origin.z,30,64);
 const baseHeight=origin.z+nearHeight*startTail-13*(1-startTail);
 return {start:m.arc,anchor,shift:{x:anchor.x-origin.x,y:anchor.y-origin.y},
  side:{x:-(ahead.y-origin.y)/planar,y:(ahead.x-origin.x)/planar},
  nearHeight,startTail,baseHeight,motion};
}
function at(r,s,f){
 const p=floor(r,s),endDist=Math.max(0,r.length-s),tail=smooth(endDist/tailLength);
 const rest=farLift*tail-13*(1-tail);
 if(!f){p.z+=rest;return p;}
 const d=Math.max(0,s-f.start),restWeight=smooth(d/influence),pull=1-restWeight;
 const startTail=f.startTail;
 const anchorWeight=(1-smooth(d/Math.min(420,Math.max(1,r.length-f.start))))*Math.min(1,tail/Math.max(.000001,startTail));
 const belly=Math.sin(Math.PI*R.clamp(d/influence))**2*pull*tail;
 // Body motion bends the near strand sideways. Do not drive a travelling
 // vertical sine wave through the exact part the player is running towards.
 const drift=R.clamp(-(f.motion.vx*f.side.x+f.motion.vy*f.side.y)*.018,-5,5);
 const wave=drift*belly;
 p.x+=f.shift.x*anchorWeight+f.side.x*wave;p.y+=f.shift.y*anchorWeight+f.side.y*wave;
 p.z+=rest+(f.nearHeight-farLift)*pull*tail;
 // Preserve both endpoints, including on a steep last flight of stairs.
 const base=f.baseHeight;
 p.z+=(f.anchor.z-base)*anchorWeight;
 return p;
}
function section(r,f,a,b){
 if(b-a<1)return null;
 // Fixed material coordinates: passing an atlas knot must never insert or
 // remove a spline point or renumber live Niagara particles / mesh vertices.
 const ps=[],n=f?48:52;for(let i=0;i<=n;i++)ps.push(at(r,a+(b-a)*i/n,f));
 return {ps,before:a>0?at(r,Math.max(0,a-4),f):null,after:b<r.length?at(r,Math.min(r.length,b+4),f):null};
}
exports.road=road;exports.floor=floor;exports.index=index;exports.match=match;exports.animate=animate;exports.frame=frame;
exports.at=at;exports.section=section;exports.influence=influence;exports.around=around;exports.unit=unit;exports.append=append;exports.attachment=attachment;
