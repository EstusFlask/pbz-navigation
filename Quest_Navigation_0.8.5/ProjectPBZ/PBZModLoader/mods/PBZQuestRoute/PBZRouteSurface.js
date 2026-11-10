"use strict";
// Points from cooked convex Recast faces, with support for overlapping floors.
function surface(g,id,p){
 const faces=g.faces;
 if(!faces||id*6>=faces.length)return g.pt(id);
 const vertices=[];
 for(let k=0;k<6;k++){const n=faces[id*6+k];if(n<0)break;const o=n*3;vertices.push({x:g.v[o],y:g.v[o+1],z:g.v[o+2]});}
 if(vertices.length<3)return g.pt(id);
 const a=vertices[0];
 for(let i=1;i+1<vertices.length;i++){
  const b=vertices[i],c=vertices[i+1],bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y,det=bx*cy-by*cx;if(Math.abs(det)<.01)continue;
  const x=p.x-a.x,y=p.y-a.y,u=(x*cy-y*cx)/det,v=(bx*y-by*x)/det;
  if(u>=-1e-5&&v>=-1e-5&&u+v<=1.00001)return {x:p.x,y:p.y,z:a.z+u*(b.z-a.z)+v*(c.z-a.z)};
 }
 let hit=null,best=Infinity;
 for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],x=b.x-a.x,y=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));
  const q={x:a.x+x*t,y:a.y+y*t,z:a.z+(b.z-a.z)*t},d=(p.x-q.x)**2+(p.y-q.y)**2;
  if(d<best){best=d;hit=q;}}
 return hit;
}
function anchors(...args){const task=anchorsJob(...args);let row;do{row=task.next();}while(!row.done);return row.value;}
function* anchorsJob(g,p,goal=false){
 let work=0;const cx=Math.floor(p.x/3200),cy=Math.floor(p.y/3200),best=new Map();
 for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){
  const k=g.bin.get(x+','+y);if(k===undefined)continue;
  for(let j=g.cells[k+2];j<g.cells[k+3];j++){
   if((++work&127)===0)yield;const id=g.order[j];if(g.walkNodes!==undefined&&id>=g.walkNodes)continue;
   const q=surface(g,id,p),dx=q.x-p.x,dy=q.y-p.y,dz=q.z-p.z,r=Math.hypot(dx,dy);
   if(r>(goal?530:760)||dz>(goal?95:85)||dz<-(goal?310:100))continue;
   const cost=r+Math.abs(dz+(goal?55:0))*2,component=g.strong[id],row={id,q,cost,r,dz,component};
   const old=best.get(component);if(!old||old.cost>cost)best.set(component,row);
  }}
 return [...best.values()].sort((a,b)=>a.cost-b.cost).slice(0,7);
}
function join(w,feet,row){
 if(row.r<=18&&Math.abs(row.dz)<=37)return [feet,row.q];
 if(!w||row.r>760)return null;
 const n=Math.max(1,Math.ceil(row.r/58)),pts=[feet];let last=feet;
 for(let i=1;i<=n;i++){const t=i/n,q={x:feet.x+(row.q.x-feet.x)*t,y:feet.y+(row.q.y-feet.y)*t,z:feet.z+row.dz*t};
  const h=w.step(last,q,true);if(!h.p||Math.abs(h.p.z-q.z)>68)return null;pts.push(h.p);last=h.p;}
 return Math.abs(last.z-row.q.z)<51?pts:null;
}
exports.surface=surface;exports.anchors=anchors;exports.join=join;

exports.anchorsJob=anchorsJob;
