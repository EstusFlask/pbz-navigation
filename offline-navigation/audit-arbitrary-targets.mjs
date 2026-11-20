// Compare the shipped provider against coordinates from the installed-format
// navigation index. This measures planning inputs, not live scene feasibility.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const [stage,outputFile,providerDirectory=stage]=process.argv.slice(2);
if(!stage||!outputFile)throw Error('Expected a Mod scripts directory and private output file');
const output=path.resolve(outputFile);
if(!output.startsWith(path.resolve('build')+path.sep))throw Error('Private output must stay under build/');
const scripts=path.resolve(stage),source=path.resolve(providerDirectory),data=path.join(scripts,'PBZRecastWorlds');
const load=file=>fs.readFileSync(file,'utf8'),json=file=>JSON.parse(load(file));
const sha=value=>createHash('sha256').update(value).digest('hex');
const catalog=json(path.join(data,'catalog.json'));
const context=vm.createContext({module:{exports:{}},WebAssembly:undefined,console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(load(path.join(scripts,'PBZRecastRuntime.js')),context);
const core=context.module.exports;
await core.initialize();
const {WorldCache}=require(path.join(source,'PBZRouteRecastProvider'));
const asPoint=([x,y,z])=>({x,y,z}),asArray=({x,y,z})=>[x,y,z];
const distance=(a,b)=>Math.hypot(...a.map((value,i)=>value-b[i]));
const drain=job=>{
 let step,count=0,maxMs=0;
 do{
  const start=performance.now();
  step=job.next();
  maxMs=Math.max(maxMs,performance.now()-start);
  if(++count>500000){job.return();throw Error('Diagnostic step limit reached');}
 }while(!step.done);
 return {value:step.value,count,maxMs};
};
const rank=(label,id)=>sha(label+'/'+id);
const rows=[],sampleCounts=[];
for(const [world,descriptor] of Object.entries(catalog.worlds)){
 const folder=path.join(data,world),index=json(path.join(data,descriptor.index));
 const pages=core.createWorld(index,file=>load(path.join(folder,file)),{maxTiles:256,maxBytes:32*1024*1024,maxPages:8,maxNodes:65535});
 const events=[];
 const cache=new WorldCache(()=>core,{dataRoot:data,readText:load},(name,value)=>events.push({name,value}),()=>{},Date.now);
 Object.assign(cache,{world,index,pages,core,ready:true,catalogue:catalog,states:{}});
 // The only substitution when testing current source is the stage's action
 // modules. Their world, grid and data digest still have to match.
 if(source!==scripts){
  const overlay=require(path.join(scripts,'PBZRouteActionCorridors',world)).data;
  cache.actionHints=()=>overlay.world===world&&overlay.schema===1&&overlay.sourceIndexSHA256===index.sourceIndexSHA256&&
   (!overlay.navigationGrid||overlay.navigationGrid===pages.currentID)?overlay.rows:[];
 }
 function query(kind,start,goal,grid,extra={}){
  events.length=0;
  try{
   const result=drain(cache.route(world,asPoint(start),asPoint(goal),{localActions:true}));
   const leg=result.value,end=leg?.points.at(-1);
   const row={world,grid,kind,start,goal,...extra,complete:!!leg&&!leg.partial,
    endpointErrorCm:end?distance(asArray(end),goal):null,partial:!!leg?.partial,
    hints:cache.actionCorridorActions(),resident:events.some(e=>e.name==='recast resident movement corridor'),
    steps:result.count,maxStepMs:+result.maxMs.toFixed(3),
    errors:events.filter(e=>e.name.includes('unavailable'))};
   rows.push(row);return row;
  }catch(error){
   const row={world,grid,kind,start,goal,...extra,complete:false,error:String(error)};
   rows.push(row);return row;
  }
 }
 try{
  for(const grid of index.grids||[{id:'main'}]){
   const paged=grid.index?pages.ensure(grid):pages,graph=paged.corridors,manifest=paged.manifest;
   const label=world+'/'+grid.id;
   const selected=point=>!grid.index||pages.select(point).id===grid.id;
   let walking=0,placed=0;
   // Sample across coarse pages and multiple spans. Only actual walking
   // adjacency supplies the pairs, with no use of the 47 endpoint tables.
   for(let attempt=0;attempt<48&&walking<6;attempt++){
    const id=parseInt(rank(label+'/walking',attempt).slice(0,8),16)%manifest.corridors.nodes;
    let node=drain(graph.node(id)).value,current=id;
    const [x,y,layer,...start]=node.slice(0,6);
    if(!selected(start))continue;
    const seen=new Set([id]);let goal=start;
    for(let step=0;step<5;step++){
     const next=node[6].find(i=>!seen.has(i));if(next===undefined)break;
     const candidate=drain(graph.node(next)).value;
     if(!selected(candidate.slice(3,6)))break;
     seen.add(next);current=next;node=candidate;goal=node.slice(3,6);
     if(distance(start,goal)>5500)break;
    }
    if(current===id||distance(start,goal)<400)continue;
    query('walking',start,goal,grid.id,{from:id,to:current,tile:[x,y,layer],hops:seen.size-1});
    walking++;
   }
   cache.states=Object.fromEntries(index.actors.map(actor=>[actor.id,true]));
   const hints=cache.actionHints(world).filter(row=>row.from!==row.to&&row.entry&&row.exit&&distance(row.entry,row.exit)>200&&
    distance(row.entry,row.exit)<5500&&selected(row.entry)&&selected(row.exit));
   hints.sort((a,b)=>rank(label,a.guid+'/'+a.from).localeCompare(rank(label,b.guid+'/'+b.from)));
   const seenKinds=new Set();
   for(const hint of hints){
    if(placed>=6)break;
    if(seenKinds.has(hint.kind))continue;
    const row=query('placed action',hint.entry,hint.exit,grid.id,{from:hint.from,to:hint.to,actor:hint.guid,actionKind:hint.kind});
    if(row.complete)continue;
    seenKinds.add(hint.kind);placed++;
   }
   cache.states={};
   sampleCounts.push({world,grid:grid.id,walking,placed});
   console.log(JSON.stringify(sampleCounts.at(-1)));
  }
 }finally{cache.cancel();cache.clearMovementCorridors();pages.destroy();}
}
const summary={
 schema:1,scope:'Deterministic cooked mesh walking controls with default conditions and separate optimistic action-window controls. Live physics and mechanisms require separate validation.',
 providerSHA256:sha(load(path.join(source,'PBZRouteRecastProvider.js'))),runtimeSHA256:sha(load(path.join(scripts,'PBZRecastRuntime.js'))),
 catalogSHA256:sha(load(path.join(data,'catalog.json'))),sampleCounts,rows
};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(summary,null,2));
