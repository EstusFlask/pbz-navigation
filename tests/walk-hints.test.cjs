'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.PBZ_TEST_SOURCE||path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const Local=require(root+'/PBZRouteLocalWalk'),R=require(root+'/PBZRouteCore');
function run(job){let r,n=0;do{r=job.next();assert.ok(++n<100000);}while(!r.done);return r.value;}

test('an explicitly requested frontier retains checked ground when the candidate endpoint is not loaded',()=>{
 const {Index}=require(root+'/PBZRouteWalkHints');let locked=false;
 const start={x:0,y:0,z:0},goal={x:2000,y:0,z:0},hints=new Index(Array.from({length:21},(_,i)=>[i*100,0,0]));
 const world={floorAt:p=>p.x<=1000?p:null,step:(a,b)=>locked&&b.x>=500?{why:'locked bridge',locked:true}:b.x<=1000?{p:b}:{why:'no supporting floor'}};
 const options={hints,hintsOnly:true,allowFrontier:true,clock:()=>0};
 const route=run(Local.search(world,start,goal,options));
 assert.ok(route?.partial&&route.physicalVerified,'an unloaded final footpoint discarded the checked corridor before it');
 assert.ok(route.points.at(-1).x>=700&&route.points.every(p=>p.x<=1000),'unchecked endpoint geometry entered the safe frontier');
 locked=true;assert.equal(run(Local.search(world,start,goal,options)),null,'a frontier bypassed a newly locked bridge');
});

test('the captured bridge approach reaches the cave mouth with checked finite candidates',()=>{
 const f=require('./fixtures/bridge-cave-20261114.json'),hints=require(root+'/PBZRouteWalkHints').forWorld(f.world);
 let blocked=false,checks=0;const world={rise:50,slope:1.43,floorAt:p=>p,step:(a,b)=>{
  checks++;return blocked&&Math.min(a.y,b.y)<208000&&Math.max(a.y,b.y)>=208000?
   {why:'locked bridge',locked:true}:{p:b};
 }};
 const options={hints,hintsOnly:true,clock:()=>0};
 const route=run(Local.search(world,f.start,f.goal,options));
 assert.ok(route&&!route.partial,'existing bridge/cave observations are unavailable to the finite candidate search');
 assert.ok(checks>0&&checks<=64,'candidate geometry bypassed or exhausted the live edge checks');
 assert.ok(R.dist(route.points.at(-1),f.goal)<1);
 blocked=true;assert.equal(run(Local.search(world,f.start,f.goal,options)),null,'the bridge reused an open edge after its lock changed');
});

test('the captured tower roof reaches its forward ladder through a checked directed short drop',()=>{
 const f=require('./fixtures/tower-rooftop-20261114.json'),hints=require(root+'/PBZRouteWalkHints').forWorld(f.world);
 let blocked=false,locked=false,sweeps=0;
 // Model only the observed grounded gap and query contracts. These callbacks
 // are not the scene's collision mesh; live acceptance remains independent.
 const world={r:45,rise:50,slope:1.43,floorAt:p=>p,
  hit:(a,b,body)=>{if(body)sweeps++;return body&&blocked?{point:b}:null;},
  step:(a,b)=>Math.min(a.x,b.x)<f.gapPlaneX&&Math.max(a.x,b.x)>=f.gapPlaneX?
   {why:locked?'locked passage':'drop required',locked}:Math.abs(a.z-b.z)>50+R.xy(a,b)*1.43?{why:'different floor'}:{p:b}};
 const options={hints,hintsOnly:true,allowDrops:true,clock:()=>0};
 const route=run(Local.search(world,f.start,f.goal,options));
 assert.ok(route&&!route.partial,'the forward rooftop connector is missing despite existing author observations and a clear short-drop model');
 assert.ok(route.moves.some(m=>m.kind==='fall'&&m.drop),'the observed gap was mislabeled as ordinary walking');
 assert.ok(route.checks.some(c=>c.kind===12&&c.verified),'the short drop lost its mandatory physical check');
 assert.ok(sweeps>=2,'the outward and downward capsule sweeps were omitted');
 assert.ok(R.dist(route.points.at(-1),f.goal)<1);
 blocked=true;
 assert.equal(run(Local.search(world,f.start,f.goal,options)),null,'the candidate graph bypassed a blocking drop sweep');
 blocked=false;locked=true;
 assert.equal(run(Local.search(world,f.start,f.goal,options)),null,'a locked walking edge became a short drop');
 locked=false;
 assert.equal(run(Local.search(world,f.goal,f.start,options)),null,'the downward gap invented a reverse climb');
});

