"use strict";
const R=require("./PBZRouteCore");
const finite=u=>!!u&&Number.isFinite(u.x+u.y)&&Math.abs(u.x)<8&&Math.abs(u.y)<8&&(u.x!==0||u.y!==0);
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const ease=x=>x*x*(3-2*x);
function matrix(p,u,project,scale){
 const columns=[];
 for(const axis of ["x","y","z"]){
  const step=45,hi=project({...p,[axis]:p[axis]+step}),lo=project({...p,[axis]:p[axis]-step});
  const plausible=v=>finite(v)&&R.xy(v,u)<Math.max(.004,step*scale*5);
  const a=plausible(lo)?lo:u,b=plausible(hi)?hi:u,n=(a!==u&&b!==u?2:1)*step;
  columns.push({x:(b.x-a.x)/n,y:(b.y-a.y)/n});
 }
 return q=>{const delta=[q.x-p.x,q.y-p.y,q.z-p.z];let x=u.x,y=u.y;
  for(let i=0;i<3;i++){x+=columns[i].x*delta[i];y+=columns[i].y*delta[i];}return {x,y};};
}
function repair(run,project){
 const good=[];for(let i=0;i<run.length;i++)if(finite(run[i].uv))good.push(i);
 if(!good.length)return {rows:[],repairs:0};
 const rates=[];for(let j=1;j<good.length;j++){const a=run[good[j-1]],b=run[good[j]],ds=b.s-a.s;
  if(ds>3){const rate=R.xy(a.uv,b.uv)/ds;if(rate>1e-8)rates.push(rate);}}
 rates.sort((a,b)=>a-b);const scale=R.clamp(rates[Math.floor(rates.length*.45)]||1/80000,1/800000,1/3000);
 const first=good[0],last=good[good.length-1];const gaps=[];
 for(let j=1;j<good.length;j++){const a=good[j-1],b=good[j],ds=run[b].s-run[a].s,delta=R.xy(run[a].uv,run[b].uv);
  if(b===a+1&&delta<=Math.max(.009,scale*ds*5.2))continue;
  // Give a discontinuous painted-map transform a transition measured along
  // the known road. Keep its real bends via the two local world-to-map bases.
  const shoulder=R.clamp(delta/(scale*3),195,1200);let l=a,r=b;
  while(l>first&&(run[a].s-run[l].s<shoulder||!finite(run[l].uv)))l--;
  while(r<last&&(run[r].s-run[b].s<shoulder||!finite(run[r].uv)))r++;
  const prior=gaps[gaps.length-1];if(prior&&l<=prior.r)prior.r=Math.max(prior.r,r);else gaps.push({l,r});
 }
 for(const {l,r} of gaps){const a=run[l],b=run[r];if(!finite(a.uv)||!finite(b.uv)||l===r)continue;
  const left=matrix(a.p,a.uv,project,scale),right=matrix(b.p,b.uv,project,scale),span=b.s-a.s;
  for(let i=l+1;i<r;i++){const q=run[i];q.uv=mix(left(q.p),right(q.p),ease(R.clamp((q.s-a.s)/(span||1))));}}
 // Missing projections at the edge of a walk run can still use the adjacent
 // map cell's transform. Do not extrapolate arbitrarily far into another chart.
 for(const [idx,dir] of [[first,-1],[last,1]]){const q=run[idx];if(idx+dir<0||idx+dir>=run.length)continue;
  const transform=matrix(q.p,q.uv,project,scale);
  for(let i=idx+dir;i>=0&&i<run.length&&Math.abs(run[i].s-q.s)<=700;i+=dir)run[i].uv=transform(run[i].p);}
 return {rows:run.filter(q=>finite(q.uv)),repairs:gaps.length};
}
function projectLeg(points,project,belongs,anchorStart,anchorEnd){
 if(points.length<2)return {runs:[],offsets:[0],repairs:0};
 const total=R.extent(points),step=Math.max(125,total/1000),runs=[],offsets=[0];let raw=[],s=0,repairs=0;
 const flush=()=>{if(raw.length){const v=repair(raw,project);if(v.rows.length>1)runs.push(v.rows);repairs+=v.repairs;raw=[];}};
 const add=(p,at,anchor)=>{if(!belongs(p)){flush();return;}raw.push({p,s:at,uv:finite(anchor)?anchor:project(p)});};
 add(points[0],0,anchorStart);
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=R.dist(a,b),n=Math.max(1,Math.ceil(d/step));
  if(b.liftTravel){flush();s+=d;add(b,s,i===points.length-1?anchorEnd:null);offsets.push(s);continue;}
  for(let j=1;j<=n;j++)add(j===n?b:R.lerp(a,b,j/n),s+d*j/n,i===points.length-1&&j===n?anchorEnd:null);
  s+=d;offsets.push(s);}
 flush();return {runs,offsets,repairs};
}
function after(rows,s){
 if(!rows.length||s>rows[rows.length-1].s)return [];if(s<=rows[0].s)return rows.map(q=>q.uv);
 const i=rows.findIndex(q=>q.s>=s),a=rows[i-1],b=rows[i];if(i<1)return [];
 return [mix(a.uv,b.uv,(s-a.s)/(b.s-a.s||1)),...rows.slice(i).map(q=>q.uv)];
}
// Clip in map UV space, independently of zoom. Off-paper parts of one
// walking leg must never connect two separate visits to the drawing.
function clip(a,b){
 const dx=b.x-a.x,dy=b.y-a.y;let l=0,h=1;
 for(const [p,q] of [[-dx,a.x],[dx,1-a.x],[-dy,a.y],[dy,1-a.y]]){
  if(!p){if(q<0)return null;continue;}const t=q/p;if(p<0)l=Math.max(l,t);else h=Math.min(h,t);if(l>h)return null;}
 return [mix(a,b,l),mix(a,b,h)];
}
function visible(points){
 let run=[];const result=[];for(let i=1;i<points.length;i++){const pair=clip(points[i-1],points[i]);
  if(!pair){if(run.length>1)result.push(run);run=[];continue;}
  if(run.length&&R.xy(run[run.length-1],pair[0])>.00001){if(run.length>1)result.push(run);run=[];}
  if(!run.length)run.push(pair[0]);run.push(pair[1]);}
 if(run.length>1)result.push(run);return result;
}
function dashes(a,b,dash=11,gap=8){const out=[],length=R.xy(a,b);if(length<=1)return out;
 const n=Math.max(1,Math.round((length+gap)/(dash+gap))),unit=length/Math.max(.1,n+(n-1)*gap/dash);
 for(let i=0;i<n;i++){const start=i*unit*(1+gap/dash);out.push([mix(a,b,start/length),mix(a,b,Math.min(1,(start+unit)/length))]);}return out;}
exports.projectLeg=projectLeg;exports.after=after;exports.visible=visible;exports.dashes=dashes;exports.finite=finite;
