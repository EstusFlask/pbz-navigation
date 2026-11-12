'use strict';
const R=require('./PBZRouteCore');
function guidePath(feature,path,entry,exit){
 const length=R.extent(path)||1,upA=Math.max(0,entry.z-path[0].z),upB=Math.max(0,exit.z-path[path.length-1].z);
 let distance=0;const result=path.map((p,i)=>{if(i)distance+=R.dist(path[i-1],p);return {...p,z:p.z+upA+(upB-upA)*distance/length};});
 if(['ascent','mantle'].includes(feature.kind)||path[0].z<entry.z)result[0]={...entry};
 if(['ascent','mantle'].includes(feature.kind)||path[path.length-1].z<exit.z)result[result.length-1]={...exit};
 return result;
}
// Search chains of walking connectors and authored movement actions. An action
// is directional; it never becomes an ordinary walk across a vertical gap.
function assemble(world,start,segments){
 const points=[start],moves=[],walks=[];
 const append=p=>{if(R.dist(points[points.length-1],p)>.1)points.push({...p});};
 for(const segment of segments){
  if(segment.action){
   const {feature,path,entry,exit}=segment.action,from=points.length-1;
   for(const p of path)append(p);append(exit);
   moves.push({kind:feature.kind,guid:feature.guid,p:entry,end:exit,from,to:points.length-1,fold:false,
    scripted:feature.kind==='lift'&&!feature.both});
  }else for(const p of segment.points){const a=points[points.length-1],from=points.length-1;append(p);
   if(points.length>from+1)walks.push({a,b:p,from,to:points.length-1,edge:-1});}
 }
 return {world,points,moves,walks,checks:[],gates:[],meters:R.extent(points)/100,physicalVerified:true};
}
function* route(options){
 const {world,start,goal,features,landing,walk,canTraverse,validate}=options;
 const clock=options.clock||Date.now,deadline=options.deadline||clock()+12000;
 const prepareUntil=Math.min(deadline,clock()+3500);
 const goals=options.goals?.length?options.goals:[goal],actions=[],closed=[];
 const pads=new Map(),rejected=[];
 const pad=function*(feature,p,side){const key=feature.guid+'/'+side;if(!pads.has(key))pads.set(key,yield* landing(feature,p,side));return pads.get(key);};
 for(const feature of features.slice(0,24)){
  for(const reverse of feature.both?[false,true]:[false]){
   const path=reverse?feature.runtimePath.slice().reverse():feature.runtimePath;
   const entry=yield* pad(feature,path[0],reverse?'right':'left');
   if(!entry){rejected.push({guid:feature.guid,kind:feature.kind,why:'entry support/clearance'});continue;}
   const exit=yield* pad(feature,path[path.length-1],reverse?'left':'right');
   if(!exit){rejected.push({guid:feature.guid,kind:feature.kind,why:'exit support/clearance'});continue;}
   const action={feature,path,entry,exit};
   if(!canTraverse(feature)){closed.push(action);continue;}
   if(validate&&!(yield* validate(action))){rejected.push({guid:feature.guid,kind:feature.kind,why:'action approach'});continue;}
   action.path=guidePath(feature,path,entry,exit);
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
 const cache=new Map();let connectors=0;
 const connection=function*(a,b,goalEdge=false){
  const key=[a.x,a.y,a.z,b.x,b.y,b.z,goalEdge].join('/');if(cache.has(key))return cache.get(key);
  if(++connectors>(options.maxConnectors||128)||clock()>deadline)return null;
  const result=yield* walk(a,b,{deadline,local:!goalEdge||Math.abs(a.z-b.z)<200});
  cache.set(key,result);return result;
 };
 function* search(goalLimit){
 const open=[{id:'start',p:start,cost:0,score:heuristic(start),parent:null,segments:[]}],best=new Map([['start',0]]),seen=new Set();
 while(open.length&&clock()<=deadline){
  open.sort((a,b)=>a.score-b.score||Number(!!a.pending)-Number(!!b.pending));const row=open.shift();
  if(row.pending){
   if(seen.has(row.id)||row.score>=(best.get('goal')??Infinity)||best.get(row.parent.id)!==row.parent.cost)continue;
   const leg=yield* connection(row.parent.p,row.target,!row.action);if(!leg)continue;
   const cost=row.parent.cost+leg.meters*100+(row.action?.cost||0);
   if(cost<(best.get(row.id)??Infinity)){
    best.set(row.id,cost);open.push({id:row.id,p:row.action?.exit||row.target,cost,
     score:cost+(row.action?heuristic(row.action.exit):0),parent:row.parent,segments:row.action?[leg,{action:row.action}]:[leg]});
   }
   continue;
  }
  if(seen.has(row.id)||best.get(row.id)!==row.cost)continue;
  if(row.id==='goal'){
   return {legs:[assembled(row)],transfer:null};
  }
  if(options.allowPartial&&row.id!=='start'&&heuristic(row.p)<heuristic(start)-140&&(!frontier||heuristic(row.p)<heuristic(frontier.p)-50)){
   frontier=row;options.onPartial?.(partial(row));
  }
  seen.add(row.id);
  for(const target of goals.slice().sort((a,b)=>R.dist(row.p,a)-R.dist(row.p,b)).slice(0,goalLimit)){
   const score=row.cost+R.dist(row.p,target);if(score>=(best.get('goal')??Infinity))continue;
   open.push({id:'goal',pending:true,target,score,parent:row});
  }
  const next=actions.filter(a=>!seen.has(a.id)).sort((a,b)=>R.dist(row.p,a.entry)+heuristic(a.exit)-R.dist(row.p,b.entry)-heuristic(b.exit));
  for(const action of next){
   if(row.cost+R.dist(row.p,action.entry)+action.cost+heuristic(action.exit)>=(best.get('goal')??Infinity))continue;
   // Queue an optimistic edge before doing its expensive physical walk. This
   // lets a promising first action reach the next action while other entry
   // probes remain pending, instead of exhausting the budget on the start.
   const score=row.cost+R.dist(row.p,action.entry)+action.cost+heuristic(action.exit);
   open.push({id:action.id,pending:true,target:action.entry,action,score,parent:row});
  }
 }
 return null;
 }
 // Test a couple of nearby standing positions before expanding action chains.
 // Repeating every variant of a blocked direct path can consume the entire job.
 const primary=yield* search(actions.length?2:goals.length);if(primary)return primary;
 if(actions.length&&goals.length>2&&clock()<=deadline){const fallback=yield* search(goals.length);if(fallback)return fallback;}
 if(options.onClosed)for(const action of closed.slice(0,3)){
  const first=yield* connection(start,action.entry);if(first)options.onClosed(first,action);
 }
 options.report?.('action search exhausted',{connectors,ready:actions.length,remainingMs:Math.round(deadline-clock()),
  reason:clock()>deadline?'time budget':connectors>=(options.maxConnectors||128)?'connector budget':'no checked chain'});
 return options.allowPartial&&frontier?partial(frontier):null;
}
exports.route=route;
