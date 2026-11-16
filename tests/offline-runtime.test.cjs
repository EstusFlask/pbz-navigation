'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),bundle=path.join(root,'build/offline-navigation/runtime/PBZRecastRuntime.js');
const {pathToFileURL}=require('node:url');
function load(extra={},options={}){
 const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}},...extra},options);
 vm.runInContext(fs.readFileSync(bundle,'utf8'),context,{filename:'PBZRecastRuntime.js'});
 return {api:context.module.exports,context};
}

test('portable Recast initializes without Node, DOM, fetch or filesystem access',{skip:!fs.existsSync(bundle)},async()=>{
 const {api,context}=load();assert.equal(vm.runInContext('typeof process',context),'undefined');
 assert.equal(vm.runInContext('typeof fetch',context),'undefined');assert.equal(vm.runInContext('typeof document',context),'undefined');
 assert.ok(api.capabilities());await api.initialize();
});

test('embedded host can initialize without an asynchronous WebAssembly task pump',{skip:!fs.existsSync(bundle)},async()=>{
 // Puerts is an embedded V8 host, not Node's event loop. Keep normal JS
 // microtasks and synchronous WASM, while native async WASM jobs stay queued.
 let asyncCalls=0;
 const native=WebAssembly,host={Module:native.Module,Instance:native.Instance,Memory:native.Memory,Table:native.Table,
  Global:native.Global,RuntimeError:native.RuntimeError,CompileError:native.CompileError,LinkError:native.LinkError,
  validate:native.validate,compile(){asyncCalls++;return new Promise(()=>{});},instantiate(){asyncCalls++;return new Promise(()=>{});}};
 const {api}=load({WebAssembly:host});let ready=false,failure;
 api.initialize().then(()=>{ready=true;},error=>{failure=error;});
 for(let i=0;i<8;i++)await new Promise(setImmediate);
 if(failure)throw failure;
 assert.equal(ready,true,'both covered destinations remain waiting because the core never initializes');
 assert.equal(asyncCalls,0,'portable bootstrap depended on native asynchronous WASM scheduling');
});

test('the game host can initialize navigation with WASM code generation disabled',{skip:!fs.existsSync(bundle)},async()=>{
 const {api}=load({}, {codeGeneration:{strings:false,wasm:false}});
 await api.initialize();
});

test('the JavaScript backend also initializes when WebAssembly is absent or a partial shim',{skip:!fs.existsSync(bundle)},async()=>{
 const {api}=load({WebAssembly:{Module(){},instantiate(){}}});
 assert.equal(api.capabilities(),true);await api.initialize();
 const missing=load({WebAssembly:undefined});await missing.api.initialize();
});

test('the JavaScript backend never invokes the host WASM compiler',{skip:!fs.existsSync(bundle)},async()=>{
 let calls=0;const host={Module:class{constructor(){calls++;throw Error('host rejected the module');}},Instance(){calls++;throw Error('host rejected the instance');}};
 const {api}=load({WebAssembly:host});assert.equal(api.capabilities(),true);await api.initialize();assert.equal(calls,0);
});

test('the bundled core queries real regional data and keeps physical acceptance separate',{
 skip:!fs.existsSync(bundle)||!fs.existsSync(path.join(root,'build/offline-navigation/route-001/region-current.navbin'))
},async()=>{
 const {api}=load();await api.initialize();const folder=path.join(root,'build/offline-navigation/route-001');
 const planner=new api.Planner(fs.readFileSync(path.join(folder,'region-current.navbin')),
  JSON.parse(fs.readFileSync(path.join(folder,'region-current.navbin.json'),'utf8')));
 try{
  const route=planner.route([-174362.737,113727.465,-3055.905],[-187916,114639,-1057]);
  assert.equal(route.complete,true,route.reason);assert.equal(route.physicalVerified,false);
  assert.ok(route.points.length>=route.corners.length);assert.ok(route.points.every(p=>p.every(Number.isFinite)));
  assert.ok(Math.hypot(...route.points.at(-1).map((v,k)=>v-route.projectedGoal[k]))<1);
  const cancelled=planner.routeJob([-174362.737,113727.465,-3055.905],[-187916,114639,-1057]);
  assert.equal(cancelled.next().done,false);cancelled.return();assert.equal(planner.jobs.size,0);
  assert.equal(planner.route([-174362.737,113727.465,-3055.905],[-187916,114639,-1057]).complete,true);
  assert.throws(()=>planner.route([NaN,0,0],[0,0,0]),/Invalid navigation request/);
 }finally{planner.destroy();}
 assert.throws(()=>planner.route([0,0,0],[0,0,0]),/Invalid navigation request/);
});

