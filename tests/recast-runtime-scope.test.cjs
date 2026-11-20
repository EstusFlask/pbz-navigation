'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),source=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRecastRuntime.js');
test('the plain JS runtime keeps generated engine internals inside its CommonJS scope',async()=>{
 const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}}),before=new Set(Object.keys(context));
 vm.runInContext(fs.readFileSync(source,'utf8'),context);assert.deepEqual(Object.keys(context).filter(key=>!before.has(key)),[],'generated runtime leaked its helpers and tables to the host global object');
 const runtime=context.module.exports;assert.equal(typeof runtime.initialize,'function');assert.equal(typeof runtime.PackedStore,'function');assert.equal(typeof runtime.createWorld,'function');await runtime.initialize();
 assert.equal(vm.runInContext('typeof WebAssembly',context),'object','the runtime replaced the host API');assert.equal(Object.hasOwn(context,'crcTable'),false);
 const fresh={exports:{}};context.module=fresh;vm.runInContext(fs.readFileSync(source,'utf8'),context);await fresh.exports.initialize();assert.notEqual(fresh.exports,runtime);assert.equal(typeof runtime.createWorld,'function');
});