test('a short-drop roof connector retains its action and check when assembled before a ladder',()=>{
 const f=require('./fixtures/tower-rooftop-20261114.json'),T=require(root+'/PBZRouteTransitions'),F=require(root+'/PBZRouteFeasibility');
 const entry=f.goal,exit={...entry,z:entry.z-1200},goal={...exit,x:exit.x+140};
 const world={r:45,rise:50,slope:1.43,floorAt:p=>p,hit:()=>null,
  step:(a,b)=>Math.min(a.x,b.x)<f.gapPlaneX&&Math.max(a.x,b.x)>=f.gapPlaneX?{why:'drop required'}:{p:b}};
 const trip=run(T.route({name:f.world,start:f.start,goal,clock:()=>0,stagedWalk:true,
  features:[{guid:'roof-ladder',kind:'ladder',runtimePath:[entry,exit]}],landing:function*(f,p){return p;},
  canTraverse:()=>true,validate:function*(){return true;},walk:function*(a,b){
   if(R.dist(a,f.start)<1&&R.dist(b,entry)<1)return yield* Local.search(world,a,b,
    {hints:require(root+'/PBZRouteWalkHints').forWorld(f.world),hintsOnly:true,allowDrops:true,clock:()=>0});
   return R.dist(a,exit)<1&&R.dist(b,goal)<1?{points:[a,b],meters:R.dist(a,b)/100}:null;
  }}));
 assert.ok(trip,'the checked rooftop connector never joined the ladder chain');
 const leg=trip.legs[0];
 assert.deepEqual(leg.moves.map(m=>m.kind),['fall','ladder'],'action assembly reclassified the checked drop as ordinary walking');
 assert.ok(leg.checks.some(c=>c.kind===12&&c.verified&&c.to>c.from),'assembly discarded the drop audit');
 assert.equal(run(F.check(world,leg,f.start)).ok,true,'the final physical audit rejected a connector whose movement metadata was lost');
});

test('the failed lower-stair query crosses a sampling gap without spending physics on a disconnected search',()=>{
 const field=require('./fixtures/tower-stair-budget-20261114.json');
 const hints=require(root+'/PBZRouteWalkHints').forWorld(field.world);
 let probes=0,samples=0;
 // Open-space graph control, with an operation clock close to the field's
 // ~1000 checked steps per 200ms CPU. This is not a real-time benchmark.
 const world={rise:50,slope:1.43,floorAt:p=>p,step:(a,b)=>{probes++;samples+=Math.max(1,Math.ceil(R.xy(a,b)/35));return {p:b};}};
 const route=run(Local.search(world,field.start,field.goal,{hints,hintsOnly:true,maxNodes:192,maxMs:200,clock:()=>probes*.2}));
 assert.ok(route&&!route.partial,'the known walk is disconnected by a 210cm candidate limit despite a 222cm ordinary sampling gap');
 assert.ok(probes<=60,'finite graph planning still spends expensive physical checks on hundreds of unused neighbour edges: '+probes);
 assert.ok(samples<=120,'longer candidate edges hid an excessive number of ordinary 35cm floor/body samples: '+samples);
 assert.ok(R.dist(route.points.at(-1),field.goal)<1);
});

