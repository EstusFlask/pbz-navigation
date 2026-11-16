'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..'),mod=path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const States=require(mod+'/PBZRecastStates'),{RecastCache}=require(mod+'/PBZRouteRecast');
const array=values=>({Num:()=>values.length,Get:i=>values[i]});
function fixture(index,saved={}){
 let loaded=[],mode=0,now=0,invalidated=0;
 const P={$ref:value=>({value}),$unref:ref=>ref.value};
 const UE={Class:{Load:value=>value},PrimitiveComponent:{StaticClass:()=> 'primitive'},SplineMeshComponent:{StaticClass:()=> 'spline'},
  PBZLevelActorManager:{StaticClass:()=> 'manager'},JsonObjectWrapper:class{},
  JSONUtility:{TryGetBoolField(object,field,value,success){value.value=object[field];success.value=typeof object[field]==='boolean';}},
  GameplayStatics:{GetAllActorsOfClass(pawn,cls,out){out.value=array(loaded.filter(actor=>cls.includes(actor.asset)));}}};
 const manager={GetSaveData(id,out){out.value=saved[id]||{};}};
 const api={UE,P,T:{getWorldSubsystem:()=>manager},alive:x=>!!x};
 return {api,setMode:value=>mode=value,setLoaded:values=>{loaded=values;},
  actor(item){return {asset:item.classAsset,GetName:()=>item.name,K2_GetComponentsByClass:()=>array([
   {GetName:()=>item.components?.[0]||'Fog',GetCollisionEnabled:()=>mode,GetCollisionResponseToChannel:()=>2},
   ...(item.components?.slice(1)||[]).map(name=>({GetName:()=>name,GetCollisionEnabled:()=>mode,GetCollisionResponseToChannel:()=>2}))])};},
  clock:()=>now+=16,invalidate:()=>invalidated++,get invalidated(){return invalidated;}};
}
test('saved flags never override loaded closed or transitional collision',()=>{
 const item={id:'World-Actor',name:'Actor',classAsset:'/test/bp_vine',savedField:'Broken',components:['Vine','Plane']},index={actors:[item]};
 const f=fixture(index,{[item.id]:{Broken:true}});
 assert.equal(States.read({},index,f.api)[item.id],true);
 f.setLoaded([f.actor(item)]);f.setMode(3);assert.equal(States.read({},index,f.api)[item.id],false);
 f.setMode(0);assert.equal(States.read({},index,f.api)[item.id],true);
 f.setMode(99);assert.equal(States.read({},index,f.api)[item.id],undefined);
 assert.equal(States.componentPassable({GetCollisionEnabled:()=>1,GetCollisionResponseToChannel:()=>1},f.api.UE),true);
 assert.equal(States.componentPassable({GetCollisionEnabled:()=>1},f.api.UE),undefined);
});

