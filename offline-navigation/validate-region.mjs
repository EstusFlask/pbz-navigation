// Integration evidence from real installed-game geometry; no construction input.
import fs from 'node:fs';
import path from 'node:path';
import {initialize,Planner,assembleNavSet,decodeBase64,selectVariants} from './query.mjs';
const [folder]=process.argv.slice(2);if(!folder)throw Error('Expected regional build folder');
const index=JSON.parse(fs.readFileSync(path.join(folder,'variants/index.json'),'utf8'));
const snapshot=JSON.parse(fs.readFileSync(path.join(folder,'saved-navigation-state.json'),'utf8'));
const saved=Object.fromEntries(index.actors.filter(a=>a.savedField).map(a=>[a.id,snapshot.actors[a.id]?.[a.savedField]]));
const scenario=JSON.parse(fs.readFileSync(new URL('../authoring/offline-route-001-exploration-state.json',import.meta.url),'utf8'));
const exploration={...saved,...Object.fromEntries(Object.entries(scenario.actors).map(([id,row])=>[id,row.Passable]))};
await initialize();const rows=[];
for(const [name,states]of Object.entries({unknown:{},saved,exploration})){
 const selected=selectVariants(index,states),entries=selected.tiles.map(t=>({...t,data:t.blob===null?null:fs.readFileSync(path.join(folder,'variants',t.blob+'.bin'))}));
 const bytes=assembleNavSet(decodeBase64(index.navHeaderBase64),entries),planner=new Planner(bytes,index);
 try{
  const result=planner.route([-174688.995,112340.126,-3034.172],[-187916,114639,-1057]);
  rows.push({name,complete:result.complete,reason:result.reason,unknownActors:selected.unknownActors,corners:result.corners.length,points:result.points.length,meters:result.meters});
  fs.writeFileSync(path.join(folder,'route-variants-'+name+'.json'),JSON.stringify(result));
  // No save values or save identifiers enter packaged data. This file stays local.
  if(name==='exploration'){
   fs.writeFileSync(path.join(folder,'region-variants.navbin'),bytes);
   const crypto=await import('node:crypto');fs.writeFileSync(path.join(folder,'region-variants.navbin.json'),JSON.stringify({...index,blobs:undefined,tiles:undefined,actors:undefined,navSHA256:crypto.createHash('sha256').update(bytes).digest('hex')}));
  }
 }finally{planner.destroy();}
}
fs.writeFileSync(path.join(folder,'variant-validation.json'),JSON.stringify({schema:1,scope:'First walking region; exploration explicitly assumes the recorded fog door is passable',collisionSHA256:index.sourceCollisionSHA256,rows},null,2));
console.log(rows.map(r=>`${r.name}: ${r.complete?'complete':'partial'}; ${r.corners} corners; ${r.reason}`).join('\n'));
if(rows.find(r=>r.name==='unknown').complete||!rows.find(r=>r.name==='exploration').complete)throw Error('Conditional region regression');
