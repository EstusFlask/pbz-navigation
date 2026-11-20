// Candidate falls come only from resident Detour polygon boundaries. Every
// candidate still requires the current player's policy and full scene checks.
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const sameCoordinate=(a,b)=>a===b||a!==a&&b!==b;
// Resolve hot-loop intrinsics once, including in the isolated JS host.
const roundCoordinate=Math.round,hashMultiply=Math.imul;
// An external link covers its quantized interval. Internal links cover
// their entire edge. Keep intervals only for polygons with partial links.
function coverEdge(data,edge,side,min,max){
 if(data.linked.has(edge))return;
 if(side===0xff||min===0&&max===255){
  data.linked.add(edge);
  data.partial?.delete(edge);
  return;
 }
 if(min>max)throw Error('Invalid movement portal interval');
 const partial=data.partial??=new Map();
 if(!partial.has(edge))partial.set(edge,[]);
 partial.get(edge).push([min,max]);
}
const fullEdge=[[0,1]];
function exposedEdge(intervals){
 if(!intervals?.length)return fullEdge;
 const result=[];
 let boundary=0;
 for(const [min,max] of intervals.slice().sort((a,b)=>a[0]-b[0])){
  if(min>boundary)result.push([boundary/255,min/255]);
  boundary=Math.max(boundary,max);
 }
 if(boundary<255)result.push([boundary/255,1]);
 return result;
}
function polyData(planner,ref){
 // Read the stock dtMeshHeader/dtPoly/dtLink layout from its owned heap
 // buffer. These are the same mutable links built by Detour/admission.
 // Do not retain a heap view across yields or native allocations.
 const h=planner.header,slot=Math.floor((ref>>>0)/h.maxPolys)%h.maxTiles,index=(ref>>>0)%h.maxPolys,data=planner.tileBuffers.get(slot);
 if(!data)return null;
 const bytes=data.getHeapView(),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),np=v.getInt32(24,true),nv=v.getInt32(28,true),links=v.getInt32(32,true),at=100+nv*12+index*32,linkAt=100+nv*12+np*32;
 if(v.getUint32(0,true)!==0x444e4156||v.getInt32(4,true)!==7||index>=np||linkAt+links*12>bytes.length)throw Error('Unsupported resident movement tile layout');
 const vertices=[],neighbors=[],result={vertices,neighbors,linked:new Set()};
 for(let j=0;j<v.getUint8(at+30);j++){const i=100+v.getUint16(at+4+j*2,true)*12;vertices.push({x:v.getFloat32(i,true),y:v.getFloat32(i+4,true),z:v.getFloat32(i+8,true)});}
 let link=v.getUint32(at,true),count=0;
 while(link!==0xffffffff&&++count<=links){
  if(link>=links)throw Error('Invalid resident movement link');
  const p=linkAt+link*12,to=v.getUint32(p,true);
  link=v.getUint32(p+4,true);
  if(to){coverEdge(result,v.getUint8(p+8),v.getUint8(p+9),v.getUint8(p+10),v.getUint8(p+11));neighbors.push(to);}
 }
 return result;
}
function rayPolygon(vertices,p,nx,nz,maximum){
 let area=0;for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];area+=a.x*b.z-a.z*b.x;}
 const sign=area>=0?1:-1;let low=.001,high=maximum;
 for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length],dx=b.x-a.x,dz=b.z-a.z,c=sign*(dx*(p.z-a.z)-dz*(p.x-a.x)),s=sign*(dx*nz-dz*nx);
  if(Math.abs(s)<1e-9){if(c<0)return null;continue;}
  const t=-c/s;if(s>0)low=Math.max(low,t);else high=Math.min(high,t);if(low>high)return null;
 }
 return low+Math.min(.25,(high-low)/2);
}
function* movementProposalsJob(group,options,resolve,limited=()=>false){
 const ordered=group.slice().sort((a,b)=>a.score-b.score),selected=[];
 let work=0;
 for(const item of ordered){
  if((++work&63)===0)yield;
  if(selected.some(p=>Math.hypot(p.a[0]-item.a[0],p.a[1]-item.a[1])<150&&Math.hypot(p.b[0]-item.b[0],p.b[1]-item.b[1])<150))continue;
  const verified=resolve?yield* resolve(item):item;
  if(verified)selected.push(verified);
  if(selected.length>=24||limited())break;
 }
 if(options.envelopeBands&&!limited()){
  const band=p=>Math.floor((p.a[2]-p.b[2])/50)+'/'+Math.floor(p.span/100),seen=new Set(selected.map(band));
  for(const item of ordered){
   if((++work&63)===0)yield;
   if(seen.has(band(item)))continue;
   const verified=resolve?yield* resolve(item):item;
   if(limited())break;
   if(!verified)continue;
   const id=band(verified);if(seen.has(id))continue;
   seen.add(id);selected.push(verified);if(selected.length>=96)break;
  }
 }
 return selected;
}
export function selectMovementProposals(group,options={}){
 const job=movementProposalsJob(group,options);let row;
 do{row=job.next();}while(!row.done);
 return row.value;
}
function* rankFeatures(features,scores,chain,pruneGeometry=false,maximum,representatives){
 const getScore=(f,i)=>{const value=scores instanceof Map?scores.get(f):scores?.[i];return Number.isNaN(value)||value===undefined?Infinity:value;};
 const hasScore=(f,i)=>scores instanceof Map?scores.has(f):!!scores&&!Number.isNaN(scores[i]);
 const priority=(feature,score)=>chain.has(feature.guid)?2:feature.source==='game-placement'&&!feature.topologyClosed&&Number.isFinite(score)?1:0;
 const limit=Number.isSafeInteger(maximum)&&maximum>0?maximum:Infinity;let irrelevantGeometry=0,availableFeatures=0;
 if(limit!==Infinity){
  const chainFlags=new Uint8Array(features.length);
  const scoreAt=i=>getScore(features[i],i);
  const compare=(a,b)=>{
   const priority=chainFlags[b]-chainFlags[a];
   if(priority)return priority;
   const first=scoreAt(a),last=scoreAt(b);
   return first<last?-1:first>last?1:a-b;
  };
  const boundedHeap=capacity=>{
   const values=new Int32Array(capacity);let size=0;
   return {
    offer(i){
     if(size<capacity){
      let at=size++;
      while(at){const parent=(at-1)>>1;if(compare(values[parent],i)>=0)break;values[at]=values[parent];at=parent;}
      values[at]=i;return;
     }
     if(compare(i,values[0])>=0)return;
     let at=0;
     while(at*2+1<size){
      let child=at*2+1;
      if(child+1<size&&compare(values[child+1],values[child])>0)child++;
      if(compare(i,values[child])>=0)break;
      values[at]=values[child];at=child;
     }
     values[at]=i;
    },
    entries:()=>values.subarray(0,size)
   };
  };
  const normal=boundedHeap(limit),reserve=representatives&&limit>=4?boundedHeap(Math.floor(limit/4)):null;
  for(let i=0;i<features.length;i++){
   const f=features[i],score=scoreAt(i);
   if(pruneGeometry&&f.source==='recast-boundary'&&hasScore(f,i)&&!Number.isFinite(score))irrelevantGeometry++;
   else{
    availableFeatures++;chainFlags[i]=priority(f,score);normal.offer(i);
    if(reserve&&representatives.has(i))reserve.offer(i);
   }
   if((i&63)===63)yield;
  }
  let source=Array.from(normal.entries()),target=new Array(source.length);
  for(let at=0;at<source.length;at+=256){const part=source.slice(at,at+256).sort(compare);for(let i=0;i<part.length;i++)source[at+i]=part[i];yield;}
  let work=0;for(let width=256;width<source.length;width*=2){for(let at=0;at<source.length;at+=2*width){let a=at,b=Math.min(source.length,at+width);const endA=b,endB=Math.min(source.length,at+width*2);for(let out=at;out<endB;out++){target[out]=a<endA&&(b>=endB||compare(source[a],source[b])<=0)?source[a++]:source[b++];if((++work&255)===0)yield;}}[source,target]=[target,source];}
  const chosen=[];
  if(reserve){
   // Keep preferred chains and placed actions ahead of geometric alternatives.
   // Use at most a quarter of the existing shortlist for pair representatives.
   const placed=source.findIndex(i=>chainFlags[i]===0),prefix=placed<0?source.length:placed;
   const pinned=new Set(source.slice(0,prefix));
   const diverse=Array.from(reserve.entries()).sort(compare).filter(i=>!pinned.has(i)).slice(0,limit-prefix);
   const promoted=new Set(diverse);
   chosen.push(...source.slice(0,prefix),...diverse);
   for(let i=prefix;i<source.length&&chosen.length<limit;i++)if(!promoted.has(source[i]))chosen.push(source[i]);
  }else chosen.push(...source);
  const ranked=[];
  for(let i=0;i<chosen.length;i++){ranked.push(features[chosen[i]]);if((i&63)===63)yield;}
  return{ranked,irrelevantGeometry,availableFeatures,rankingHeapSlots:normal.entries().length,rankingCandidateObjects:0};
 }
 const compare=(a,b)=>b.chain-a.chain||(a.score<b.score?-1:a.score>b.score?1:a.i-b.i);let source=[];
 for(let i=0;i<features.length;i++){const f=features[i],score=getScore(f,i);if(pruneGeometry&&f.source==='recast-boundary'&&hasScore(f,i)&&!Number.isFinite(score))irrelevantGeometry++;else{availableFeatures++;source.push({f,i,score,chain:priority(f,score)});}if((i&63)===63)yield;}
 for(let at=0;at<source.length;at+=256){const part=source.slice(at,at+256).sort(compare);for(let i=0;i<part.length;i++)source[at+i]=part[i];yield;}
 let target=new Array(source.length),work=0;
 for(let width=256;width<source.length;width*=2){
  for(let at=0;at<source.length;at+=2*width){let a=at,b=Math.min(source.length,at+width);const endA=b,endB=Math.min(source.length,at+width*2);for(let out=at;out<endB;out++){target[out]=a<endA&&(b>=endB||compare(source[a],source[b])<=0)?source[a++]:source[b++];if((++work&255)===0)yield;}}
  [source,target]=[target,source];
 }
 const ranked=[];for(let i=0;i<source.length;i++){ranked.push(source[i].f);if((i&63)===63)yield;}return{ranked,irrelevantGeometry,availableFeatures,rankingHeapSlots:0,rankingCandidateObjects:availableFeatures};
}
// This graph is a search hint, never a physical certificate. It prevents
// Euclidean action search spending its connector quota on unrelated floors.
// The graph belongs to one resident, immutable Detour window only.
export function* actionTopology(planner,start,goal,features,options={}){
 const origin=planner.origin??[0,0,0],q=planner.query,n=planner.navMesh,state=planner.movementTopology||={labels:new Map(),points:new Map(),polygons:new Map(),visited:0,island:0}, {labels,points}=state;let {visited,island}=state;
 let completed=false;try{
 let projections=0;
 const locate=p=>{
  const x=roundCoordinate(p[0]*10),y=roundCoordinate(p[1]*10),z=roundCoordinate(p[2]*10),k=hashMultiply(x,73856093)^hashMultiply(y,19349663)^hashMultiply(z,83492791),head=points.get(k);
  // Verify the complete quantized coordinates even when the integer hash
  // collides or truncates a large value. Read coordinates on every lookup
  // so callers can mutate a point without retaining its former polygon.
  for(let entry=head;entry;entry=entry.next)if(sameCoordinate(entry.x,x)&&sameCoordinate(entry.y,y)&&sameCoordinate(entry.z,z))return entry.ref;
  projections++;
  const row=q.findNearestPoly({x:(p[0]-origin[0])/100,y:(p[2]-origin[2])/100,z:-(p[1]-origin[1])/100},{halfExtents:{x:1,y:.9,z:1}});
  const ref=row.success?row.nearestRef:0;
  points.set(k,{x,y,z,ref,next:head});
  return ref;
 };
 const extra=[];let totalPolygons;
 if(options.allComponents){
  totalPolygons=0;
  for(let slot=0;slot<(n.getMaxTiles?.()??0);slot++){
   const tile=n.getTile(slot),header=tile?.header();if(!header)continue;
   const count=header.polyCount(),base=n.getPolyRefBase(tile)>>>0;totalPolygons+=count;
   // At most 65536 components can be labelled by this bounded graph. Keep
   // known polygons even when the capacity is exhausted; report partial
   // discovery rather than calling an unvisited platform covered.
   for(let i=0;i<count&&extra.length<66000;i++)extra.push((base+i)>>>0);
   yield;
  }
 }
 const goals=[goal,...(options.additionalGoals||[])];
 const featureRefs=new Uint32Array(features.length*2),endpoints=function*(){yield start;yield* goals;for(const f of features){yield f.path[0];yield f.path.at(-1);}yield* extra;};let pointWork=0,endpointIndex=-2-goals.length;
 for(const p of endpoints()){
  endpointIndex++;
  const ref=typeof p==='number'?p:locate(p);if(endpointIndex>=0&&endpointIndex<featureRefs.length)featureRefs[endpointIndex]=ref;
  // Cache hits and numeric polygon references need no native projection.
  // Keep the projection bound and yield separately for consecutive hits.
  if(++pointWork>=128||projections>=4){pointWork=0;projections=0;yield;}
  if(!ref||labels.has(ref))continue;
  if(visited>=65536)continue;
  const todo=[ref],id=island++;
  for(let i=0;i<todo.length;i++){
   const ref=todo[i];if(labels.has(ref))continue;
   // Unknown nodes stay unclassified when the bounded graph is exhausted.
   if(visited>=65536)break;
   let data=polyData(planner,ref);
   if(!data){
    const row=n.getTileAndPolyByRef(ref);
    if(!row.success)continue;
    const vertices=[],neighbors=[];
    data={vertices,neighbors,linked:new Set()};
    let link=row.poly.firstLink()>>>0,count=0;
    while(link!==0xffffffff&&++count<=row.tile.header().maxLinkCount()){
     const edge=row.tile.links(link),to=edge.ref()>>>0;
     link=edge.next()>>>0;
     if(to){coverEdge(data,edge.edge(),edge.side(),edge.bmin(),edge.bmax());neighbors.push(to);}
    }
    for(let j=0;j<row.poly.vertCount();j++){
     const i=row.poly.verts(j)*3;
     vertices.push({x:row.tile.verts(i),y:row.tile.verts(i+1),z:row.tile.verts(i+2)});
    }
   }
   labels.set(ref,id);visited++;
   for(const to of data.neighbors)if(!labels.has(to))todo.push(to);
   const {vertices,linked,partial}=data;
   state.polygons.set(ref,{ref,component:id,vertices,linked,...(partial?.size?{partial}:{})});
   if((visited&15)===0)yield;
  }
  yield;
 }
 state.visited=visited;state.island=island;
 const component=p=>labels.get(locate(p)),from=component(start),targets=new Set(),count=features.length,nodeCount=island;
 for(const p of goals){const target=component(p);if(target!==undefined)targets.add(target);}
 const componentA=new Int32Array(count),componentB=new Int32Array(count),featureClass=new Uint8Array(count);
 const outCount=new Uint32Array(nodeCount),inCount=new Uint32Array(nodeCount);
 let directedEdges=0,pendingEdges=0,featureWork=0,sameComponentCount=0,pendingAction;
 for(let i=0;i<count;i++){
  const f=features[i];if((++featureWork&63)===0)yield;
  const a=labels.get(featureRefs[i*2]),b=labels.get(featureRefs[i*2+1]);if(a===undefined||b===undefined)continue;
  componentA[i]=a;componentB[i]=b;
  if(a===b){featureClass[i]=1;sameComponentCount++;continue;}
  featureClass[i]=f.topologyClosed?3:2;
  if(f.topologyClosed&&!options.pendingMechanisms)continue;
  const directions=Number(!f.noForward)+Number(!!f.both&&!f.noReverse);
  if(f.topologyClosed)pendingEdges+=directions;else directedEdges+=directions;
  if(!f.noForward){outCount[a]++;inCount[b]++;}
  if(f.both&&!f.noReverse){outCount[b]++;inCount[a]++;}
 }
 const baseScratch=featureRefs.byteLength+componentA.byteLength+componentB.byteLength+featureClass.byteLength+outCount.byteLength+inCount.byteLength;
 const finish=(selected,chain,reachableTargetComponents,topologyScratchBytes,ranking)=>{
  completed=true;
  return {
   features:selected,component,componentConnectors:true,refComponent:ref=>labels.get(ref),
   ...(pendingAction?{pendingAction}:{}),
   canConnect:(a,b)=>{const x=component(a),y=component(b);return x!==undefined&&y!==undefined&&x===y;},
   stats:{islands:island,polygons:visited,totalPolygons,allComponents:totalPolygons===undefined?undefined:visited===totalPolygons,
    topologyEdges:directedEdges,topologyEdgeObjects:0,sameComponentFeatures:sameComponentCount,topologyScratchBytes,
    rankingHeapSlots:ranking.rankingHeapSlots,rankingCandidateObjects:ranking.rankingCandidateObjects,chain,
    ...(options.additionalGoals?.length?{targetComponents:targets.size,reachableTargetComponents}:{}),
    ...(options.relevantOnly?{irrelevantGeometry:ranking.irrelevantGeometry}:{}),
    ...(options.maxRankedFeatures?{rankedFeatures:selected.length,availableFeatures:ranking.availableFeatures}:{})}
  };
 };
 const hasTerminal=from!==undefined&&(targets.has(from)||outCount[from]>0&&[...targets].some(target=>inCount[target]>0));
 if(!hasTerminal){
  // Every route score would be infinite. Preserve the stable recovery order
  // while skipping the adjacency, cost and heap scans for this window.
  const limit=Number.isSafeInteger(options.maxRankedFeatures)&&options.maxRankedFeatures>0?Math.min(count,options.maxRankedFeatures):count;
  const selected=[];
  for(let i=0;i<limit;i++){selected.push(features[i].sourceFeature||features[i]);if((i&63)===63)yield;}
  return finish(selected,[],0,baseScratch,{irrelevantGeometry:0,availableFeatures:count,rankingHeapSlots:0,rankingCandidateObjects:0});
 }
 const edgeCost=new Float64Array(count),scores=new Float64Array(count);scores.fill(NaN);
 // Signed candidate indexes encode direction; CSR adjacency avoids allocating
 // short-lived edge objects and per-edge references for large proposal sets.
 const outOffsets=new Uint32Array(nodeCount+1),inOffsets=new Uint32Array(nodeCount+1);let adjacencyWork=0;
 for(let node=0;node<nodeCount;node++){outOffsets[node+1]=outOffsets[node]+outCount[node];inOffsets[node+1]=inOffsets[node]+inCount[node];if((++adjacencyWork&255)===0)yield;}
 const outEdges=new Int32Array(directedEdges+pendingEdges),inEdges=new Int32Array(directedEdges+pendingEdges);
 let outCursor=new Uint32Array(outOffsets),inCursor=new Uint32Array(inOffsets),longest=1;
 for(let i=0;i<count;i++){
  const type=featureClass[i],feature=features[i];
  if(type){
   scores[i]=Infinity;edgeCost[i]=Math.max(1,distance(feature.path[0],feature.path.at(-1)));
   if(pendingEdges)longest=Math.max(longest,edgeCost[i]);
  }
  if(type===2||type===3&&pendingEdges){
   const a=componentA[i],b=componentB[i],forward=i+1;
   if(!feature.noForward){outEdges[outCursor[a]++]=forward;inEdges[inCursor[b]++]=forward;}
   if(feature.both&&!feature.noReverse){outEdges[outCursor[b]++]=-forward;inEdges[inCursor[a]++]=-forward;}
  }
  if((++adjacencyWork&63)===0)yield;
 }
 outCursor=null;inCursor=null;
 const pendingPenalty=longest*nodeCount+1;
 const shortest=function*(sources,reverse=false,allowPending=false){const costs=new Map(),prev=new Map(),todo=[...sources],offsets=reverse?inOffsets:outOffsets,adjacent=reverse?inEdges:outEdges;for(const source of todo)costs.set(source,0);
  while(todo.length){todo.sort((a,b)=>costs.get(a)-costs.get(b));const a=todo.shift();let work=0;for(let at=offsets[a];at<offsets[a+1];at++){
    if((++work&31)===0)yield;
    const code=adjacent[at],index=Math.abs(code)-1,closed=featureClass[index]===3;
    if(closed&&!allowPending)continue;
    const edgeFrom=code<0?componentB[index]:componentA[index],edgeTo=code<0?componentA[index]:componentB[index],b=reverse?edgeFrom:edgeTo;
    const c=costs.get(a)+edgeCost[index]+(closed?pendingPenalty:0);
    if(c<(costs.get(b)??Infinity)){costs.set(b,c);prev.set(b,code);if(!todo.includes(b))todo.push(b);}
   }yield;}return{costs,prev};};
 // Rank toward all of the already checked standing positions. Keep the
 // first reachable target as the preferred chain for stable guidance.
 const forward=yield* shortest([from]),chain=new Set();
 const reachableTargets=[...targets].filter(target=>forward.costs.has(target)),preferred=reachableTargets[0];
 if(preferred!==undefined){let at=preferred,work=0;while(at!==from){const code=forward.prev.get(at);if(!code)break;const index=Math.abs(code)-1;chain.add(features[index].guid);at=code<0?componentB[index]:componentA[index];if((++work&63)===0)yield;}}
 let preferredFeatures=chain,rankingTargets=targets;
 if(preferred===undefined&&pendingEdges){
  // Pending gates only identify a checked approach worth attempting. The
  // action search still treats the gate as closed and verifies the prefix.
  const pending=yield* shortest(targets,true,true),prefix=new Set();let at=from,work=0;
  while(pending.prev.has(at)){
   const code=pending.prev.get(at),index=Math.abs(code)-1,guid=features[index].guid;
   prefix.add(guid);
   if(featureClass[index]===3){
    pendingAction={guid,reverse:code<0};preferredFeatures=prefix;rankingTargets=[at];break;
   }
   at=code<0?componentA[index]:componentB[index];
   if((++work&63)===0)yield;
  }
 }
 const back=yield* shortest(rankingTargets,true);
 yield;
 const byPair=options.diverseRecovery&&reachableTargets.length&&options.maxRankedFeatures>=4?new Map():null;
 const offerPair=(from,to,index,score)=>{
  if(!Number.isFinite(score))return;
  // Component IDs are bounded by the polygon classification budget.
  const pair=from*65536+to;
  const previous=byPair.get(pair);
  if(!previous||score<previous.score)byPair.set(pair,{index,score});
 };
 let scoreWork=0;
 for(let i=0;i<count;i++){
  if(featureClass[i]===1||featureClass[i]===2){
   const a=componentA[i],b=componentB[i],cost=edgeCost[i],feature=features[i];
   const forwardScore=feature.noForward?Infinity:(forward.costs.get(a)??Infinity)+cost+(back.costs.get(b)??Infinity);
   const reverseScore=featureClass[i]===2&&feature.both&&!feature.noReverse?(forward.costs.get(b)??Infinity)+cost+(back.costs.get(a)??Infinity):Infinity;
   scores[i]=Math.min(forwardScore,reverseScore);
   if(byPair&&featureClass[i]===2&&feature.source==='recast-boundary'){
    offerPair(a,b,i,forwardScore);
    offerPair(b,a,i,reverseScore);
   }
  }
  if((++scoreWork&63)===0)yield;
 }
 // If a complete optimistic chain already exists, an edge with no finite
 // start-to-goal score cannot participate in any complete alternative in
 // this immutable window. Native/closed interactions remain available for
 // condition reporting. Incomplete graphs retain their exploratory inputs.
 const pruneGeometry=!!options.relevantOnly&&reachableTargets.length>0;
 let representatives;
 if(byPair){
  representatives=new Set();let work=0;
  for(const {index} of byPair.values()){
   representatives.add(index);
   if((++work&63)===0)yield;
  }
 }
 const ranking=yield* rankFeatures(features,scores,preferredFeatures,pruneGeometry,options.maxRankedFeatures,representatives);
 const topologyScratchBytes=baseScratch+edgeCost.byteLength+scores.byteLength+outOffsets.byteLength+inOffsets.byteLength+outEdges.byteLength+inEdges.byteLength;
 return finish(ranking.ranked.map(f=>f.sourceFeature||f),[...chain],reachableTargets.length,topologyScratchBytes,ranking);
 }finally{if(!completed&&planner.movementTopology===state)planner.movementTopology=null;}
}

