'use strict';
// Change storage only: preserve every original column byte and actor order.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),nav=path.join(root,'Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const option=name=>{const at=process.argv.indexOf(name);return at>=0?process.argv[at+1]:undefined;};
const chunkChars=Number(option('--chunk-chars')||524288),buildRoot=path.resolve(root,option('--build-root')||'build');
if(!Number.isSafeInteger(chunkChars)||chunkChars<65536||chunkChars>1048576||chunkChars%65536)throw Error('chunk size must be a multiple of 65536, up to 1 MiB');
const output=path.join(buildRoot,'streamed-atlas'),legacyRoot=path.join(buildRoot,'legacy-atlas'),stateFile=path.join(output,'manifest.json');
const columns=['p','v','e','arc','lab','cells','strong','dag','off','weight','sizes','order','metric'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const generator=hash(fs.readFileSync(__filename));
const sourceFiles=['PBZRouteWorlds','PBZRouteFaces','PBZRouteChunks'].flatMap(dir=>fs.readdirSync(path.join(nav,dir)).filter(n=>n.endsWith('.js')).map(n=>dir+'/'+n));
const sources=Object.fromEntries(sourceFiles.map(n=>[n,hash(fs.readFileSync(path.join(nav,n)))]));
let old;try{old=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch(_){}
if(old?.format===3&&old.chunkChars===chunkChars&&old.generator===generator&&JSON.stringify(old.sources)===JSON.stringify(sources)&&old.files.every(n=>fs.existsSync(path.join(output,n)))&&old.legacy.every(r=>fs.existsSync(path.join(legacyRoot,r.name)))){
 console.log('Streamed atlas cache is current: '+old.files.length+' modules');process.exit(0);
}
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(legacyRoot,{recursive:true});const files=[],worlds=[],legacy=[];
const write=(name,field,value)=>{const file=path.join(output,name+'.js');fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,"'use strict';exports."+field+'='+JSON.stringify(value)+';\n');files.push(name+'.js');};
function stream(world,key,value){
 const parts=typeof value==='string'?[value]:value,base64=parts.join(''),chunks=Math.max(1,Math.ceil(base64.length/chunkChars));
 for(let i=0;i<chunks;i++)write(world+'/'+key+'/'+i,'chunk',base64.slice(i*chunkChars,(i+1)*chunkChars));
 let offset=0;
 for(let i=0;i<parts.length;i++){
  const name=world+'.'+key+'.'+String(i).padStart(3,'0')+'.js',size=parts[i].length;
  if(sources['PBZRouteChunks/'+name]){
   const first=Math.floor(offset/chunkChars),last=Math.ceil((offset+size)/chunkChars),refs=[];
   for(let j=first;j<last;j++)refs.push("require('../PBZRouteStreaming/"+world+'/'+key+'/'+j+"').chunk");
   const text="'use strict';exports.value=["+refs.join(',')+'].join(\'\').slice('+offset%chunkChars+','+(offset%chunkChars+size)+');\n';
   fs.writeFileSync(path.join(legacyRoot,name),text);legacy.push({name,sha256:hash(parts[i])});
  }offset+=size;
 }
 const bytes=Buffer.from(base64,'base64');return {stream:world+'/'+key,chunks,bytes:bytes.length,sha256:hash(bytes)};
}
for(const name of sourceFiles.filter(n=>n.startsWith('PBZRouteWorlds/'))){
 const world=path.basename(name,'.js'),dataFile=path.join(nav,name),faceFile=path.join(nav,'PBZRouteFaces',world+'.js');
 const data=require(dataFile).data,faces=require(faceFile).faces,meta={...data};delete meta.actors;
 for(const key of columns)meta[key]=stream(world,key,data[key]);
 const face=stream(world,'faces',faces),actorChunks=Math.ceil(data.actors.length/48);
 for(let i=0;i<actorChunks;i++)write(world+'/actors/'+i,'actors',data.actors.slice(i*48,(i+1)*48));
 const manifest={data:meta,faces:face,actorChunks,actorsHash:hash(JSON.stringify(data.actors))};
 const file=path.join(output,world,'index.js');fs.writeFileSync(file,"'use strict';module.exports="+JSON.stringify(manifest)+';\n');files.push(world+'/index.js');
 worlds.push(world);console.log('Prepared '+world+': '+data.n+' nodes, original byte hashes retained');
 delete require.cache[require.resolve(dataFile)];delete require.cache[require.resolve(faceFile)];
 if(global.gc)global.gc();
}
if(legacy.length!==sourceFiles.filter(n=>n.startsWith('PBZRouteChunks/')).length)throw Error('missing legacy column facade');
fs.writeFileSync(stateFile,JSON.stringify({format:3,generator,chunkChars,sources,worlds,files,legacy},null,2)+'\n');
console.log('Prepared '+files.length+' streamed modules in build/streamed-atlas');
