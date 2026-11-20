import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import * as query from './query.mjs';import * as worldSet from './world-set.mjs';import {PackedStore} from './packed-storage.mjs';import {bindActionCollisionEvidence,checkedFeature} from './action-collision-evidence.mjs';import {checkedFrontierJob} from './checked-frontier.mjs';
const require=createRequire(import.meta.url),data=path.resolve(process.argv[2]),caseFile=path.resolve(process.argv[3]),oracleFile=path.resolve(process.argv[4]),output=path.resolve(process.argv[5]),mod=path.resolve('Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute'),need=(value,message)=>{if(!value)throw Error(message);},sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
need(output.startsWith(path.resolve('build')+path.sep)&&!fs.existsSync(output),'Fresh private frontier output required');
const selectionLimit=process.argv[6]===undefined?null:Number(process.argv[6]);
need(selectionLimit===null||Number.isSafeInteger(selectionLimit)&&selectionLimit>=1&&selectionLimit<=4096,'Frontier batch must contain 1 to 4096 source features');
const side=process.argv[8]||'start';
need(side==='start'||side==='goal','Invalid checked frontier side');
const selectionOptions={...(selectionLimit===null?{perPair:8,maxFeatures:128}:{perPair:selectionLimit,maxFeatures:selectionLimit}),...(side==='goal'?{side}:{})};
const sourceBytes=fs.readFileSync(caseFile),source=JSON.parse(sourceBytes),oracle=JSON.parse(fs.readFileSync(oracleFile)),world=source.world,index=JSON.parse(fs.readFileSync(path.join(data,world,'index.json'))),core={...query,...worldSet,PackedStore},start=source.standingStart,goal=source.standingGoal,array=point=>[point.x,point.y,point.z],distance=(first,last)=>Math.hypot(...first.map((value,axis)=>value-last[axis]));
need(source.sourceIndexSHA256===index.sourceIndexSHA256,'Frontier source belongs to another navigation build');
const evidence=bindActionCollisionEvidence(sourceBytes,oracle,{number:source.number,world,sourceIndexSHA256:index.sourceIndexSHA256,start,goal,policy:source.policy}),known=new Set(oracle.rows.map(row=>row.guid)),drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
await core.initialize();
const {WorldCache}=require(path.join(mod,'PBZRouteRecastProvider'));
const movementCorridorsRoot=process.argv[7]?path.resolve(process.argv[7]):undefined;
if(movementCorridorsRoot){
 const summary=JSON.parse(fs.readFileSync(path.join(path.dirname(caseFile),'summary.json'))),manifest=path.join(movementCorridorsRoot,world,'index.json');
 need(sha(manifest)===summary.worldManifestSHA256?.[world]?.movementCorridors,'Frontier movement corridor source differs');
 need(sha(path.join(mod,'PBZRouteRecastProvider.js'))===summary.providerSHA256,'Frontier provider source differs');
}
const reportProvider=(name,value)=>{if(movementCorridorsRoot&&name.includes('unavailable'))throw Error(name+': '+value);};
const cache=new WorldCache(()=>core,{dataRoot:data,movementCorridorsRoot,readText:file=>fs.readFileSync(file,'utf8')},reportProvider,()=>{},()=>0);
Object.assign(cache,{world,ready:true,index,catalogue:JSON.parse(fs.readFileSync(path.join(data,'catalog.json'))),states:Object.fromEntries(index.actors.map(row=>[row.id,true])),pages:core.createWorld(index,file=>fs.readFileSync(path.join(data,world,file),'utf8'),{maxNodes:65535})});
try{
 const placed=require(path.join(mod,'PBZRoutePlacedPassages')).forWorld(world),straight=distance(array(start),array(goal)),seeds=placed.filter(feature=>Math.min(...feature.path.map(point=>distance(array(start),point)+distance(array(goal),feature.path.at(-1))))<straight+6000).slice(0,32).flatMap(feature=>[feature.path[0],feature.path.at(-1)].map(point=>({x:point[0],y:point[1],z:point[2]})));
 drain(cache.route(world,start,goal,{localActions:true,motionSeeds:seeds,heightPaddingCm:150}));
 const prepared=source.movementFeatures.map(feature=>{const checked=known.has(feature.guid)?checkedFeature(feature,evidence):null,row=checked||feature;return{...row,topologyClosed:!!row.topologyClosed||known.has(feature.guid)&&!checked,path:row.standingEntry?[array(row.standingEntry),array(row.standingExit)]:row.path};});
 const topology=drain(cache.actionTopology(world,start,goal,prepared));need(topology,'Frontier topology unavailable');const edges=[];
 for(let featureIndex=0;featureIndex<prepared.length;featureIndex++){
  const feature=prepared[featureIndex],first=topology.component(feature.path[0]),last=topology.component(feature.path.at(-1));if(first===undefined||last===undefined||first===last||feature.topologyClosed)continue;
  for(const [from,to,entry,exit,reverse]of feature.both?[[first,last,feature.path[0],feature.path.at(-1),false],[last,first,feature.path.at(-1),feature.path[0],true]]:[[first,last,feature.path[0],feature.path.at(-1),false]])edges.push({guid:feature.guid,index:featureIndex,kind:feature.kind,from,to,entry,exit,reverse,score:distance(array(start),entry)+distance(entry,exit)+distance(exit,array(goal)),checked:known.has(feature.guid)});
 }
 const result=drain(checkedFrontierJob(edges,topology.component(array(start)),topology.component(array(goal)),selectionOptions)),report={schema:1,number:source.number,world,sourceIndexSHA256:index.sourceIndexSHA256,sourceCaseSHA256:sha(caseFile),oracleSHA256:sha(oracleFile),sourceScriptsSHA256:Object.fromEntries(['inspect-checked-frontier.mjs','checked-frontier.mjs','movement-links.mjs','action-collision-evidence.mjs'].map(file=>[file,sha(new URL(file,import.meta.url))])),scope:'Source feature IDs only; fewest unchecked steps is a diagnostic priority, not a physical or native/game certificate',selectionOptions,checked:known.size,checkedTargetReachable:result.forward.has(topology.component(array(goal))),forwardComponents:result.forward.size,backwardComponents:result.backward.size,frontier:result.frontier.length,criticalFrontier:result.critical.length,minimumUncheckedSteps:result.minimumUncheckedSteps,selected:result.selected,guids:[...new Set([...known,...source.movementFeatures.filter(feature=>feature.source!=='recast-boundary').map(feature=>feature.guid),...result.selected.map(edge=>edge.guid)])]};
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,selected:report.selected.length,guids:report.guids.length}));
}finally{cache.cancel();cache.pages.destroy();}
