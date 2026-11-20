export function* checkedFrontierJob(edges,start,goal,{perPair=8,maxFeatures=128,side='start'}={}){
 if(!Number.isSafeInteger(perPair)||perPair<1||!Number.isSafeInteger(maxFeatures)||maxFeatures<1)throw Error('Invalid checked frontier limit');
 if(side!=='start'&&side!=='goal')throw Error('Invalid checked frontier side');
 const fromGoal=side==='goal';
 const outgoing=new Map(),incoming=new Map(),weighted=new Map(),append=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};let work=0;
 for(const edge of edges){
  if(edge.checked){append(outgoing,edge.from,edge.to);append(incoming,edge.to,edge.from);}
  append(weighted,fromGoal?edge.from:edge.to,edge);
  if((++work&63)===0)yield;
 }
 const visit=function*(seed,adjacent){
  const seen=new Set(seed===undefined?[]:[seed]),queue=[...seen];
  for(const from of queue)for(const to of adjacent.get(from)||[]){if(!seen.has(to)){seen.add(to);queue.push(to);}if((++work&63)===0)yield;}
  return seen;
 };
 const forward=yield* visit(start,outgoing),backward=yield* visit(goal,incoming);
 // Start-side selection needs the cost to the goal, found along incoming
 // edges. Goal-side selection needs the cost from the start along outgoing
 // edges. Only the traversal order changes; emitted actions keep direction.
 const seed=fromGoal?start:goal,reach=fromGoal?backward:forward;
 const depths=new Map(seed===undefined?[]:[[seed,0]]),queue=new Map();let head=0,tail=0;
 if(seed!==undefined)queue.set(tail++,[seed,0]);
 while(head<tail){
  const [current,depth]=queue.get(head);
  queue.delete(head++);
  if(depths.get(current)!==depth)continue;
  for(const edge of weighted.get(current)||[]){
   const other=fromGoal?edge.to:edge.from,cost=edge.checked?0:1,next=depth+cost;
   if(next<(depths.get(other)??Infinity)){depths.set(other,next);queue.set(cost?tail++:--head,[other,next]);}
   if((++work&63)===0)yield;
  }
 }
 const frontier=[];let minimumUncheckedSteps=Infinity;
 for(let index=0;index<edges.length;index++){
  const edge=edges[index],near=fromGoal?edge.to:edge.from,far=fromGoal?edge.from:edge.to;
  if((++work&63)===0)yield;
  if(edge.checked||!reach.has(near)||reach.has(far)||!depths.has(far))continue;
  const uncheckedSteps=1+depths.get(far);minimumUncheckedSteps=Math.min(minimumUncheckedSteps,uncheckedSteps);frontier.push({...edge,uncheckedSteps,frontierOrder:index});
 }
 const critical=frontier.filter(edge=>edge.uncheckedSteps===minimumUncheckedSteps).sort((left,right)=>(left.score??Infinity)-(right.score??Infinity)||left.frontierOrder-right.frontierOrder),groups=new Map();
 for(const edge of critical){append(groups,edge.from+'/'+edge.to,edge);if((++work&63)===0)yield;}
 const selected=[],seen=new Set();
 for(let round=0;round<perPair&&selected.length<maxFeatures;round++)for(const group of groups.values()){
  const edge=group[round];if(edge&&!seen.has(edge.guid)){seen.add(edge.guid);selected.push(edge);if(selected.length>=maxFeatures)break;}
  if((++work&63)===0)yield;
 }
 return{forward,backward,frontier,critical,minimumUncheckedSteps:Number.isFinite(minimumUncheckedSteps)?minimumUncheckedSteps:null,selected};
}
