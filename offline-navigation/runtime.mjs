// The game explicitly disallows WASM code generation. Binaryen translates the
// pinned upstream module to ordinary JS; Emscripten's bindings stay compatible.
export * from './query.mjs';
import {initialize as initializeQuery} from './query.mjs';
import createModule from '@recast-navigation/wasm';
import instantiate from 'pbz:recast-javascript';
export const backend='javascript-wasm2js';
export function capabilities(){return typeof ArrayBuffer==='function'&&typeof Uint8Array==='function'&&typeof Math.fround==='function';}
export function initialize(){
 if(!capabilities())return Promise.reject(Error('Typed-array JavaScript runtime is unavailable'));
 return initializeQuery(()=>{
  let failure;
  const result=createModule({instantiateWasm(imports,receive){
   try{
    const exports=instantiate(imports);receive({exports});return exports;
   }catch(error){failure=error;return {};}
  }});
  if(failure)throw failure;return result;
 });
}
