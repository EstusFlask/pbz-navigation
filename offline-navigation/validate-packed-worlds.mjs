// Complete logical-file SHA differential through the shipped plain-JS decoder.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
const [folder,output,only]=process.argv.slice(2),catalog=JSON.parse(fs.readFileSync(path.join(folder,'catalog.json'),'utf8'));
const context=vm.createContext({module:{exports:{}},WebAssembly:undefined},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(new URL('../build/offline-navigation/runtime/PBZRecastRuntime.js',import.meta.url),'utf8'),context);const {PackedStore}=context.module.exports;
const drain=job=>{let r;do{r=job.next();}while(!r.done);return r.value;},sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),rows=[];
function validate(dir,world){
 const m=JSON.parse(fs.readFileSync(path.join(dir,'index.json'),'utf8'));
 if(m.kind==='multi-grid-world'){for(const g of m.grids)validate(path.join(dir,path.dirname(g.index)),world+'/'+g.id);return;}
 const proof=JSON.parse(fs.readFileSync(path.join(dir,'compression-proof.json'),'utf8')),store=new PackedStore(m,file=>fs.readFileSync(path.join(dir,file),'utf8'));let bytes=0,files=0;
 const check=(name,data)=>{if(sha(data)!==proof.logicalSHA256[name])throw Error('Decoded logical SHA differs: '+world+'/'+name);bytes+=data.length;files++;};
 try{
  for(let i=0;i<m.packetCount;i++){const size=i===m.packetCount-1?m.lastPacketBytes:m.chunkBytes;check('packets/'+i+'.txt',drain(store.bytesJob([i*(m.chunkBytes/32768),Math.ceil(size/32768),size])));}
  for(const p of m.pages)check('pages/'+p.id+'.json',Buffer.from(drain(store.textJob(p.packed)),'utf8'));
  const graph=m.corridors;if(graph)for(let i=0;i<graph.packed.length;i++)check('corridors/'+i+'.json',Buffer.from(drain(store.textJob(graph.packed[i])),'utf8'));
  if(store.containers.size>2||store.directories.size>4)throw Error('Storage cache bound exceeded');
  const row={world,files,bytes,records:m.storage.records,containers:m.storage.containers,passed:true};rows.push(row);console.log(JSON.stringify(row));
 }finally{store.clear();}
}
for(const world of Object.keys(catalog.worlds))if(!only||world===only)validate(path.join(folder,world),world);
fs.writeFileSync(output,JSON.stringify({schema:1,decoder:'pinned bounded fflate ordinary JS',WebAssembly:'absent',strings:false,wasm:false,rows,completeCollisionClaim:false,physicalVerified:false},null,2));