export function* discoverFalls(planner,seeds,options={}){
 const height=Number(options.maxHeightCm),run=Number(options.maxRunCm);
 if(!(height>=100&&height<=2000&&run>=100&&run<=2000))return[];
 const origin=planner.origin??[0,0,0],ue=p=>[origin[0]+p.x*100,origin[1]-p.z*100,origin[2]+p.y*100],q=planner.query;
 if(options.sourceBoundsUE&&(!Array.isArray(options.sourceBoundsUE)||options.sourceBoundsUE.length!==4||!options.sourceBoundsUE.every(Number.isFinite)||options.sourceBoundsUE[0]>options.sourceBoundsUE[2]||options.sourceBoundsUE[1]>options.sourceBoundsUE[3]))throw Error('Invalid movement field source bounds');
 const topology=yield* actionTopology(planner,seeds[0],options.goal||seeds[0],seeds.slice(0,48).map((p,i)=>({guid:'seed'+i,path:[p,p]})),options);
 const polygons=[...planner.movementTopology.polygons.values()],size=Math.max(2,run/100),bins=new Map(),tips=new Map();let work=0;
 for(const poly of polygons){
  const v=poly.vertices,center={x:v.reduce((s,p)=>s+p.x,0)/v.length,z:v.reduce((s,p)=>s+p.z,0)/v.length};
  const a=v[0];let plane=null;for(let j=1;j<v.length-1;j++){const b=v[j],c=v[j+1],nx=(b.y-a.y)*(c.z-a.z)-(b.z-a.z)*(c.y-a.y),ny=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z),nz=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(Math.abs(ny)>1e-9){plane={a,nx,ny,nz};break;}}
  poly.plane=plane;
  poly.minY=Math.min(...v.map(p=>p.y));poly.maxY=Math.max(...v.map(p=>p.y));
  const xmin=Math.floor(Math.min(...v.map(p=>p.x))/size),xmax=Math.floor(Math.max(...v.map(p=>p.x))/size),zmin=Math.floor(Math.min(...v.map(p=>p.z))/size),zmax=Math.floor(Math.max(...v.map(p=>p.z))/size);
  if((xmax-xmin+1)*(zmax-zmin+1)>256)continue;
  for(let x=xmin;x<=xmax;x++)for(let z=zmin;z<=zmax;z++){const id=x+','+z;if(!bins.has(id))bins.set(id,[]);bins.get(id).push(poly);}
  for(let i=0;i<v.length;i++)if(!poly.linked.has(i))for(const [lo,hi] of exposedEdge(poly.partial?.get(i))){
   const a=v[i],b=v[(i+1)%v.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.001)continue;
   let nx=dz/length,nz=-dx/length;if(nx*((a.x+b.x)/2-center.x)+nz*((a.z+b.z)/2-center.z)<0){nx=-nx;nz=-nz;}
   const count=Math.min(16,Math.max(1,Math.ceil(length*(hi-lo)/1.5)));
   for(let j=0;j<count;j++){const t=lo+(hi-lo)*(j+.5)/count,p={x:a.x+dx*t,y:a.y+(b.y-a.y)*t,z:a.z+dz*t},d=Math.hypot(center.x-p.x,center.z-p.z)||1,inset=Math.min(.15,d*.25);p.x+=(center.x-p.x)*inset/d;p.z+=(center.z-p.z)*inset/d;
    const id=poly.component+'/'+Math.round(p.x/.75)+','+Math.round(p.z/.75)+','+Math.round(p.y/.5);if(!tips.has(id))tips.set(id,{p,nx,nz,ref:poly.ref,component:poly.component});
   }
  }
  if((++work&15)===0)yield;
 }
 const groups=new Map();let probes=0;
 for(const edge of tips.values()){
  const targets=new Set(),x=Math.floor(edge.p.x/size),z=Math.floor(edge.p.z/size);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of bins.get((x+dx)+','+(z+dz))||[])if(p.component!==edge.component&&edge.p.y-p.minY<=height/100+1&&p.minY-edge.p.y<=2)targets.add(p);
  for(const poly of targets){
   let closest=null,distance2=Infinity;
   for(let i=0;i<poly.vertices.length;i++){const a=poly.vertices[i],b=poly.vertices[(i+1)%poly.vertices.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((edge.p.x-a.x)*dx+(edge.p.z-a.z)*dz)/(dx*dx+dz*dz||1))),p={x:a.x+dx*t,z:a.z+dz*t},d=(p.x-edge.p.x)**2+(p.z-edge.p.z)**2;if(d<distance2){distance2=d;closest=p;}}
   if(!closest||distance2>(run/100)**2)continue;
   const d=Math.sqrt(distance2)||1,nx=(closest.x-edge.p.x)/d,nz=(closest.z-edge.p.z)/d;
   // The closest boundary may lie behind the launch if the lower
   // polygon overlaps it. Only the outward ray can justify this fallback.
   const overlapRecovery=nx*edge.nx+nz*edge.nz<-.15;
   const rays=overlapRecovery?[[edge.nx,edge.nz]]:[[edge.nx,edge.nz],[nx,nz]];
   for(const [dx,dz]of rays){
    const r=rayPolygon(poly.vertices,edge.p,dx,dz,run/100);if(r===null)continue;
    const p={x:edge.p.x+dx*r,z:edge.p.z+dz*r,y:edge.p.y},cx=poly.vertices.reduce((s,v)=>s+v.x,0)/poly.vertices.length,cz=poly.vertices.reduce((s,v)=>s+v.z,0)/poly.vertices.length,cd=Math.hypot(cx-p.x,cz-p.z)||1,inset=Math.min(.15,cd*.25);p.x+=(cx-p.x)*inset/cd;p.z+=(cz-p.z)*inset/cd;
    const plane=poly.plane;if(!plane)continue;p.y=plane.a.y-(plane.nx*(p.x-plane.a.x)+plane.nz*(p.z-plane.a.z))/plane.ny;
    const a=ue(edge.p),b=ue(p),drop=a[2]-b[2],span=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(options.sourceBoundsUE&&(a[0]<options.sourceBoundsUE[0]||a[1]<options.sourceBoundsUE[1]||a[0]>options.sourceBoundsUE[2]||a[1]>options.sourceBoundsUE[3]))continue;
    if(drop< -Math.min(200,options.maxRiseCm??200)||drop>height||span>run+1)continue;
    if(overlapRecovery&&(drop<100||(p.x-edge.p.x)*edge.nx+(p.z-edge.p.z)*edge.nz<=0))continue;
    const id=edge.component+'>'+poly.component;if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push({a,b,ref:edge.ref,target:poly.ref,kind:drop<100?'surface':'fall',source:'recast-boundary',overlapRecovery,span,score:span+distance(a,seeds[0])*.05});
   }
   if((++probes&31)===0)yield;
  }
  yield;
 }
 const answer=[];
 let reachable,approaches,heightProbes=0,heightLimitedGroups=0;
 if(options.allComponents){
  // A field can retain routes leaving its known standing pads and routes
  // arriving at them. Traverse the latter backwards for membership only;
  // this never emits a reversed fall. Surfaces may be followed either way.
  const roots=new Set(seeds.map(p=>topology.component(p)).filter(id=>id!==undefined)),outgoing=new Map(),incoming=options.inboundRoots?new Map():null;
  const add=(map,from,to)=>{if(!map.has(from))map.set(from,[]);map.get(from).push(to);};
  const link=(from,to)=>{add(outgoing,from,to);if(incoming)add(incoming,to,from);};
  for(const [id,items]of groups){
   const [from,to]=id.split('>').map(Number);link(from,to);
   // This is an optimistic membership hint. Exact endpoint heights and the
   // later movement policy remain authoritative for the emitted candidate.
   if(items.some(item=>item.kind==='surface'))link(to,from);
   yield;
  }
  const expand=function*(edges){const seen=new Set(roots),queue=[...roots];let steps=0;
   for(let i=0;i<queue.length;i++){for(const to of edges.get(queue[i])||[]){if(!seen.has(to)){seen.add(to);queue.push(to);}if((++steps&63)===0)yield;}if((i&31)===0)yield;}
   return seen;
  };
  reachable=yield* expand(outgoing);
  if(incoming)approaches=yield* expand(incoming);
 }
 for(const [id,group]of groups){
  let candidates=group,reverseOnly=false;
  if(reachable){
   const [from,to]=id.split('>').map(Number),direct=reachable.has(from)||approaches?.has(to);
   if(!direct){
    if(!reachable.has(to)&&!approaches?.has(from))continue;
    reverseOnly=true;
    // A distinct surface on the same pair must not reverse a fall row.
    candidates=group.filter(item=>item.kind==='surface');
   }
  }
  const project=p=>({x:(p[0]-origin[0])/100,y:(p[2]-origin[2])/100,z:-(p[1]-origin[1])/100});
  const checked=new Map(),movementLimit=options.envelopeBands?96:24,probeLimit=movementLimit*4;
  let limited=false;
  function* measure(item){
   if(checked.has(item))return checked.get(item);
   if(checked.size>=probeLimit){limited=true;return null;}
   const first=q.getPolyHeight(item.ref,project(item.a)),last=q.getPolyHeight(item.target,project(item.b));
   let verified=null;
   if(first.success&&last.success&&Number.isFinite(first.height)&&Number.isFinite(last.height)){
    const a=[item.a[0],item.a[1],origin[2]+first.height*100],b=[item.b[0],item.b[1],origin[2]+last.height*100],drop=a[2]-b[2];
    if(drop<=height&&drop>= -Math.min(200,options.maxRiseCm??200)&&(!reverseOnly||drop<100)&&(!item.overlapRecovery||drop>=100))verified={...item,a,b,kind:drop<100?'surface':'fall'};
   }
   checked.set(item,verified);
   yield;
   return verified;
  }
  // Keep the existing qualified preferences. If a detail-height failure
  // consumed a slot, look for checked replacements without preempting them.
  const ordinary=candidates.filter(item=>!item.overlapRecovery);
  const primary=yield* movementProposalsJob(ordinary,options),kept=new Set();
  for(const item of primary){const verified=yield* measure(item);if(verified){answer.push(verified);kept.add(verified);}}
  if(kept.size<primary.length||kept.size<movementLimit&&ordinary.length<candidates.length){
   const measured=yield* movementProposalsJob(candidates,options,measure,()=>limited);
   for(const item of measured){
    if(kept.has(item))continue;
    answer.push({...item,boundaryRecovery:true});
    kept.add(item);
    if(kept.size>=movementLimit)break;
   }
  }
  heightProbes+=checked.size;
  if(limited)heightLimitedGroups++;
  yield;
 }
 answer.stats={components:planner.movementTopology.island,reachableComponents:reachable?.size,...(approaches?{approachComponents:approaches.size}:{}),polygons:polygons.length,totalPolygons:topology.stats.totalPolygons,allComponents:topology.stats.allComponents,tips:tips.size,probes,heightProbes,heightLimitedGroups,groups:groups.size,candidates:answer.length};return answer;
}
