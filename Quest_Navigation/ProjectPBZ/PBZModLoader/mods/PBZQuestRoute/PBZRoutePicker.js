"use strict";
const {lerp,clamp}=require("./PBZRouteCore");
function valid(uv){return uv&&Number.isFinite(uv.x+uv.y)&&uv.x>=0&&uv.x<=1&&uv.y>=0&&uv.y<=1&&(uv.x!==0||uv.y!==0);}
// The stock map has no inverse projection. Fit each 32 m tile to the game's
// own projection and refine the nearest reachable road with exact projections.
class Picker{
 constructor(g,project){this.graph=g;this.project=project;this.tiles=[];this.cursor=0;}
 prepare(budget=Infinity){
  const g=this.graph,start=Date.now();
  for(;this.cursor<g.cells.length;this.cursor+=4){
   const i=this.cursor,begin=g.cells[i+2],end=g.cells[i+3];let fit;
   for(const pos of [begin+(end-begin>>1),begin,end-1]){
    if(g.walkNodes!==undefined&&g.order[pos]>=g.walkNodes)continue;
    const p=g.pt(g.order[pos]),uv=this.project(p);if(!valid(uv))continue;
    const ux=this.project({...p,x:p.x+80}),uy=this.project({...p,y:p.y+80}),uz=this.project({...p,z:p.z+80});
    if(!valid(ux)||!valid(uy))continue;
    fit={begin,end,p,uv,xx:(ux.x-uv.x)/80,xy:(ux.y-uv.y)/80,yx:(uy.x-uv.x)/80,yy:(uy.y-uv.y)/80,
     zx:valid(uz)?(uz.x-uv.x)/80:0,zy:valid(uz)?(uz.y-uv.y)/80:0};break;}
   if(fit)this.tiles.push(fit);
   if(Date.now()-start>=budget){this.cursor+=4;break;}
  }return this.cursor>=g.cells.length;
 }
 pick(uv,reachable,width,height,feet){
  this.prepare();const g=this.graph,candidates=[];let worst=Infinity;
  for(const f of this.tiles){for(let j=f.begin;j<f.end;j++){const id=g.order[j];if(g.walkNodes!==undefined&&id>=g.walkNodes)continue;if(reachable&&!reachable.has(g.strong[id]))continue;
    const o=id*3,dx=g.p[o]-f.p.x,dy=g.p[o+1]-f.p.y,dz=g.p[o+2]-f.p.z;
    const u=f.uv.x+dx*f.xx+dy*f.yx+dz*f.zx,v=f.uv.y+dx*f.xy+dy*f.yy+dz*f.zy;
    if(u<-.02||v<-.02||u>1.02||v>1.02)continue;
    const d=((u-uv.x)*width)**2+((v-uv.y)*height)**2;
    if(d>worst)continue;candidates.push({id,d});
    if(candidates.length>=80){candidates.sort((a,b)=>a.d-b.d);candidates.length=32;worst=candidates[31].d;}
  }}
  candidates.sort((a,b)=>a.d-b.d);let best=null,score=Infinity;
  const inspect=(p,at,id)=>{if(!valid(at))return;const d=((at.x-uv.x)*width)**2+((at.y-uv.y)*height)**2;
   const delta=feet?Math.abs(p.z-feet.z):0;if(d<score-.01||Math.abs(d-score)<=.01&&delta<(best?.delta??Infinity)){score=d;best={p,id,uv:at,delta};}};
  for(const {id} of candidates.slice(0,36)){const a=g.pt(id),pa=this.project(a);if(!valid(pa))continue;inspect(a,pa,id);
   for(let j=g.off[id];j<g.off[id+1];j++){const arc=g.arc[j],k=arc<0?~arc:arc;const kind=g.e[k*6+2];if(kind>1)continue;
    const to=g.e[k*6+(arc<0?0:1)];if(reachable&&!reachable.has(g.strong[to]))continue;
    const b=g.pt(to),pb=this.project(b);if(!valid(pb))continue;const dx=(pb.x-pa.x)*width,dy=(pb.y-pa.y)*height;
    const t=clamp(((uv.x-pa.x)*width*dx+(uv.y-pa.y)*height*dy)/(dx*dx+dy*dy||1));
    const p=lerp(a,b,t);inspect(p,this.project(p),t>.5?to:id);}}
  return best&&{...best,pixels:Math.sqrt(score)};
 }
}
exports.Picker=Picker;exports.valid=valid;
