'use strict';
// A map callback only queues data. Small generated modules and typed columns
// are loaded/decoded between gameplay frames, outside the route job timeout.
class AtlasCache {
 constructor(load,construct,report,clock=Date.now){
  Object.assign(this,{load,construct,report,clock});this.graphs=new Map();this.failed=new Map();this.pending=new Map();this.revision=0;this.nextPump=0;
 }
 get(world,protectedWorlds=[]){
  if(this.graphs.has(world))return this.graphs.get(world);
  const bad=this.failed.get(world);if(bad&&this.clock()<bad.next)return null;
  if(!this.pending.has(world))this.pending.set(world,{world,protect:protectedWorlds,job:this.prepare(world),started:this.clock(),maxSlice:0});
  return null;
 }
 *prepare(world){
  const manifest=this.load('./PBZRouteStreaming/'+world+'/index');yield;
  const data={...manifest.data,actors:[]};
  if(data.world!==world||!Number.isInteger(data.n)||data.n<1)throw Error('incomplete atlas '+world);
  for(let i=0;i<manifest.actorChunks;i++){
   data.actors.push(...this.load('./PBZRouteStreaming/'+world+'/actors/'+i).actors);yield;
  }
  const task=this.construct(data,manifest.faces,key=>this.load('./PBZRouteStreaming/'+key).chunk);
  return task&&typeof task.next==='function'?yield* task:task;
 }
 pump(){
  const now=this.clock();if(now<this.nextPump||!this.pending.size)return false;this.nextPump=now+16;
  const item=this.pending.values().next().value;let row,steps=0;
  try{
   do{row=item.job.next();steps++;if(row.done)break;}while(steps<8&&this.clock()-now<1.25);
   item.maxSlice=Math.max(item.maxSlice,this.clock()-now);
   if(row.done){
    if(!row.value)throw Error('empty atlas');
    this.graphs.set(item.world,row.value);this.pending.delete(item.world);this.failed.delete(item.world);this.revision++;
    if(this.graphs.size>3){const old=[...this.graphs.keys()].find(k=>k!==item.world&&!item.protect.includes(k));if(old)this.graphs.delete(old);}
    this.report('preloaded '+item.world,row.value.n+' nodes streamed in '+(this.clock()-item.started)+'ms maxSlice='+item.maxSlice+'ms');
   }
  }catch(error){
   this.pending.delete(item.world);this.failed.set(item.world,{next:now+60000,message:String(error)});
   this.report('atlas unavailable '+item.world,String(error)+'; selection retained');
  }
  return true;
 }
}
exports.AtlasCache=AtlasCache;
