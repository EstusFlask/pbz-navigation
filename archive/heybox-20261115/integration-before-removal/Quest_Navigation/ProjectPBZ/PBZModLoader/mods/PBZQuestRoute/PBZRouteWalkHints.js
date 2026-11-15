'use strict';
const R=require('./PBZRouteCore'),cache=new Map(),reviewed=new Map();
class Index{
 constructor(points){this.bins=new Map();this.count=0;
  for(const raw of points){const p={x:raw[0],y:raw[1],z:raw[2]};if(!R.finite(p))continue;
   const key=this.key(p);if(!this.bins.has(key))this.bins.set(key,[]);this.bins.get(key).push(p);this.count++;}
 }
 key(p){return [p.x,p.y,p.z].map(v=>Math.floor(v/280)).join(',');}
 candidates(p,radius=210){
  const rows=[],n=Math.ceil(Math.min(radius,500)/280),cell=[p.x,p.y,p.z].map(v=>Math.floor(v/280));
  for(let x=-n;x<=n;x++)for(let y=-n;y<=n;y++)for(let z=-n;z<=n;z++)
   for(const q of this.bins.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))||[]){const d=R.dist(p,q);if(d>1&&d<=radius)rows.push({p:q,d});}
  return rows.sort((a,b)=>a.d-b.d).map(r=>({...r.p}));
 }
 near(p,radius=210,limit=12){
  return this.candidates(p,radius).slice(0,Math.min(16,limit));
 }
}
function reviewedForWorld(world){
 const name=String(world||'').toLowerCase();if(name!=='pbz_xigu_wp')return null;
 if(!reviewed.has(name))reviewed.set(name,new Index(require('./PBZRouteWalkHintData/pbz_xigu_wp').data.points));
 return reviewed.get(name);
}
function forWorld(world){
 const name=String(world||'').toLowerCase();
 if(!cache.has(name)){
  const observed=reviewedForWorld(name),M=require('./PBZRouteMapHints');
  if(!M.supported(name)){if(observed)cache.set(name,observed);else return null;}
  else cache.set(name,{observed,world:name,surfaceCandidates:true,get surface(){return M.forWorld(name);},
   // Reviewed observations retain their finite graph. The surface layer fills
   // uncovered approaches; HintWalk tries the two graphs separately.
   near(p,radius=210,limit=12){
    const rows=observed?.near(p,radius,limit)||[];
    if(rows.length)return rows;
    const keys=new Set(rows.map(q=>[q.x,q.y,q.z].join(',')));
    for(const q of this.surface?.near(p,radius,16)||[])if(rows.length<Math.min(16,limit)&&!keys.has([q.x,q.y,q.z].join(',')))rows.push(q);
    return rows;
   },
   candidates(p,radius=210){
    const rows=observed?.candidates(p,radius)||[],keys=new Set(rows.map(q=>[q.x,q.y,q.z].join(',')));
    for(const q of this.surface?.candidates(p,radius)||[])if(!keys.has([q.x,q.y,q.z].join(',')))rows.push(q);
    return rows;
   }
  });
 }
 return cache.get(name);
}
exports.Index=Index;exports.forWorld=forWorld;exports.reviewedForWorld=reviewedForWorld;
