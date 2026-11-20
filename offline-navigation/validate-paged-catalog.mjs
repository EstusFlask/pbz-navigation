// Small real-tile loader/query smoke controls for every staged world. These
// do not certify playable scenes, live conditions, physics or frame timing.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {WorldCache}=createRequire(import.meta.url)('../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteRecastProvider.js');
const [folder,outputFile]=process.argv.slice(2);if(!folder)throw Error('Expected public paged-data directory');
const catalog=JSON.parse(fs.readFileSync(path.join(folder,'catalog.json'),'utf8'));
const runtime=path.resolve(folder,'../PBZRecastRuntime.js'),context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(fs.existsSync(runtime)?runtime:new URL('../build/offline-navigation/runtime/PBZRecastRuntime.js',import.meta.url),'utf8'),context);
const core=context.module.exports;await core.initialize();const rows=[];
for(const [world,descriptor]of Object.entries(catalog.worlds)){
 if(descriptor.index!==world+'/index.json')throw Error('Catalog path mismatch');
 const m=JSON.parse(fs.readFileSync(path.join(folder,descriptor.index),'utf8'));
 if(m.world!==world||m.sourceIndexSHA256!==descriptor.sourceIndexSHA256)throw Error('World index mismatch');
 if(m.actors.some(a=>typeof a.name!=='string'||typeof a.id!=='string'||typeof a.classAsset!=='string'))throw Error('Public actor binding lacks state-reader fields: '+world);
 let clock=0;const pawn={},foot={x:0,y:0,z:0},api={dataRoot:folder,readText:file=>fs.readFileSync(file,'utf8'),P:{$ref:value=>({value}),$unref:r=>r.value},T:{},alive:x=>!!x,UE:{Class:{Load:x=>x},GameplayStatics:{GetAllActorsOfClass(p,c,out){out.value={Num:()=>0};}}}};
 const provider=new WorldCache(()=>core,api,()=>{},()=>{},()=>clock);
 try{
  for(let n=0;n<100&&!provider.signature;n++){clock+=32;provider.pump(world,pawn,foot);if(provider.error)throw Error('Actual Mod world provider failed: '+provider.error);await Promise.resolve();}
  if(!provider.ready||!provider.signature)throw Error('Actual Mod world provider failed to initialize actor state: '+world);
 }finally{provider.cancel();provider.job?.return?.();provider.pages?.destroy();}
 const read=file=>fs.readFileSync(path.join(folder,world,file),'utf8');
 const cases=m.kind==='multi-grid-world'?m.grids.map(g=>({label:g.id,leaf:JSON.parse(read(g.index)),prefix:g.index.slice(0,-'index.json'.length)})):[{label:'main',leaf:m,prefix:''}];
 for(const {label,leaf,prefix}of cases){
 const readLeaf=file=>read(prefix+file),pages=core.createWorld(m,read,{maxTiles:32,maxBytes:16*1024*1024,maxPages:2,maxPackets:2,maxCachedBytes:4*1024*1024});
 const packed=leaf.storage?new core.PackedStore(leaf,readLeaf):null,drain=job=>{let r;do{r=job.next();}while(!r.done);return r.value;};
 let result,attempts=0;
 try{
  for(const page of leaf.pages){
   const metadata=JSON.parse(packed?drain(packed.textJob(page.packed)):readLeaf('pages/'+page.id+'.json'));
   for(const tile of metadata.tiles){
    if(tile.conditions.length||!tile.coarseSeeds?.length)continue;
    const p=tile.coarseSeeds[0].slice(1),q=[p[0]+1,p[1],p[2]];let row,n=0;
    try{const job=pages.routeJob(p,q,{}, {paddingTiles:0,heightPaddingCm:500});do{row=job.next();if(++n>10000)throw Error('Smoke query did not finish');}while(!row.done);result=row.value;}
    catch(error){if(!String(error).match(/budget|capacity/))throw error;}
    attempts++;if(result?.complete||attempts>=32)break;
   }
   if(result?.complete||attempts>=32)break;
  }
  if(!result?.complete)throw Error('No small loaded-tile control succeeded: '+world);
  const resident=pages.current??pages;
  if(resident.window.loaded.size>32||resident.pages.size>2||resident.packetCache.size>2||resident.blobCacheBytes>4*1024*1024)throw Error('Smoke residency exceeded');
  const row={world,grid:label,complete:true,scope:'small cooked tile query only',attempts,residentTiles:resident.window.loaded.size,metadataPages:resident.pages.size,packetPages:resident.packetCache.size,decodedCacheBytes:resident.blobCacheBytes,physicalVerified:false};rows.push(row);console.log(JSON.stringify(row));
 }finally{pages.destroy();packed?.clear();}
 }
}
const out=path.resolve(outputFile??'build/offline-navigation/paged-catalog-validation.json');if(!out.startsWith(path.resolve('build')+path.sep))throw Error('Private evidence must stay under build/');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({schema:1,codeGeneration:{strings:false,wasm:false},rows,physicalVerified:false},null,2));
