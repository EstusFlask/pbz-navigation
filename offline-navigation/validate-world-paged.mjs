// Real paged data through the shipped Mod provider, in a no-codegen VM core.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),[folder,referenceFile,outputFolder]=process.argv.slice(2),world='pbz_pangzhen_wp';
if(!folder||!referenceFile)throw Error('Expected paged data folder and frozen reference state');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,world,'index.json'),'utf8'));
const evidence=path.resolve(outputFolder??'build/offline-navigation/paged-validation'),buildRoot=path.resolve('build');
if(!evidence.startsWith(buildRoot+path.sep))throw Error('Private validation evidence must remain under build/');fs.mkdirSync(evidence,{recursive:true});
const installedRuntime=path.resolve(folder,'../PBZRecastRuntime.js'),installedProvider=path.resolve(folder,'../PBZRouteRecastProvider.js');
const runtimeFile=fs.existsSync(installedRuntime)?installedRuntime:new URL('../build/offline-navigation/runtime/PBZRecastRuntime.js',import.meta.url);
const coreContext=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(runtimeFile,'utf8'),coreContext);
const core=coreContext.module.exports;await core.initialize();
const {WorldCache}=require(fs.existsSync(installedProvider)?installedProvider:'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteRecastProvider.js');
const snapshot=JSON.parse(fs.readFileSync(referenceFile,'utf8')),lookup=new Map(Object.entries(snapshot.actors).map(([id,row])=>[id.toLowerCase(),row]));
const explicit=JSON.parse(fs.readFileSync(new URL('../authoring/offline-route-001-exploration-state.json',import.meta.url),'utf8'));
const saved=Object.fromEntries(manifest.actors.map(a=>[a.id,{[a.savedField]:lookup.get(a.id.toLowerCase())?.[a.savedField]}]));
for(const [id,r]of Object.entries(explicit.actors)){const a=manifest.actors.find(a=>a.id.toLowerCase()===id.toLowerCase());if(a)saved[a.id]={[a.savedField]:r.Passable};}
const P={$ref:value=>({value}),$unref:r=>r.value},array=values=>({Num:()=>values.length,Get:i=>values[i]});
const UE={PBZLevelActorManager:{StaticClass:()=>1},JsonObjectWrapper:class{},JSONUtility:{TryGetBoolField(obj,field,value,success){value.value=obj[field];success.value=typeof obj[field]==='boolean';}},
 Class:{Load:v=>v},GameplayStatics:{GetAllActorsOfClass(p,cls,out){out.value=array([]);}}};
let now=0,reads=0,maxRead=0;
const cache=new WorldCache(()=>core,{UE,P,T:{getWorldSubsystem:()=>({GetSaveData(id,out){out.value=saved[id]??{};}})},alive:x=>!!x,
 dataRoot:folder,readText:file=>{const text=fs.readFileSync(file,'utf8');reads++;maxRead=Math.max(maxRead,text.length);return text;}},()=>{},()=>{},()=>now);
const start={x:-174688.995,y:112340.126,z:-3034.172},pawn={},rows=[];
try{
 for(let i=0;i<1000&&!(cache.ready&&cache.signature);i++){now+=32;cache.pump(world,pawn,start);if(cache.error)throw Error(cache.error);await new Promise(setImmediate);}
 if(!cache.ready||!cache.signature)throw Error('Actual Mod provider never became ready');
 for(const [name,goal]of Object.entries({route001:{x:-187916,y:114639,z:-1057},nearBell:{x:-171921,y:120932,z:-4137}})){
  const job=cache.route(world,start,goal);let row,steps=0,maxStepMs=0;const started=performance.now();
  do{const at=performance.now();row=job.next();maxStepMs=Math.max(maxStepMs,performance.now()-at);if(++steps>200000)throw Error('Paged route did not finish');}while(!row.done);
  const leg=row.value;if(!leg?.topologyComplete||leg.conditionalCandidate)throw Error('Frozen paged Mod route incomplete: '+name);
  const result={name,meters:leg.meters,points:leg.points.length,steps,maxStepMs,elapsedMs:performance.now()-started,residentTiles:cache.pages.window.loaded.size,
   metadataPages:cache.pages.pages.size,coarsePages:cache.pages.corridors?.pages.size??0,physicalVerified:false};rows.push(result);console.log(JSON.stringify(result));
  fs.writeFileSync(path.join(evidence,'validated-'+name+'.json'),JSON.stringify({...leg,complete:leg.topologyComplete&&!leg.conditionalCandidate,points:leg.points.map(p=>[p.x,p.y,p.z]),assumedActorStates:cache.states}));
 }
 const report={schema:1,world,scope:'Frozen reference plus two explicitly passable fog doors, actual Mod WorldCache and paged data; Node timing only',codeGeneration:{strings:false,wasm:false},reads,maxRead,rows,physicalVerified:false,installed:false};
 fs.writeFileSync(path.join(evidence,'paged-mod-validation.json'),JSON.stringify(report,null,2));
}finally{cache.cancel();cache.pages?.destroy();}
