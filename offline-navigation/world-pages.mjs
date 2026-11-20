// JSON/text reads do not enter Puerts' permanent CommonJS module cache.
import {WorldWindow} from './world-window.mjs';
import {WorldCorridors} from './world-corridors.mjs';
import {PackedStore} from './packed-storage.mjs';
import {decodeBase64Job} from './text-codec.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
export class PagedWorld{
 constructor(manifest,readText,options={}){
  need(manifest.schema===1&&manifest.kind==='paged-sparse-world'&&manifest.unknownState==='closed','Unsupported paged world');
  need(manifest.pages.length<=100000&&manifest.chunkBytes<=196608,'Invalid world paging budget');
  this.manifest=manifest;this.readText=readText;this.pages=new Map();this.jobs=new Set();this.maxPages=options.maxPages??8;
  this.packed=manifest.storage?new PackedStore(manifest,readText):null;
  this.packetCache=new Map();this.maxPackets=options.maxPackets??4;
  this.blobCache=new Map();this.blobCacheBytes=0;this.maxCachedBytes=options.maxCachedBytes??8*1024*1024;
  need(Number.isInteger(this.maxPages)&&this.maxPages>0,'Invalid page cache budget');
  need(Number.isInteger(this.maxPackets)&&this.maxPackets>0&&this.maxPackets<=16,'Invalid packet cache budget');
  need(Number.isSafeInteger(this.maxCachedBytes)&&this.maxCachedBytes>=0&&this.maxCachedBytes<=32*1024*1024,'Invalid decoded tile cache budget');
  need(!manifest.blobLayout||manifest.blobLayout==='packets-v1'&&(Array.isArray(manifest.packets)||Number.isSafeInteger(manifest.packetCount)&&manifest.packetCount>=0),'Unsupported world blob layout');
  this.index={...manifest,kind:'experimental-sparse-world',tiles:[],blobs:{}};
  this.window=new WorldWindow(this.index,(id,row)=>drain(this.blobJob(id,row)),{...options,readBlobJob:(id,row)=>this.blobJob(id,row)});
  this.corridors=manifest.corridors?new WorldCorridors(this):null;
 }
 *decodePacketJob(text){return yield* decodeBase64Job(text);}
 *blobJob(id,row){
  need(/^[a-f0-9]{64}$/.test(id)&&Number.isInteger(row.bytes)&&row.bytes>0&&row.bytes<=16*1024*1024,'Invalid paged blob');
  if(this.blobCache.has(id)){const cached=this.blobCache.get(id);need(cached.length===row.bytes,'Cached world tile size differs');this.blobCache.delete(id);this.blobCache.set(id,cached);return cached;}
  if(this.manifest.blobLayout==='packets-v1'){
   need(Array.isArray(row.parts)&&row.parts.length>0&&row.parts.length<=Math.ceil(row.bytes/this.manifest.chunkBytes)+1,'Invalid world packet spans');
   const bytes=new Uint8Array(row.bytes);let at=0;
   const count=this.manifest.packetCount??this.manifest.packets.length;
   for(const [packetID,offset,length]of row.parts){
    need([packetID,offset,length].every(Number.isInteger)&&packetID>=0&&packetID<count&&offset>=0&&length>0&&at+length<=bytes.length,'Invalid world packet span');
    const expected=this.manifest.packetCount===undefined?this.manifest.packets[packetID].bytes:packetID===count-1?this.manifest.lastPacketBytes:this.manifest.chunkBytes;
    need(offset+length<=expected,'World packet span exceeds data');
    if(this.packed){
     // Independent 32KiB records permit exact sub-packet reads. A tiny tile
     // must not inflate the other five records of its 192KiB source packet.
     // The existing four-entry packet cache now holds smaller record buffers.
     const block=this.packed.layout.blockBytes,base=packetID*(this.manifest.chunkBytes/block);need(Number.isInteger(base),'Invalid packed packet alignment');
     for(let source=offset;source<offset+length;){
      const ordinal=Math.floor(source/block),id=base+ordinal;let part=this.packetCache.get(id);
      if(!part)part=yield* this.packed.recordJob(id);
      need(part.length===Math.min(block,expected-ordinal*block),'Truncated packed packet block');
      this.packetCache.delete(id);this.packetCache.set(id,part);while(this.packetCache.size>this.maxPackets)this.packetCache.delete(this.packetCache.keys().next().value);
      const within=source%block,n=Math.min(part.length-within,offset+length-source);need(n>0,'Invalid packed packet range');bytes.set(part.subarray(within,within+n),at);at+=n;source+=n;yield;
     }
     continue;
    }
    let packet=this.packetCache.get(packetID);
    if(!packet){
     const text=this.readText('packets/'+packetID+'.txt');yield;packet=yield* this.decodePacketJob(text);
     need(packet.length===expected&&packet.length<=this.manifest.chunkBytes,'Truncated world data chunk');
    }
    this.packetCache.delete(packetID);this.packetCache.set(packetID,packet);while(this.packetCache.size>this.maxPackets)this.packetCache.delete(this.packetCache.keys().next().value);
    need(offset+length<=packet.length,'World packet span exceeds data');bytes.set(packet.subarray(offset,offset+length),at);at+=length;yield;
   }
   need(at===bytes.length,'Incomplete world blob spans');return this.cacheBlob(id,bytes);
  }
  need(row.chunks===Math.ceil(row.bytes/this.manifest.chunkBytes),'Invalid world chunk count');
  const bytes=new Uint8Array(row.bytes);let at=0;
  for(let i=0;i<row.chunks;i++){
   const text=this.readText('blobs/'+id.slice(0,2)+'/'+id+'/'+i+'.txt');yield;
   const part=yield* this.decodePacketJob(text),expected=Math.min(this.manifest.chunkBytes,row.bytes-at);
   need(part.length===expected,'Truncated world data chunk');bytes.set(part,at);at+=part.length;yield;
  }
  return this.cacheBlob(id,bytes);
 }
 cacheBlob(id,bytes){
  if(bytes.length<=this.maxCachedBytes){
   if(this.blobCache.has(id)){this.blobCacheBytes-=this.blobCache.get(id).length;this.blobCache.delete(id);}
   while(this.blobCacheBytes+bytes.length>this.maxCachedBytes){const key=this.blobCache.keys().next().value;this.blobCacheBytes-=this.blobCache.get(key).length;this.blobCache.delete(key);}
   this.blobCache.set(id,bytes);this.blobCacheBytes+=bytes.length;
  }
  return bytes;
 }
 *textJob(kind,id){
  need(Number.isInteger(id)&&id>=0,'Invalid world text identity');
  if(this.packed){const span=kind==='page'?this.manifest.pages[id]?.packed:this.manifest.corridors?.packed?.[id];return yield* this.packed.textJob(span);}
  const text=this.readText((kind==='page'?'pages/':'corridors/')+id+'.json');yield;return text;
 }
 *metadataJob(bounds,vertical,tileKeys,xyKeys){
  const tiles=[],blobs={};
  for(const descriptor of this.manifest.pages){
   if(!overlaps(descriptor.boundsUE,bounds)||descriptor.verticalBoundsUE[0]>vertical[1]||descriptor.verticalBoundsUE[1]<vertical[0])continue;
   need(Number.isInteger(descriptor.id)&&descriptor.id>=0,'Invalid world page identity');
   let page=this.pages.get(descriptor.id);
   if(!page){
    const text=yield* this.textJob('page',descriptor.id);
    need(text.length===descriptor.characters&&text.length<=1048576,'Invalid world page length');page=JSON.parse(text);
    need(page.schema===1&&page.world===this.manifest.world&&page.id===descriptor.id&&page.tiles.length<=128,'World page identity differs');
   }
   this.pages.delete(descriptor.id);this.pages.set(descriptor.id,page);
   while(this.pages.size>this.maxPages)this.pages.delete(this.pages.keys().next().value);
   const size=this.manifest.extentCm;
   for(const tile of page.tiles){
    if(tileKeys&&!tileKeys.has(tile.x+','+tile.y+','+tile.layer))continue;
    if(xyKeys&&!xyKeys.has(tile.x+','+tile.y))continue;
    if(!overlaps([tile.x*size,-(tile.y+1)*size,(tile.x+1)*size,-tile.y*size],bounds)||tile.verticalBoundsUE[0]>vertical[1]||tile.verticalBoundsUE[1]<vertical[0])continue;
    tiles.push(tile);
    need(tiles.length<=this.window.maxTiles,'World tile window budget exceeded; coarse corridor required');
    for(const blob of Object.values(tile.variants))if(blob){need(page.blobs[blob],'Missing paged blob descriptor');blobs[blob]=page.blobs[blob];}
   }
   yield;
  }
  return{tiles,blobs};
 }
 routeJob(start,goal,states={},options={}){return this._track(this._routeJob(start,goal,states,options));}
 *_routeJob(start,goal,states,options){
  // Begin with the endpoint rectangle. A wider detour is resolved through
  // the coarse graph, instead of importing two extra rings of dense tiles.
  options={paddingTiles:0,...options};
  let direct;
  try{direct=yield* this.directJob(start,goal,states,options);if(direct.complete||!this.corridors||options.directOnly)return direct;}
  catch(error){if(options.directOnly||!this.corridors||!String(error).match(/budget|capacity/))throw error;}
  return (yield* this.corridors.routeJob(start,goal,states,options))??direct??{complete:false,partial:true,reason:'coarse corridor unavailable',points:[],corners:[],meters:0,physicalVerified:false};
 }
 _track(source){const owner=this;let job;job=(function*(){try{return yield* source;}finally{owner.jobs.delete(job);}})();this.jobs.add(job);return job;}
 *directJob(start,goal,states,options){
  const pad=(options.paddingTiles??2)*this.manifest.extentCm,height=options.heightPaddingCm??20000;
  const bounds=options.boundsUE??[Math.min(start[0],goal[0])-pad,Math.min(start[1],goal[1])-pad,Math.max(start[0],goal[0])+pad,Math.max(start[1],goal[1])+pad];
  const vertical=options.heightBoundsUE??[Math.min(start[2],goal[2])-height,Math.max(start[2],goal[2])+height];
  const tileKeys=options.tileKeys?new Set(options.tileKeys):null;
  if(tileKeys)need(tileKeys.size<=this.window.maxTiles&&[...tileKeys].every(k=>/^-?\d+,-?\d+,\d+$/.test(k)),'World coarse footprint budget or identity invalid');
  const xyKeys=options.xyKeys?new Set(options.xyKeys):null;
  if(xyKeys)need(xyKeys.size<=this.window.maxTiles&&[...xyKeys].every(k=>/^-?\d+,-?\d+$/.test(k)),'World segment footprint budget or identity invalid');
  const metadata=yield* this.metadataJob(bounds,vertical,tileKeys,xyKeys);
  // Keep descriptors required for cancellation of the old window as well.
  const oldTiles=this.index.tiles,oldBlobs=this.index.blobs;
  this.index.tiles=metadata.tiles;this.index.blobs={...oldBlobs,...metadata.blobs};
  let done=false;
  try{
   const result=yield* this.window.routeJob(start,goal,states,{...options,boundsUE:bounds});done=true;
   return{...result,pagedWorld:true,experimentalOnly:true,completeCollisionClaim:false};
  }finally{
   if(!done)this.index.tiles=oldTiles;
   const retained=new Set(Object.values(this.index.tiles).flatMap(t=>Object.values(t.variants)).filter(Boolean));
   for(const row of this.window.loaded.values())if(row.blob)retained.add(row.blob);
   this.index.blobs=Object.fromEntries([...retained].filter(id=>this.index.blobs[id]).map(id=>[id,this.index.blobs[id]]));
  }
 }
 candidateJob(start,goal,authoritative,candidate,options={}){return this._track(this._candidateJob(start,goal,authoritative,candidate,options));}
 *_candidateJob(start,goal,authoritative,candidate,options){
  const known=new Map(Object.entries(authoritative).map(([id,v])=>[id.toLowerCase(),v]));
  for(const [id,v]of Object.entries(candidate))need(!(known.get(id.toLowerCase())===false&&v===true),'Known closed world actor cannot be opened for a candidate');
  const previous=this.window.holdWindow(),tiles=this.index.tiles,blobs=this.index.blobs;
  try{return yield* this.routeJob(start,goal,{...authoritative,...candidate},options);}
  finally{
   this.window.restoreWindow(previous);this.index.tiles=tiles;this.index.blobs=blobs;
  }
 }
 cancelQueries(){for(const job of [...this.jobs])job.return();this.jobs.clear();this.window.cancelQueries();}
 destroy(){this.cancelQueries();this.window.destroy();this.pages.clear();this.packetCache.clear();this.blobCache.clear();this.blobCacheBytes=0;this.corridors?.pages.clear();this.corridors?.anchorCache.clear();this.corridors?.componentCache.clear();this.packed?.clear();}
}
