'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path');
test('action topology visits adjacent movement edges rather than rescanning every edge at each component',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs');
 const run=n=>{
  const labels=new Map(Array.from({length:n},(_,i)=>[i+1,i])),features=[];
  for(let i=0;i<n-1;i++)for(let j=0;j<8;j++)features.push({guid:i+'/'+j,path:[[i*100,0,0],[(i+1)*100,0,0]]});
  const planner={origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>({success:true,nearestRef:Math.round(p.x)+1})},movementTopology:{labels,points:new Map(),polygons:new Map(),visited:n,island:n}};
  const job=actionTopology(planner,[0,0,0],[(n-1)*100,0,0],features);let r,steps=0;do{r=job.next();steps++;}while(!r.done);
  assert.equal(r.value.stats.chain.length,n-1);assert.equal(r.value.features.length,features.length);assert.equal(r.value.canConnect([0,0,0],[0,0,0]),true);assert.equal(r.value.canConnect([0,0,0],[100,0,0]),false);
  return steps;
 };
 const small=run(80),large=run(160);assert.ok(large<=small*2.3,`doubling a linear action graph multiplied scheduled work from ${small} to ${large}`);
});

test('large movement ranking preserves stable tie order while bounding nearest-poly work between yields',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs'),features=Array.from({length:2501},(_,i)=>({guid:'edge-'+(3000-i),path:[[0,0,0],[100,0,0]]}));let queries=0;
 const planner={origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>{queries++;return{success:true,nearestRef:p.x<.5?1:2};}},movementTopology:{labels:new Map([[1,0],[2,1]]),points:new Map(),polygons:new Map(),visited:2,island:2}},job=actionTopology(planner,[0,0,0],[100,0,0],features);let r,max=0;
 do{const before=queries;r=job.next();max=Math.max(max,queries-before);}while(!r.done);
 assert.ok(max<=32,'a large feature set performed all endpoint projections in one scheduler step');assert.deepEqual(r.value.features.map(f=>f.guid),features.map(f=>f.guid));assert.deepEqual(r.value.stats.chain,['edge-3000']);
});

test('bounded action ranking returns the exact existing 1024-feature consumption prefix',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs'),features=Array.from({length:10001},(_,i)=>({guid:'prefix-'+i,source:i%13?'recast-boundary':'game-placement',kind:i%13?'fall':'ladder',topologyClosed:i%31===0,path:[[0,0,0],[100+i%17,0,0]]}));
 const make=()=>({origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>({success:true,nearestRef:p.x<.5?1:2})},movementTopology:{labels:new Map([[1,0],[2,1]]),points:new Map(),polygons:new Map(),visited:2,island:2}}),drain=job=>{let r,steps=0;do{r=job.next();steps++;}while(!r.done);return{value:r.value,steps};};
 const full=drain(actionTopology(make(),[0,0,0],[100,0,0],features,{relevantOnly:true})),limited=drain(actionTopology(make(),[0,0,0],[100,0,0],features,{relevantOnly:true,maxRankedFeatures:1024}));
 assert.deepEqual(limited.value.features.map(f=>f.guid),full.value.features.slice(0,1024).map(f=>f.guid),'runtime prefix differs from the full stable ranking');
 assert.deepEqual(limited.value.stats.chain,full.value.stats.chain);assert.equal(limited.value.stats.irrelevantGeometry,full.value.stats.irrelevantGeometry);
 assert.ok(limited.steps<full.steps,'ranking still scheduled all unused tail entries');
 assert.equal(features.length,10001);assert.equal(limited.value.stats.rankedFeatures,1024);assert.equal(limited.value.stats.availableFeatures,full.value.features.length);
});

