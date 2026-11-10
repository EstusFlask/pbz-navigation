'use strict';
const R=require('./PBZRouteCore');
// Collectible actors may have collision or a non-walkable surface at their
// origin. Find same-level standing positions within interaction range.
function* approaches(world,point,radius=140,options={}){
 const probes=[point];
 for(const r of [90,radius])for(let i=0;i<8;i++){const a=i*Math.PI/4;probes.push({x:point.x+Math.cos(a)*r,y:point.y+Math.sin(a)*r,z:point.z});}
 const result=[],seen=new Set();
 for(const p of probes){
  const q=world.floorAt(p,true);yield;
  if(!q||q.z>point.z+75||q.z<point.z-200)continue;
  const blocked=world.hit?.(q,q,true);yield;if(blocked)continue;
  const sight=world.hit?.({...q,z:q.z+60},{...point,z:point.z+8},false,true);yield;
  if(sight){
   const owners=sight.owners||[],key=String(options.targetKey||'').toLowerCase();
   const own=owners.some(name=>key.includes(String(name).toLowerCase()));
   const barrier=owners.some(name=>/door|gate|wall|rock|stone|floor|landscape|blocking/i.test(String(name)));
   if(!own&&(barrier||!sight.point||R.dist(sight.point,point)>40))continue;
  }
  const key=[q.x,q.y,q.z].map(x=>Math.round(x*10)).join(',');
  if(!seen.has(key)){seen.add(key);result.push(q);}
 }
 return result;
}
exports.approaches=approaches;