test('the recorded approach cloud can be checked without creating offset grids at every hint',()=>{
 const hints=require(root+'/PBZRouteWalkHints').forWorld('pbz_xigu_wp');
 const start={x:-62824.77957057578,y:220546.45007256905,z:-15506.803871754168};
 const goal={x:-64810.17578124981,y:217523.4375,z:-14462.497596686248};
 // Candidate-graph control only: this intentionally supplies no game collision.
 // It isolates the duplicate-grid budget from floor/body rejection.
 let probes=0,report;
 const world={floorAt:p=>p,step:(a,b)=>{probes++;return {p:b};}};
 const route=run(Local.search(world,start,goal,{hints,hintsOnly:true,maxNodes:192,clock:()=>0,
  report:(phase,data)=>report=data}));
 assert.ok(route&&!route.partial,'new offset lattices exhaust the budget before the finite recorded candidates reach the climb entry');
 assert.ok(report.expanded<=192&&probes<1200);
 assert.ok(route.points.every((p,i,ps)=>!i||R.dist(ps[i-1],p)<=351));
});

test('lazy candidate rejection finds a checked detour and reuses only this job validation',()=>{
 const {Index}=require(root+'/PBZRouteWalkHints'),start={x:0,y:0,z:0},goal={x:1000,y:0,z:0};
 const hints=new Index([[100,0,0],[250,0,0],[450,0,0],[550,0,0],[750,0,0],[900,0,0],[250,250,0],[500,250,0],[750,250,0]]);
 const blocked=(a,b)=>{
  if(a.x===b.x||Math.min(a.x,b.x)>=500||Math.max(a.x,b.x)<500)return false;
  return Math.abs(a.y+(b.y-a.y)*(500-a.x)/(b.x-a.x))<100;
 };
 let report;const calls=new Map(),world={floorAt:p=>p,describeTrace:()=>({actor:'simulated-wall',shape:'capsule'}),step:(a,b)=>{
  const key=JSON.stringify([a,b]);calls.set(key,(calls.get(key)||0)+1);
  return blocked(a,b)?{hit:b,why:'body wall',collision:{component:'simulated-component'}}:{p:b};
 }};
 const route=run(Local.search(world,start,goal,{hints,hintsOnly:true,clock:()=>0,report:(phase,data)=>report=data}));
 assert.ok(route&&!route.partial,'one rejected candidate prevented a valid checked side passage');
 assert.ok(report.proposals>1&&report.rejected.some(r=>r.why==='body wall'));
 assert.equal(report.rejected.find(r=>r.why==='body wall').trace.actor,'simulated-wall','the failed physical boundary lost its scalar collision diagnostic');
 assert.ok(route.points.slice(1).every((p,i)=>!blocked(route.points[i],p)),'unchecked optimistic edges leaked into the guide');
 assert.ok([...calls.values()].every(n=>n===1),'the same directed physical edge was rechecked during candidate repair');
 const shut={floorAt:p=>p,step:(a,b)=>a.x<500&&b.x>=500?{hit:b,why:'locked passage',locked:true}:{p:b}};
 assert.equal(run(Local.search(shut,start,goal,{hints,hintsOnly:true,clock:()=>0})),null,'another request reused stale open-door collision results');
});