test('finite placed actions survive a crowded geometric shortlist without displacing the preferred chain',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs'),start=[0,0,0],goal=[100,0,0];
 const geometry=Array.from({length:1100},(_,index)=>({guid:'cheap-'+index,source:'recast-boundary',kind:'surface',path:[start,goal]}));
 const swing={guid:'placed-swing',source:'game-placement',kind:'swing',both:true,path:[start,[200,0,0]]},away={guid:'unrelated-ladder',source:'game-placement',kind:'ladder',path:[[300,0,0],[400,0,0]]},closed={...swing,guid:'closed-swing',path:[start,[20,0,0]],topologyClosed:true};
 const make=()=>({origin:[0,0,0],navMesh:{},query:{findNearestPoly:point=>({success:true,nearestRef:point.x<.5?1:point.x<2.5?2:point.x<3.5?3:4})},movementTopology:{labels:new Map([[1,0],[2,1],[3,2],[4,3]]),points:new Map(),polygons:new Map(),visited:4,island:4}});
 const features=[...geometry,swing,away,closed],run=maximum=>{const job=actionTopology(make(),start,goal,features,{maxRankedFeatures:maximum});let row;do{row=job.next();}while(!row.done);return row.value;};
 const limited=run(4),full=run(undefined);
 assert.deepEqual(limited.features.map(row=>row.guid),['cheap-0','placed-swing','cheap-1','cheap-2']);
 assert.deepEqual(limited.features,full.features.slice(0,4));
 assert.deepEqual(limited.stats.chain,['cheap-0']);
 assert.equal(limited.features.includes(away),false);assert.equal(limited.features.includes(closed),false);
 assert.equal(swing.both,true);assert.equal(closed.topologyClosed,true);
});

test('bounded topology keeps distinct checked destination approaches available to the action search',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs');
 const p=(x,z=0)=>[x,0,z],start=p(0),first=p(1000),second=p(1100),unrelated=p(1200),unmapped=p(1300,500);
 const refs=new Map([[0,1],[10,2],[11,3],[12,4]]),make=()=>({origin:[0,0,0],navMesh:{},query:{findNearestPoly:({x})=>({success:refs.has(x),nearestRef:refs.get(x)})},movementTopology:{labels:new Map([[1,0],[2,1],[3,2],[4,3]]),points:new Map(),polygons:new Map(),visited:4,island:4}});
 const feature=(guid,a,b,options={})=>({guid,path:[a,b],source:'recast-boundary',kind:'fall',both:false,...options});
 const firstAction=feature('first',start,first),secondAction=feature('second',start,second),away=feature('unrelated',start,unrelated),oneWay=feature('reverse-only',second,start),closed=feature('closed',start,unrelated,{topologyClosed:true});
 const run=(goal,features,additionalGoals)=>{const job=actionTopology(make(),start,goal,features,{relevantOnly:true,maxRankedFeatures:2,additionalGoals});let r;do{r=job.next();}while(!r.done);return r.value;};
 const alternatives=[second,second,unmapped];
 assert.deepEqual(run(first,[away,firstAction,secondAction],alternatives).features.map(f=>f.guid),['first','second'],'a valid later standing component was pruned by the first candidate');
 const later=run(first,[away,secondAction,oneWay,closed],alternatives);
 assert.equal(later.features[0],secondAction,'an unreachable primary approach hid the reachable alternate');
 assert.deepEqual(later.stats.chain,['second']);
 assert.equal(run(first,[oneWay,closed],alternatives).stats.chain.length,0,'the shortest path invented an action direction or opened a closed action');
});

test('isolated terminal components leave bounded recovery candidates in input order without a dense search',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs');
 const start=[0,0,0],step=[100,0,0],isolated=[200,0,0],count=4096;
 const features=Array.from({length:count},(_,i)=>({guid:'forward-'+i,path:[start,step],source:'recast-boundary',both:false}));
 const make=()=>({origin:[0,0,0],navMesh:{},query:{findNearestPoly:({x})=>({success:true,nearestRef:x+1})},movementTopology:{labels:new Map([[1,0],[2,1],[3,2]]),points:new Map(),polygons:new Map(),visited:3,island:3}});
 const run=additionalGoals=>{const task=actionTopology(make(),start,isolated,features,{relevantOnly:true,maxRankedFeatures:1024,additionalGoals});let r,steps=0;do{r=task.next();steps++;}while(!r.done);return{...r.value,steps};};
 const noRoute=run([]),reachable=run([step]);
 assert.deepEqual(noRoute.features,features.slice(0,1024));
 assert.deepEqual(noRoute.stats.chain,[]);
 assert.equal(noRoute.stats.topologyEdges,count);
 assert.equal(noRoute.stats.availableFeatures,count);
 assert.ok(noRoute.steps<reachable.steps*.85,`the isolated goal scheduled ${noRoute.steps} steps versus ${reachable.steps} for a traversable alternate`);
 assert.deepEqual(reachable.stats.chain,['forward-0']);
});

