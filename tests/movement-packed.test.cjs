'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),mod=path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute'),run=job=>{let r,n=0;do{r=job.next();if(++n>100000)throw Error('Movement paging did not finish');}while(!r.done);return r.value;};
test('packed movement pages preserve coordinates and read only nearby spatial pages without code generation',()=>{
 const folder=fs.mkdtempSync(path.join(root,'build','movement-page-test-')),source=path.join(folder,'source'),out=path.join(folder,'packed');fs.mkdirSync(source);
 const rows=Array.from({length:2200},(_,i)=>[i*10000+.123,30.234,500.345,i*10000+200.456,40.567,100.678]),manifest={schema:1,world:'test',sourceIndexSHA256:'a'.repeat(64),kind:'geometry-movement-proposals',navigationGrid:null,pages:Math.ceil(rows.length/512),rows:rows.length,coverage:[]};
 fs.writeFileSync(path.join(source,'index.js'),"'use strict';\nexports.data="+JSON.stringify(manifest)+';\n');for(let i=0;i<manifest.pages;i++)fs.writeFileSync(path.join(source,i+'.js'),"'use strict';\nexports.rows="+JSON.stringify(rows.slice(i*512,(i+1)*512))+';\n');
 execFileSync('py',['-3.12','-X','utf8','tools/pack-movement-proposals.py',source,out],{cwd:root,stdio:'pipe'});
 const packed=JSON.parse(fs.readFileSync(path.join(out,'index.js'),'utf8').split('exports.data=')[1].trim().replace(/;$/,'')),context=vm.createContext({module:{exports:{}},WebAssembly:undefined},{codeGeneration:{strings:false,wasm:false}});vm.runInContext(fs.readFileSync(path.join(mod,'PBZRecastRuntime.js'),'utf8'),context);const core=context.module.exports;
 const module={exports:{}},reads=[];vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(path.join(mod,'PBZRouteMovementIndex.js'),'utf8')+'\n})')(id=>['./PBZRouteCore','./PBZRouteMovementStore'].includes(id)?require(path.join(mod,id)):{data:packed},module,module.exports);
 const io={state:{},core:()=>core,readText:name=>{reads.push(name);return fs.readFileSync(path.join(out,name),'utf8');}},args=['test',{sourceIndexSHA256:manifest.sourceIndexSHA256},{x:0,y:0,z:500},{x:300,y:0,z:100},{maxRunCm:800,maxHeightCm:1100},[-100,-100,1000,1000],null,[0,600],io];
 const result=run(module.exports.candidates(...args));assert.ok(result&&result.length===1,'spatial packed candidates were not connected to the production reader');assert.deepEqual(Array.from(result[0].path[0]),rows[0].slice(0,3));assert.deepEqual(Array.from(result[0].path[1]),rows[0].slice(3));
 assert.ok(reads.length<10,'a small query loaded every movement page');assert.ok(io.state.reader.store.containers.size<=2&&io.state.reader.store.directories.size<=4);assert.ok(io.state.reader.metadata.size<=2);
 const old=reads.length;run(module.exports.candidates(...args));assert.equal(reads.length,old,'the same nearby query reread immutable storage');
 io.state.reader.clear();assert.equal(io.state.reader.store.containers.size,0);assert.equal(io.state.reader.metadata.size,0);
 const broken={...io,state:{},readText:name=>name.startsWith('packs/')?'corrupt':io.readText(name)};assert.throws(()=>run(module.exports.candidates(...args.slice(0,-1),broken)),/Packed container identity/,'a corrupt packed movement page was accepted');
 packed.sourceIndexSHA256='b'.repeat(64);assert.equal(run(module.exports.candidates(...args)),null,'movement from another world build was accepted');
});
