import {tileComponentsJob} from './coarse-components.mjs';

const need=(v,m)=>{if(!v)throw Error(m);},distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
class Heap{
 constructor(){this.rows=[];}
 push(row){const a=this.rows;let i=a.length;a.push(row);while(i){const p=(i-1)>>1;if(a[p][0]<=row[0])break;a[i]=a[p];i=p;}a[i]=row;}
 pop(){const a=this.rows,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
export class WorldCorridors{
 constructor(owner){this.owner=owner;this.pages=new Map();this.anchorCache=new Map();this.componentCache=new Map();}
 *exactAnchor(point,states,bounds,vertical=[point[2]-200,point[2]+200],goal=false){
  const owner=this.owner;
  yield* owner.directJob(point,point,states,{paddingTiles:0,boundsUE:bounds,heightBoundsUE:vertical});
  const planner=owner.window.planner,nav=planner.navMesh,near=planner.query.findNearestPoly({x:point[0]/100,y:point[2]/100,z:-point[1]/100},{halfExtents:{x:1,y:.75,z:1}});
  if(!near.success||!near.nearestRef)return null;
  const decoded=nav.decodePolyId(near.nearestRef),tile=[...owner.window.loaded.values()].find(t=>t.slot===decoded.tileIndex);
  if(!tile?.coarseSeeds?.length||tile.blob!==tile.variants['0'.repeat(tile.conditions.length)])return null;
  // Coarse IDs are assigned in first-polygon order from these exact bytes.
  // Resolve the projected polygon's component, rather than guessing from a
  // short list of spatially close seeds on unrelated roofs and props.
  let groups=this.componentCache.get(tile.blob);
  if(!groups){
   const bytes=yield* owner.blobJob(tile.blob,owner.index.blobs[tile.blob]);
   groups=yield* tileComponentsJob(bytes);
  }
  need(groups.components===tile.coarseSeeds.length,'Coarse component metadata differs from optimistic tile');
  // The digest identifies the exact optimistic tile bytes. Cache only
  // polygon ordinals, never the planner, projection, or directional check.
  this.componentCache.delete(tile.blob);
  this.componentCache.set(tile.blob,groups);
  if(this.componentCache.size>8)this.componentCache.delete(this.componentCache.keys().next().value);
  const ordinal=groups.labels[decoded.tilePolygonIndex];if(ordinal===undefined)return null;
  const [id,...p]=tile.coarseSeeds[ordinal],route=yield* planner.routeJob(goal?p:point,goal?point:p);
  return route.complete?{id,point:p,cost:route.meters*100}:null;
 }
 *node(id){
  const m=this.owner.manifest.corridors;need(Number.isInteger(id)&&id>=0&&id<m.nodes,'Invalid coarse node');const pageID=Math.floor(id/m.pageNodes);
  let page=this.pages.get(pageID);
  if(!page){const text=yield* this.owner.textJob('corridor',pageID);need(text.length<=1048576,'Oversized corridor page');page=JSON.parse(text);need(page.schema===1&&page.world===this.owner.manifest.world&&page.first===pageID*m.pageNodes&&page.nodes.length<=m.pageNodes,'Invalid coarse page');}
  this.pages.delete(pageID);this.pages.set(pageID,page);while(this.pages.size>16)this.pages.delete(this.pages.keys().next().value);
  const row=page.nodes[id-page.first];need(row?.length===7&&row.slice(0,6).every(Number.isFinite)&&Array.isArray(row[6]),'Invalid coarse component');return row;
 }
 *anchors(point,states,goal=false){
  const size=this.owner.manifest.extentCm,x=Math.floor(point[0]/size),y=Math.floor(-point[1]/size),seen=new Set();
  // All candidates in a pass share one fixed window. Previously every seed
  // imported a different dense 3x3 window, even for disconnected components.
  for(const ring of [0,1]){
   const epsilon=.001,bounds=[Math.min(point[0],(x-ring)*size+epsilon),Math.min(point[1],-(y+1+ring)*size+epsilon),Math.max(point[0],(x+1+ring)*size-epsilon),Math.max(point[1],-(y-ring)*size-epsilon)],vertical=[point[2]-200,point[2]+200],metadata=yield* this.owner.metadataJob(bounds,vertical);
   try{const exact=yield* this.exactAnchor(point,states,bounds,vertical,goal);if(exact)return[exact];}catch(error){if(!String(error).match(/budget|capacity/))throw error;}
   const candidates=metadata.tiles.filter(t=>t.x>=x-ring&&t.x<=x+ring&&t.y>=y-ring&&t.y<=y+ring).flatMap(t=>t.coarseSeeds??[]).sort((a,b)=>distance(a.slice(1),point)-distance(b.slice(1),point));
   for(const [id,...p]of candidates.slice(0,8)){
    if(seen.has(id))continue;seen.add(id);
    try{const r=yield* this.owner.directJob(goal?p:point,goal?point:p,states,{paddingTiles:0,boundsUE:bounds,heightBoundsUE:vertical});if(r.complete)return[{id,point:p,cost:r.meters*100}];}catch(error){if(!String(error).includes('budget')&&!String(error).includes('capacity'))throw error;}
   }
  }
  return [];
 }
 *cachedAnchors(point,states,signature,goal){
  // Adjacent goal trials often share the same start. Keep only the tiny
  // verified anchor records; never cache a planner or a mutable tile view.
  const key=JSON.stringify([point,goal,signature]);
  let found=this.anchorCache.get(key);
  if(found)this.anchorCache.delete(key);else found=yield* this.anchors(point,states,goal);
  this.anchorCache.set(key,found);
  while(this.anchorCache.size>16)this.anchorCache.delete(this.anchorCache.keys().next().value);
  return found;
 }
 *path(start,goal,states,options={}){
  const signature=JSON.stringify(Object.entries(states).sort(([a],[b])=>a.localeCompare(b)));
  const starts=yield* this.cachedAnchors(start,states,signature,false),goals=yield* this.cachedAnchors(goal,states,signature,true);
  if(!starts.length||!goals.length)return null;
  const target=new Map(goals.map(r=>[r.id,r])),scores=new Map(),parent=new Map(),via=new Map(),actions=new Map(),heap=new Heap(),heuristic=p=>Math.min(...goals.map(g=>distance(p,g.point)));
  const allowedID=id=>!options.componentIDs||options.componentIDs.has(id);
  const allowedTile=row=>!options.tileKeys||options.tileKeys.has(row.slice(0,3).join(','));
  const validateAction=hint=>{
   need([hint.from,hint.to].every(id=>Number.isInteger(id)&&id>=0&&id<this.owner.manifest.corridors.nodes)&&Number.isFinite(hint.cost)&&hint.cost>0&&typeof hint.guid==='string','Invalid coarse action hint');
   const point=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);need(!hint.entry&&!hint.exit||point(hint.entry)&&point(hint.exit),'Invalid coarse action pad');
  };
  need(!options.actionSource||typeof options.actionSource.fromJob==='function','Invalid coarse movement source');
  need(!options.actionHints||Array.isArray(options.actionHints)&&options.actionHints.length<=1024,'Invalid coarse action hint budget');
  for(const hint of options.actionHints||[]){
   validateAction(hint);
   if(hint.requiresPassable!==undefined){
    need(typeof hint.requiresPassable==='string'&&hint.requiresPassable.length<=220,'Invalid coarse action condition');
    if(states[hint.requiresPassable]!==true){yield;continue;}
   }
   need(hint.reverse===undefined||hint.reverse===true&&!hint.both,'Invalid placed action direction');
   const forward={to:hint.to,cost:hint.cost,guid:hint.guid,entry:hint.entry,exit:hint.exit,reverse:hint.reverse===true};
   if(!actions.has(hint.from))actions.set(hint.from,[]);
   actions.get(hint.from).push(forward);
   if(hint.both){
    if(!actions.has(hint.to))actions.set(hint.to,[]);
    actions.get(hint.to).push({...forward,to:hint.from,entry:hint.exit,exit:hint.entry,reverse:true});
   }
   yield;
  }
  if(!goals.some(goal=>allowedID(goal.id)))return null;
  for(const s of starts){if(!allowedID(s.id)||options.tileKeys&&!allowedTile(yield* this.node(s.id)))continue;scores.set(s.id,s.cost);heap.push([s.cost+heuristic(s.point),s.id,s.cost]);}
  let visited=0,actionWork=0;
  while(heap.rows.length){
   const [,id,cost]=heap.pop();if(scores.get(id)!==cost)continue;
   if(target.has(id)){
    const ids=[id];while(parent.has(ids.at(-1)))ids.push(parent.get(ids.at(-1)));ids.reverse();
    const rows=[];
    for(const component of ids){
     const action=via.get(component),row={id:component,row:yield* this.node(component)};
     if(action){
      row.viaAction=action.guid;
      if(action.entry){row.viaEntry=action.entry.slice();row.viaExit=action.exit.slice();}
      if(action.reverse)row.viaReverse=true;
     }
     rows.push(row);
    }
    return rows;
   }
   if(++visited>(options.maxCoarseNodes??32768))return null;
   const row=yield* this.node(id),p=row.slice(3,6);
   for(const next of row[6]){if(!allowedID(next))continue;const n=yield* this.node(next);if(!allowedTile(n))continue;const g=cost+distance(p,n.slice(3,6));if(g<(scores.get(next)??Infinity)){scores.set(next,g);parent.set(next,id);via.delete(next);heap.push([g+heuristic(n.slice(3,6)),next,g]);}}
   const movement=options.actionSource?yield* options.actionSource.fromJob(id):[];
   need(Array.isArray(movement)&&movement.length<=2048,'Invalid coarse movement adjacency budget');
   let adjacencyChecks=0;
   for(const hint of movement){validateAction(hint);need(hint.from===id&&!hint.both,'Movement adjacency changed direction');if((++adjacencyChecks&31)===0)yield;}
   for(const action of [...(actions.get(id)||[]),...movement]){
    if((++actionWork&15)===0)yield;
    const excluded=options.excludedActions?.get(action.guid.toLowerCase())??0;
    if(excluded&(action.reverse?2:1))continue;
    const next=action.to;
    if(!allowedID(next))continue;
    const neighbor=yield* this.node(next);
    if(!allowedTile(neighbor))continue;
    const nextCost=cost+Math.max(action.cost,distance(p,neighbor.slice(3,6)));
    if(nextCost>=(scores.get(next)??Infinity))continue;
    scores.set(next,nextCost);parent.set(next,id);via.set(next,action);
    heap.push([nextCost+heuristic(neighbor.slice(3,6)),next,nextCost]);
   }
   if(visited%32===0)yield;
  }
  return null;
 }
 *routeJob(start,goal,states,options={}){
  const corridor=yield* this.path(start,goal,states,{...options,actionHints:undefined,actionSource:undefined});if(!corridor)return null;
  const points=[],corners=[];let current=start,last=null,index=0,complete=true;
  const width=Math.max(1,Math.floor(Math.sqrt(this.owner.window.maxTiles))-3),targets=[...corridor.map(n=>n.row.slice(3,6)),goal];
  const append=result=>{
   if(points.length&&result.points.length&&distance(points.at(-1),result.points[0])>2)return false;
   for(const p of result.points)if(!points.length||distance(points.at(-1),p)>.1)points.push(p);
   corners.push(...result.corners);return true;
  };
  while(index<targets.length){
   let stop=Math.min(targets.length-1,index+width-1),result;
   for(;;){
    try{
     const rows=corridor.slice(Math.max(0,index-1),Math.min(corridor.length,stop+1)).map(n=>n.row),size=this.owner.manifest?.extentCm;
     const tileKeys=rows.length?rows.map(r=>r.slice(0,3).join(',')):undefined;
     const boundsUE=size&&rows.length?[Math.min(current[0],targets[stop][0],...rows.map(r=>r[0]*size+.001)),Math.min(current[1],targets[stop][1],...rows.map(r=>-(r[1]+1)*size+.001)),Math.max(current[0],targets[stop][0],...rows.map(r=>(r[0]+1)*size-.001)),Math.max(current[1],targets[stop][1],...rows.map(r=>-r[1]*size-.001))]:undefined;
     result=yield* this.owner.directJob(current,targets[stop],states,{...options,paddingTiles:1,boundsUE,tileKeys});
     // A rectangle between distant representatives can clip the very detour
     // proved by the coarse chain. Retry a shorter prefix just as for a
     // capacity failure, before treating this as an unavailable connection.
     if(!result.complete&&stop>index){stop=index+Math.floor((stop-index)/2);yield;continue;}
     break;
    }
    catch(error){if((String(error).includes('budget')||String(error).includes('capacity'))&&stop>index){stop=index+Math.floor((stop-index)/2);continue;}throw error;}
   }
   last=result;if(!append(result)){complete=false;last={...result,reason:'coarse segment projection gap'};break;}
   if(!result.complete||points.length>=16384){complete=false;break;}
   current=points.at(-1);index=stop+1;yield;
  }
  if(!last)return null;
  return{...last,start,goal,complete:complete&&index===targets.length,partial:!complete||index!==targets.length,points,corners,
   meters:points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0)/100,coarseCorridor:true,coarseComponents:corridor.length,
   completeCollisionClaim:false,physicalVerified:false};
 }
}
