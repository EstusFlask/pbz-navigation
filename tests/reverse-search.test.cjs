'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const R=require(root+'/PBZRouteCore'),Local=require(root+'/PBZRouteLocalWalk'),T=require(root+'/PBZRouteTransitions');
const p=(x,y=0,z=0)=>({x,y,z});
function run(job){let row,n=0;do{row=job.next();assert.ok(++n<1000000,'search did not yield/terminate');}while(!row.done);return row.value;}
function graph(n,edges){
 const rows=Array.from({length:n},()=>[]),e=[],weight=[],off=[0],arc=[];
 for(const [from,to,cost=100,both=false,type=1] of edges){const k=weight.length;e.push(from,to,type,0,0,type===2?1:0);weight.push(cost);rows[from].push(k);if(both)rows[to].push(~k);}
 for(const row of rows){arc.push(...row);off.push(arc.length);}
 const decoded={p:Int32Array.from(Array.from({length:n},(_,i)=>[i*10,0,0]).flat()),v:new Int32Array(),e:Int32Array.from(e),arc:Int32Array.from(arc),
  off:Uint32Array.from(off),weight:Uint32Array.from(weight),lab:new Int32Array(n),strong:new Int32Array(n),dag:new Int32Array(),cells:new Int32Array(),
  sizes:Uint32Array.of(n),order:new Uint32Array(),metric:new Uint16Array(n*4)};
 return new R.Graph({world:'test',n,actors:[{guid:'ladder',fold:true}]},null,decoded);
}
const cost=(g,arcs)=>arcs?.reduce((n,a)=>{const k=a<0?~a:a;return n+(k<g.weight.length?g.weight[k]:g.liveEdges[k-g.weight.length].cost);},0);

test('atlas defaults to reverse search while retaining signed forward arc identities',()=>{
 const g=graph(3,[[1,0,10,true],[1,2,20]]);
 assert.deepEqual(g.path(0,2),[~0,1]);
 assert.equal(g.lastSearch?.direction,'reverse');
 assert.equal(g.g[2],0,'reverse search was not actually rooted at the goal');assert.equal(g.g[0],30);
 assert.equal(g.path(2,0),null,'a reverse query invented an outgoing edge from a one-way sink');
 assert.deepEqual(g.path(0,2,new Set(),{direction:'forward'}),[~0,1]);
 assert.equal(g.lastSearch.direction,'forward');
 assert.equal(g.g[0],0,'forward search was not actually rooted at the player');assert.equal(g.g[2],30);
});

test('reverse atlas keeps locks, banned edges and live-edge resets directional',()=>{
 const g=graph(4,[[0,1,10,false,2],[1,3,10],[0,2,30],[2,3,30]]);
 assert.deepEqual(g.path(0,3),[2,3]);g.openPassages.add('ladder');
 assert.deepEqual(g.path(0,3),[0,1]);assert.deepEqual(g.path(0,3,new Set([1])),[2,3]);
 g.addLiveEdge(0,3,[p(0),p(30)],{guid:'drop',drop:true});g.allowDrops=true;
 // Make the one-way live edge cheaper than the ordinary detour.
 g.liveEdges[0].cost=1;assert.deepEqual(g.path(0,3),[4]);assert.equal(g.path(3,0),null);
 g.allowDrops=false;assert.deepEqual(g.path(0,3),[0,1]);
 g.clearLiveEdges();assert.deepEqual(g.path(0,3),[0,1]);
 g.addLiveEdge(2,0,[p(20),p(0)],{guid:'walk',walk:true});g.liveEdges[0].cost=1;
 assert.deepEqual(g.path(2,1),[4,0],'incoming index retained a removed live edge');
});

test('reverse and forward atlas costs agree on deterministic directed graph controls',()=>{
 let seed=17;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let sample=0;sample<12;sample++){
  const edges=[];for(let a=0;a<14;a++)for(let b=0;b<14;b++)if(a!==b&&rand()<.15)edges.push([a,b,1+Math.floor(rand()*50),rand()<.2]);
  const g=graph(14,edges);
  for(let a=0;a<14;a++)for(let b=0;b<14;b++){
   const forward=g.path(a,b,new Set(),{direction:'forward'}),reverse=g.path(a,b,new Set(),{direction:'reverse'});
   assert.equal(reverse===null,forward===null);if(forward)assert.equal(cost(g,reverse),cost(g,forward),`${sample}: ${a}->${b}`);
  }
 }
});

test('an improved closed node is reopened under an admissible inconsistent atlas heuristic',()=>{
 const g=graph(4,[[0,1,3],[0,2,1],[2,1,1],[1,3,3],[2,3,100]]);
 g.h=(a,b)=>b===3&&a===2?4:0;
 assert.equal(cost(g,g.path(0,3,new Set(),{direction:'forward'})),5);
 assert.equal(cost(g,g.path(0,3,new Set(),{direction:'reverse'})),5);
});

