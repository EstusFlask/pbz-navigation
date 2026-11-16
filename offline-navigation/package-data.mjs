// Convert verified local Detour tiles to bounded CommonJS data modules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [input,output,...extra]=process.argv.slice(2);
if(!input||!output||extra.length)throw Error('Usage: node package-data.mjs variants-folder mod-data-folder');
const index=JSON.parse(fs.readFileSync(path.join(input,'index.json'),'utf8'));
if(index.schema!==1||index.engine!=='recast-navigation@0.44.0')throw Error('Unsupported tile index');
fs.mkdirSync(output,{recursive:true});let packet={},chars=0,packets=0;
function flush(){if(!chars)return;fs.writeFileSync(path.join(output,packets+'.js'),"'use strict';exports.tiles="+JSON.stringify(packet)+';\n');packets++;packet={};chars=0;}
for(const [id,blob]of Object.entries(index.blobs)){
 if(!/^[a-f0-9]{64}$/.test(id)||blob.file!==id+'.bin')throw Error('Invalid tile identity');
 const bytes=fs.readFileSync(path.join(input,blob.file));
 if(bytes.length!==blob.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==id)throw Error('Changed tile '+id);
 const encoded=bytes.toString('base64');if(encoded.length>900000)throw Error('Tile exceeds portable payload budget');
 if(chars+encoded.length>393216)flush();packet[id]=encoded;chars+=encoded.length;
}
flush();const publicIndex={...index,packets,blobs:Object.fromEntries(Object.entries(index.blobs).map(([id,b])=>[id,{bytes:b.bytes}]))};
fs.writeFileSync(path.join(output,'index.js'),"'use strict';module.exports="+JSON.stringify(publicIndex)+';\n');
console.log(`Packaged ${packets} JS data modules; no game save, key, native executable or shared library`);
