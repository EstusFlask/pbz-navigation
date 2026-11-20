'use strict';
const need=(condition,message)=>{if(!condition)throw Error(message);},integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const EDGE_BYTES=53,MAX_PAGE_BYTES=131072,MAX_PAGES=8;
class Reader{
 constructor(manifest,readText,core){
  need(manifest.schema===1&&manifest.kind==='paged-geometry-movement-corridors'&&integer(manifest.nodes,1,10000000)&&integer(manifest.edges,0,10000000)&&Array.isArray(manifest.pages)&&manifest.pages.length<=4096,'Invalid movement corridor manifest');
  let previous=-1;
  for(const descriptor of manifest.pages){need(integer(descriptor.first,previous+1,manifest.nodes-1)&&integer(descriptor.last,descriptor.first,manifest.nodes-1)&&integer(descriptor.edges,1,2048*4096),'Invalid movement corridor range');previous=descriptor.last;}
  Object.assign(this,{manifest,store:new core.PackedStore(manifest,readText),pages:new Map()});
 }
 *fromJob(id){
  need(integer(id,0,this.manifest.nodes-1),'Movement corridor node out of range');
  const descriptors=this.manifest.pages;let low=0,high=descriptors.length-1,selected=-1;
  while(low<=high){const middle=Math.floor((low+high)/2),descriptor=descriptors[middle];if(id<descriptor.first)high=middle-1;else if(id>descriptor.last)low=middle+1;else{selected=middle;break;}}
  if(selected<0)return[];
  let page=this.pages.get(selected);
  if(!page){
   const descriptor=descriptors[selected],bytes=yield* this.store.bytesJob(descriptor.packed);
   need(bytes.length>=8&&bytes.length<=MAX_PAGE_BYTES,'Oversized movement corridor page');
   const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=view.getUint32(4,true);
   need(view.getUint32(0,true)===0x31434d50&&count>=1&&count<=4096,'Invalid movement corridor page');
   const offsets=new Map();let at=8,previous=descriptor.first-1,total=0;
   for(let node=0;node<count;node++){
    need(at+8<=bytes.length,'Truncated movement corridor node');
    const from=view.getUint32(at,true),length=view.getUint32(at+4,true);at+=8;
    need(integer(from,previous+1,descriptor.last)&&length>=1&&length<=2048&&at+length*EDGE_BYTES<=bytes.length,'Invalid movement corridor adjacency');
    offsets.set(from,at-4);
    at+=length*EDGE_BYTES;total+=length;previous=from;
    if((node&63)===63)yield;
   }
   need(at===bytes.length&&total===descriptor.edges&&offsets.keys().next().value===descriptor.first&&previous===descriptor.last,'Movement corridor page extent differs');
   page={view,offsets};
  }
  this.pages.delete(selected);this.pages.set(selected,page);
  while(this.pages.size>MAX_PAGES)this.pages.delete(this.pages.keys().next().value);
  const offset=page.offsets.get(id);
  if(offset===undefined)return[];
  const view=page.view,length=view.getUint32(offset,true),edges=[];
  let at=offset+4;
  for(let index=0;index<length;index++){
   const to=view.getUint32(at,true),flags=view.getUint8(at+4),points=[];at+=5;
   need(integer(to,0,this.manifest.nodes-1)&&to!==id&&flags<=2,'Invalid movement corridor edge');
   for(let axis=0;axis<6;axis++){
    const value=view.getFloat64(at,true);at+=8;
    need(Number.isFinite(value)&&Math.abs(value)<1e10,'Invalid movement corridor coordinate');points.push(value);
   }
   const entry=points.slice(0,3),exit=points.slice(3),reverse=flags===1,kind=flags===2?'fall':'surface';
   const originalEntry=reverse?exit:entry,originalExit=reverse?entry:exit;
   need((originalEntry[2]-originalExit[2]<100)===(kind==='surface'),'Movement corridor direction differs');
   const guid='recast-movement:'+originalEntry.map(Math.round).join(',')+'>'+originalExit.map(Math.round).join(',');
   edges.push({from:id,to,entry,exit,kind,reverse,guid,cost:Math.hypot(...entry.map((value,axis)=>value-exit[axis]))});
   if((index&31)===31)yield;
  }
  return edges;
 }
 clear(){this.pages.clear();this.store.clear();}
}
exports.Reader=Reader;