test('a stalled host bootstrap reports its phase and terminates instead of waiting forever',()=>{
 let now=0;const events=[],index=require(mod+'/PBZRecastData/route-001/index');
 const core={initialize:()=>new Promise(()=>{})};
 const cache=new RecastCache(id=>id==='./PBZRecastRuntime'?core:index,{},(name,message)=>events.push([name,message]),()=>{},()=>now);
 const p={x:-174522,y:112570,z:-3042},pawn={};
 for(let i=0;i<40&&!cache.error;i++){now+=500;cache.pump(index.world,pawn,p);}
 assert.match(cache.error||'',/initializ.*timed out/i,'neither destination gets a result or a useful failure while bootstrap hangs');
 assert.equal(cache.ready,false);assert.ok(events.some(([name,text])=>name==='recast unavailable'&&text.includes('initialize')));
});
test('real packaged regional tiles switch doors, cancel old corridors and restore a complete route',{
 skip:!fs.existsSync(mod+'/PBZRecastData/route-001/index.js')
},async()=>{
 const index=require(mod+'/PBZRecastData/route-001/index'),saved={};
 for(const item of index.actors)if(item.savedField)saved[item.id]={[item.savedField]:true};
 const door=index.actors.find(item=>item.name.endsWith('1366641873')),f=fixture(index,saved);delete saved[door.id];f.setLoaded([f.actor(door)]);
 const cache=new RecastCache(id=>require(path.resolve(mod,id)),f.api,()=>{},f.invalidate,f.clock),a={x:-174688.995,y:112340.126,z:-3034.172},b={x:-187916,y:114639,z:-1057};
 const pawn={};
 const until=async predicate=>{for(let i=0;i<5000;i++){cache.pump(index.world,pawn,a);if(cache.error)throw Error(cache.error);if(predicate())return;await new Promise(setImmediate);}throw Error('Recast warm/state update stalled');};
 const drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
 try{
  await until(()=>cache.ready&&cache.revision>=3);
  assert.equal(drain(cache.route(index.world,a,b)).partial,false);
  const pending=cache.planner.routeJob(Object.values(a),Object.values(b));pending.next();
  const revision=cache.revision;f.setMode(3);await until(()=>cache.ready&&cache.revision>revision);
  assert.ok(f.invalidated);assert.equal(pending.next().done,true);assert.equal(drain(cache.route(index.world,a,b)).partial,true);
  const closed=cache.revision;f.setMode(0);await until(()=>cache.ready&&cache.revision>closed);assert.equal(drain(cache.route(index.world,a,b)).partial,false);
  const beforeTravel=cache.revision;cache.pump('another_world',pawn,a);assert.equal(cache.ready,false);
  await until(()=>cache.ready&&cache.revision>=beforeTravel+4);assert.equal(drain(cache.route(index.world,a,b)).partial,false);
 }finally{cache.planner?.destroy();}
});

test('captured selections and the finish approach work when the game forbids WASM code generation',async()=>{
 const index=require(mod+'/PBZRecastData/route-001/index'),saved={};for(const item of index.actors)saved[item.id]={[item.savedField]:true};
 const f=fixture(index,saved),door=index.actors.find(item=>item.name.endsWith('1366641873'));delete saved[door.id];f.setLoaded([f.actor(door)]);
 const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
 vm.runInContext(fs.readFileSync(process.env.PBZ_TEST_RECAST_BUNDLE||path.join(root,'build/offline-navigation/runtime/PBZRecastRuntime.js'),'utf8'),context);
 const core=context.module.exports,cache=new RecastCache(id=>id==='./PBZRecastRuntime'?core:require(path.resolve(mod,id)),f.api,()=>{},()=>{},f.clock);
 const field=require('./fixtures/recast-190-selections-20261115.json'),pawn={},a=field.origin;
 try{
  for(let i=0;i<5000&&!(cache.ready&&cache.revision>=3);i++){cache.pump(index.world,pawn,a);if(cache.error)throw Error(cache.error);await new Promise(setImmediate);}
  assert.equal(cache.ready,true,'captured selections never reach a usable regional planner');
  for(const {bell:name,p:b}of field.destinations){
   const job=cache.route(index.world,a,b);let row;do{row=job.next();}while(!row.done);
   assert.ok(row.value,'no route candidate for '+name);assert.equal(row.value.partial,false,name+' did not reach the selected endpoint');
  }
  const latest=require('./fixtures/recast-191-codegen-20261115.json'),near=latest.nearFinishOrigin,goal=latest.target,revision=cache.revision;f.setMode(3);
  for(let i=0;i<5000&&!(cache.ready&&cache.revision>revision);i++){cache.pump(index.world,pawn,near);if(cache.error)throw Error(cache.error);await new Promise(setImmediate);}
  const task=cache.route(index.world,near,goal);let result;do{result=task.next();}while(!result.done);
  assert.ok(result.value&&!result.value.partial,'the captured finish approach still produces no route with a distant closed door');
 }finally{cache.planner?.destroy();}
});
