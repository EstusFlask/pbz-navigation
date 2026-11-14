'use strict';
const R=require('./PBZRouteCore'),cache=new Map();
class Index{
 constructor(points){this.bins=new Map();this.count=0;
  for(const raw of points){const p={x:raw[0],y:raw[1],z:raw[2]};if(!R.finite(p))continue;
   const key=this.key(p);if(!this.bins.has(key))this.bins.set(key,[]);this.bins.get(key).push(p);this.count++;}
 }
 key(p){return [p.x,p.y,p.z].map(v=>Math.floor(v/280)).join(',');}
 near(p,radius=210,limit=12){
  const rows=[],n=Math.ceil(Math.min(radius,500)/280),cell=[p.x,p.y,p.z].map(v=>Math.floor(v/280));
  for(let x=-n;x<=n;x++)for(let y=-n;y<=n;y++)for(let z=-n;z<=n;z++)
   for(const q of this.bins.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))||[]){const d=R.dist(p,q);if(d>1&&d<=radius)rows.push({p:q,d});}
  return rows.sort((a,b)=>a.d-b.d).slice(0,Math.min(16,limit)).map(r=>({...r.p}));
 }
}
function forWorld(world){
 const name=String(world||'').toLowerCase();if(name!=='pbz_xigu_wp')return null;
 if(!cache.has(name))cache.set(name,new Index(require('./PBZRouteWalkHintData/pbz_xigu_wp').data.points));
 return cache.get(name);
}
exports.Index=Index;exports.forWorld=forWorld;
