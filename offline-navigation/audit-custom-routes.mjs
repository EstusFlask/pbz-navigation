// Exact user-defined endpoints; real provider/core and bounded scheduler.
// Clear physics/all conditions open are topology controls, not game acceptance.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import vm from 'node:vm';import{createRequire}from'node:module';
import{bindActionCollisionEvidence,checkedFeature}from'./action-collision-evidence.mjs';
import{collectDeferredEvidence}from'./movement-evidence.mjs';
const require=createRequire(import.meta.url),root=process.cwd(),mod=path.join(root,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const rawArgs=process.argv.slice(2),collectDeferred=rawArgs.includes('--collect-deferred-evidence');
const flowBarrierMode=rawArgs.includes('--close-live-flow-barriers')?'closed':'optimistic';
const flowScope=flowBarrierMode==='closed'?'; live-only flow barriers closed':'';
const liveFlowBarrier=actor=>actor.savedField===null&&actor.rule.startsWith('flow-');
const corridorOverrides=rawArgs.filter(value=>value.startsWith('--movement-corridors='));
const actionOverrides=rawArgs.filter(value=>value.startsWith('--action-hints='));
if(actionOverrides.length>1)throw Error('Expected at most one placed action overlay override');
const actionRoot=actionOverrides.length?path.resolve(actionOverrides[0].slice('--action-hints='.length)):path.join(mod,'PBZRouteActionCorridors');
if(actionOverrides.length&&!actionRoot.startsWith(path.resolve('build')+path.sep))throw Error('Private placed action overlay required');
if(corridorOverrides.length>1)throw Error('Expected at most one movement corridor override');
const args=rawArgs.filter(value=>value!=='--collect-deferred-evidence'&&value!=='--close-live-flow-barriers'&&!corridorOverrides.includes(value)&&!actionOverrides.includes(value));
const data=path.resolve(args[0]||'build/offline-navigation/mod-worlds-deflate-1101'),out=path.resolve(args[1]||'build/custom-route-audit-1110'),mode=args[2]||'wasm',chosen=args[3],movementDataRoot=args[11]?path.resolve(args[11]):path.join(mod,'PBZRouteMovementData');
const movementCorridorsRoot=corridorOverrides.length?path.resolve(corridorOverrides[0].slice('--movement-corridors='.length)):path.join(mod,'PBZRouteMovementCorridors');
if(corridorOverrides.length&&(!args[11]||!movementCorridorsRoot.startsWith(path.resolve('build')+path.sep)))throw Error('Private movement corridors require a matching private movement field');
fs.mkdirSync(out,{recursive:true});
function* appendCandidateRows(target,rows){let count=0;for(const row of rows){target.push(row);if((++count&63)===0)yield;}return target;}
if(args[11]&&!movementDataRoot.startsWith(path.resolve('build')+path.sep))throw Error('Private movement data override required');
const collisionDirectory=args[13]?path.resolve(args[13]):null;
const checkedOnly=args[14]==='checked-only';
if(checkedOnly&&!collisionDirectory)throw Error('Checked-only replay requires independent collision evidence');
const hashFile=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const scriptSHA256=Object.fromEntries(['PBZRecastRuntime.js','PBZRouteRecastProvider.js','PBZRouteRecastApproach.js','PBZRouteMovementIndex.js','PBZRouteMovementStore.js','PBZRouteMovementCorridors.js','PBZRouteTransitions.js','PBZRoutePassages.js','PBZRouteLandingLimits.js','PBZRouteWallrunRelays.js','PBZRouteSlideRelay.js','PBZRouteDrops.js','PBZRouteJobs.js','PBZQuestRoute.js'].map(file=>[file,hashFile(path.join(mod,file))]));
const auditScriptSHA256=hashFile(new URL(import.meta.url)),worldManifestSHA256={};
if(collisionDirectory&&(!collisionDirectory.startsWith(path.resolve('build')+path.sep)||collisionDirectory===out))throw Error('Separate private source collision evidence required');
const tables=require(path.join(mod,'PBZRouteTables')).data,tasks=require(path.join(mod,'PBZRouteSurveyTasks')).resolve(tables),{WorldCache}=require(path.join(mod,'PBZRouteRecastProvider')),{Planner:Jobs}=require(path.join(mod,'PBZRouteJobs')),Transitions=require(path.join(mod,'PBZRouteTransitions')),Drops=require(path.join(mod,'PBZRouteDrops'));
let core;if(mode==='js'){const ctx=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});vm.runInContext(fs.readFileSync(path.join(mod,'PBZRecastRuntime.js'),'utf8'),ctx);core=ctx.module.exports;}else core={...await import('./query.mjs'),...await import('./world-set.mjs'),...await import('./packed-storage.mjs')};await core.initialize();
const point=p=>({x:p[0],y:p[1],z:p[2]}),array=p=>[p.x,p.y,p.z],distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),policy=args[6]?JSON.parse(fs.readFileSync(path.resolve(args[6]))):{maxHeightCm:1109,maxRunCm:934,gravityCm:2156,speedCm:750,jumpVelocityCm:420,canJump:true};
function actionGraphSummary(topology,features,start,goal){
 if(!topology)return null;
 const source=topology.component(array(start)),target=topology.component(array(goal)),outgoing=new Map(),incoming=new Map(),froms=new Int32Array(features.length),tos=new Int32Array(features.length),unclassifiedSamples=[];froms.fill(-1);tos.fill(-1);let classified=0,unclassified=0,same=0,closed=0;
 const add=(a,b)=>{if(!outgoing.has(a))outgoing.set(a,[]);if(!incoming.has(b))incoming.set(b,[]);outgoing.get(a).push(b);incoming.get(b).push(a);};
 for(let i=0;i<features.length;i++){const feature=features[i],entry=feature.standingEntry?array(feature.standingEntry):feature.path[0],exit=feature.standingExit?array(feature.standingExit):feature.path.at(-1),from=topology.component(entry),to=topology.component(exit);if(from===undefined||to===undefined){unclassified++;if(unclassifiedSamples.length<20)unclassifiedSamples.push({guid:feature.guid,kind:feature.kind,source:feature.source,entry,exit});continue;}froms[i]=from;tos[i]=to;if(from===to){same++;continue;}if(feature.topologyClosed){closed++;continue;}classified++;add(from,to);if(feature.both)add(to,from);}
 const visit=(seed,edges)=>{const seen=new Set(seed===undefined?[]:[seed]),queue=[...seen];for(let i=0;i<queue.length;i++)for(const next of edges.get(queue[i])||[])if(!seen.has(next)){seen.add(next);queue.push(next);}return seen;};
 const forward=visit(source,outgoing),backward=visit(target,incoming),forwardKinds={},backwardKinds={},reverseFrontierKinds={},reverseFrontierSamples=[],surfaceOutgoing=new Map([...outgoing].map(([node,edges])=>[node,edges.slice()])),geometryOutgoing=new Map([...outgoing].map(([node,edges])=>[node,edges.slice()]));let directBridgeEdges=0,reverseFrontierEdges=0,surfaceReverseEdges=0,geometryReverseEdges=0;
 for(let i=0;i<features.length;i++){const from=froms[i],to=tos[i];if(from<0||to<0||from===to||features[i].topologyClosed)continue;const feature=features[i],kind=feature.source+'/'+feature.kind;
  if(forward.has(from))forwardKinds[kind]=(forwardKinds[kind]||0)+1;
  if(backward.has(to))backwardKinds[kind]=(backwardKinds[kind]||0)+1;
  if(forward.has(from)&&backward.has(to))directBridgeEdges++;
  if(backward.has(from)&&forward.has(to)){reverseFrontierEdges++;reverseFrontierKinds[kind]=(reverseFrontierKinds[kind]||0)+1;if(reverseFrontierSamples.length<24)reverseFrontierSamples.push({guid:feature.guid,kind:feature.kind,source:feature.source,from,to,entry:feature.standingEntry?array(feature.standingEntry):feature.path[0],exit:feature.standingExit?array(feature.standingExit):feature.path.at(-1),deltaZ:(feature.standingEntry?feature.standingEntry.z:feature.path[0][2])-(feature.standingExit?feature.standingExit.z:feature.path.at(-1)[2])});}
  if(feature.source==='recast-boundary'&&!feature.both){if(!geometryOutgoing.has(to))geometryOutgoing.set(to,[]);geometryOutgoing.get(to).push(from);geometryReverseEdges++;}
  if(feature.kind==='surface'&&!feature.both){if(!surfaceOutgoing.has(to))surfaceOutgoing.set(to,[]);surfaceOutgoing.get(to).push(from);surfaceReverseEdges++;}
 }
 const surfaceReachable=visit(source,surfaceOutgoing),geometryReachable=visit(source,geometryOutgoing);
 return{source:source??null,target:target??null,classifiedEdges:classified,unclassifiedEdges:unclassified,unclassifiedSamples,sameComponentEdges:same,closedCrossComponentEdges:closed,sourceOutDegree:outgoing.get(source)?.length||0,targetInDegree:incoming.get(target)?.length||0,forwardComponents:forward.size,backwardComponents:backward.size,targetReachable:target!==undefined&&forward.has(target),startCanReachGoal:source!==undefined&&backward.has(source),directBridgeEdges,reverseFrontierEdges,reverseFrontierKinds,reverseFrontierSamples,surfaceReverseEdges,surfaceBidirectionalTargetReachable:target!==undefined&&surfaceReachable.has(target),geometryReverseEdges,allRecastGeometryBidirectionalTargetReachable:target!==undefined&&geometryReachable.has(target),forwardKinds,backwardKinds};
}
if(![policy.maxHeightCm,policy.maxRunCm,policy.gravityCm,policy.speedCm,policy.jumpVelocityCm].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid explicit audit movement capabilities');
policy.maxRiseCm=policy.canJump?Math.max(0,policy.jumpVelocityCm**2/(2*policy.gravityCm)-20):0;
const endpointMode=args[7]||'standing',runtimeEndpoints=endpointMode==='runtime-endpoints',standingFile=args[4]?path.resolve(args[4]):null,standing=standingFile?new Map(JSON.parse(fs.readFileSync(standingFile)).rows.map(r=>[r.world+'/'+r.endpoint.id,r])):null;
const catalogue=JSON.parse(fs.readFileSync(path.join(data,'catalog.json'))),results=[];
for(const task of tasks.filter(c=>!chosen||chosen.split(',').includes(String(c.number))||chosen.split(',').includes(c.id))){
 const world=task.world,rawStart=task.start.p,rawGoal=task.end.p,startPads=standing?.get(world+'/'+task.start.id)?.pads,goalPads=standing?.get(world+'/'+task.end.id)?.pads,start=startPads?.find(r=>r.radius<=200)?point(startPads.find(r=>r.radius<=200).p):rawStart,goal=runtimeEndpoints||endpointMode==='raw-goal'?rawGoal:goalPads?.find(r=>r.radius<=200)?point(goalPads.find(r=>r.radius<=200).p):rawGoal,index=JSON.parse(fs.readFileSync(path.join(data,world,'index.json'))),events=[];let wall=0,active=null,result,metrics,phase='start',walking,features=[],topology,checkedGraph,endpointApproach,endpointCandidateCounts;
 if(!worldManifestSHA256[world]){
  const movementManifest=path.join(movementDataRoot,world,'index.js');
  const movementCorridors=path.join(movementCorridorsRoot,world,'index.json');
  if(corridorOverrides.length&&JSON.parse(fs.readFileSync(movementCorridors)).movementManifestSHA256!==hashFile(movementManifest))throw Error('Private movement corridor and field differ');
  worldManifestSHA256[world]={navigation:hashFile(path.join(data,world,'index.json')),movement:fs.existsSync(movementManifest)?hashFile(movementManifest):null,movementCorridors:fs.existsSync(movementCorridors)?hashFile(movementCorridors):null,actions:hashFile(path.join(actionRoot,world+'.js'))};
 }
 const endpointGoals=runtimeEndpoints&&goalPads?.length?goalPads.filter(row=>row.radius<=200).map(row=>point(row.p)).filter(p=>Math.hypot(p.x-rawGoal.x,p.y-rawGoal.y)<=190&&Math.abs(p.z-rawGoal.z)<=110):[goal],topologyGoal=endpointGoals[0]||goal;
 const clock=()=>wall+(active===null?0:performance.now()-active),report=(name,value)=>{events.push({name,value});if(name==='recast world query unavailable')phase='provider error';};
 const caseName=task.number.toString().padStart(2,'0')+'-'+task.id+'.json',collisionEvidence=collisionDirectory?bindActionCollisionEvidence(fs.readFileSync(path.join(collisionDirectory,caseName)),JSON.parse(fs.readFileSync(path.join(collisionDirectory,task.number.toString().padStart(2,'0')+'-action-oracle.json'))),{number:task.number,world,sourceIndexSHA256:index.sourceIndexSHA256,start,goal,policy}):null;
 let collisionConnectors=0;const collisionUnassessed=new Set();
 const allPlaced=require(path.join(mod,'PBZRoutePlacedPassages')).forWorld(world),straight=distance(start,goal),seedRank=f=>Math.min(...f.path.map(p=>distance(start,point(p))+distance(goal,point(f.path.at(-1))))),actionRank=f=>Math.min(distance(start,point(f.path[0]))+distance(goal,point(f.path.at(-1))),f.both?distance(start,point(f.path.at(-1)))+distance(goal,point(f.path[0])):Infinity);
 let placed=allPlaced.filter(f=>actionRank(f)<Math.max(26000,straight+6000));const seeds=allPlaced.filter(f=>seedRank(f)<straight+6000).slice(0,32).flatMap(f=>[point(f.path[0]),point(f.path.at(-1))]);
 const cache=new WorldCache(()=>core,{dataRoot:data,movementDataRoot,movementCorridorsRoot,movementManifest:args[11]?require(path.join(movementDataRoot,world,'index.js')).data:undefined,readText:f=>fs.readFileSync(f,'utf8')},report,()=>{},clock);Object.assign(cache,{world,ready:true,index,catalogue,states:Object.fromEntries(index.actors.map(a=>[a.id,flowBarrierMode!=='closed'||!liveFlowBarrier(a)])),pages:core.createWorld(index,f=>fs.readFileSync(path.join(data,world,f),'utf8'),{maxNodes:65535})});
 if(actionOverrides.length){
  const overlay=require(path.join(actionRoot,world+'.js')).data;
  if(overlay.schema!==1||overlay.world!==world||overlay.sourceIndexSHA256!==index.sourceIndexSHA256||!Array.isArray(overlay.rows)||overlay.rows.length>1024)
   throw Error('Private placed action overlay differs from the navigation build');
  cache.actionHints=()=>!overlay.navigationGrid||overlay.navigationGrid===cache.pages?.currentID?overlay.rows:[];
 }
 if(args[9]==='all-components')cache.dropCandidates=function*(world,start,goal,seeds,policy){
  const planner=(this.pages.current||this.pages).window.planner,rows=yield* planner.dropCandidatesJob([array(start),...seeds.map(array)],{...policy,maxRiseCm:200,goal:array(goal),allComponents:true,envelopeBands:true});
  report('all component movement control',rows.stats);return yield* require(path.join(mod,'PBZRouteMovementIndex')).boundaryFeatures(rows);
 };
 const profile={};if(args[8]==='profile'){
  const track=(object,key,label)=>{if(!object?.[key])return;const original=object[key];object[key]=function(...values){const task=original.apply(this,values);if(!task?.next)return task;return(function*(){let row;try{do{const began=performance.now();row=task.next();const p=profile[label]||={steps:0,cpu:0,max:0};const ms=performance.now()-began;p.steps++;p.cpu+=ms;p.max=Math.max(p.max,ms);if(!row.done)yield row.value;}while(!row.done);return row.value;}finally{task.return?.();}})();};};
  const active=cache.pages.current||cache.pages;for(const key of ['path','anchors','exactAnchor','node','routeJob'])track(active.corridors,key,'coarse.'+key);for(const key of ['metadataJob','blobJob','directJob'])track(active,key,'pages.'+key);track(active.window,'loadWindowJob','window.load');for(const key of ['routeCandidate','dropCandidates','actionTopology'])track(cache,key,'provider.'+key);track(Transitions,'route','transitions.route');track(Drops,'inspect','drops.inspect');
 }
  const worldMock={r:45,dropPolicy:()=>policy,floorAt:p=>p,standAt:p=>p,step:(a,b)=>({p:b}),airHit:()=>null,blockAt:()=>null},clearSurfaceWalk=function*(a,b){
   const first=worldMock.floorAt(a,true),last=worldMock.floorAt(b,true);if(!first||!last)return null;
   const count=Math.max(1,Math.ceil(distance(a,b)/52)),points=[first];let previous=first;
   for(let i=1;i<=count;i++){yield;const step=worldMock.step(previous,{x:first.x+(last.x-first.x)*i/count,y:first.y+(last.y-first.y)*i/count,z:first.z+(last.z-first.z)*i/count},false);if(!step?.p)return null;points.push(step.p);previous=step.p;}
   return points;
  },scheduler=new Jobs(report,clock);
 try{
  scheduler.request({key:task.id,world,level:world,start,p:goal,revision:0,originRevision:0},searchClock=>(function*(){
    phase='walking';const selectedSeeds=args[10]==='focused-window'?seeds.filter(p=>p.x>=Math.min(start.x,goal.x)-600&&p.x<=Math.max(start.x,goal.x)+600&&p.y>=Math.min(start.y,goal.y)-600&&p.y<=Math.max(start.y,goal.y)+600&&p.z>=Math.min(start.z,goal.z)-1500&&p.z<=Math.max(start.z,goal.z)+1500):seeds;walking=yield* cache.route(world,start,goal,{localActions:true,motionSeeds:selectedSeeds,focusedWindow:args[10]==='focused-window',heightPaddingCm:args[12]==='expanded-height'?1500:150});
   if(walking&&!walking.partial)return{legs:[walking],transfer:null};
    if(runtimeEndpoints){
     for(const target of endpointGoals.slice().sort((a,b)=>distance(start,a)-distance(start,b)).slice(0,8)){const local=yield* cache.routeLocal(world,start,target);if(local&&!local.partial){endpointApproach={source:'goal-local',goal:target};return{legs:[local],transfer:null};}}
     phase='endpoint approach';const bridged=yield* require(path.join(mod,'PBZRouteRecastApproach')).route(cache,world,worldMock,start,goal,endpointGoals,{clock:searchClock,report,onCandidates:counts=>{endpointCandidateCounts=counts;}});if(bridged){endpointApproach={source:'endpoint-bridge',goalCandidates:endpointGoals.length};if(!bridged.partial)return{legs:[bridged],transfer:null};}
    }
   const rejectedDirections=new Map(),assessedGeometry=new Set();
   for(let windowStage=0;windowStage<2;windowStage++){
   if(windowStage){
    if(collisionConnectors>=24||!rejectedDirections.size)break;
    const alternate=yield* cache.routeAlternateMovement(world,start,goal,rejectedDirections);
    if(!alternate)break;
    if(alternate.leg&&!alternate.leg.partial)return{legs:[alternate.leg],transfer:null};
   }
   const corridorActions=cache.actionCorridorActions(),geometryHints=new Set(corridorActions.filter(guid=>guid.startsWith('recast-movement:')));
   for(const guid of corridorActions){if(placed.some(f=>f.guid===guid))continue;const f=require(path.join(mod,'PBZRoutePlacedPassages')).forWorld(world).find(f=>f.guid===guid);if(f){placed.push(f);seeds.push(point(f.path[0]),point(f.path.at(-1)));}yield;}
   phase='movements';features=placed.map(f=>({...f}));
   // Use selected real coarse pads for the topology control. Live planning
   // prepares the same endpoints against both resident native actors.
   for(const relay of require(path.join(mod,'PBZRouteWallrunRelays')).forWorld(world)){
    const hint=cache.actionCorridorPads().get(relay.guid.toLowerCase());
    if(!hint||collisionEvidence)continue;
    const actors=relay.steps.map(step=>allPlaced.find(f=>f.guid===step.guid));
    if(actors.some(f=>!f))throw Error('Wallrun relay actor absent from placements');
    const path=relay.steps.flatMap((step,i)=>step.reverse?actors[i].path.slice().reverse():actors[i].path);
    features.unshift({guid:relay.guid,kind:'wallrun',source:'game-placement',both:false,path,wallrunRelay:relay.steps});
   }
   const slide=require(path.join(mod,'PBZRouteSlideRelay')).forWorld(world),slideHint=slide&&cache.actionCorridorPads().get(slide.guid.toLowerCase());
   if(slideHint&&!collisionEvidence&&cache.states[slide.gate]===true){
    const actors=slide.steps.map(guid=>allPlaced.find(f=>f.guid===guid));
    if(actors.some(f=>!f))throw Error('Slide relay actor absent from placements');
    const path=[...actors.flatMap(f=>f.path),slideHint.exit];
    features.unshift({guid:slide.guid,kind:'slide',source:'game-placement',both:false,path,slideRelay:slide.steps});
   }
   const movementCandidates=yield* cache.dropCandidates(world,start,goal,seeds,policy);
   features.deferredCount=movementCandidates.deferredCount||0;
   yield* appendCandidateRows(features,movementCandidates);
   const rejectedMovementDirections=new Map(windowStage?rejectedDirections:[]);
   for(let movementStage=0;movementStage<2;movementStage++){
   if(collisionEvidence&&collisionConnectors>=24)break;
   if(args[5]==='prepared'){const planner=(cache.pages.current||cache.pages).window.planner;
    for(const f of features)if(f.source!=='recast-boundary'){
     const pads=[],volume=require(path.join(mod,'PBZRouteHookVolume')),hint=cache.actionCorridorPads().get(String(f.guid).toLowerCase());
      for(const [side,raw]of [f.path[0],f.path.at(-1)].entries()){
       const box=side===0&&f.kind==='hook'&&volume.valid(f.entryVolume)?f.entryVolume:null,selected=hint?.[side===0?'entry':'exit'],candidates=box?[...(hint?.entry?[hint.entry]:[]),...volume.samples(box,array(start))]:[...(selected?[selected]:[]),raw];let pad;
      for(const sample of candidates){const p=planner.query.findNearestPoly({x:sample[0]/100,y:sample[2]/100,z:-sample[1]/100},{halfExtents:{x:3.6,y:4.75,z:3.6}});yield;
       if(!p.nearestRef)continue;const q=[p.nearestPoint.x*100,-p.nearestPoint.z*100,p.nearestPoint.y*100];if(box&&!volume.contains(box,q))continue;pad=point(q);break;
      }pads.push(pad||point(raw));
     }[f.standingEntry,f.standingExit]=pads;
    }
   }
   const topologyInputs=[];let checkedWork=0;
   for(const original of features){
    if(checkedOnly&&(++checkedWork&31)===0)yield;
    const f=checkedOnly?checkedFeature(original,collisionEvidence):original;
    if(!f)continue;
    const excluded=f.source==='recast-boundary'?rejectedMovementDirections.get(String(f.guid).toLowerCase())??0:0;
    if((excluded&(f.both?3:1))===(f.both?3:1))continue;
    const runtimePath=f.runtimePath||(f.runtimePath=f.path.map(point)),first=f.standingEntry||runtimePath[0],last=f.standingExit||runtimePath.at(-1),path=f.source==='recast-boundary'&&f.path.length===2&&!f.standingEntry&&!f.standingExit?f.path:[array(first),array(last)];
    topologyInputs.push({guid:f.guid,kind:f.kind,source:f.source,both:f.both,noForward:!!(excluded&1),noReverse:!!(excluded&2),topologyClosed:f.topologyClosed,path,sourceFeature:f});if((topologyInputs.length&31)===0)yield;
   }
    topology=yield* cache.actionTopology(world,start,topologyGoal,topologyInputs,endpointGoals.slice(1),rejectedMovementDirections.size>0);
   if(!topology)return null;
   if(checkedOnly)checkedGraph=actionGraphSummary(topology,topologyInputs.map(f=>f.sourceFeature),start,topologyGoal);
   let stageConnectors=0,addedCollisionExclusion=false;
    phase=collisionEvidence?'actions with independent collision evidence':'actions';const mixed=yield* Transitions.route({name:world,start,goal,goals:runtimeEndpoints?endpointGoals:undefined,features:topology.features,clock:searchClock,lazyActions:true,maxConnectors:collisionEvidence?24-collisionConnectors:24,excludedDirections:rejectedMovementDirections,component:p=>topology.component(array(p)),componentConnectors:topology.componentConnectors,canConnect:(a,b)=>topology.canConnect(array(a),array(b)),canTraverse:()=>true,
    landing:function*(f,p,side){yield;if(collisionEvidence&&!checkedOnly){const check=collisionEvidence.lookup(f);if(check&&geometryHints.has(f.guid))assessedGeometry.add(f.guid);if(!check&&!collisionUnassessed.has(f.guid)){collisionUnassessed.add(f.guid);report('action collision evidence unavailable',{guid:f.guid,kind:f.kind});}const pad=side==='left'?check?.entry:check?.exit;return pad?point(pad):null;}return side==='left'?f.standingEntry||p:f.standingExit||p;},validate:function*(a){
     if(collisionEvidence){const reverse=a.path[0]!==a.feature.runtimePath[0],row=checkedOnly?null:collisionEvidence.lookup(a.feature,reverse),v=checkedOnly?(reverse?a.feature.checkedReverse:a.feature.checkedForward):row?.validation;if(!v){report('movement collision evidence rejected',{guid:a.feature.guid,nativeActionUncertified:row?.nativeActionUncertified,failure:row?.failure});return row?.failure||false;}if(v.nativePadOnly){yield;return true;}for(let i=0;i<v.points.length;i++)yield;return{...v,points:v.points.map(point)};}
      if(a.feature.kind==='surface'){const points=yield* clearSurfaceWalk(a.entry,a.exit);if(points)return{points,walking:true};}
      if(['fall','surface'].includes(a.feature.kind)){const v=yield* Drops.inspect(worldMock,a.entry,a.exit,a.feature.kind==='surface'?'jump':'fall');if(!v.ok)report('movement validation rejected',{guid:a.feature.guid,kind:a.feature.kind,why:v.why,unknown:v.unknown,point:v.p});return v;}return true;},
    walk:function*(a,b){const v=yield* cache.routeLocal(world,a,b);return v&&!v.partial?v:null;},report:(name,value)=>{
     if(['action connector start','action chain accepted','action search exhausted'].includes(name))stageConnectors=Math.max(stageConnectors,value.connectors||value.id||0);
     if(name==='action rejected'&&value.source==='recast-boundary'&&value.knownBlocked){
      const guid=String(value.guid).toLowerCase(),prior=rejectedMovementDirections.get(guid)??0,next=prior|(value.reverse?2:1);
      if(next!==prior){rejectedMovementDirections.set(guid,next);addedCollisionExclusion=true;}
     }
     if(!windowStage&&name==='action rejected'&&assessedGeometry.has(value.guid)){
      rejectedDirections.set(value.guid,(rejectedDirections.get(value.guid)??0)|(value.reverse?2:1));
     }
     report(name,value);
    }});
   if(collisionEvidence)collisionConnectors+=stageConnectors;
   if(mixed)return mixed;
   const extra=movementStage===0?yield* cache.moreMovementCandidates(world,start,goal):[];if(movementStage!==0||(!extra.length&&!addedCollisionExclusion))break;for(let i=0;i<extra.length;i++){features.push(extra[i]);if((i&63)===63)yield;}
   }
   }
   phase='expanded walking';const expanded=yield* cache.walkingAlternative(world,start,goal);if(expanded&&!expanded.partial)return{legs:[expanded],transfer:null};
   if(flowBarrierMode==='closed'){
    const gate=yield* cache.pendingSlideGate(world,start,goal);
    if(gate)report('gate approach topology',gate);
   }
   return null;
  })(),(v,request,stats)=>{result=v;metrics=stats;});
  if(args[8]==='offline-drain'){
   const began=performance.now();let step,steps=0;do{step=scheduler.job.iterator.next();if(++steps>10000000)throw Error('Offline diagnostic step limit exceeded');}while(!step.done);result=step.value;metrics={offlineOnly:true,cpu:performance.now()-began,steps};scheduler.clear('offline diagnostic complete');
  }else for(let i=0;scheduler.pending&&i<4000;i++){active=performance.now();scheduler.pump();wall+=Math.max(16,performance.now()-active);active=null;}
  const leg=result?.legs[0],end=leg?.points.at(-1),endpointError=end?distance(end,goal):null,complete=!!leg&&!leg.partial&&endpointError<=220,liveGuard=walking?.partial&&distance(start,goal)>19000;
  const endpointComponents=topology?{start:topology.component(array(start))??null,goal:topology.component(array(topologyGoal))??null,approaches:endpointGoals.map(p=>topology.component(array(p))??null)}:null,topologyGraph=checkedOnly?checkedGraph:actionGraphSummary(topology,features,start,topologyGoal);
  const row={number:task.number,id:task.id,world,sourceIndexSHA256:index.sourceIndexSHA256,start:task.start,end:task.end,standingStart:start,standingGoal:goal,standingStartAvailable:!standing||!!startPads?.some(r=>r.radius<=200),standingGoalAvailable:!standing||!!goalPads?.some(r=>r.radius<=200),endpointApproach:runtimeEndpoints?{connected:!!endpointApproach,goalCandidates:endpointGoals.length,meshCandidates:endpointCandidateCounts||null}:undefined,hints:task.hints,scope:(runtimeEndpoints?'Runtime endpoint connector simulation with source-bound standing candidates; topology only, no physical/game acceptance':'Explicit optimistic collision control; no physical/game acceptance')+flowScope,mode,phase,metrics,straightMeters:distance(start,goal)/100,complete,liveActionDistanceGuard:!!liveGuard,endpointErrorCm:endpointError,walking:walking?{partial:walking.partial,points:walking.points.length,meters:walking.meters,frontier:walking.points.at(-1)}:null,features:features.length,topology:topology?.stats,endpointComponents,topologyGraph,moves:leg?.moves?.map(m=>({kind:m.kind,guid:m.guid})),result,events,physicalVerified:false};
  if(collisionEvidence)Object.assign(row,{scope:checkedOnly?'Offline diagnostic search restricted to independently checked action directions; native actions have standing-pad evidence only':'Mocked integration with source-bound independent cooked action collision evidence, original candidate order and 24 shared connectors; native actions/scene/game not certified',collisionEvidence:{sourceCaseSHA256:collisionEvidence.sourceCaseSHA256,connectors:collisionConnectors,maxConnectors:24,unassessedCandidates:collisionUnassessed.size,nativeActionsCertified:false,precomputed:true}});
  let movementEvidence;
  if(collectDeferred){const job=collectDeferredEvidence(features,()=>cache.moreMovementCandidates(world,start,goal));let step;do{step=job.next();}while(!step.done);movementEvidence=step.value;}
  fs.writeFileSync(path.join(out,task.number.toString().padStart(2,'0')+'-'+task.id+'.json'),JSON.stringify({...row,policy,movementFeatures:movementEvidence?.features||features,movementEvidence:movementEvidence?.collection,prioritizedMovementFeatures:topology?.features?.slice(0,512),rankedMovementFeatures:topology?.features?.slice(0,1024),profile},null,2));results.push({...row,result:undefined,events:undefined});console.log(JSON.stringify({number:row.number,id:row.id,complete,liveActionDistanceGuard:!!liveGuard,phase,metrics,features:features.length,moves:row.moves?.length,providerErrors:events.filter(e=>e.name.includes('unavailable')&&!e.name.includes('collision evidence')),profile:args[8]?profile:undefined}));
 }catch(error){const row={number:task.number,id:task.id,world,error:String(error),stack:String(error?.stack||''),phase,complete:false,physicalVerified:false};results.push(row);fs.writeFileSync(path.join(out,task.number.toString().padStart(2,'0')+'-'+task.id+'.json'),JSON.stringify({...row,events},null,2));console.log(JSON.stringify(row));}
 finally{scheduler.clear('audit case complete');cache.cancel();cache.pages.destroy();}
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({schema:1,mode,dataRoot:data,movementDataRoot,runtimeSHA256:scriptSHA256['PBZRecastRuntime.js'],providerSHA256:scriptSHA256['PBZRouteRecastProvider.js'],scriptSHA256,auditScriptSHA256,worldManifestSHA256,flowBarrierMode,standingSHA256:standingFile?hashFile(standingFile):null,inputSHA256:crypto.createHash('sha256').update(JSON.stringify(tasks)).digest('hex'),scope:checkedOnly?'Offline diagnostic using only independently checked action directions and uncertified native pads':'47 original custom endpoint pairs, topology control only; no gameplay acceptance',endpointMode,policy,total:results.length,complete:results.filter(r=>r.complete).length,results},null,2));
}
