'use strict';
// Only search topology is shared. Physical proofs remain owned by each job.
let reverse=true;
exports.direction=()=>reverse?'reverse':'forward';
exports.configure=enabled=>{reverse=enabled!==false;};
exports.read=(text,fallback=true,previous=fallback)=>{
 if(!text)return fallback;
 try{const data=JSON.parse(text),values=data?.values;
  if(data?.schemaVersion===1&&values&&typeof values==='object'&&!Array.isArray(values)){
   if(!Object.hasOwn(values,'ReverseSearch'))return fallback;
   if(typeof values.ReverseSearch==='boolean')return values.ReverseSearch;
  }
 }catch(_){}return previous;
};