test('a crowded disconnected graph preserves the approach to the first gate on a directed chain',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs');
 const p=i=>[i*100,0,0],feature=(guid,a,b,closed=false)=>({guid,path:[p(a),p(b)],
  kind:closed?'ascent':'fall',source:closed?'game-placement':'recast-boundary',topologyClosed:closed});
 const noise=Array.from({length:1100},(_,i)=>feature('dead-end-'+i,0,1));
 const first=feature('first-drop',0,2),second=feature('second-drop',2,3),
  wrong=feature('wrong-direction',5,0,true),gate=feature('entry-gate',3,4,true),later=feature('later-gate',4,5,true);
 const make=()=>({origin:[0,0,0],navMesh:{},query:{findNearestPoly:({x})=>({success:true,nearestRef:x+1})},
  movementTopology:{labels:new Map(Array.from({length:6},(_,i)=>[i+1,i])),points:new Map(),polygons:new Map(),visited:6,island:6}});
 const run=features=>{const job=actionTopology(make(),p(0),p(5),features,{relevantOnly:true,maxRankedFeatures:512,pendingMechanisms:true});let row;do{row=job.next();}while(!row.done);return row.value;};
 const result=run([...noise,first,second,wrong,gate,later]);
 assert.deepEqual(result.pendingAction,{guid:'entry-gate',reverse:false});
 assert.deepEqual(result.stats.chain,[],'a pending gate must not become an open route');
 assert.deepEqual(result.features.slice(0,3).map(f=>f.guid),['first-drop','second-drop','entry-gate']);
 assert.equal(result.features.length,512);
 assert.equal(run([...noise,first,second,wrong,gate,{...later,noForward:true}]).pendingAction,undefined);
 const open=feature('open-route',0,5);
 assert.equal(run([...noise,first,second,gate,later,open]).features[0],open);
});

test('topology endpoint views return the original action objects for live validation',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs'),original={guid:'source-action',kind:'fall',source:'recast-boundary',both:false,path:[[0,0,0],[100,0,0]],runtimePath:[{x:0,y:0,z:0},{x:100,y:0,z:0}],validationToken:{owner:'live'}},view={guid:original.guid,kind:original.kind,source:original.source,both:original.both,path:original.path,sourceFeature:original},planner={origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>({success:true,nearestRef:p.x<.5?1:2})},movementTopology:{labels:new Map([[1,0],[2,1]]),points:new Map(),polygons:new Map(),visited:2,island:2}},job=actionTopology(planner,[0,0,0],[100,0,0],[view],{relevantOnly:true,maxRankedFeatures:1024});let row;do{row=job.next();}while(!row.done);
 assert.equal(row.value.features.length,1);assert.equal(row.value.features[0],original,'a topology projection wrapper escaped into action validation');assert.equal(row.value.features[0].runtimePath,original.runtimePath);assert.equal(row.value.features[0].validationToken,original.validationToken);
});

test('endpoint projection yields after at most four native nearest-poly queries',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs'),features=Array.from({length:80},(_,i)=>({guid:'projection-'+i,source:'game-placement',kind:'ladder',both:false,path:[[i*10,0,0],[i*10+5,0,0]]}));let queries=0;
 const planner={origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getTileAndPolyByRef:()=>({success:false})},query:{findNearestPoly:p=>{queries++;return{success:true,nearestRef:p.x<.5?1:2};}},movementTopology:{labels:new Map(),points:new Map(),polygons:new Map(),visited:65536,island:1}},job=actionTopology(planner,[0,0,0],[800,0,0],features,{maxRankedFeatures:16});let row,maxQueries=0;
 do{const before=queries;row=job.next();maxQueries=Math.max(maxQueries,queries-before);}while(!row.done);
 assert.ok(maxQueries<=4,`one scheduled step performed ${maxQueries} nearest-poly projections`);assert.equal(row.value.features.length,16);
});

