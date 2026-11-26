// Compare real Detour queries in the plain-JS runtime with code generation off.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const [sourceRoot,subsetRoot,anchorsFile,output]=process.argv.slice(2);
const mod=path.resolve('Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const context=vm.createContext({module:{exports:{}},WebAssembly:undefined,console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(fs.readFileSync(path.join(mod,'PBZRecastRuntime.js'),'utf8'),context);
const core=context.module.exports;await core.initialize();
const read=file=>JSON.parse(fs.readFileSync(file)),drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
const anchors=read(anchorsFile).records.filter(r=>!r.unresolved),receipt=read(subsetRoot+'.receipt.json'),results=[];
for(const record of receipt.records.filter(r=>r.bells>1)){
 const {world,grid}=record,folder=grid?'grids/'+grid:'',local=anchors.filter(a=>a.world===world&&a.grid===grid),byID=new Map(local.map(a=>[a.id,a]));
 const owners=[sourceRoot,path.join(subsetRoot,'worlds')].map(root=>{
  const base=path.join(root,world,folder),manifest=read(path.join(base,'index.json'));
  return core.createWorld(manifest,file=>fs.readFileSync(path.join(base,file),'utf8'),{maxTiles:256,maxBytes:32*1024*1024,maxPages:8,maxNodes:65535});
 });
 try{
  const pairs=record.pairs.filter(p=>p.reachable).sort((a,b)=>{
   const length=p=>Math.hypot(...byID.get(p.source).p.map((v,i)=>v-byID.get(p.target).p[i]));return length(a)-length(b);
  });
  let witnessed=0;
  for(const pair of pairs.slice(0,24)){
   const start=byID.get(pair.source).p,goal=byID.get(pair.target).p;
   for(const mode of ['unknown-closed','optimistic-query-hints']){
    const states=mode==='unknown-closed'?{}:Object.fromEntries(owners[0].manifest.actors.map(a=>[a.id,true]));
    let original;
    try{original=drain(owners[0].routeJob(start,goal,states,{heightPaddingCm:1500}));}catch(error){if(String(error).match(/budget|capacity/))continue;throw error;}
    if(!original.complete)continue;
    const subset=drain(owners[1].routeJob(start,goal,states,{heightPaddingCm:1500}));
    assert.equal(subset.complete,true,world+' lost complete walking control '+pair.source+' → '+pair.target);
    assert(subset.points.length>1);assert.equal(subset.physicalVerified,false);
    results.push({world,grid,source:pair.source,target:pair.target,mode,sourceMeters:original.meters,subsetMeters:subset.meters,passed:true});witnessed++;
   }
   if(witnessed>=2)break;
  }
  assert(witnessed>0,'No complete original walking control found for '+world);
  console.log('BELL DETOUR CONTROL',world,grid,witnessed);
 }finally{for(const owner of owners)owner.destroy();}
}
assert(results.length>=8);
fs.writeFileSync(output,JSON.stringify({runtime:'plain JavaScript; WebAssembly absent; string/wasm generation disabled',scope:'Original-versus-subset Detour walking controls; no live collision, native action or game acceptance',results,physicalVerified:false},null,2));
