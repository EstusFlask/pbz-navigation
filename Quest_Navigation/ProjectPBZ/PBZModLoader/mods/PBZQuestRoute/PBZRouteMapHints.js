'use strict';
const R=require('./PBZRouteCore'),cache=new Map();
// Compiled surface positions are proposals. No adjacency, lock state, floor
// acceptance or collision certificate is carried over from the source pack.
class Index{
 constructor(data,load){
  if(data?.schema!==1||data.tileSize!==3200||data.scale!==10||!data.tiles)throw Error('invalid surface candidate index');
  this.data=data;this.load=load;this.pages=new Map();this.failed=new Set();this.pending=new Map();this.count=data.points;this.surfaceCandidates=true;
 }
 page(row){
  if(this.pages.has(row.name)){const value=this.pages.get(row.name);this.pages.delete(row.name);this.pages.set(row.name,value);return value;}
  if(this.failed.has(row.name))return null;
  try{
   if(!Number.isInteger(row.n)||row.n<1||row.n>4096)throw Error('oversized surface candidate page');
   const encoded=this.load(row.name).p;
   if(typeof encoded!=='string'||encoded.length!==row.n*16)throw Error('invalid surface candidate payload');
   const values=R.decode(encoded,Int32Array);
   if(values.length!==row.n*3)throw Error('incomplete surface candidate page');
   if(this.pages.size>=32)this.pages.delete(this.pages.keys().next().value);
   this.pages.set(row.name,values);return values;
  }catch(_){this.failed.add(row.name);return null;}
 }
 candidates(p,radius=210){
  if(!R.finite(p)||!Number.isFinite(radius)||radius<=0)return [];
  const r=Math.min(radius,500),size=this.data.tileSize,rows=[];let reads=0;
  for(let x=Math.floor((p.x-r)/size);x<=Math.floor((p.x+r)/size);x++)
   for(let y=Math.floor((p.y-r)/size);y<=Math.floor((p.y+r)/size);y++){
    const dx=Math.max(x*size-p.x,0,p.x-(x+1)*size),dy=Math.max(y*size-p.y,0,p.y-(y+1)*size);
    if(dx*dx+dy*dy>r*r)continue;
    for(const row of this.data.tiles[x+','+y]||[]){
     if(row.lo>p.z+r||row.hi<p.z-r||this.failed.has(row.name))continue;
     if(!this.pages.has(row.name)){
      if(this.deferred){this.pending.set(row.name,row);continue;}
      if(reads++>=8)continue;
     }
     const values=this.page(row);if(!values)continue;
     for(let i=0;i<values.length;i+=3){
      const q={x:values[i]/10,y:values[i+1]/10,z:values[i+2]/10},d=R.dist(p,q);
      if(d>1&&d<=r)rows.push({p:q,d});
     }
    }
   }
  return rows.sort((a,b)=>a.d-b.d||a.p.x-b.p.x||a.p.y-b.p.y||a.p.z-b.p.z).slice(0,256).map(row=>row.p);
 }
 near(p,radius=210,limit=12){return this.candidates(p,radius).slice(0,Math.max(0,Math.min(16,limit)));}
 pump(){
  const row=this.pending.values().next().value;if(!row)return false;
  this.pending.delete(row.name);this.page(row);return true;
 }
}
function supported(world){try{return require('./PBZRouteMapData/index').data.worlds.includes(String(world||'').toLowerCase());}catch(_){return false;}}
function forWorld(world){
 const name=String(world||'').toLowerCase();
 if(!cache.has(name)){
  let index=null;
  try{if(supported(name))
   index=new Index(require('./PBZRouteMapData/'+name+'/index').data,key=>require('./PBZRouteMapData/'+key).data);
  }catch(_){}
  // Cache only supported worlds; arbitrary input must not grow a global map.
  if(index)cache.set(name,index);return index;
 }
 return cache.get(name);
}
function warm(world,points=[]){
 // Called before Planner.pump, so a cold require cannot fail an otherwise
 // valid route's 50 ms slice guard. Load at most one page per game tick.
 const known=cache.has(String(world||'').toLowerCase()),index=forWorld(world);if(!index)return false;
 index.deferred=true;if(!known)return true;
 if(index.pump())return true;
 const valid=points.filter(R.finite),stamp=valid.map(p=>[p.x,p.y,p.z].map(v=>Math.floor(v/280)).join(',')).join('|');
 if(index.warmStamp===stamp)return false;index.warmStamp=stamp;
 for(const p of valid)index.candidates(p,350);
 return index.pump();
}
exports.Index=Index;exports.forWorld=forWorld;exports.supported=supported;exports.warm=warm;