test('reverse hint search follows original incoming neighbours and validates only player-to-goal steps',()=>{
 const {Index}=require(root+'/PBZRouteWalkHints'),start=p(0),goal=p(1200),hints=new Index(Array.from({length:13},(_,i)=>[i*100,0,0]));
 const checked=[];let report;
 const world={floorAt:q=>q,step:(a,b)=>{checked.push([a,b]);return b.x>a.x?{p:b}:{why:'one-way floor'};}};
 const route=run(Local.search(world,start,goal,{hints,hintsOnly:true,clock:()=>0,report:(_,r)=>report=r}));
 assert.ok(route&&!route.partial);assert.equal(report.direction,'reverse');
 assert.ok(checked.every(([a,b])=>b.x>a.x));assert.deepEqual(route.points[0],start);assert.deepEqual(route.points.at(-1),goal);
 // A nearest-neighbour relation is directed too. Dense samples next to B
 // exclude A from B's 16 neighbours even though A selects B.
 const dense=new Index([[0,0,0],[349,0,0],...Array.from({length:17},(_,i)=>[350+i*.1,1,0])]);
 const a=p(-100),b=p(650);let backward;
 const result=run(Local.search({floorAt:q=>q,step:(u,v)=>({p:v})},a,b,{hints:dense,hintsOnly:true,clock:()=>0,report:(_,r)=>backward=r}));
 assert.ok(result);assert.equal(backward.direction,'reverse');
 assert.ok(result.points.some(q=>q.x===0),'reverse search missed the incoming sparse-to-dense connection');
});

test('cancelled incoming-index preparation publishes no partial atlas topology',()=>{
 const g=graph(3000,Array.from({length:2999},(_,i)=>[i,i+1,1]));
 const job=g.incomingJob();assert.equal(job.next().done,false);job.return();assert.equal(g.incoming,undefined);
 const incoming=run(g.incomingJob());assert.equal(incoming.arc.length,g.arc.length);
 assert.deepEqual(g.path(0,2999),Array.from({length:2999},(_,i)=>i));
});

test('the experiment switch restores forward topology search without sharing physical proofs',()=>{
 const Search=require(root+'/PBZRouteSearch'),{Index}=require(root+'/PBZRouteWalkHints');
 try{
  Search.configure(false);const g=graph(2,[[0,1]]);assert.ok(g.path(0,1));assert.equal(g.lastSearch.direction,'forward');
  const data={world:'test',n:g.n,actors:[]};
  for(const name of ['p','v','e','arc','off','weight','lab','strong','dag','cells','sizes','order','metric'])data[name]=Buffer.from(g[name].buffer).toString('base64');
  // Keep non-empty encoded storage where an unused atlas column is empty.
  for(const name of ['v','dag','cells','order'])data[name]=Buffer.from(new Int32Array(name==='cells'?4:name==='v'?3:name==='dag'?2:1).buffer).toString('base64');
  assert.ok(run(R.graphJob(data,null)).incoming,'starting in forward mode left later reverse queries without a prepared index');
  let report;const hints=new Index([[200,0,0],[400,0,0]]);
  const options={hints,hintsOnly:true,clock:()=>0,report:(_,r)=>report=r};
  assert.ok(run(Local.search({floorAt:q=>q,step:(a,b)=>({p:b})},p(0),p(600),options)));assert.equal(report.direction,'forward');
  Search.configure(true);
  assert.equal(run(Local.search({floorAt:q=>q,step:()=>({why:'new locked door',locked:true})},p(0),p(600),options)),null);
  assert.equal(report.direction,'reverse');
 }finally{Search.configure(true);}
});

test('reverse action search chooses a directed chain and checks connectors in travel order',()=>{
 const features=[{guid:'up',kind:'ascent',runtimePath:[p(100),p(100,0,500)]},
  {guid:'across',kind:'hook',runtimePath:[p(400,0,500),p(800,0,500)]}];
 const start=p(0),goal=p(1000,0,500),checked=[],reports=[];
 const allowed=(a,b)=>[[start,features[0].runtimePath[0]],[features[0].runtimePath[1],features[1].runtimePath[0]],[features[1].runtimePath[1],goal]]
  .some(([u,v])=>R.dist(a,u)<1&&R.dist(b,v)<1);
 const options={name:'test',start,goal,features,clock:()=>0,stagedWalk:true,canTraverse:()=>true,landing:function*(f,q){return q;},
  walk:function*(a,b){checked.push([a,b]);return allowed(a,b)?{points:[a,b],meters:R.dist(a,b)/100}:null;},
  report:(phase,data)=>reports.push({phase,...data})};
 const route=run(T.route(options));assert.ok(route);assert.deepEqual(route.legs[0].moves.map(m=>m.guid),['up','across']);
 assert.ok(reports.some(r=>r.phase==='action chain candidate'&&r.direction==='reverse'));
 assert.ok(checked.filter(([a,b])=>allowed(a,b)).every(([a,b])=>b.x>=a.x));
 assert.equal(run(T.route({...options,start:goal,goal:start})),null,'reversed planning enabled the one-way climb backwards');
});