test('cached polygon lookups are batched without repeating native projection work',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs');
 const start=[0,0,0],goal=[100,0,0],path=[start,goal],features=Array.from({length:4096},(_,i)=>({guid:`cached-${i}`,path}));
 let queries=0;
 const planner={origin:[0,0,0],navMesh:{},query:{findNearestPoly:({x})=>{queries++;return{success:true,nearestRef:x+1};}},movementTopology:{labels:new Map([[1,0],[2,1]]),points:new Map(),polygons:new Map(),visited:2,island:2}};
 const task=actionTopology(planner,start,goal,features,{maxRankedFeatures:1024});let steps=0,r;
 do{r=task.next();steps++;}while(!r.done);
 assert.equal(queries,2);
 assert.deepEqual(r.value.stats.chain,['cached-0']);
 assert.equal(r.value.features.length,1024);
 assert.ok(steps<700,`repeat cached lookups split work into ${steps} generator steps`);
});

test('endpoint projection cache separates hash collisions, floors and coordinates beyond 32 bits',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs');
 // The first pair collides in the integer hash at real map coordinates.
 // The next pair also collides after integer truncation of a large coordinate.
 const points=[[-42331.7,109840.8,-2270],[-42050.8,109251.7,-3290],[0,0,0],[429496729.6,0,0],[0,0,500]],features=points.map((p,i)=>({guid:'collision-'+i,path:[p,p]})),snapshot=points.map(p=>p.slice());let queries=0;
 const planner={origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>{queries++;const i=snapshot.findIndex(v=>Math.abs(v[0]/100-p.x)<1e-8&&Math.abs(v[2]/100-p.y)<1e-8&&Math.abs(-v[1]/100-p.z)<1e-8);assert.ok(i>=0);return{success:true,nearestRef:i+1};}},movementTopology:{labels:new Map(points.map((_,i)=>[i+1,i])),points:new Map(),polygons:new Map(),visited:5,island:5}},drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
 const first=drain(actionTopology(planner,points[0],points[1],features));
 assert.deepEqual(points.map(p=>first.component(p)),[0,1,2,3,4]);assert.equal(queries,points.length);
 const second=drain(actionTopology(planner,points[0],points[1],features));
 assert.deepEqual(points.map(p=>second.component(p)),[0,1,2,3,4]);assert.equal(queries,points.length,'repeated topology projected an already cached endpoint');
});

test('endpoint projection cache follows coordinate mutations and retains failed projections',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs');let queries=0;
 const point=[0,0,0],missing=[-100,0,0],planner={origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>{queries++;return p.x<0?{success:false}:{success:true,nearestRef:p.x<.5?1:2};}},movementTopology:{labels:new Map([[1,0],[2,1]]),points:new Map(),polygons:new Map(),visited:2,island:2}},job=actionTopology(planner,point,missing,[]);let row;do{row=job.next();}while(!row.done);
 const topology=row.value;assert.equal(queries,2);assert.equal(topology.component(missing),undefined);assert.equal(queries,2,'an unprojectable endpoint was repeatedly queried');
 point[0]=100;assert.equal(topology.component(point),1,'a mutated point reused its former polygon');assert.equal(queries,3);
 assert.equal(topology.component([0,0,0]),0);assert.equal(topology.component([100.01,0,0]),1);assert.equal(queries,3,'the existing tenth-centimetre quantization changed');
});

