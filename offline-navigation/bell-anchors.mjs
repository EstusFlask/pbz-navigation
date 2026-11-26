// Resolve bell endpoints against the existing cooked Detour polygons. No trails.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {initialize} from './query.mjs';
import {createWorld} from './world-set.mjs';
const require=createRequire(import.meta.url);
const [input,output]=process.argv.slice(2),root=path.resolve(input),dest=path.resolve(output);
if(!dest.startsWith(path.resolve('build')+path.sep)||fs.existsSync(dest))throw Error('Fresh private anchor output required');
const tables=require('../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteTables').data;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))),records=[],sources={};
const drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
await initialize();
for(const [world,entry]of Object.entries(catalog.worlds)){
 const folder=path.join(root,world),manifest=JSON.parse(fs.readFileSync(path.join(root,entry.index)));
 sources[world]=hash(path.join(root,entry.index));
 const owner=createWorld(manifest,file=>fs.readFileSync(path.join(folder,file),'utf8'),{maxTiles:256,maxBytes:32*1024*1024,maxPages:8,maxNodes:65535});
 const states=Object.fromEntries(manifest.actors.map(a=>[a.id,true])); // Extraction hints only; never shipped as actor truth.
 try{
  for(const bell of Object.values(tables.bells).filter(b=>b.world===world&&!/^brokenbell/i.test(b.id))){
   let resolved=null;
   const offsets=[[0,0,0],[0,0,-50],[0,0,-100],...[0,1,2,3,4,5,6,7].map(i=>[Math.cos(i*Math.PI/4)*120,Math.sin(i*Math.PI/4)*120,-50])];
   for(const offset of offsets){
    const p=bell.at.map((v,i)=>v+offset[i]);
    const grid=manifest.kind==='multi-grid-world'?owner.ensure(owner.select(p)):owner;
    try{
     const starts=drain(grid.corridors.anchors(p,states,false));
     const goals=drain(grid.corridors.anchors(p,states,true));
     if(starts.length&&goals.length){resolved={id:bell.id,name:bell.name,world,grid:owner.currentID??null,p,bell:bell.at,start:starts[0],goal:goals[0]};break;}
    }catch(error){if(!String(error).match(/budget|capacity/))throw error;}
   }
   records.push(resolved??{id:bell.id,world,bell:bell.at,unresolved:true});
   console.log('BELL ANCHOR',world,bell.id,resolved?resolved.start.id:'unresolved');
  }
 }finally{owner.destroy();}
}
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,JSON.stringify({schema:1,source:'cooked-navigation-bell-projections',sourceCatalogSHA256:hash(path.join(root,'catalog.json')),sources,records,physicalVerified:false},null,2));
