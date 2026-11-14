'use strict';
const defaults=Object.freeze({ThreadColor:'blue',ThreadCustomColor:'#3895FF'});
const hex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const blue=Object.freeze({key:'blue',tint:[.04,.3,1,1],low:[.018,.16,.68],range:[.018,.12,.26]});
const red=Object.freeze({key:'red',tint:[1,.04,.04,1],low:[.68,.018,.018],range:[.26,.018,.018]});
let custom;
function read(text,previous=defaults){
 try{const data=JSON.parse(text),v=data?.values;
  if(data?.schemaVersion===1&&v&&['red','blue','custom'].includes(v.ThreadColor)&&hex(v.ThreadCustomColor))
   return {ThreadColor:v.ThreadColor,ThreadCustomColor:v.ThreadCustomColor.toUpperCase()};
 }catch(_){}return previous;
}
function resolve(cfg=defaults){
 if(cfg.ThreadColor==='red')return red;
 if(cfg.ThreadColor!=='custom'||!hex(cfg.ThreadCustomColor))return blue;
 const key=cfg.ThreadCustomColor.toUpperCase();if(custom?.key===key)return custom;
 const tint=[1,3,5].map(i=>{const c=parseInt(key.slice(i,i+2),16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
 return custom={key,tint:[...tint,1],low:tint.map(c=>c*.72),range:tint.map(c=>c*.28)};
}
exports.defaults=defaults;exports.read=read;exports.resolve=resolve;exports.blue=blue;