test('58775-candidate topology bounds live scratch under controlled GC and measures CPU separately',t=>{
 const root=path.resolve(__dirname,'..'),source=`import {pathToFileURL} from 'node:url';
const {actionTopology}=await import(pathToFileURL(${JSON.stringify(path.join(root,'offline-navigation/movement-links.mjs'))}));
const n=58775,shared=[[0,0,0],[100,0,0]],features=Array.from({length:n},(_,i)=>({guid:'edge-'+i,source:'recast-boundary',kind:'fall',both:false,path:shared}));
function legacy(){global.gc();const base=process.memoryUsage().heapUsed,started=performance.now(),labels=new Map([[1,0],[2,1]]),points=new Map(),locate=p=>{const k=p.map(v=>Math.round(v*10)).join(',');if(points.has(k))return points.get(k);const ref=p[0]<50?1:2;points.set(k,ref);return ref;},edges=[],outgoing=new Map([[0,[]]]),incoming=new Map([[1,[]]]),scores=new Map();for(const f of features){const a=labels.get(locate(f.path[0])),b=labels.get(locate(f.path.at(-1))),edge={a,b,f,cost:100};edges.push(edge);outgoing.get(a).push(edge);incoming.get(b).push(edge);scores.set(f,100);}const rows=features.map((f,i)=>({f,i,score:scores.get(f),chain:0})).sort((a,b)=>a.score-b.score||a.i-b.i);global.gc();const elapsed=performance.now()-started,heapDelta=process.memoryUsage().heapUsed-base;return{elapsed,heapDelta,edgeObjects:edges.length,rankObjects:rows.length,pointKeys:points.size,labelCount:labels.size};}
const make=()=>({origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>({success:true,nearestRef:p.x<.5?1:2})},movementTopology:{labels:new Map([[1,0],[2,1]]),points:new Map(),polygons:new Map(),visited:2,island:2}}),baseline=legacy();global.gc();const base=process.memoryUsage().heapUsed,started=performance.now(),job=actionTopology(make(),[0,0,0],[100,0,0],features,{relevantOnly:true,maxRankedFeatures:1024});let row,peak=base,samples=0;do{row=job.next();if((++samples&15)===0)global.gc();peak=Math.max(peak,process.memoryUsage().heapUsed);}while(!row.done);global.gc();peak=Math.max(peak,process.memoryUsage().heapUsed);const memorySampleMs=performance.now()-started,stats=row.value.stats,heapDelta=peak-base;const timed=actionTopology(make(),[0,0,0],[100,0,0],features,{relevantOnly:true,maxRankedFeatures:1024}),began=performance.now();while(!timed.next().done){}const cpuMs=performance.now()-began;console.log(JSON.stringify({n,baseline:{...baseline,objectCount:baseline.edgeObjects+baseline.rankObjects},optimized:{cpuMs,memorySampleMs,controlledLiveHeapDelta:heapDelta,...stats,first:row.value.features[0].guid,last:row.value.features.at(-1).guid}}));`;
 const measured=JSON.parse(execFileSync(process.execPath,['--expose-gc','--input-type=module','-e',source],{cwd:root,encoding:'utf8',maxBuffer:1024*1024}).trim());
 assert.equal(measured.n,58775);assert.equal(measured.optimized.topologyEdges,58775);assert.equal(measured.optimized.rankedFeatures,1024);assert.equal(measured.optimized.rankingHeapSlots,1024);assert.equal(measured.optimized.rankingCandidateObjects,0);assert.equal(measured.optimized.topologyEdgeObjects,0);
 assert.ok(measured.optimized.topologyScratchBytes<3_000_000,`typed topology scratch grew to ${measured.optimized.topologyScratchBytes} bytes`);
 assert.ok(measured.optimized.controlledLiveHeapDelta<measured.baseline.heapDelta*.65,`controlled live heap did not fall enough: ${measured.optimized.controlledLiveHeapDelta} vs ${measured.baseline.heapDelta}`);
 assert.ok(measured.optimized.cpuMs<5000,`large topology query took ${measured.optimized.cpuMs}ms`);
 assert.equal(measured.optimized.first,'edge-0');assert.equal(measured.optimized.last,'edge-1023');
 t.diagnostic(JSON.stringify(measured));
});

