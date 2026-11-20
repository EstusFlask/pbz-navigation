'use strict';
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite),dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
function valid(v){
 if(!v||!finite(v.center)||!Array.isArray(v.axes)||v.axes.length!==3||!v.axes.every(finite))return false;
 const lengths=v.axes.map(a=>Math.hypot(...a));
 return lengths.every(n=>n>.01&&n<=100000)&&v.axes.every((a,i)=>v.axes.every((b,j)=>i===j||Math.abs(dot(a,b))<=lengths[i]*lengths[j]*1e-5));
}
function contains(v,p,halfHeight=96){
 if(!valid(v)||!finite(p)||!Number.isFinite(halfHeight))return false;
 const delta=p.map((x,i)=>x-v.center[i]+(i===2?halfHeight:0));
 return v.axes.every(a=>Math.abs(dot(delta,a)/dot(a,a))<=1+1e-7);
}
function overlapsCapsule(v,feet,halfHeight=96,radius=35){
 if(!valid(v)||!finite(feet)||!Number.isFinite(halfHeight)||!Number.isFinite(radius)||radius<=0||halfHeight<radius)return false;
 const extents=v.axes.map(axis=>Math.hypot(...axis));
 const axes=v.axes.map((axis,i)=>axis.map(value=>value/extents[i]));
 const bottom=feet.map((value,i)=>value-v.center[i]+(i===2?radius:0));
 const start=axes.map(axis=>dot(bottom,axis));
 const direction=axes.map(axis=>axis[2]*2*(halfHeight-radius));
 const breaks=[0,1];
 for(let i=0;i<3;i++){
  if(Math.abs(direction[i])<1e-12)continue;
  for(const side of [-extents[i],extents[i]]){
   const t=(side-start[i])/direction[i];
   if(t>0&&t<1)breaks.push(t);
  }
 }
 breaks.sort((a,b)=>a-b);
 const distanceSquared=t=>start.reduce((sum,value,i)=>sum+Math.max(0,Math.abs(value+t*direction[i])-extents[i])**2,0);
 // Between box-face crossings the segment-to-box distance is quadratic.
 // Minimize each interval to retain the capsule's spherical end caps.
 for(let n=1;n<breaks.length;n++){
  const low=breaks[n-1],high=breaks[n],middle=(low+high)/2;
  let numerator=0,denominator=0;
  for(let i=0;i<3;i++){
   const value=start[i]+middle*direction[i];
   if(Math.abs(value)<=extents[i])continue;
   const offset=start[i]-(value>0?extents[i]:-extents[i]);
   numerator+=direction[i]*offset;
   denominator+=direction[i]**2;
  }
  const t=denominator?Math.max(low,Math.min(high,-numerator/denominator)):middle;
  if(distanceSquared(t)<=radius**2+1e-7)return true;
 }
 return false;
}
function samples(v,near=v?.center,halfHeight=96){
 if(!valid(v)||!finite(near)||!Number.isFinite(halfHeight))return[];
 const point=f=>v.center.map((x,i)=>x+v.axes.reduce((n,a,k)=>n+a[i]*f[k],0)-(i===2?halfHeight:0));
 const delta=near.map((x,i)=>x-v.center[i]+(i===2?halfHeight:0)),closest=v.axes.map(a=>Math.max(-.85,Math.min(.85,dot(delta,a)/dot(a,a)))),out=[point(closest),point([0,0,0])];
 // At most 83 probes, spaced through the actual authored oriented box.
 // Ground and capsule checks decide every returned standing candidate.
 for(const x of [0,-.8,.8])for(const y of [0,-.8,.8])for(let z=-4;z<=4;z++)out.push(point([x,y,z*.2]));
 return out.sort((a,b)=>Math.hypot(...a.map((x,i)=>x-near[i]))-Math.hypot(...b.map((x,i)=>x-near[i])));
}
function upperFootSamples(volume,near){
 if(!valid(volume)||!finite(near))return[];
 const up=volume.axes.map(axis=>Math.abs(axis[2])/Math.hypot(...axis));
 const vertical=up.indexOf(Math.max(...up));
 const horizontal=volume.axes.filter((_,i)=>i!==vertical),axis=volume.axes[vertical];
 const face=volume.center.map((value,i)=>value+axis[i]*Math.sign(axis[2]));
 face[2]-=12;
 const points=[];
 for(const a of [-.8,0,.8])for(const b of [-.8,0,.8]){
  points.push(face.map((value,i)=>value+a*horizontal[0][i]+b*horizontal[1][i]));
 }
 return points.sort((a,b)=>Math.hypot(...a.map((value,i)=>value-near[i]))-Math.hypot(...b.map((value,i)=>value-near[i])));
}
function live(box,UE,plain){
 try{
  const transform=box?.K2_GetComponentToWorld?.()||box?.GetComponentTransform?.(),extent=box?.GetUnscaledBoxExtent?.();
  if(!transform||!extent||!UE.KismetMathLibrary?.TransformLocation||!UE.Vector)return null;
  const place=p=>{const q=plain(UE.KismetMathLibrary.TransformLocation(transform,new UE.Vector(...p)));return[q.x,q.y,q.z];},center=place([0,0,0]),axes=[extent.X,extent.Y,extent.Z].map((n,i)=>place([0,0,0].map((_,j)=>i===j?Number(n):0)).map((x,j)=>x-center[j])),result={center,axes};
  return valid(result)?result:null;
 }catch(_){return null;}
}
exports.contains=contains;exports.overlapsCapsule=overlapsCapsule;exports.samples=samples;exports.upperFootSamples=upperFootSamples;exports.live=live;exports.valid=valid;
