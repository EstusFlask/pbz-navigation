// JS/WASM build only. No native executable or DLL is produced/distributed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild-wasm';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(here,'../build/offline-navigation/runtime');
fs.mkdirSync(out,{recursive:true});
const wasmFolder=path.join(here,'node_modules/@recast-navigation/wasm/dist');
const coreBinary=path.join(wasmFolder,'recast-navigation.wasm.wasm'),coreHash=crypto.createHash('sha256').update(fs.readFileSync(coreBinary)).digest('hex');
const translated=path.join(out,'recast-core-js.raw.js'),translationState=path.join(out,'translation.json');
const binaryen=JSON.parse(fs.readFileSync(path.join(here,'node_modules/binaryen/package.json'),'utf8')).version;
const options=['--all-features','--emscripten','--deterministic','-O2'],signature=JSON.stringify({coreHash,binaryen,options});
let previous;try{previous=JSON.parse(fs.readFileSync(translationState,'utf8'));}catch(_){}
const cachedHash=fs.existsSync(translated)?crypto.createHash('sha256').update(fs.readFileSync(translated)).digest('hex'):null;
if(previous?.signature!==signature||cachedHash!==previous?.sha256){
 execFileSync(process.execPath,[path.join(here,'node_modules/binaryen/bin/wasm2js'),coreBinary,...options,'-o',translated],{stdio:'pipe',maxBuffer:8*1024*1024});
 const bytes=fs.readFileSync(translated);fs.writeFileSync(translationState,JSON.stringify({signature,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
}
const source=fs.readFileSync(translated,'utf8');
if(source.includes('WebAssembly')||source.includes('use asm'))throw Error('Translated core still depends on WASM generation');
const embeddedWasm={name:'pbz-javascript-core',setup(build){
 build.onResolve({filter:/^@recast-navigation\/wasm$/},()=>({path:path.join(wasmFolder,'recast-navigation.wasm.js')}));
 // Private loader compatibility object; never touches the game's global API.
 // All module execution uses instantiateWasm above, and Table.set accepts JS.
 build.onLoad({filter:/recast-navigation\.wasm\.js$/},args=>({contents:'// PBZ loader adaptation: errors use Error; execution is translated JavaScript.\nconst WebAssembly={RuntimeError:Error};\n'+fs.readFileSync(args.path,'utf8'),loader:'js'}));
 build.onResolve({filter:/^pbz:recast-javascript$/},()=>({path:'core',namespace:'pbz-js'}));
 build.onLoad({filter:/.*/,namespace:'pbz-js'},()=>({contents:source+'\nexport default instantiate;\n',loader:'js'}));
}};
await esbuild.build({entryPoints:[path.join(here,'runtime.mjs')],plugins:[embeddedWasm],bundle:true,format:'cjs',platform:'neutral',mainFields:['module','main'],
 conditions:['import','default'],target:'es2020',outfile:path.join(out,'PBZRecastRuntime.js'),minify:false,legalComments:'inline',
 banner:{js:'// Recast/Detour translated to ordinary JavaScript by Binaryen wasm2js. No WASM code generation. See THIRD-PARTY-LICENSES.txt.\nvar performance = globalThis.performance || {now: function(){return Date.now();}};'},
 define:{'import.meta.url':'""'}});
const licenses=[];
for(const name of ['recast-navigation','@recast-navigation/core','@recast-navigation/wasm']){
 const folder=path.join(here,'node_modules',name),file=path.join(folder,'LICENSE');
 if(fs.existsSync(file))licenses.push(name+'\n'+fs.readFileSync(file,'utf8'));
}
licenses.push(fs.readFileSync(path.join(here,'RECAST-LICENSE.txt'),'utf8'));
licenses.push('Binaryen wasm2js runtime helpers\n'+fs.readFileSync(path.join(here,'node_modules/binaryen/LICENSE'),'utf8'));
fs.writeFileSync(path.join(out,'THIRD-PARTY-LICENSES.txt'),licenses.join('\n\n'));
const bytes=fs.readFileSync(path.join(out,'PBZRecastRuntime.js'));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({schema:1,engine:'recast-navigation@0.44.0',format:'CommonJS + translated JavaScript',backend:'javascript-wasm2js',requiresWebAssembly:false,
 bootstrap:'Emscripten instantiateWasm hook backed by ordinary JS',binaryen,upstreamWasmSHA256:coreHash,translation:JSON.parse(fs.readFileSync(translationState,'utf8')),
 customExecutable:false,newNativeLibrary:false,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},null,2));
console.log('Built pure JavaScript runtime:',bytes.length,'bytes');
