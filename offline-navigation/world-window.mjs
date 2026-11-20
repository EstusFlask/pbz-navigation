// Bounded sparse-world tile residency. No filesystem, WASM API, or dynamic code.
import {Planner} from './query.mjs';
import {decodeBase64,navHeader} from './nav-set.mjs';
import {prepare as prepareAdmission,restore as restorePortals,connect as connectPortals,events as connectionEvents} from './admission.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},key=t=>t.x+','+t.y+','+(t.layer??0);
export class WorldWindow{
 constructor(index,readBlob,options={}){
  need(index.schema===1&&index.kind==='experimental-sparse-world'&&index.unknownState==='closed','Unsupported sparse world');
  need(index.originUE.every(v=>v===0)&&index.extentCm>0,'Unsupported sparse coordinate origin');
  this.index=index;this.readBlob=readBlob;this.loaded=new Map();this.jobs=new Set();this.retained=new Map();this.busy=false;this.destroyed=false;
  const header=decodeBase64(index.navHeaderBase64);this.maxTiles=Math.min(options.maxTiles??256,navHeader(header).maxTiles);
  this.maxBytes=options.maxBytes??32*1024*1024;
  this.readBlobJob=options.readBlobJob;
  need(Number.isInteger(this.maxTiles)&&this.maxTiles>0&&Number.isFinite(this.maxBytes)&&this.maxBytes>0,'Invalid world window budget');
  this.defaultHeader=header;this.plannerOptions={maxNodes:options.maxNodes??8192};
  this.planner=new Planner(header,index,this.plannerOptions);
 }
 select(bounds,states={},verticalBounds){
  need(!this.destroyed&&bounds.length===4&&bounds.every(Number.isFinite)&&bounds[0]<=bounds[2]&&bounds[1]<=bounds[3],'Invalid world window bounds');
  const size=this.index.extentCm,values=new Map(Object.entries(states).map(([id,v])=>[id.toLowerCase(),v]));
  const tiles=this.index.tiles.filter(t=>t.x*size<=bounds[2]&&(t.x+1)*size>=bounds[0]&&-t.y*size>=bounds[1]&&-(t.y+1)*size<=bounds[3]&&
   (!verticalBounds||!t.verticalBoundsUE||t.verticalBoundsUE[0]<=verticalBounds[1]&&t.verticalBoundsUE[1]>=verticalBounds[0]));
  need(tiles.length<=this.maxTiles,'World tile window budget exceeded; a smaller window or coarse corridor is required');
  let bytes=0,requiredPolygons=1;const unknown=new Set(),selected=[];
  for(const tile of tiles){
   let variant='';for(const id of tile.conditions){const state=values.get(id.toLowerCase());if(state!==true&&state!==false)unknown.add(id);variant+=state===true?'0':'1';}
   need(Object.prototype.hasOwnProperty.call(tile.variants,variant),'Missing world state variant');const blob=tile.variants[variant];
   if(blob){const descriptor=this.index.blobs[blob];need(descriptor&&Number.isInteger(descriptor.bytes)&&descriptor.bytes>0,'Missing world tile blob');bytes+=descriptor.bytes;requiredPolygons=Math.max(requiredPolygons,descriptor.polygons??16384);}
   selected.push({...tile,blob});
  }
  need(bytes<=this.maxBytes,'World tile byte budget exceeded');
  const maxPolys=Math.max(16384,2**Math.ceil(Math.log2(requiredPolygons))),maxTiles=2**22/maxPolys;
  need(maxPolys<=65536&&tiles.length<=Math.min(this.maxTiles,maxTiles),'World dense-tile window capacity exceeded');
  return{tiles:selected,bytes,unknownActors:[...unknown],maxPolys,maxTiles};
 }
 _bytes(row,value){
  if(!row.blob)return null;
  value??=this.readBlob(row.blob,this.index.blobs[row.blob]);const b=value instanceof Uint8Array?value:new Uint8Array(value);
  need(b.length===this.index.blobs[row.blob].bytes&&b.length>=100,'Invalid world tile size');
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  need(v.getUint32(0,true)===0x444e4156&&v.getInt32(4,true)===7&&v.getInt32(8,true)===row.x&&v.getInt32(12,true)===row.y&&v.getInt32(16,true)===(row.layer??0),'World tile coordinates differ');
  need(v.getInt32(24,true)<=(this.index.blobs[row.blob].polygons??16384),'World tile polygon capacity metadata differs');
  return b;
 }
 *_bytesJob(row){
  if(!row.blob)return null;
  const prior=this.loaded.get(key(row)),resident=prior?.blob===row.blob?this.planner.tileBuffers.get(prior.slot):null;
  if(resident){
   // Stock addTile rebuilds the free list and connectIntLinks resets every
   // polygon's firstLink. Off-mesh tiles are rejected by admission. Copy the
   // already checked resident payload instead of reading/inflating it again.
   const bytes=new Uint8Array(resident.size);
   for(let at=0;at<bytes.length;at+=16384){bytes.set(resident.getHeapView().subarray(at,Math.min(bytes.length,at+16384)),at);yield;}
   return this._bytes(row,bytes);
  }
  return this._bytes(row,this.readBlobJob?yield* this.readBlobJob(row.blob,this.index.blobs[row.blob]):undefined);
 }
 _header(maxTiles,maxPolys){const header=this.defaultHeader.slice(),view=new DataView(header.buffer);view.setUint32(32,maxTiles,true);view.setUint32(36,maxPolys,true);return header;}
 holdWindow(){
  need(!this.busy&&!this.destroyed,'Cannot retain a busy world window');
  need(this.retained.size===0||this.retained.has(this.planner),'Nested temporary world windows are not supported');
  const snapshot={planner:this.planner,loaded:new Map(this.loaded)};
  this.retained.set(snapshot.planner,(this.retained.get(snapshot.planner)??0)+1);return snapshot;
 }
 restoreWindow(snapshot){
  need(this.retained.has(snapshot.planner),'World snapshot is not retained');
  if(this.planner!==snapshot.planner&&!this.retained.has(this.planner))this.planner.destroy();
  this.planner=snapshot.planner;this.loaded=new Map(snapshot.loaded);
  const count=this.retained.get(snapshot.planner);if(count===1)this.retained.delete(snapshot.planner);else this.retained.set(snapshot.planner,count-1);
 }
 _track(source){
  const owner=this;let job;
  job=(function*(){try{return yield* source;}finally{owner.jobs.delete(job);}})();
  this.jobs.add(job);return job;
 }
 loadWindowJob(bounds,states={},verticalBounds){return this._track(this._loadWindowJob(bounds,states,verticalBounds));}
 *_loadWindowJob(bounds,states={},verticalBounds){
  need(!this.busy&&!this.destroyed,'World window is busy or destroyed');
  const plan=this.select(bounds,states,verticalBounds),wanted=new Map(plan.tiles.map(t=>[key(t),t]));
  const same=this.loaded.size===wanted.size&&[...this.loaded].every(([id,row])=>wanted.get(id)?.blob===row.blob);
  if(same)return{residentTiles:this.loaded.size,residentBytes:plan.bytes,unknownActors:plan.unknownActors};
  // A complete second bounded graph is staged before the swap. Cancellation,
  // corrupt input and I/O failure leave the authoritative graph untouched.
  // Peak tile payload is at most twice maxBytes, or three times maxBytes
  // while a hypothetical query retains its authoritative graph as well.
  const staged=new Planner(this._header(plan.maxTiles,plan.maxPolys),this.index,this.plannerOptions),loaded=new Map(),admissions=[];let committed=false;this.busy=true;
  try{
   for(const tile of plan.tiles){
    const row={...tile,slot:loaded.size},bytes=yield* this._bytesJob(row);
    if(bytes){
     const admission=yield* prepareAdmission(bytes,row.slot);staged.replaceTile(row.slot,admission.copy);
     const native=staged.navMesh.getTile(row.slot);admission.raw=native.raw;admission.base=staged.navMesh.getPolyRefBase(native)>>>0;admission.copy=null;admissions.push(admission);
    }
    loaded.set(key(row),row);yield;
   }
   // Stock Detour builds internal links. Replay its exact external-link
   // construction order in bounded steps before publishing the staged graph.
   for(const row of admissions)yield* restorePortals(row);
   for(const [from,to,side]of connectionEvents(admissions))yield* connectPortals(from,to,side);
   if(!this.retained.has(this.planner))this.planner.destroy();this.planner=staged;this.loaded=loaded;committed=true;
   return{residentTiles:loaded.size,residentBytes:plan.bytes,unknownActors:plan.unknownActors};
  }finally{if(!committed)staged.destroy();this.busy=false;}
 }
 routeJob(start,goal,states={},options={}){return this._track(this._routeJob(start,goal,states,options));}
 *_routeJob(start,goal,states={},options={}){
  const pad=(options.paddingTiles??2)*this.index.extentCm;
  const bounds=options.boundsUE??[Math.min(start[0],goal[0])-pad,Math.min(start[1],goal[1])-pad,Math.max(start[0],goal[0])+pad,Math.max(start[1],goal[1])+pad];
  need([start,goal].every(p=>p[0]>=bounds[0]&&p[0]<=bounds[2]&&p[1]>=bounds[1]&&p[1]<=bounds[3]),'World window excludes an endpoint');
  const heightPad=options.heightPaddingCm??20000,vertical=options.heightBoundsUE??[Math.min(start[2],goal[2])-heightPad,Math.max(start[2],goal[2])+heightPad];
  const window=yield* this.loadWindowJob(bounds,states,vertical);
  const route=yield* this.planner.routeJob(start,goal,options);
  return{...route,...window,boundedWorldWindow:true,windowBoundsUE:bounds,verticalWindowUE:vertical,completeCollisionClaim:false};
 }
 candidateJob(start,goal,authoritativeStates,candidateStates,options={}){return this._track(this._candidateJob(start,goal,authoritativeStates,candidateStates,options));}
 *_candidateJob(start,goal,authoritativeStates,candidateStates,options={}){
  const known=new Map(Object.entries(authoritativeStates).map(([id,v])=>[id.toLowerCase(),v]));
  for(const [id,value]of Object.entries(candidateStates))need(!(known.get(id.toLowerCase())===false&&value===true),'Known closed world actor cannot be opened for a candidate');
  const previous=this.holdWindow();
  try{return yield* this.routeJob(start,goal,{...authoritativeStates,...candidateStates},options);}
  finally{this.restoreWindow(previous);}
 }
 cancelQueries(){for(const job of [...this.jobs])job.return();this.jobs.clear();this.planner.cancelQueries();}
 destroy(){if(!this.destroyed){this.cancelQueries();this.planner.destroy();for(const planner of this.retained.keys())if(planner!==this.planner)planner.destroy();this.retained.clear();this.loaded.clear();this.destroyed=true;}}
}
