'use strict';
const R=require('./PBZRouteCore');
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
 const goals=options.goals?.length?options.goals:[goal],actions=[],closed=[];
 for(const feature of features.slice(0,24)){
  for(const reverse of feature.both?[false,true]:[false]){
   const path=reverse?feature.runtimePath.slice().reverse():feature.runtimePath;
   const entry=yield* landing(feature,path[0],reverse?'right':'left');
   const exit=yield* landing(feature,path[path.length-1],reverse?'left':'right');
   if(!entry||!exit)continue;
   const action={feature,path,entry,exit};
   if(!canTraverse(feature)){closed.push(action);continue;}
   if(validate&&!(yield* validate(action)))continue;
   action.id='action:'+actions.length;
   action.cost=R.dist(entry,path[0])+R.extent(path)+R.dist(path[path.length-1],exit);
   actions.push(action);
  }
  if(clock()>deadline)return null;
 }
 const heuristic=p=>Math.min(...goals.map(q=>R.dist(p,q)));
 const open=[{id:'start',p:start,cost:0,score:heuristic(start),parent:null,segments:[]}],best=new Map([['start',0]]),seen=new Set();
 const cache=new Map();let connectors=0;
 const connection=function*(a,b,goalEdge=false){
  const key=[a.x,a.y,a.z,b.x,b.y,b.z,goalEdge].join('/');if(cache.has(key))return cache.get(key);
  if(++connectors>48||clock()>deadline)return null;
  const result=yield* walk(a,b,{deadline,local:!goalEdge||Math.abs(a.z-b.z)<200});
  cache.set(key,result);return result;
 };
 while(open.length&&clock()<=deadline){
  open.sort((a,b)=>a.score-b.score);const row=open.shift();if(seen.has(row.id)||best.get(row.id)!==row.cost)continue;
  if(row.id==='goal'){
   const chain=[];for(let p=row;p;p=p.parent)chain.push(p);chain.reverse();
   return {legs:[assemble(options.name,start,chain.flatMap(p=>p.segments))],transfer:null};
  }
  seen.add(row.id);
  for(const target of goals.slice().sort((a,b)=>R.dist(row.p,a)-R.dist(row.p,b))){
   if(row.cost+R.dist(row.p,target)>=(best.get('goal')??Infinity))continue;
   const leg=yield* connection(row.p,target,true);if(!leg)continue;
   const cost=row.cost+leg.meters*100;
   if(cost<(best.get('goal')??Infinity)){best.set('goal',cost);open.push({id:'goal',p:target,cost,score:cost,parent:row,segments:[leg]});}
  }
  const next=actions.filter(a=>!seen.has(a.id)).sort((a,b)=>R.dist(row.p,a.entry)+heuristic(a.exit)-R.dist(row.p,b.entry)-heuristic(b.exit));
  for(const action of next){
   if(row.cost+R.dist(row.p,action.entry)+action.cost+heuristic(action.exit)>=(best.get('goal')??Infinity))continue;
   const first=yield* connection(row.p,action.entry);if(!first)continue;
   const cost=row.cost+first.meters*100+action.cost;
   if(cost<(best.get(action.id)??Infinity)){best.set(action.id,cost);open.push({id:action.id,p:action.exit,cost,
    score:cost+heuristic(action.exit),parent:row,segments:[first,{action}]});}
  }
 }
 if(options.onClosed)for(const action of closed.slice(0,3)){
  const first=yield* connection(start,action.entry);if(first)options.onClosed(first,action);
 }
 return null;
}
exports.route=route;
