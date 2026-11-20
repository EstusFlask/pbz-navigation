'use strict';
const need=(value,why)=>{if(!value)throw Error(why);},box=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1],height=(a,b)=>!b||a[0]<=b[1]&&a[1]>=b[0];
const bounds=value=>Array.isArray(value)&&value.length===4&&value.every(Number.isFinite)&&value[0]<=value[2]&&value[1]<=value[3];
class Reader{
 constructor(manifest,readText,core){
  need(manifest.schema===2&&manifest.kind==='spatial-geometry-movement-proposals'&&manifest.coordinateEncoding==='local-int32-mm-v1'&&manifest.quantizationCm===.001,'Unsupported spatial movement storage');
  need(Number.isSafeInteger(manifest.pages)&&manifest.pages>=0&&manifest.pages<=1000000&&Number.isSafeInteger(manifest.rows)&&manifest.rows>=0&&manifest.rows<=512000000&&Array.isArray(manifest.indexPages)&&manifest.indexPages.length<=7813,'Invalid spatial movement extent');
  Object.assign(this,{manifest,store:new core.PackedStore(manifest,readText),metadata:new Map(),rows:new Map()});
 }
 *descriptorsJob(query,vertical){
  need(bounds(query),'Invalid movement query bounds');const output=[];
  for(let id=0;id<this.manifest.indexPages.length;id++){
   const descriptor=this.manifest.indexPages[id];need(bounds(descriptor.boundsUE)&&Array.isArray(descriptor.verticalBoundsUE)&&descriptor.verticalBoundsUE.length===2&&descriptor.verticalBoundsUE.every(Number.isFinite),'Invalid movement metadata bounds');
   if(!box(descriptor.boundsUE,query)||!height(descriptor.verticalBoundsUE,vertical))continue;
   let page=this.metadata.get(id);
   if(!page){const text=yield* this.store.textJob(descriptor.packed);need(text.length<=131072,'Oversized movement metadata page');page=JSON.parse(text);need(page.schema===1&&page.world===this.manifest.world&&page.first===descriptor.first&&Array.isArray(page.pages)&&page.pages.length===descriptor.pages&&page.pages.length<=128,'Movement metadata identity differs');}
   this.metadata.delete(id);this.metadata.set(id,page);while(this.metadata.size>2)this.metadata.delete(this.metadata.keys().next().value);
   for(const row of page.pages){
    need(bounds(row.boundsUE)&&Array.isArray(row.verticalBoundsUE)&&row.verticalBoundsUE.length===2&&row.verticalBoundsUE.every(Number.isFinite)&&Number.isInteger(row.rows)&&row.rows>0&&row.rows<=512&&Number.isSafeInteger(row.first)&&row.first>=0&&row.first+row.rows<=this.manifest.rows,'Invalid movement leaf descriptor');
    if(box(row.boundsUE,query)&&height(row.verticalBoundsUE,vertical))output.push(row);yield;
   }
  }
  return output;
 }
 *pageJob(row){
  if(this.rows.has(row.first)){const cached=this.rows.get(row.first);this.rows.delete(row.first);this.rows.set(row.first,cached);return cached;}
  need(Array.isArray(row.originUE)&&row.originUE.length===3&&row.originUE.every(v=>Number.isFinite(v)&&Math.abs(v)<1e10),'Invalid movement local origin');
  const bytes=yield* this.store.bytesJob(row.packed);need(bytes.length===row.rows*24,'Movement binary page size differs');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out=[],origin=row.originUE.map(v=>Math.round(v*1000));
  for(let i=0;i<row.rows;i++){const p=[];for(let j=0;j<6;j++)p.push((origin[j%3]+view.getInt32(i*24+j*4,true))/1000);out.push(p);if((i&63)===63)yield;}
  this.rows.set(row.first,out);while(this.rows.size>2)this.rows.delete(this.rows.keys().next().value);return out;
 }
 clear(){this.store.clear();this.metadata.clear();this.rows.clear();}
}
exports.Reader=Reader;
