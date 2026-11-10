'use strict';
// A rejected module must not break the map's confirm handler or be retried
// on every tick. Keep selection independent from the route-data lifecycle.
class AtlasCache {
 constructor(load,construct,report,clock=Date.now){this.load=load;this.construct=construct;this.report=report;this.clock=clock;this.graphs=new Map();this.failed=new Map();}
 get(world,protectedWorlds=[]){
  if(this.graphs.has(world))return this.graphs.get(world);
  const now=this.clock(),bad=this.failed.get(world);if(bad&&now<bad.next)return null;
  try{
   const data=this.load('./PBZRouteWorlds/'+world)?.data,faces=this.load('./PBZRouteFaces/'+world)?.faces;
   if(!data||data.world!==world||!Number.isInteger(data.n)||data.n<1||!Array.isArray(data.actors))throw Error('incomplete atlas '+world);
   if(!faces)throw Error('missing atlas faces '+world);
   const g=this.construct(data,faces);this.graphs.set(world,g);this.failed.delete(world);
   if(this.graphs.size>3){const old=[...this.graphs.keys()].find(k=>k!==world&&!protectedWorlds.includes(k));if(old)this.graphs.delete(old);}
   this.report('preloaded '+world,g.n+' nodes in '+(this.clock()-now)+'ms');return g;
  }catch(e){
   const message=String(e);this.failed.set(world,{next:now+60000,message});
   this.report('atlas unavailable '+world,message+'; selection retained');return null;
  }
 }
}
exports.AtlasCache=AtlasCache;