test('packed CSR topology preserves historical ranking except the explicit placed-action priority and cuts scratch',t=>{
 const fs=require('node:fs'),root=path.resolve(__dirname,'..'),before=path.join(root,'build/custom-route-audit-1112/runtime-before-csr.js'),after=path.join(root,'build/offline-navigation/runtime/PBZRecastRuntime.js');if(!fs.existsSync(before)){t.skip('private pre-CSR reference bundle unavailable');return;}
 const source=`import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const files=${JSON.stringify([before,after])},cores=files.map(file=>{const context=vm.createContext({module:{exports:{}},console:{log(){},error(){}}},{codeGeneration:{strings:false,wasm:false}});vm.runInContext(fs.readFileSync(file,'utf8'),context);return context.module.exports;}),drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;},makePlanner=()=>({origin:[0,0,0],header:{maxPolys:16384,maxTiles:256},tileBuffers:new Map(),navMesh:{getTileAndPolyByRef:()=>({success:false})},query:{findNearestPoly:p=>({success:true,nearestRef:Math.round(p.x)+1})},movementTopology:{labels:new Map(Array.from({length:20},(_,i)=>[i+1,i])),points:new Map(),polygons:new Map(),visited:20,island:20}});
let state=9041;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
for(let test=0;test<100;test++){
 const partial=test%3===0,features=Array.from({length:200+test%7*117},(_,i)=>{const a=Math.floor(random()*(partial?24:20)),b=Math.floor(random()*(partial?24:20));return{guid:test+'/'+i,source:i%5?'recast-boundary':'game-placement',kind:i%5?'fall':'ladder',both:random()<.2,topologyClosed:random()<.15,path:[[a*100,0,0],[b*100,0,0]]};}),options={relevantOnly:true,maxRankedFeatures:test%2?1024:37};
 const run=(core,settings)=>drain(core.Planner.prototype.actionTopologyJob.call(makePlanner(),[0,0,0],[1900,0,0],features,settings)),old=run(cores[0],{...options,maxRankedFeatures:undefined}),current=run(cores[1],options),outgoing=new Map(),incoming=new Map();
 const add=(from,to)=>{if(!outgoing.has(from))outgoing.set(from,[]);outgoing.get(from).push(to);if(!incoming.has(to))incoming.set(to,[]);incoming.get(to).push(from);};
 for(const feature of features){const from=feature.path[0][0]/100,to=feature.path.at(-1)[0]/100;if(feature.topologyClosed||from>=20||to>=20)continue;add(from,to);if(feature.both)add(to,from);}
 const visit=(start,edges)=>{const seen=new Set([start]),queue=[start];for(const from of queue)for(const to of edges.get(from)||[])if(!seen.has(to)){seen.add(to);queue.push(to);}return seen;},forward=visit(0,outgoing),backward=visit(19,incoming),chain=new Set(old.stats.chain);
 const priority=feature=>{if(chain.has(feature.guid))return 2;if(feature.source!=='game-placement'||feature.topologyClosed)return 0;const from=feature.path[0][0]/100,to=feature.path.at(-1)[0]/100;return from<20&&to<20&&(forward.has(from)&&backward.has(to)||feature.both&&forward.has(to)&&backward.has(from))?1:0;};
 const expected=old.features.slice().sort((a,b)=>priority(b)-priority(a)).slice(0,options.maxRankedFeatures);
 assert.equal(JSON.stringify(current.features.map(feature=>feature.guid)),JSON.stringify(expected.map(feature=>feature.guid)),'unexpected ranking change in randomized control '+test);
 assert.equal(JSON.stringify(current.stats.chain),JSON.stringify(old.stats.chain));assert.equal(current.stats.irrelevantGeometry,old.stats.irrelevantGeometry);assert.equal(current.stats.availableFeatures,old.features.length);
}
const n=58775,pathPair=[[0,0,0],[100,0,0]],features=Array.from({length:n},(_,i)=>({guid:'edge-'+i,source:'recast-boundary',kind:'fall',both:false,path:pathPair}));function baseline(){global.gc();const base=process.memoryUsage().heapUsed,edges=[],out=new Map([[0,[]]]),inside=new Map([[1,[]]]),scores=new Map();for(const f of features){const e={a:0,b:1,f,cost:100};edges.push(e);out.get(0).push(e);inside.get(1).push(e);scores.set(f,100);}const ranked=features.map((f,i)=>({f,i,score:scores.get(f),chain:0})).sort((a,b)=>a.score-b.score||a.i-b.i);global.gc();return{heap:process.memoryUsage().heapUsed-base,ranked:ranked.length,edges:edges.length};}const oldMemory=baseline();
function measure(core){const planner=makePlanner(),times=[],heap=[],stats=[];planner.movementTopology.labels=new Map([[1,0],[2,1]]);planner.movementTopology.visited=2;planner.movementTopology.island=2;for(let i=0;i<4;i++){global.gc();const base=process.memoryUsage().heapUsed,job=core.Planner.prototype.actionTopologyJob.call(planner,[0,0,0],[100,0,0],features,{relevantOnly:true,maxRankedFeatures:1024});let row,peak=base;const began=performance.now();do{row=job.next();peak=Math.max(peak,process.memoryUsage().heapUsed);}while(!row.done);times.push(performance.now()-began);heap.push(peak-base);stats.push(row.value.stats);assert.equal(row.value.features[0].guid,'edge-0');assert.equal(row.value.features.at(-1).guid,'edge-1023');}return{times,heap,stats:stats.at(-1)};}const measured=cores.map(measure);console.log(JSON.stringify({oldMemory,old:measured[0],current:measured[1]}));`;
 const r=JSON.parse(execFileSync(process.execPath,['--expose-gc','--input-type=module','-e',source],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024}).trim()),median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)],oldTime=median(r.old.times.slice(1)),newTime=median(r.current.times.slice(1)),oldHeap=median(r.old.heap.slice(1)),newHeap=median(r.current.heap.slice(1));
 assert.ok(r.current.stats.topologyScratchBytes<2_500_000);assert.equal(r.current.stats.rankingCandidateObjects,0);assert.equal(r.current.stats.topologyEdgeObjects,0);assert.ok(newHeap<oldHeap*.7,`CSR retained heap ${newHeap} vs ${oldHeap}`);assert.ok(newTime<oldTime,`CSR median CPU ${newTime}ms vs ${oldTime}ms`);t.diagnostic(JSON.stringify({oldTime,newTime,oldHeap,newHeap,stats:r.current.stats}));
});

