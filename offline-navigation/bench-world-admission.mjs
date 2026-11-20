// Exact Detour byte admission comparison; source collision and voxel sizes
// are held constant. --jitless is stress only, not a game-flag assertion.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
const [source,probe,out]=process.argv.slice(2);if(!out)throw Error('Expected original world, retiled probe and private report');
const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(new URL('../build/offline-navigation/runtime/PBZRecastRuntime.js',import.meta.url),'utf8'),context);const core=context.module.exports;await core.initialize();
const control=JSON.parse(fs.readFileSync(path.join(probe,'probe.json'),'utf8')),bounds=control.boundsUE.map((v,i)=>v+(i<2?1:-1));const rows=[];
let samples=[];const original=core.Planner.prototype.replaceTile;
core.Planner.prototype.replaceTile=function(slot,b){const at=performance.now();try{return original.call(this,slot,b);}finally{if(b){const v=new DataView(b.buffer,b.byteOffset,b.byteLength);samples.push({tile:[v.getInt32(8,true),v.getInt32(12,true),v.getInt32(16,true)],polygons:v.getInt32(24,true),bytes:b.length,ms:performance.now()-at});}}};
for(const folder of [source,probe]){
 const index=JSON.parse(fs.readFileSync(path.join(folder,'navigation-index.json'),'utf8')),buffers=new Map();
 const size=index.extentCm,selected=index.tiles.filter(t=>t.x*size<=bounds[2]&&(t.x+1)*size>=bounds[0]&&-t.y*size>=bounds[1]&&-(t.y+1)*size<=bounds[3]&&t.verticalBoundsUE[0]<=24000&&t.verticalBoundsUE[1]>=-20000);
 index.tiles=selected;const states=Object.fromEntries(index.actors.map(a=>[a.id,true]));
 for(const t of selected){const id=t.variants['0'.repeat(t.conditions.length)];if(!id||buffers.has(id))continue;const b=fs.readFileSync(path.join(folder,index.blobs[id].file));if(crypto.createHash('sha256').update(b).digest('hex')!==id)throw Error('Changed input');buffers.set(id,b);}
 for(let run=0;run<3;run++){
  const window=new core.WorldWindow(index,id=>buffers.get(id),{maxNodes:65535});samples=[];let row,maxStepMs=0,steps=0;
  try{const job=window.loadWindowJob(bounds,states,[-20000,24000]);do{const at=performance.now();row=job.next();maxStepMs=Math.max(maxStepMs,performance.now()-at);steps++;}while(!row.done);
   rows.push({tileCells:index.tileCells,cellCm:index.cellCm,run,tiles:window.loaded.size,steps,maxStepMs,maxInsertMs:Math.max(...samples.map(s=>s.ms)),slowest:[...samples].sort((a,b)=>b.ms-a.ms).slice(0,3)});
  }finally{window.destroy();}
 }
}
const report={schema:1,nodeFlags:process.execArgv,scope:'preloaded bytes; excludes disk/base64; no game acceptance',bounds,rows};fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
