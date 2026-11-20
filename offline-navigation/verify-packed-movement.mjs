// Full legacy/spatial candidate coordinate differential through plain JS.
// This verifies storage and cache bounds, not action/game acceptance.
import fs from'node:fs';import path from'node:path';import vm from'node:vm';import crypto from'node:crypto';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),[source,packed,out]=process.argv.slice(2);if(!source||!packed||!out)throw Error('Expected legacy source, packed candidate and private proof output');
const context=vm.createContext({module:{exports:{}},WebAssembly:undefined},{codeGeneration:{strings:false,wasm:false}});vm.runInContext(fs.readFileSync(new URL('../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRecastRuntime.js',import.meta.url),'utf8'),context);const core=context.module.exports,{Reader}=require('../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteMovementStore.js'),drain=j=>{let r;do{r=j.next();}while(!r.done);return r.value;},parse=f=>JSON.parse(fs.readFileSync(f,'utf8').split('exports.data=',2)[1].trim().replace(/;$/,'')),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),rowKey=row=>row.map(n=>n.toFixed(3)).join(','),results=[];
for(const world of fs.readdirSync(source).filter(w=>fs.statSync(path.join(source,w)).isDirectory())){
 const oldDir=path.join(source,world),dir=path.join(packed,world),manifest=parse(path.join(dir,'index.js')),old=parse(path.join(oldDir,'index.js'));
 if(manifest.sourceIndexSHA256!==old.sourceIndexSHA256||manifest.packedFromManifestSHA256!==hash(fs.readFileSync(path.join(oldDir,'index.js'))))throw Error('Movement source identity differs: '+world);
 const expected=[];for(let i=0;i<old.pages;i++){const rows=JSON.parse(fs.readFileSync(path.join(oldDir,i+'.js'),'utf8').split('exports.rows=',2)[1].trim().replace(/;$/,''));expected.push(...rows.map(rowKey));}
 const reader=new Reader(manifest,file=>fs.readFileSync(path.join(dir,file),'utf8'),core),actual=[];try{
  const leaves=drain(reader.descriptorsJob([-1e10,-1e10,1e10,1e10],[-1e10,1e10]));
  for(const leaf of leaves)actual.push(...drain(reader.pageJob(leaf)).map(rowKey));
  const a=[...new Set(expected)].sort(),b=[...new Set(actual)].sort(),sourceSHA256=hash(a.join('\n')),decodedSHA256=hash(b.join('\n'));
  if(a.length!==manifest.rows||b.length!==a.length||sourceSHA256!==decodedSHA256||actual.length!==expected.length)throw Error('Movement coordinates changed: '+world);
  if(reader.store.containers.size>2||reader.store.directories.size>4||reader.metadata.size>2||reader.rows.size>2)throw Error('Movement cache exceeded budget');
  const record={world,rows:actual.length,pages:leaves.length,sourceSHA256,decodedSHA256,passed:true};results.push(record);console.log(JSON.stringify(record));
 }finally{reader.clear();}
}
const file=path.resolve(out);if(!file.startsWith(path.resolve('build')+path.sep))throw Error('Private proof output only');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({schema:1,strings:false,wasm:false,WebAssembly:'absent',scope:'Lossless candidate storage only; no movement/game acceptance',worlds:results},null,2));