test('an exhausted component budget does not create one empty island for every unknown endpoint',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs'),features=Array.from({length:200},(_,i)=>({guid:'unclassified-'+i,path:[[i*100,0,0],[(i+1)*100,0,0]]})),planner={origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>({success:true,nearestRef:Math.round(p.x)+1})},movementTopology:{labels:new Map(),points:new Map(),polygons:new Map(),visited:65536,island:8}};
 const job=actionTopology(planner,[0,0,0],[20100,0,0],features);let r;do{r=job.next();}while(!r.done);assert.equal(r.value.stats.islands,8,'empty components grew after the polygon classification limit');assert.equal(r.value.component([0,0,0]),undefined);assert.equal(r.value.canConnect([0,0,0],[0,0,0]),false);
});

test('a complete action graph can omit irrelevant geometry before ranking while retaining native conditions',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs'),labels=new Map([[1,0],[2,1],[3,2],[4,3],[5,4]]),features=[{guid:'first',source:'recast-boundary',path:[[0,0,0],[100,0,0]]},{guid:'second',source:'recast-boundary',path:[[100,0,0],[200,0,0]]},...Array.from({length:1000},(_,i)=>({guid:'isolated-'+i,source:'recast-boundary',path:[[300,0,0],[400,0,0]]})),{guid:'closed-native',kind:'ladder',source:'game-placement',topologyClosed:true,path:[[300,0,0],[400,0,0]]}],make=()=>({origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>({success:true,nearestRef:Math.round(p.x)+1})},movementTopology:{labels:new Map(labels),points:new Map(),polygons:new Map(),visited:5,island:5}}),drain=j=>{let r;do{r=j.next();}while(!r.done);return r.value;};
 const full=drain(actionTopology(make(),[0,0,0],[200,0,0],features)),filtered=drain(actionTopology(make(),[0,0,0],[200,0,0],features,{relevantOnly:true}));
 assert.deepEqual(filtered.stats.chain,full.stats.chain);assert.deepEqual(filtered.features.map(f=>f.guid),['first','second','closed-native']);assert.equal(filtered.stats.irrelevantGeometry,1000);
 const disconnected=drain(actionTopology(make(),[0,0,0],[400,0,0],features,{relevantOnly:true}));assert.equal(disconnected.features.length,features.length,'an incomplete graph lost its exploratory/conditional candidates');
});
test('relevant topology filtering retains checked surface repairs within a useful component and unresolved endpoints',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs'),features=[{guid:'bridge',source:'recast-boundary',path:[[0,0,0],[100,0,0]]},{guid:'same-component-walk-repair',source:'recast-boundary',path:[[10,0,0],[20,0,0]]},{guid:'unresolved-alternative',source:'recast-boundary',path:[[300,0,0],[400,0,0]]}],planner={origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>({success:true,nearestRef:p.x<.5?1:p.x<2?2:3})},movementTopology:{labels:new Map([[1,0],[2,1]]),points:new Map(),polygons:new Map(),visited:65536,island:2}},job=actionTopology(planner,[0,0,0],[100,0,0],features,{relevantOnly:true});let r;do{r=job.next();}while(!r.done);
 assert.ok(r.value.features.some(f=>f.guid==='same-component-walk-repair'),'an ordinary checked alternative within a relevant floor component was removed');
 assert.ok(r.value.features.some(f=>f.guid==='unresolved-alternative'),'a polygon-budget partial classification became an impossibility claim');
});


