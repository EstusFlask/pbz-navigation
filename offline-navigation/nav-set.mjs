// Recast Navigation's 32-bit MSET v1 container; no pathfinding is reimplemented.
const MAGIC=0x4d534554,TILE_MAGIC=0x444e4156;
function need(ok,message){if(!ok)throw Error(message);}
function bytes(value){return value instanceof Uint8Array?value:ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value);}
function view(value){return new DataView(value.buffer,value.byteOffset,value.byteLength);}
export function navHeader(value){
 const b=bytes(value),v=view(b);need(b.length>=40&&v.getUint32(0,true)===MAGIC&&v.getUint32(4,true)===1,'Unsupported navigation set');
 const maxTiles=v.getUint32(32,true),maxPolys=v.getUint32(36,true);
 need(maxTiles>0&&maxTiles<=16384&&(maxTiles&(maxTiles-1))===0&&maxPolys>0&&(maxPolys&(maxPolys-1))===0,'Invalid navigation capacity');
 need(Math.log2(maxTiles)+Math.log2(maxPolys)<31,'Unsupported navigation reference width');
 return{bytes:b.slice(0,40),tiles:v.getUint32(8,true),maxTiles,maxPolys};
}
export function parseNavSet(value){
 const b=bytes(value),header=navHeader(b),v=view(b),tiles=[];let at=40;
 for(let i=0;i<header.tiles;i++){
  need(at+8<=b.length,'Truncated navigation tile header');const ref=v.getUint32(at,true),size=v.getUint32(at+4,true);at+=8;
  need(ref!==0&&size>=100&&at+size<=b.length,'Invalid navigation tile extent');
  const data=b.slice(at,at+size),t=view(data);need(t.getUint32(0,true)===TILE_MAGIC&&t.getUint32(4,true)===7,'Unsupported Detour tile');
  tiles.push({ref,x:t.getInt32(8,true),y:t.getInt32(12,true),layer:t.getInt32(16,true),data});at+=size;
 }
 need(at===b.length,'Unconsumed navigation set bytes');return{header:header.bytes,tiles};
}
export function assembleNavSet(headerValue,entries){
 const h=navHeader(headerValue),selected=entries.filter(row=>row.data),length=40+selected.reduce((sum,row)=>sum+8+bytes(row.data).length,0);
 need(selected.length<=h.maxTiles&&length<=256*1024*1024,'Navigation set exceeds budget');
 const out=new Uint8Array(length);out.set(h.bytes);const v=view(out);v.setUint32(8,selected.length,true);let at=40;
 const slots=new Set();
 for(const row of selected){
  const data=bytes(row.data),t=view(data);need(data.length>=100&&t.getUint32(0,true)===TILE_MAGIC&&t.getUint32(4,true)===7,'Invalid Detour tile');
  let ref=row.ref;
  if(row.slot!==undefined){need(Number.isInteger(row.slot)&&row.slot>=0&&row.slot<h.maxTiles,'Invalid tile slot');ref=h.maxTiles*h.maxPolys+row.slot*h.maxPolys;}
  need(Number.isInteger(ref)&&ref>0&&ref<=0xffffffff&&!slots.has(ref),'Invalid or repeated tile reference');slots.add(ref);
  v.setUint32(at,ref,true);v.setUint32(at+4,data.length,true);out.set(data,at+8);at+=8+data.length;
 }
 return out;
}
export function selectVariants(index,states={}){
 need(index?.schema===1&&index.engine==='recast-navigation@0.44.0','Unsupported conditional navigation index');
 const values=new Map(Object.entries(states).map(([id,value])=>[id.toLowerCase(),value])),missing=new Set(),tiles=[];let signature='';
 for(const tile of index.tiles){
  let key='';for(const id of tile.conditions){const value=values.get(id.toLowerCase());if(value!==true&&value!==false)missing.add(id);key+=value===true?'0':'1';}
  need(Object.prototype.hasOwnProperty.call(tile.variants,key),'Missing navigation state variant');const blob=tile.variants[key];
  tiles.push({slot:tile.slot,blob,x:tile.x,y:tile.y});signature+=key+';';
 }
 return{tiles,signature,unknownActors:[...missing]};
}
export function decodeBase64(text){
 need(typeof text==='string'&&text.length<=1024*1024&&text.length%4===0,'Invalid navigation payload size');
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',table=new Int16Array(128);table.fill(-1);for(let i=0;i<64;i++)table[alphabet.charCodeAt(i)]=i;
 const padding=text.endsWith('==')?2:text.endsWith('=')?1:0,out=new Uint8Array(text.length/4*3-padding);let at=0;
 for(let i=0;i<text.length;i+=4){let n=0;for(let j=0;j<4;j++){const code=text.charCodeAt(i+j),last=i+4===text.length&&j>=4-padding;need(last?code===61:code<128&&table[code]>=0,'Invalid navigation base64');n=(n<<6)|(last?0:table[code]);}if(i+4===text.length&&padding)need((n&((1<<(padding===2?16:8))-1))===0,'Non-canonical navigation base64');for(let shift=16;shift>=0&&at<out.length;shift-=8)out[at++]=(n>>>shift)&255;}
 return out;
}
