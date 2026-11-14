'use strict';
const R=require('./PBZRouteCore');
let courses;
function catalog(){
 return courses||=(require('./PBZRouteGuideData').data.courses.map(c=>({...c,
  points:c.points.map(p=>({x:p[0],y:p[1],z:p[2]})),target:{x:c.target[0],y:c.target[1],z:c.target[2]}})));
}
const actionAt=(leg,i)=>(leg.moves||[]).find(m=>m.from<=i&&m.to>i);
// Only a tiny correction inside the occupied footprint may use the fixed
// course's ground evidence. New approaches still need a checked walking join.
function* joinJob(w,a,b,occupied=65){
 const distance=R.dist(a,b);if(Math.abs(a.z-b.z)>90||distance>760)return null;
 if(distance<.5)return [{...a}];
 const n=Math.max(1,Math.ceil(distance/35)),points=[{...a}];let p=a;
 for(let j=1;j<=n;j++){
  const q=R.lerp(a,b,j/n),lock=w.blockAt?.(p,q);if(lock)return null;
  if(distance<=occupied){if(w.hit?.(p,q,true))return null;p=q;}
  else {const row=w.step(p,q,true);if(!row.p||R.dist(row.p,q)>65)return null;p=row.p;}
  points.push({...p});yield;
 }
 if(R.dist(p,b)>65)return null;
 // Keep a small measured height offset rather than re-projecting the whole
 // course onto whatever lower/upper deck the floor query happens to return.
 if(R.dist(p,b)>.5){if(w.blockAt?.(p,b)||w.hit?.(p,b,true))return null;points.push({...b});}
 return points;
}
function join(...args){const job=joinJob(...args);let row;do{row=job.next();}while(!row.done);return row.value;}
function attachment(leg,w,feet,near){
 const raw=leg.guide?R.nearestOnLine(feet,leg.points):near;
 if(leg.guide&&actionAt(leg,raw.i)&&near.d<=160){
  if(w.blockAt?.(feet,near.p))return null;
  // Climbing intentionally touches the wall. The raised ribbon's sphere
  // sweep still clips its visible connector and the authored action curve.
  return [feet,near.p];
 }
 return join(w,feet,near.p);
}
function refreshActions(leg,g){
 if(!leg?.guide||!g)return;
 const features=[...(g.observedPassages?.values()||[]),...(g.actors||[])];
 for(const move of leg.moves){
  let key=String(move.guid).toLowerCase(),state=g.passageStates?.get(key);
  if(!state&&key.startsWith('guide:')&&move.kind==='hook'){
   const feature=features.find(f=>f.kind===move.kind&&f.path?.length&&
    R.nearestOnLine({x:f.path[0][0],y:f.path[0][1],z:f.path[0][2]},leg.points.slice(move.from,move.to+1)).d<350&&
    R.dist({x:f.path[f.path.length-1][0],y:f.path[f.path.length-1][1],z:f.path[f.path.length-1][2]},move.end)<500);
   if(feature){move.stateGuid=String(feature.guid).toLowerCase();state=g.passageStates?.get(move.stateGuid);}
  }
  if(state?.ready===false)move.block=state.block||{unknown:true,label:'交互条件待确认',source:'live-mechanism'};
  else if(state?.ready===true)delete move.block;
 }
}
function* plan(w,world,dest,start,options={}){
 return yield* require('./PBZRouteBellNetwork').plan(w,world,dest,start,{
  ...options,courses:options.courses||catalog(),joinJob,refreshActions});
}
exports.plan=plan;exports.joinJob=joinJob;exports.attachment=attachment;exports.refreshActions=refreshActions;