test('collision recovery can reach a clear branch hidden behind many same-component-pair candidates',async()=>{
 const {actionTopology}=await import('../offline-navigation/movement-links.mjs');
 const T=require('../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteTransitions');
 const start=[0,0,0],goal=[1000,0,0],point=([x,y,z])=>({x,y,z});
 const component=(x,y)=>x===1000?2:x===500?(y>50?3:1):0;
 const proposal=(guid,a,b)=>({guid,kind:'fall',source:'recast-boundary',both:false,path:[a,b],runtimePath:[point(a),point(b)]});
 const crowded=Array.from({length:1100},(_,i)=>proposal('blocked-'+i,[0,0,0],[500,i/1000,0]));
 const features=[...crowded,proposal('blocked-finish',[500,0,0],goal),proposal('clear-entry',start,[500,100,0]),proposal('clear-exit',[500,100,0],goal)];
 const run=diverseRecovery=>{
  const planner={origin:[0,0,0],navMesh:{},query:{findNearestPoly:p=>({success:true,nearestRef:component(p.x*100,-p.z*100)+1})},movementTopology:{labels:new Map([[1,0],[2,1],[3,2],[4,3]]),points:new Map(),polygons:new Map(),visited:4,island:4}};
  const drain=task=>{let row;do{row=task.next();}while(!row.done);return row.value;};
  const topology=drain(actionTopology(planner,start,goal,features,{relevantOnly:true,maxRankedFeatures:1024,diverseRecovery}));
  assert.equal(topology.features.length,1024);
  assert.deepEqual(new Set(topology.features.slice(0,2).map(f=>f.guid)),new Set(['blocked-0','blocked-finish']));
  if(!diverseRecovery){assert.equal(topology.features.some(f=>f.guid==='clear-entry'),false);return null;}
  let walks=0;
  const trip=drain(T.route({name:'recovery',start:point(start),goal:point(goal),features:topology.features,lazyActions:true,clock:()=>0,maxConnectors:4,component:p=>component(p.x,p.y),componentConnectors:true,
   canTraverse:()=>true,landing:function*(f,p){return p;},validate:function*(a){return a.feature.guid.startsWith('clear-');},
   walk:function*(a,b){walks++;return {points:[a,b],meters:Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)/100};}}));
  assert.ok(trip,'the clear branch was starved by the obstructed component pair');
  assert.deepEqual(trip.legs[0].moves.map(m=>m.guid),['clear-entry','clear-exit']);assert.equal(walks,3);return trip;
 };
 run(false);run(true);
});
