'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../build/streamed-atlas'),state=require(root+'/manifest.json');
let maximum=0;
for(const name of state.files){const size=fs.statSync(path.join(root,name)).size;maximum=Math.max(maximum,size);assert.ok(size<=(state.chunkChars||262144)+1024,'oversized module '+name);}
for(const world of state.worlds){
 const index=require(path.join(root,world,'index.js')),actors=[];
 for(let i=0;i<index.actorChunks;i++)actors.push(...require(path.join(root,world,'actors',i+'.js')).actors);
 const hash=crypto.createHash('sha256').update(JSON.stringify(actors)).digest('hex');
 assert.equal(hash,index.actorsHash,'changed actor metadata/order '+world);
}
for(const item of state.legacy){
 const source=fs.readFileSync(path.resolve(root,'../legacy-atlas',item.name),'utf8'),module={exports:{}};
 new Function('require','exports',source)(id=>require(id.replace('../PBZRouteStreaming',root)),module.exports);
 assert.equal(crypto.createHash('sha256').update(module.exports.value).digest('hex'),item.sha256,'legacy facade '+item.name);
}
console.log('PASS: all streamed actor metadata hashes match; '+state.files.length+' modules, largest '+maximum+' bytes');
console.log('PASS: all '+state.legacy.length+' legacy navigation chunk paths retain their exact original string values');