test('native tiles can be loaded, removed and restored without stale queries',{
 skip:!fs.existsSync(bundle)||!fs.existsSync(path.join(root,'build/offline-navigation/route-001/region-current.navbin'))
},async()=>{
 const {api}=load();await api.initialize();const folder=path.join(root,'build/offline-navigation/route-001');
 const parsed=api.parseNavSet(fs.readFileSync(path.join(folder,'region-current.navbin'))),empty=parsed.header.slice();new DataView(empty.buffer).setUint32(8,0,true);
 const planner=new api.Planner(empty,JSON.parse(fs.readFileSync(path.join(folder,'region-current.navbin.json'),'utf8')));
 const a=[-174362.737,113727.465,-3055.905],b=[-187916,114639,-1057];
 try{
  for(let slot=0;slot<parsed.tiles.length;slot++)planner.replaceTile(slot,parsed.tiles[slot].data);
  assert.equal(planner.route(a,b).complete,true);
  const job=planner.routeJob(a,b);job.next();planner.replaceTile(0,null);assert.equal(job.next().done,true);
  for(let repeat=0;repeat<20;repeat++){planner.replaceTile(0,parsed.tiles[0].data);planner.replaceTile(0,null);}
  planner.replaceTile(0,parsed.tiles[0].data);assert.equal(planner.route(a,b).complete,true);
 }finally{planner.destroy();}
});

test('unknown actor states select closed tiles and malformed base64 is rejected',{skip:!fs.existsSync(bundle)},()=>{
 const {api}=load(),index={schema:1,engine:'recast-navigation@0.44.0',tiles:[{slot:0,x:0,y:0,conditions:['Door','Vine'],variants:{'00':'both-open','01':'vine-closed','10':'door-closed','11':'both-closed'}}]};
 assert.equal(api.selectVariants(index,{}).tiles[0].blob,'both-closed');
 assert.equal(api.selectVariants(index,{door:true,VINE:false}).tiles[0].blob,'vine-closed');
 assert.equal(api.selectVariants(index,{door:1,VINE:true}).tiles[0].blob,'door-closed');
 for(const value of ['ab=c','YWJ=','YQ=A','A==='])assert.throws(()=>api.decodeBase64(value),/base64/);
 assert.equal(Buffer.from(api.decodeBase64('YQ==')).toString(),'a');
});

test('translated JavaScript matches upstream WASM corridors and surface points on real regional data',{
 skip:!fs.existsSync(bundle)||!fs.existsSync(path.join(root,'build/offline-navigation/route-001/region-variants.navbin'))
},async()=>{
 const {api}=load({}, {codeGeneration:{strings:false,wasm:false}});await api.initialize();
 const upstream=await import(pathToFileURL(path.join(root,'offline-navigation/query.mjs')).href);await upstream.initialize();
 const folder=path.join(root,'build/offline-navigation/route-001'),bytes=fs.readFileSync(path.join(folder,'region-variants.navbin')),meta=JSON.parse(fs.readFileSync(path.join(folder,'region-variants.navbin.json'),'utf8'));
 const js=new api.Planner(bytes,meta),wasm=new upstream.Planner(bytes,meta),a=[-174522.19983567303,112570.49016589088,-3042.0138888362712];
 try{
  for(const b of [[-187916,114639,-1057],[-171921,120932,-4137]]){
   const x=js.route(a,b),y=wasm.route(a,b);assert.equal(x.complete,true);assert.equal(x.complete,y.complete);assert.equal(x.corridorPolygons,y.corridorPolygons);
   for(const name of ['corners','points']){assert.equal(x[name].length,y[name].length);for(let i=0;i<x[name].length;i++)for(let k=0;k<3;k++)assert.ok(Math.abs(x[name][i][k]-y[name][i][k])<.01,`${name}[${i}][${k}] differs`);}
  }
 }finally{js.destroy();wasm.destroy();}
});
