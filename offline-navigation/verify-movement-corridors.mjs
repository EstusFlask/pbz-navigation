import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),[buildFile,dataRoot,outputFile]=process.argv.slice(2),mod=path.resolve('Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const read=file=>JSON.parse(fs.readFileSync(file)),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert(path.resolve(outputFile).startsWith(path.resolve('build')+path.sep)&&!fs.existsSync(outputFile),'Fresh private verification output required');
const context=vm.createContext({module:{exports:{}},WebAssembly:undefined},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(path.join(mod,'PBZRecastRuntime.js'),'utf8'),context);
const {Reader}=require(path.join(mod,'PBZRouteMovementCorridors')),drain=job=>{let result;do{result=job.next();}while(!result.done);return result.value;},results=[];
for(const source of read(buildFile).records){
 const directory=path.join(dataRoot,source.world),manifest=read(path.join(directory,'index.json')),mapping=read(source.mappingFile),expected=mapping.edges.slice().sort((first,last)=>first.from-last.from||first.to-last.to);
 assert.equal(manifest.mappingSHA256,sha(source.mappingFile));
 assert.equal(manifest.sourceIndexSHA256,mapping.sourceIndexSHA256);
 assert.equal(manifest.movementManifestSHA256,sha(path.join(mod,'PBZRouteMovementData',source.world,'index.js')));
 for(const [file,evidence]of Object.entries(source.files)){assert.equal(sha(path.join(directory,file)),evidence.sha256);assert.equal(fs.statSync(path.join(directory,file)).size,evidence.bytes);}
 const reader=new Reader(manifest,file=>fs.readFileSync(path.join(directory,file),'utf8'),context.module.exports),actual=[];
 try{
  for(const from of [...new Set(expected.map(edge=>edge.from))]){
   actual.push(...drain(reader.fromJob(from)));
   assert(reader.pages.size<=8&&reader.store.containers.size<=2&&reader.store.directories.size<=4,'Movement corridor cache exceeded bound');
  }
  actual.sort((first,last)=>first.from-last.from||first.to-last.to);
  const signature=rows=>digest(rows.map(edge=>[edge.from,edge.to,edge.kind,edge.reverse,edge.guid,edge.entry,edge.exit,edge.cost]));
  assert.equal(signature(actual),signature(expected),'Source geometry movement adjacency changed');
  const record={world:source.world,edges:actual.length,sourceSHA256:signature(expected),decodedSHA256:signature(actual),passed:true};results.push(record);console.log(JSON.stringify(record));
 }finally{reader.clear();}
}
fs.writeFileSync(outputFile,JSON.stringify({scope:'Full source movement adjacency storage and direction differential only; no physical/native/game acceptance',WebAssembly:'absent',runtimeSHA256:sha(path.join(mod,'PBZRecastRuntime.js')),readerSHA256:sha(path.join(mod,'PBZRouteMovementCorridors.js')),buildReceiptSHA256:sha(buildFile),results},null,2));
