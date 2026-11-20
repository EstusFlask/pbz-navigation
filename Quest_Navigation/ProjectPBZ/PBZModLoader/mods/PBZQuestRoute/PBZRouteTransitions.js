'use strict';
const R=require('./PBZRouteCore');
const failedAudit=value=>!value||value.ok===false;
const entryJoin=action=>!action.reverse&&action.feature.entryJoin;
const exitJoin=action=>!action.reverse&&action.feature.exitJoin;
const approachPoint=action=>!action.reverse&&action.feature.meshEntry||action.entry;
const continuation=action=>!action.reverse&&action.feature.meshExit||action.exit;
function actionCost(action){
 const entry=entryJoin(action),exit=exitJoin(action);
 return R.extent(action.path)+(entry?R.extent(entry):0)+(exit?R.extent(exit):0);
}

// Match the old stable sort when several paths have the same score.
const before=(a,b)=>a.score<b.score||a.score===b.score&&a.order<b.order;
class ActionQueue {
 constructor(){this.rows=[];this.nextOrder=0;}
 push(row){
  const rows=this.rows;
  row.order=this.nextOrder++;
  let at=rows.length;
  rows.push(row);
  while(at>0){
   const parent=(at-1)>>1;
   if(!before(row,rows[parent]))break;
   rows[at]=rows[parent];
   at=parent;
  }
  rows[at]=row;
 }
 pop(){
  const rows=this.rows,first=rows[0],last=rows.pop();
  if(!rows.length)return first;
  let at=0;
  while(at*2+1<rows.length){
   let child=at*2+1;
   if(child+1<rows.length&&before(rows[child+1],rows[child]))child++;
   if(!before(rows[child],last))break;
   rows[at]=rows[child];
   at=child;
  }
  rows[at]=last;
  return first;
 }
}
function guidePath(feature,path,entry,exit){
 // Hook anchors are fixed world targets. Snap only the standing endpoints;
 // interpolating their floor offsets would move the actual grab mesh in air.
 if(feature.kind==='hook')return [{...entry},...path.slice(1,-1).map(p=>({...p})),{...exit}];
 if(feature.wallrunRelay||feature.slideRelay)return path;
 const ladder=feature.kind==='ladder',length=R.extent(path)||1;
 const upA=ladder?entry.z-path[0].z:Math.max(0,entry.z-path[0].z),upB=ladder?exit.z-path[path.length-1].z:Math.max(0,exit.z-path[path.length-1].z);
 let distance=0;const result=path.map((p,i)=>{if(i)distance+=R.dist(path[i-1],p);return {...p,z:p.z+upA+(upB-upA)*distance/length};});
 // Native ladder interaction boxes can stand two metres behind the rungs.
 // Keep the mesh axis; assembly separately joins the checked standing pads.
 if(ladder)return result;
 if(['ascent','mantle'].includes(feature.kind)||path[0].z<entry.z)result[0]={...entry};
 if(['ascent','mantle'].includes(feature.kind)||path[path.length-1].z<exit.z)result[result.length-1]={...exit};
 return result;
}
// Search chains of walking connectors and authored movement actions. An action
// is directional; it never becomes an ordinary walk across a vertical gap.
function assemble(world,start,segments){
 const points=[start],moves=[],walks=[],checks=[];
 const append=p=>{if(R.dist(points[points.length-1],p)>.1)points.push({...p});};
 const appendWalking=path=>{
  if(!path)return;
  for(const p of path){
   const a=points.at(-1),from=points.length-1;append(p);
   if(points.length-1>from)walks.push({a,b:p,from,to:points.length-1,edge:-1});
  }
 };
 for(const segment of segments){
  if(segment.action){
   appendWalking(entryJoin(segment.action));
   const {feature,path,entry,exit,reverse,walking,walkIn,validatedKind,launch}=segment.action,from=points.length-1;
   const kind=validatedKind||feature.kind,drop=kind==='fall'||kind==='jump';
   const movement=walking&&feature.source==='recast-boundary'?{guid:feature.guid,reverse:!!reverse,kind:feature.kind,entry,exit}:null;
   let takeoff;
   for(let j=0;j<path.length;j++){
    const p=path[j],a=points.at(-1),i=points.length-1;append(p);
    if((walking||j<=walkIn)&&points.length-1>i)walks.push({a,b:p,from:i,to:points.length-1,edge:-1,...(movement?{movement}:{})});
    if(drop&&j===walkIn)takeoff=points.length-1;
   }
   const before=points.at(-1),last=points.length-1;append(exit);
   if(walking){if(points.length-1>last)walks.push({a:before,b:exit,from:last,to:points.length-1,edge:-1,...(movement?{movement}:{})});}
   else {moves.push({kind,guid:feature.guid,p:takeoff===undefined?entry:points[takeoff],end:exit,from:takeoff??from,to:points.length-1,fold:false,
    scripted:feature.kind==='lift'&&!feature.both,launch,drop,
    ...(feature.wallrunRelay?{wallrunRelay:feature.wallrunRelay,source:feature.source,requiresLoaded:true}:{}),
    ...(feature.slideRelay?{slideRelay:feature.slideRelay}:{}),
    ...(typeof feature.wallrunAToB==='boolean'?{wallrunAToB:feature.wallrunAToB}:{})});
    const anchors=feature.launchBox?feature.runtimePath:path;
    if(!drop)checks.push({edge:-1,kind:9,mode:feature.kind,guid:feature.guid,a:entry,b:exit,first:anchors[0],last:anchors.at(-1),
     ...(feature.source==='game-placement'?{source:feature.source,reverse:!!feature.wallrunReverse!==!!reverse,requiresLoaded:!!feature.requiresLoaded}:{}),
     ...(feature.wallrunRelay?{wallrunRelay:feature.wallrunRelay}:{}),
     ...(feature.slideRelay?{slideRelay:feature.slideRelay}:{}),
     ...(feature.launchBox?{requiresLaunchBox:true}:{}),from,to:points.length-1,verifiedAt:Date.now()});
    else checks.push({edge:-1,kind:12,a:entry,b:exit,from,to:points.length-1,mode:kind,
     ...(feature.source==='recast-boundary'?{guid:feature.guid,source:feature.source,reverse,trajectory:segment.action.trajectory}:{}),verified:true,verifiedAt:Date.now()});}
   appendWalking(exitJoin(segment.action));
  }else {
   const indices=[],walking=segment.walks||[],movementWalks=walking.filter(w=>w.movement);
   for(let i=0;i<segment.points.length;i++){
    const p=segment.points[i],a=points.at(-1),from=points.length-1;append(p);indices[i]=points.length-1;
    const action=i>0&&(segment.moves||[]).some(m=>m.from<=i-1&&m.to>=i)&&!walking.some(w=>w.from<=i-1&&w.to>=i);
    if(points.length>from+1&&!action){
     const movement=i>0?movementWalks.find(w=>w.from<=i-1&&w.to>=i)?.movement:null;
     walks.push({a,b:p,from,to:points.length-1,edge:-1,...(movement?{movement}:{})});
    }
   }
   // A walking connector may contain a physically checked short descent.
   // Preserve its direction and mandatory audit when joining the next action.
   for(const m of segment.moves||[])if(indices[m.from]!==undefined&&indices[m.to]>indices[m.from])
    moves.push({...m,from:indices[m.from],to:indices[m.to]});
   for(const c of segment.checks||[])checks.push({...c,
    ...(c.from===undefined?{}:{from:indices[c.from],to:indices[c.to??c.from+1]})});
  }
 }
 return {world,points,moves,walks,checks,gates:[],meters:R.extent(points)/100,physicalVerified:true};
}
// Recover a chain using the fewest additions from the existing reserve.
// Component connectivity is optimistic. The normal action and walk checks
// still have to pass before any of this chain can become guidance.
function* reserveChain(start,goals,active,remaining){
 const outgoing=new Map(),incoming=new Map();
 const add=(map,key,edge)=>{
  if(!map.has(key))map.set(key,[]);
  map.get(key).push(edge);
 };
 let work=0;
 for(const edge of [...active,...remaining]){
  if(edge.from!==undefined&&edge.from!==null&&edge.to!==undefined&&edge.to!==null&&edge.from!==edge.to){
   add(outgoing,edge.from,edge);
   add(incoming,edge.to,edge);
  }
  if((++work&63)===0)yield;
 }
 const reachable=new Set([start]),forward=[start];
 for(const from of forward)for(const edge of outgoing.get(from)||[]){
  if(!reachable.has(edge.to)){reachable.add(edge.to);forward.push(edge.to);}
  if((++work&63)===0)yield;
 }
 const distance=new Map(),next=new Map(),queue=new Map();
 let head=0,tail=0;
 for(const goal of goals)if(goal!==undefined&&goal!==null&&!distance.has(goal)){
  distance.set(goal,0);queue.set(tail++,{id:goal,cost:0});
 }
 while(head<tail){
  const {id,cost}=queue.get(head);queue.delete(head++);
  if(distance.get(id)!==cost)continue;
  for(const edge of incoming.get(id)||[]){
   const extra=Number(edge.index!==undefined),score=cost+extra;
   if(score<(distance.get(edge.from)??Infinity)){
    distance.set(edge.from,score);next.set(edge.from,edge);
    queue.set(extra?tail++:--head,{id:edge.from,cost:score});
   }
   if((++work&63)===0)yield;
  }
 }
 if(!distance.get(start))return null;
 const promote=new Set();
 for(let id=start;next.has(id);){
  const edge=next.get(id);id=edge.to;
  if(edge.index!==undefined)promote.add(edge.index);
  if((++work&63)===0)yield;
 }
 return {promote,reachable,canReachGoal:distance};
}
function* route(options){
 const {world,start,goal,features,landing,walk,canTraverse,validate}=options;
 const clock=options.clock||Date.now,deadline=options.deadline||clock()+12000;
 const direction='forward';
 // The Recast component labels belong to the immutable planner for this job.
 // Reuse each standing point while alternate chains revisit it.
 let component=options.component;
 let canConnect=options.canConnect;
 if(component&&options.componentConnectors){
  const findComponent=component,ids=new WeakMap();
  component=point=>{
   if(!ids.has(point))ids.set(point,findComponent(point));
   return ids.get(point);
  };
  canConnect=(a,b)=>{
   const id=component(a);
   return id!==undefined&&id!==null&&id===component(b);
  };
 }
 // Different launch pads of the same wallrun share a physical action. An
 // immediate repeat or return cannot open a new walking approach.
 const returnsImmediately=(a,b)=>!!a&&!!b&&!!a.feature.guid&&String(a.feature.guid).toLowerCase()===String(b.feature.guid||'').toLowerCase()&&
  (a.feature.launchBox&&b.feature.launchBox&&a.feature.kind==='wallrun'&&b.feature.kind==='wallrun'||R.dist(a.entry,b.exit)<1&&R.dist(a.exit,b.entry)<1);
 let immediateReturnsSkipped=0;
 const prepareUntil=Math.min(deadline,clock()+3500);
 let goals=options.goals?.length?options.goals:[goal];const actions=[],closed=[];
 const pads=new WeakMap(),rejected=[],disabled=new Set();
 const reverseSide=(feature,path,entry)=>{const reverse=path[0]!==feature.runtimePath[0];return entry?(reverse?'right':'left'):(reverse?'left':'right');};
 const allowedDirection=(feature,reverse)=>{
  if(reverse?feature.noReverse:feature.noForward)return false;
  if(feature.source!=='recast-boundary'||!options.excludedDirections?.size)return true;
  const excluded=options.excludedDirections.get(String(feature.guid).toLowerCase())??0;
  return !(excluded&(reverse?2:1));
 };
 const pad=function*(feature,p,side){
  let values=pads.get(feature);
  if(!values){values=new Map();pads.set(feature,values);}
  if(!values.has(side))values.set(side,yield* landing(feature,p,side));
  return values.get(side);
 };
 // Crowded ladder/wall volumes must not permanently hide a different move
 // family. Prepare the nearest representative of each kind before duplicates;
 // keep the same time deadline and a finite discovery cap.
 const candidates=features.slice(0,options.lazyActions?512:96),kinds=new Set(),representatives=[],remaining=[];
 let nextFeature=candidates.length,actionSerial=0,refills=0,examinedReserve=false;
 const promoted=new Set(),reserveEnd=Math.min(features.length,candidates.length+512);
 for(const feature of candidates){if(kinds.has(feature.kind))remaining.push(feature);else{kinds.add(feature.kind);representatives.push(feature);}}
 for(const feature of [...representatives,...remaining]){
  for(const reverse of feature.both?[false,true]:[false]){
   if(!allowedDirection(feature,reverse))continue;
   const path=reverse?feature.runtimePath.slice().reverse():feature.runtimePath;
   if(options.lazyActions){
    const action={feature,path,reverse,entry:reverse?feature.standingExit||path[0]:feature.standingEntry||path[0],exit:reverse?feature.standingEntry||path.at(-1):feature.standingExit||path.at(-1),unprepared:true,id:'action:'+actionSerial++};
    action.cost=actionCost(action);
    if(canTraverse(feature))actions.push(action);else closed.push(action);
    continue;
   }
   const entry=yield* pad(feature,path[0],reverse?'right':'left');
   if(!entry){rejected.push({guid:feature.guid,kind:feature.kind,why:'entry support/clearance'});continue;}
   const exit=yield* pad(feature,path[path.length-1],reverse?'left':'right');
   if(!exit){rejected.push({guid:feature.guid,kind:feature.kind,why:'exit support/clearance'});continue;}
   const action={feature,path,entry,exit,reverse};
   if(!canTraverse(feature)){closed.push(action);continue;}
   const validation=validate?yield* validate(action):true;
   if(failedAudit(validation)){rejected.push({guid:feature.guid,kind:feature.kind,why:validation?.why||'action approach'});continue;}
   const mesh=feature.kind==='ladder'?feature.runtimeGuidePath:null;
   const nativeMesh=Array.isArray(mesh)&&mesh.length>=2&&mesh.every(R.finite)&&
    R.dist(mesh[0],feature.runtimePath[0])<=600&&R.dist(mesh.at(-1),feature.runtimePath.at(-1))<=600;
   const guide=nativeMesh?(reverse?mesh.slice().reverse():mesh):path;
   action.walking=validation.walking===true;action.walkIn=validation.walkIn;action.validatedKind=validation.kind;action.launch=validation.launch;
   action.path=validation.points||guidePath(feature,guide,entry,exit);
   if(feature.source==='recast-boundary'&&validation.points&&!action.walking)
    action.trajectory={points:validation.points,walkIn:validation.walkIn,launch:validation.launch};
   action.id='action:'+actions.length;
   action.cost=R.dist(entry,action.path[0])+R.extent(action.path)+R.dist(action.path[action.path.length-1],exit);
   actions.push(action);
   if(options.onAction)yield* options.onAction(action,{deadline:prepareUntil});
  }
  // Keep a search window for the nearby actions already validated above.
  if(clock()>prepareUntil)break;
 }
 options.report?.('action pads',{ready:actions.length,closed:closed.length,rejected:rejected.slice(0,6),remainingMs:Math.round(deadline-clock())});
 const heuristic=p=>Math.min(...goals.map(q=>R.dist(p,q)));
 let frontier=null;
 const assembled=row=>{const chain=[];for(let p=row;p;p=p.parent)chain.push(p);chain.reverse();return {...assemble(options.name,start,chain.flatMap(p=>p.segments)),searchDirection:direction};};
 const partial=row=>{const leg=assembled(row);return {legs:[{...leg,provider:'scene',partial:true,scenePartial:true,
  obstacles:[{id:'action-frontier',world:options.name,p:row.p,unknown:true,icon:'mechanism',label:'前方通路待确认'}]}],transfer:null};};
 const cache=new Map(),maxConnectors=options.maxConnectors||128;let connectors=0;
 const signature=(a,b,goalEdge,afterAction)=>{
  const local=!goalEdge||Math.abs(a.z-b.z)<200||afterAction;
  return {local,key:[a.x,a.y,a.z,b.x,b.y,b.z,goalEdge,local].join('/')};
 };
 const connection=function*(a,b,goalEdge=false,afterAction=false,feature,quick=false,phaseLimit=maxConnectors){
  // A checked action may end below stairs leading to the final destination.
  // Keep the bounded local connector available there, with the same physical
  // checks and overall deadline, instead of treating every higher goal as a
  // second unmodelled traversal. The direct start-to-goal policy is unchanged.
  const {local,key}=signature(a,b,goalEdge,afterAction),cached=cache.get(key);
  // A quick failure means the cheap providers did not connect these pads;
  // it must not suppress the later grid repair. Successful checks may be
  // reused inside this same job by either phase.
  if(cached&&(cached.result||!cached.quick||quick))return cached.result;
  if(connectors>=phaseLimit||connectors>=maxConnectors||clock()>deadline)return null;
  const id=++connectors,began=clock(),wall=Date.now(),detail={id,from:a,to:b,goalEdge,local,quick,
   ...(feature?{kind:feature.kind,guid:feature.guid}:{}),remainingMs:Math.max(0,Math.round(deadline-began))};
  if(id<=16)options.report?.('action connector start',detail);
  let finished=false,result;
  try{
   result=yield* walk(a,b,{deadline,local,quick});
   if(result?.partial)result=null;
   finished=true;cache.set(key,{result,quick});return result;
  }finally{
   const cpuMs=Math.max(0,Math.round(clock()-began)),wallMs=Math.max(0,Date.now()-wall);
   if(id<=16||!finished||cpuMs>250||wallMs>2000)options.report?.(finished?'action connector result':'action connector interrupted',
    {...detail,found:!!result,cpuMs,wallMs,pointCount:result?.points?.length||0});
  }
 };
 function* search(goalLimit,quick=false,phaseLimit=maxConnectors){
   let attemptLimit=maxConnectors+(options.lazyActions?Math.min(512,actions.length):0);
  const outgoing=new Map();
  const indexEntry=(action,id)=>{
   if(!outgoing.has(id))outgoing.set(id,[]);
   outgoing.get(id).push(action);
  };
  const unindexEntry=(action,id)=>{
   const list=outgoing.get(id),at=list?.indexOf(action);
   if(at>=0)list.splice(at,1);
  };
  if(component){
   let work=0;
   for(const action of actions){indexEntry(action,component(approachPoint(action)));if((++work&15)===0)yield;}
  }
  const removeAction=action=>{
   const index=actions.indexOf(action);
   if(index<0)return;
   actions.splice(index,1);
   if(component)unindexEntry(action,component(approachPoint(action)));
  };
  const addFeature=function*(feature){
   refills++;
   const allowed=canTraverse(feature);
   for(const reverse of feature.both?[false,true]:[false]){
    if(!allowedDirection(feature,reverse))continue;
    const path=reverse?feature.runtimePath.slice().reverse():feature.runtimePath;
    const entry=reverse?feature.standingExit||path[0]:feature.standingEntry||path[0];
    const exit=reverse?feature.standingEntry||path.at(-1):feature.standingExit||path.at(-1);
    const action={feature,path,reverse,entry,exit,unprepared:true,id:'action:'+actionSerial++};
    action.cost=actionCost(action);
    if(!allowed){closed.push(action);continue;}
    actions.push(action);attemptLimit++;
    if(component)indexEntry(action,component(approachPoint(action)));
   }
   options.report?.('action candidates refilled',{count:refills,active:new Set(actions.map(a=>a.feature)).size,remaining:reserveEnd-nextFeature});
   yield;
  };
  const refill=function*(rejectedAction){
   // One slot covers all permitted directions of the original geometry.
   const feature=rejectedAction.feature;
   if(!options.lazyActions||feature.source!=='recast-boundary'||refills>=512)return;
   const directions=feature.both?actions.filter(action=>action.feature===feature):[rejectedAction];
   if(directions.some(action=>!disabled.has(action)))return;
   while(promoted.has(nextFeature))nextFeature++;
   if(nextFeature>=reserveEnd)return;
   for(const action of directions)removeAction(action);
   yield* addFeature(features[nextFeature++]);
  };
  const bridgeReserve=function*(){
   if(examinedReserve||!options.lazyActions||!options.componentConnectors||!component||nextFeature>=reserveEnd||refills>=512)return false;
   examinedReserve=true;
   const source=component(start);
   if(source===undefined||source===null)return false;
   const targets=goals.map(component),active=[],remaining=[],slots=new Map();
   let work=0;
   for(const action of actions){
    if(!slots.has(action.feature))slots.set(action.feature,[]);
    const edge={action,from:component(approachPoint(action)),to:component(continuation(action))};
    slots.get(action.feature).push(edge);
    if(!disabled.has(action))active.push(edge);
    if((++work&7)===0)yield;
   }
   for(let index=nextFeature;index<reserveEnd;index++){
    const feature=features[index];
    if(!promoted.has(index)&&canTraverse(feature)){
     const path=feature.runtimePath,first=feature.standingEntry||path[0],last=feature.standingExit||path.at(-1);
     if(allowedDirection(feature,false))remaining.push({index,from:component(feature.meshEntry||first),to:component(feature.meshExit||last)});
     if(feature.both&&allowedDirection(feature,true))remaining.push({index,from:component(last),to:component(first)});
    }
    if((++work&7)===0)yield;
   }
   const chain=yield* reserveChain(source,targets,active,remaining);
   if(!chain||chain.promote.size>512-refills||clock()>deadline)return false;
   const needed=Math.max(0,slots.size+chain.promote.size-512),retire=[];
   for(const [feature,edges] of slots){
    if(retire.length===needed)break;
    // Keep every active direction that may participate in a chain across
    // the combined graph, and keep every placed mechanism.
    if(feature.source==='recast-boundary'&&edges.every(({action,from,to})=>
     disabled.has(action)||!chain.reachable.has(from)||!chain.canReachGoal.has(to)))retire.push(edges);
    if((++work&63)===0)yield;
   }
   if(retire.length<needed)return false;
   for(const edges of retire){for(const edge of edges)removeAction(edge.action);if((++work&15)===0)yield;}
   for(const index of chain.promote){promoted.add(index);yield* addFeature(features[index]);}
   return true;
  };
  // Plan an entire candidate chain using only coordinates/cached results.
  // Validate its edges in order, remove a failed connector for this phase and
  // replan. Once a complete checked chain exists, return it immediately; do
  // not hold guidance while proving every optimistic alternative is longer.
  // Entry components were indexed above. With the owned component cache,
  // offering them only compares cached IDs and pure JS costs. Keep the
  // original cadence for opaque callbacks and the component-indexing loop.
  const offerMask=component&&options.componentConnectors?63:15;
  const forwardCandidate=function*(){
   const open=new ActionQueue(),best=new Map([['start',0]]),seen=new Set();let expanded=0;
   open.push({id:'start',p:start,cost:0,score:heuristic(start),parent:null});
   while(open.rows.length&&clock()<=deadline){
    const row=open.pop();
    if(seen.has(row.id)||best.get(row.id)!==row.cost)continue;
    if(row.id==='goal'){const chain=[];for(let n=row;n.parent;n=n.parent)chain.push(n);return chain.reverse();}
    seen.add(row.id);if((++expanded&7)===0)yield;
    const offer=(target,action)=>{
     if(canConnect&&!canConnect(row.p,target))return;
     if(returnsImmediately(row.action,action)){immediateReturnsSkipped++;return;}
     const id=action?.id||'goal';if(seen.has(id))return;
     // Before any walking connector has been checked, every cache lookup
     // must miss. Avoid allocating coordinate keys while invalid actions
     // repeatedly replan the optimistic chain.
     const known=cache.size?cache.get(signature(row.p,target,!action,row.id!=='start').key):undefined;
     if(known&&!known.result&&(!known.quick||quick))return;
     const walkCost=known?.result?known.result.meters*100:R.dist(row.p,target),cost=row.cost+walkCost+(action?.cost||0);
     if(cost>=(best.get(id)??Infinity))return;
     best.set(id,cost);const p=action?continuation(action):target;
     open.push({id,p,target,action,cost,score:cost+(action?heuristic(p):0),parent:row});
    };
    for(const target of goals.slice().sort((a,b)=>R.dist(row.p,a)-R.dist(row.p,b)).slice(0,goalLimit))offer(target);
    let offered=0;for(const action of component?outgoing.get(component(row.p))||[]:actions){if(!disabled.has(action))offer(approachPoint(action),action);if((++offered&offerMask)===0)yield;}
   }
   return null;
  };
  for(let attempt=0;attempt<=attemptLimit&&clock()<=deadline;attempt++){
   let chain=yield* forwardCandidate();
   if(!chain&&connectors<phaseLimit&&(yield* bridgeReserve()))chain=yield* forwardCandidate();
   if(!chain)return null;
   if(attempt<8)options.report?.('action chain candidate',{direction,quick,attempt:attempt+1,immediateReturnsSkipped,estimatedMeters:chain.at(-1).cost/100,
    actions:chain.filter(r=>r.action).map(r=>r.action.feature.guid)});
   let row={id:'start',p:start,cost:0,parent:null,segments:[]},failed=false,padsMoved=false;
   // Reject every physically impossible action in the proposed chain before
   // spending the finite walking-connector budget on any prefix of it.
   for(const edge of chain){
    const action=edge.action;
    if(action?.unprepared){
     const {feature,path}=action,entry=yield* pad(feature,path[0],reverseSide(action.feature,path,true)),exit=yield* pad(feature,path.at(-1),reverseSide(action.feature,path,false));
     let validation=false;
     if(entry&&exit&&canTraverse(feature))validation=validate?yield* validate({...action,entry,exit}):true;
     if(failedAudit(validation)){
      const failure=validation?.ok===false?validation:null;
      disabled.add(action);rejected.push({guid:feature.guid,kind:feature.kind,why:!entry?'entry support/clearance':!exit?'exit support/clearance':failure?.why||'action approach',
       ...(failure?{unknown:failure.unknown!==false,knownBlocked:feature.source==='recast-boundary'&&failure.unknown===false&&failure.obstructed===true}:{})});
      options.report?.('action rejected',{...rejected.at(-1),source:feature.source,reverse:path[0]!==feature.runtimePath[0],flight:failure?.flight});
      yield* refill(action);failed=true;break;
     }
     padsMoved||=R.dist(action.entry,entry)>0||R.dist(action.exit,exit)>0;
     const oldApproach=approachPoint(action);
     Object.assign(action,{entry,exit,path:validation.points||guidePath(feature,path,entry,exit),walking:validation.walking===true,walkIn:validation.walkIn,validatedKind:validation.kind,launch:validation.launch,unprepared:false});
     const approach=approachPoint(action);
     if(component&&R.dist(oldApproach,approach)>0){
      const before=component(oldApproach),after=component(approach);
      if(before!==after){unindexEntry(action,before);indexEntry(action,after);}
     }
     if(feature.source==='recast-boundary'&&validation.points&&!action.walking)
      action.trajectory={points:validation.points,walkIn:validation.walkIn,launch:validation.launch};
     action.cost=actionCost(action);edge.target=approach;
     if(options.onAction)yield* options.onAction(action,{deadline});
    }
   }
   if(failed)continue;
   if(padsMoved&&canConnect){
    let previous=start;
    for(const edge of chain){
     if(!canConnect(previous,edge.target)){failed=true;break;}
     previous=edge.action?continuation(edge.action):edge.target;
    }
    // Replan against the checked entry and exit before spending connectors.
    if(failed)continue;
   }
   for(const edge of chain){
    const action=edge.action;
    const leg=yield* connection(row.p,edge.target,!edge.action,row.id!=='start',edge.action?.feature,quick,phaseLimit);
    if(!leg){if(connectors>=phaseLimit||clock()>deadline)return null;failed=true;break;}
    const next={id:edge.id,p:action?continuation(action):edge.target,cost:row.cost+leg.meters*100+(edge.action?.cost||0),parent:row,
     segments:edge.action?[leg,{action:edge.action}]:[leg]};row=next;
    if(options.allowPartial&&row.id!=='goal'&&heuristic(row.p)<heuristic(start)-140&&(!frontier||heuristic(row.p)<heuristic(frontier.p)-50)){
     frontier=row;options.onPartial?.(partial(row));
    }
   }
   if(!failed){const leg=assembled(row);
    options.report?.('action chain accepted',{direction,quick,attempts:attempt+1,connectors,immediateReturnsSkipped,meters:leg.meters,actions:leg.moves.map(m=>m.guid)});
    return {legs:[leg],transfer:null};
   }
  }
  return null;
 }
 // First combine checked native/atlas/hint connectors across the action graph.
 // One speculative grid repair must not starve an already reachable climb and
 // its upstairs continuation. Reserve half the finite connector quota for the
 // original full-repair fallback; neither pass extends the overall deadline.
 if(options.stagedWalk){
  const limit=Math.max(1,Math.floor(maxConnectors/2));
  const quick=yield* search(actions.length?2:goals.length,true,limit);if(quick)return quick;
  if(actions.length&&goals.length>2&&connectors<limit&&clock()<=deadline){const more=yield* search(goals.length,true,limit);if(more)return more;}
 }
 // Test a couple of nearby standing positions before expanding action chains.
 // Repeating every variant of a blocked direct path can consume the entire job.
 const primary=yield* search(actions.length?2:goals.length);if(primary)return primary;
 if(actions.length&&goals.length>2&&clock()<=deadline){const fallback=yield* search(goals.length);if(fallback)return fallback;}
 const preferredPending=action=>action.feature.guid===options.pendingAction?.guid&&action.reverse===options.pendingAction.reverse;
 if(options.onClosed)for(const action of closed.sort((a,b)=>Number(preferredPending(b))-Number(preferredPending(a))||
  R.dist(start,a.entry)+R.dist(a.exit,goal)-R.dist(start,b.entry)-R.dist(b.exit,goal)).slice(0,4)){
  if(options.lazyActions){
   const original=goals;goals=[action.entry];const prefix=yield* search(1);goals=original;
   if(prefix){options.onClosed(prefix.legs[0],action);break;}
  }else {const first=yield* connection(start,action.entry,false,false,action.feature);if(first)options.onClosed(first,action);}
 }
 options.report?.('action search exhausted',{connectors,immediateReturnsSkipped,ready:actions.length,remainingMs:Math.round(deadline-clock()),
  reason:clock()>deadline?'time budget':connectors>=(options.maxConnectors||128)?'connector budget':'no checked chain'});
 return options.allowPartial&&frontier?partial(frontier):null;
}
exports.route=route;
