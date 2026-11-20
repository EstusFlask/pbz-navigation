// Strict, bounded codecs shared by loose and compressed text storage.
const need=(v,m)=>{if(!v)throw Error(m);};
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',base64=new Uint8Array(128);
for(let i=0;i<alphabet.length;i++)base64[alphabet.charCodeAt(i)]=i;
export function* decodeBase64Job(text){
  need(typeof text==='string'&&text.length<=1048576&&text.length%4===0,'Invalid navigation payload size');
  const padding=text.endsWith('==')?2:text.endsWith('=')?1:0,end=text.length-padding,bytes=new Uint8Array(text.length/4*3-padding);let offset=0;
  // Validate in native string code, then decode quartets without per-byte
  // function calls. Bound each interpreted step to 6KiB of decoded output.
  for(let at=0;at<text.length;at+=8192){
   const stop=Math.min(at+8192,end);need(!/[^A-Za-z0-9+/]/.test(text.slice(at,stop)),'Invalid navigation base64');
   for(let i=at;i<stop;i+=4){
    const remaining=stop-i,a=base64[text.charCodeAt(i)],b=base64[text.charCodeAt(i+1)],c=remaining>2?base64[text.charCodeAt(i+2)]:0,d=remaining>3?base64[text.charCodeAt(i+3)]:0;
    bytes[offset++]=(a<<2)|(b>>4);
    if(remaining>2)bytes[offset++]=(b<<4)|(c>>2);
    if(remaining>3)bytes[offset++]=(c<<6)|d;
    if(remaining===2)need((b&15)===0,'Non-canonical navigation base64');
    if(remaining===3)need((c&3)===0,'Non-canonical navigation base64');
   }
   yield;
  }
  need(offset===bytes.length,'Incomplete navigation payload');return bytes;
 }
