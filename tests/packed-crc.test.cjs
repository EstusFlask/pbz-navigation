'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(){
 // esbuild lowers module-level const to var in the Puerts CommonJS bundle.
 const text=fs.readFileSync(require.resolve('../offline-navigation/packed-storage.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^const /gm,'var ').replace('export class PackedStore','class PackedStore')+'\nmodule.exports={crcJob};',context=vm.createContext({module:{exports:{}}},{codeGeneration:{strings:false,wasm:false}});vm.runInContext(text,context);return{context,crcJob:context.module.exports.crcJob};
}
test('batched CRC matches the bytewise polynomial for alignment, tail and scheduler boundaries',async()=>{
 const {crcJob}=runtime(),drain=j=>{let r,steps=0;do{r=j.next();if(!r.done)steps++;}while(!r.done);return{value:r.value,steps};},reference=bytes=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let bit=0;bit<8;bit++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 assert.equal(drain(crcJob(Uint8Array.from(Buffer.from('123456789')))).value,0xcbf43926);
 let state=12345;const raw=Uint8Array.from({length:32780},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>24;});
 for(const offset of [0,1,2,3,5,7])for(const length of [0,1,2,3,4,5,7,8,9,31,32,4095,4096,4097,32767,32768]){
  const bytes=raw.subarray(offset,offset+length),result=drain(crcJob(bytes));assert.equal(result.value,reference(bytes),offset+'/'+length);assert.equal(result.steps,Math.ceil(length/4096));
 }
 const changed=raw.subarray(3,32771).slice(),before=drain(crcJob(changed)).value;changed[32767]^=1;assert.notEqual(drain(crcJob(changed)).value,before);
});
test('a bundled CRC reads its cross-context table once rather than once per byte',()=>{
 const {context,crcJob}=runtime(),table=context.crcTable;let reads=0;
 Object.defineProperty(context,'crcTable',{configurable:true,get(){reads++;return table;}});
 const bytes=Uint8Array.from({length:32768},(_,i)=>i%251),job=crcJob(bytes);while(!job.next().done){}
 assert.ok(reads<=1,'CRC performed '+reads+' VM-global table lookups for one bounded record');
});