test('lazy walking keeps goal-floor checks and returns no route when its validation budget expires',()=>{
 const h=corridor(),options={hints:h.hints,hintsOnly:true,maxMs:1};let clock=0;
 const slow={floorAt:h.world.floorAt,step:(a,b)=>{clock+=2;return h.world.step(a,b);}};
 assert.equal(run(Local.search(slow,h.start,h.goal,{...options,clock:()=>clock})),null,'an unfinished validation became a complete route');
 assert.ok(run(Local.search(h.world,h.start,h.goal,{...options,maxMs:200,clock:()=>0})),'a fresh request inherited the timed-out validation');
 const wrong={floorAt:p=>p,step:(a,b)=>({p:{...b,z:b.z-600}})};
 assert.equal(run(Local.search(wrong,h.start,h.goal,{...options,maxMs:200,clock:()=>0})),null,'a checked candidate snapped to an unrelated lower floor');
 let checks=0,reason;
 const counted={floorAt:h.world.floorAt,step:(a,b)=>{checks++;return h.world.step(a,b);}};
 assert.equal(run(Local.search(counted,h.start,h.goal,{...options,maxMs:200,maxChecks:1,clock:()=>0,
  report:(phase,data)=>reason=data.reason})),null);
 assert.equal(checks,1);assert.equal(reason,'physical check budget');
 checks=0;
 assert.equal(run(Local.search(counted,h.start,h.goal,{...options,maxMs:200,maxGraphNodes:1,clock:()=>0,
  report:(phase,data)=>reason=data.reason})),null);
 assert.equal(checks,0);assert.equal(reason,'graph node budget','a capped graph search was mislabeled as no route');
});
function corridor(closed=false){
 const c=Math.cos(Math.PI/6),s=Math.sin(Math.PI/6),point=t=>({x:t*c,y:t*s,z:t*.4}),goal=point(1500);
 const along=p=>p.x*c+p.y*s,side=p=>Math.abs(-p.x*s+p.y*c);
 const floor=p=>side(p)<=8&&along(p)>=-1&&along(p)<=1501?{...p,z:along(p)*.4}:null;
 const world={floorAt:floor,step:(a,b)=>{
  const q=floor(b);if(!q)return {why:'narrow corridor'};
  if(closed&&Math.min(along(a),along(q))<750&&Math.max(along(a),along(q))>=750)return {hit:q,locked:true,why:'closed gate'};
  return {p:q};}};
 const points=Array.from({length:31},(_,i)=>point(i*50));
 const hints={near:(p,radius,limit)=>points.filter(q=>R.dist(p,q)>1&&R.dist(p,q)<=radius).sort((a,b)=>R.dist(a,p)-R.dist(b,p)).slice(0,limit)};
 return {world,start:point(0),goal,hints};
}
test('checked author hint points recover a narrow oblique walking connection missed by the grid',()=>{
 const h=corridor();assert.equal(run(Local.search(h.world,h.start,h.goal,{clock:()=>0})),null,'control must be missed by the ordinary grid');
 const route=run(Local.search(h.world,h.start,h.goal,{clock:()=>0,hints:h.hints}));
 assert.ok(route&&!route.partial,'valid checked hint neighbours were ignored');
 assert.ok(R.dist(route.points.at(-1),h.goal)<1);
});
test('author hints cannot cross a closed gate or invent a vertical action',()=>{
 const h=corridor(true);for(const hintsOnly of [false,true])assert.equal(run(Local.search(h.world,h.start,h.goal,{clock:()=>0,hints:h.hints,hintsOnly})),null);
 const upper={x:0,y:0,z:600},world={floorAt:p=>p,step:(a,b)=>Math.abs(a.z-b.z)>50?{why:'different floor'}:{p:b}};
 for(const hintsOnly of [false,true])assert.equal(run(Local.search(world,{x:0,y:0,z:0},upper,{clock:()=>0,maxNodes:40,hints:{near:()=>[upper]},hintsOnly})),null);
});
test('grounded author points stay world-specific and bounded near the current row',()=>{
 const H=require(root+'/PBZRouteWalkHints'),data=require(root+'/PBZRouteWalkHintData/pbz_xigu_wp').data;
 assert.equal(H.forWorld('pbz_houjie_wp'),null);
 const index=H.forWorld('pbz_xigu_wp'),raw=data.points[0],p={x:raw[0],y:raw[1],z:raw[2]};
 const nearby=index.near(p,210,12);assert.ok(nearby.length>0&&nearby.length<=12);
 assert.ok(nearby.every(q=>R.dist(p,q)<=210));
 const before=nearby[0].x;nearby[0].x+=100000;assert.equal(index.near(p,210,12)[0].x,before);
});
