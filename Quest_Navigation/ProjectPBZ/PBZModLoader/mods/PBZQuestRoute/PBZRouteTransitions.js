'use strict';
const R=require('./PBZRouteCore');
function guidePath(feature,path,entry,exit){
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
 for(const segment of segments){
  if(segment.action){
   const {feature,path,entry,exit}=segment.action,from=points.length-1;
   for(const p of path)append(p);append(exit);
   moves.push({kind:feature.kind,guid:feature.guid,p:entry,end:exit,from,to:points.length-1,fold:false,
    scripted:feature.kind==='lift'&&!feature.both});
  }else {
   const indices=[];
   for(let i=0;i<segment.points.length;i++){
    const p=segment.points[i],a=points.at(-1),from=points.length-1;append(p);indices[i]=points.length-1;
    const action=i>0&&(segment.moves||[]).some(m=>m.from<=i-1&&m.to>=i)&&
     !(segment.walks||[]).some(w=>w.from<=i-1&&w.to>=i);
    if(points.length>from+1&&!action)walks.push({a,b:p,from,to:points.length-1,edge:-1});
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
function* route(options){
 const {world,start,goal,features,landing,walk,canTraverse,validate}=options;
 const clock=options.clock||Date.now,deadline=options.deadline||clock()+12000;
 const prepareUntil=Math.min(deadline,clock()+3500);
 const goals=options.goals?.length?options.goals:[goal],actions=[],closed=[];
 const pads=new Map(),rejected=[];
 const pad=function*(feature,p,side){const key=feature.guid+'/'+side;if(!pads.has(key))pads.set(key,yield* landing(feature,p,side));return pads.get(key);};
 // Crowded ladder/wall volumes must not permanently hide a different move
 // family. Prepare the nearest representative of each kind before duplicates;
 // keep the same time deadline and a finite discovery cap.
 const candidates=features.slice(0,96),kinds=new Set(),representatives=[],remaining=[];
 for(const feature of candidates){if(kinds.has(feature.kind))remaining.push(feature);else{kinds.add(feature.kind);representatives.push(feature);}}
 for(const feature of [...representatives,...remaining]){
  for(const reverse of feature.both?[false,true]:[false]){
   const path=reverse?feature.runtimePath.slice().reverse():feature.runtimePath;
   const entry=yield* pad(feature,path[0],reverse?'right':'left');
   if(!entry){rejected.push({guid:feature.guid,kind:feature.kind,why:'entry support/clearance'});continue;}
   const exit=yield* pad(feature,path[path.length-1],reverse?'left':'right');
   if(!exit){rejected.push({guid:feature.guid,kind:feature.kind,why:'exit support/clearance'});continue;}
   const action={feature,path,entry,exit};
   if(!canTraverse(feature)){closed.push(action);continue;}
   if(validate&&!(yield* validate(action))){rejected.push({guid:feature.guid,kind:feature.kind,why:'action approach'});continue;}
   const mesh=feature.kind==='ladder'?feature.runtimeGuidePath:null;
   const nativeMesh=Array.isArray(mesh)&&mesh.length>=2&&mesh.every(R.finite)&&
    R.dist(mesh[0],feature.runtimePath[0])<=600&&R.dist(mesh.at(-1),feature.runtimePath.at(-1))<=600;
   const guide=nativeMesh?(reverse?mesh.slice().reverse():mesh):path;
   action.path=guidePath(feature,guide,entry,exit);
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
 const assembled=row=>{const chain=[];for(let p=row;p;p=p.parent)chain.push(p);chain.reverse();return assemble(options.name,start,chain.flatMap(p=>p.segments));};
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
  // Plan an entire candidate chain using only coordinates/cached results.
  // Validate its edges in order, remove a failed connector for this phase and
  // replan. Once a complete checked chain exists, return it immediately; do
  // not hold guidance while proving every optimistic alternative is longer.
  const candidate=function*(){
   const open=[{id:'start',p:start,cost:0,score:heuristic(start),parent:null}],best=new Map([['start',0]]),seen=new Set();let expanded=0;
   while(open.length&&clock()<=deadline){
    open.sort((a,b)=>a.score-b.score);const row=open.shift();
    if(seen.has(row.id)||best.get(row.id)!==row.cost)continue;
    if(row.id==='goal'){const chain=[];for(let n=row;n.parent;n=n.parent)chain.push(n);return chain.reverse();}
    seen.add(row.id);if((++expanded&7)===0)yield;
    const offer=(target,action)=>{
     const id=action?.id||'goal';if(seen.has(id))return;
     const {key}=signature(row.p,target,!action,row.id!=='start'),known=cache.get(key);
     if(known&&!known.result&&(!known.quick||quick))return;
     const walkCost=known?.result?known.result.meters*100:R.dist(row.p,target),cost=row.cost+walkCost+(action?.cost||0);
     if(cost>=(best.get(id)??Infinity))return;
     best.set(id,cost);const p=action?.exit||target;
     open.push({id,p,target,action,cost,score:cost+(action?heuristic(p):0),parent:row});
    };
    for(const target of goals.slice().sort((a,b)=>R.dist(row.p,a)-R.dist(row.p,b)).slice(0,goalLimit))offer(target);
    for(const action of actions)offer(action.entry,action);
   }
   return null;
  };
  for(let attempt=0;attempt<=maxConnectors&&clock()<=deadline;attempt++){
   const chain=yield* candidate();if(!chain)return null;
   if(attempt<8)options.report?.('action chain candidate',{quick,attempt:attempt+1,estimatedMeters:chain.at(-1).cost/100,
    actions:chain.filter(r=>r.action).map(r=>r.action.feature.guid)});
   let row={id:'start',p:start,cost:0,parent:null,segments:[]},failed=false;
   for(const edge of chain){
    const leg=yield* connection(row.p,edge.target,!edge.action,row.id!=='start',edge.action?.feature,quick,phaseLimit);
    if(!leg){if(connectors>=phaseLimit||clock()>deadline)return null;failed=true;break;}
    const next={id:edge.id,p:edge.action?.exit||edge.target,cost:row.cost+leg.meters*100+(edge.action?.cost||0),parent:row,
     segments:edge.action?[leg,{action:edge.action}]:[leg]};row=next;
    if(options.allowPartial&&row.id!=='goal'&&heuristic(row.p)<heuristic(start)-140&&(!frontier||heuristic(row.p)<heuristic(frontier.p)-50)){
     frontier=row;options.onPartial?.(partial(row));
    }
   }
   if(!failed){const leg=assembled(row);
    options.report?.('action chain accepted',{quick,attempts:attempt+1,connectors,meters:leg.meters,actions:leg.moves.map(m=>m.guid)});
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
 if(options.onClosed)for(const action of closed.slice(0,3)){
  const first=yield* connection(start,action.entry,false,false,action.feature);if(first)options.onClosed(first,action);
 }
 options.report?.('action search exhausted',{connectors,ready:actions.length,remainingMs:Math.round(deadline-clock()),
  reason:clock()>deadline?'time budget':connectors>=(options.maxConnectors||128)?'connector budget':'no checked chain'});
 return options.allowPartial&&frontier?partial(frontier):null;
}
exports.route=route;
