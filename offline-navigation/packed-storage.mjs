// Immutable compressed text storage. No Node, Worker, WASM or dynamic code.
import {inflateBounded} from './vendor/fflate-bounded.mjs';
import {decodeBase64Job} from './text-codec.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},integer=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const crcTable=new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);crcTable[i]=c>>>0;}
function* crcJob(bytes){
 // The CommonJS bundle's module-level var is a VM-global property in some
 // hosts. Capture it once so the byte loop stays inside the local context.
 const table=crcTable;let c=0xffffffff;
 for(let at=0;at<bytes.length;at+=4096){const stop=Math.min(bytes.length,at+4096);for(let i=at;i<stop;i++)c=(c>>>8)^table[(c^bytes[i])&255];yield;}
 return(c^0xffffffff)>>>0;
}
function* utf8Job(bytes){
 // Metadata is predominantly ASCII JSON. Native bounded conversion avoids
 // interpreting a branch and several JS calls for every one of its bytes.
 // A non-ASCII block enters the strict decoder at a known ASCII boundary.
 const parts=[];
 for(let at=0;at<bytes.length;at+=8192){
  const part=String.fromCharCode(...bytes.subarray(at,Math.min(bytes.length,at+8192)));
  if(/[\u0080-\uffff]/.test(part)){parts.push(yield* strictUtf8Job(bytes.subarray(at)));return parts.join('');}
  parts.push(part);yield;
 }
 return parts.join('');
}
function* strictUtf8Job(bytes){
 const parts=[];let codes=[];
 for(let i=0;i<bytes.length;){
  const a=bytes[i++];let cp=a,n=0,min=0;
  if(a>=0xc2&&a<=0xdf){cp=a&31;n=1;min=0x80;}else if(a>=0xe0&&a<=0xef){cp=a&15;n=2;min=0x800;}else if(a>=0xf0&&a<=0xf4){cp=a&7;n=3;min=0x10000;}else need(a<128,'Invalid packed UTF-8');
  need(i+n<=bytes.length,'Truncated packed UTF-8');
  for(let j=0;j<n;j++){const b=bytes[i++];need((b&0xc0)===0x80,'Invalid packed UTF-8 continuation');cp=(cp<<6)|(b&63);}
  need(cp>=min&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff),'Invalid packed UTF-8 codepoint');
  if(cp>0xffff){cp-=0x10000;codes.push(0xd800+(cp>>10),0xdc00+(cp&1023));}else codes.push(cp);
  if(codes.length>=2048){parts.push(String.fromCharCode(...codes));codes=[];yield;}
 }
 if(codes.length)parts.push(String.fromCharCode(...codes));return parts.join('');
}
export class PackedStore{
 constructor(manifest,readText){
  const m=manifest.storage;
  need(m?.kind==='deflate-text-v1'&&m.blockBytes===32768&&m.indexPageRecords===512&&m.maxContainerCharacters===1048576,'Unsupported packed world storage');
  need(integer(m.records,0,10000000)&&integer(m.containers,0,100000)&&/^[a-f0-9]{64}$/.test(manifest.sourceIndexSHA256),'Invalid packed storage extent');
  Object.assign(this,{manifest,readText,layout:m});this.containers=new Map();this.directories=new Map();
 }
 *rowJob(id){
  const m=this.layout;need(integer(id,0,m.records-1),'Packed record out of range');const pageID=Math.floor(id/m.indexPageRecords);let page=this.directories.get(pageID);
  if(!page){const text=this.readText('directories/'+pageID+'.json');yield;need(typeof text==='string'&&text.length<=131072,'Oversized packed directory');page=JSON.parse(text);
   need(page.schema===1&&page.world===this.manifest.world&&page.sourceIndexSHA256===this.manifest.sourceIndexSHA256&&page.first===pageID*m.indexPageRecords&&Array.isArray(page.records)&&page.records.length===Math.min(m.indexPageRecords,m.records-page.first),'Packed directory identity differs');
  }
  this.directories.delete(pageID);this.directories.set(pageID,page);while(this.directories.size>4)this.directories.delete(this.directories.keys().next().value);
  const row=page.records[id-page.first];need(Array.isArray(row)&&row.length===5,'Invalid packed directory record');
  const [container,offset,length,bytes,crc]=row;
  need(integer(container,0,m.containers-1)&&integer(offset,0,m.maxContainerCharacters)&&integer(length,4,65536)&&length%4===0&&offset+length<=m.maxContainerCharacters&&integer(bytes,1,m.blockBytes)&&integer(crc,0,0xffffffff),'Invalid packed record extent');return row;
 }
 *recordJob(id){
  const [container,offset,length,bytes,crc]=yield* this.rowJob(id);let text=this.containers.get(container);
  if(!text){text=this.readText('packs/'+container+'.txt');yield;const header='PBZDF1|'+this.manifest.world+'|'+this.manifest.sourceIndexSHA256+'|'+container+'\n';
   need(typeof text==='string'&&text.length<=this.layout.maxContainerCharacters&&text.startsWith(header)&&offset>=header.length,'Packed container identity differs');
  }
  need(offset+length<=text.length,'Truncated packed container');this.containers.delete(container);this.containers.set(container,text);while(this.containers.size>2)this.containers.delete(this.containers.keys().next().value);
  const compressed=yield* decodeBase64Job(text.slice(offset,offset+length));
  // One independently compressed block expands to at most 32KiB. The pinned
  // inflater checks its hard limit before all writes, including backreferences.
  const output=inflateBounded(compressed,bytes);yield;
  need((yield* crcJob(output))===crc,'Packed record CRC differs');return output;
 }
 *bytesJob(span){
  need(Array.isArray(span)&&span.length===3,'Invalid packed logical span');const [first,count,bytes]=span;
  need(integer(first,0,this.layout.records-1)&&integer(count,1,32)&&first+count<=this.layout.records&&integer(bytes,1,1048576)&&count===Math.ceil(bytes/this.layout.blockBytes),'Invalid packed logical extent');
  const out=new Uint8Array(bytes);let at=0;
  for(let i=0;i<count;i++){const part=yield* this.recordJob(first+i);need(part.length===Math.min(this.layout.blockBytes,bytes-at),'Packed block length differs');out.set(part,at);at+=part.length;yield;}need(at===bytes,'Incomplete packed logical file');return out;
 }
 *textJob(span){return yield* utf8Job(yield* this.bytesJob(span));}
 clear(){this.containers.clear();this.directories.clear();}
}
