'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=process.env.PBZ_TEST_SOURCE||path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const R=require(root+'/PBZRouteCore');
function fixture(conditional=false){
 const W={alive:o=>!!o,plain:p=>({x:p.X,y:p.Y,z:p.Z})};
 const module={exports:{}},mocks={ue:{ESplineCoordinateSpace:{World:0}},puerts:{$ref:value=>({value}),$unref:ref=>ref.value},'./PBZRouteWorld':W};
 const load=id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id));
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRoutePassages.js','utf8')+'\nexports.placedCurve=placedCurve;exports.checkedWalkJob=checkedWalkJob;\n})',{Date,console})(load,module,module.exports);
 const floor=p=>p.x>=-100&&p.x<=500?0:p.x>=650&&p.x<=900?600:p.x>=1100&&p.x<=1500?1200:null;
 const world={normal:.7,rise:45,slope:1,r:35,floorAt:p=>{const z=floor(p);return z===null?null:{...p,z};},
  step:(a,b)=>{const z=floor(b);return z!==null&&Math.abs(z-a.z)<80?{p:{...b,z}}:{why:'gap'};},
  hit:(a,b,body)=>{if(body)return null;const z=floor(a);return z!==null&&z<=a.z&&z>=b.z?{point:{x:a.x,y:a.y,z},nz:1}:null;}};
 const actors=[{guid:'ladder',kind:'ladder',both:true,fold:false,conditional,path:[[500,0,0],[650,0,600]]},
  {guid:'hook',kind:'swing',both:true,fold:false,conditional,path:[[900,0,600],[1100,0,1200]]}];
 const g={name:'fixture',actors,observedPassages:new Map(),openPassages:new Set(),canTraverse:f=>!f.fold||g.openPassages.has(f.guid)};
 const native=(a,b)=>Math.abs(a.z-b.z)<25&&floor(a)===floor(b)?{points:[a,b],checks:[],gates:[],walks:[],moves:[],meters:R.dist(a,b)/100}:null;
 return {api:module.exports,g,world,native,UE:mocks.ue,start:{x:0,y:0,z:0},goal:{x:1400,y:0,z:1200}};
}
function run(job){let row,n=0;do{row=job.next();assert.ok(++n<100000);}while(!row.done);return row.value;}

test('a far unloaded goal retains its checked bridge approach when the future action has a complete ground suffix',()=>{
 const h=fixture(),start={x:-55647.689,y:213461.674,z:-15829.203},goal={x:-58421,y:196992,z:-17597};
 const entry={x:-55948.917986480876,y:201820.23439632863,z:-17400.56270589963},exit={x:-56943.91015098129,y:200708.03124155325,z:-17346.24937185971};
 h.g.name='pbz_xigu_wp';h.g.actors=[{guid:'bridge-wallrun',kind:'wallrun',path:[entry,exit].map(p=>[p.x,p.y,p.z])}];
 const loaded=p=>R.dist(p,start)<7000;
 const world={r:45,rise:50,slope:1.43,normal:.573576,floorAt:p=>loaded(p)?p:null,hit:()=>null,
  step:(a,b)=>loaded(b)?{p:b}:{why:'no supporting floor'}};
 const native=(a,b)=>R.dist(a,exit)<1&&R.dist(b,goal)<1?{provider:'native',points:[a,b],meters:R.dist(a,b)/100}:null;
 let preview;run(h.api.liveRouteJob(h.g,world,start,goal,native,{clock:()=>0,allowPartial:true,onHorizon:r=>preview=r}));
 assert.ok(preview?.legs[0].goalTopology,'the verified bridge approach vanished because the far bell collision was not loaded');
 const leg=preview.legs[0];assert.ok(leg.partial&&leg.diagnostic);
 assert.ok(leg.points.every(loaded),'a pending wallrun or unloaded tail was painted as safe walking');
 assert.ok(leg.points.at(-1).y<start.y-1000,'the published prefix does not follow the bridge/cave corridor');
 preview=null;
 run(h.api.liveRouteJob(h.g,world,start,goal,(a,b)=>{const p=native(a,b);return p?{...p,partial:true}:null;},
  {clock:()=>0,allowPartial:true,onHorizon:r=>preview=r}));
 assert.equal(preview,null,'a partial native suffix was used as proof that this action connects to the selected bell');
 run(h.api.liveRouteJob(h.g,world,start,goal,(a,b)=>{const p=native(a,b);return p?{...p,points:[a,{...b,z:b.z-600}]}:null;},
  {clock:()=>0,allowPartial:true,onHorizon:r=>preview=r}));
 assert.equal(preview,null,'an unrelated floor at the far bell certified a bridge corridor');
 const locked={...world,blockAt:()=>({locked:true})};
 run(h.api.liveRouteJob(h.g,locked,start,goal,native,{clock:()=>0,allowPartial:true,onHorizon:r=>preview=r}));
 assert.equal(preview,null,'a known locked suffix certified the pending corridor');
});

test('far-goal lookahead leaves the accepted tower route inside its existing scene range',()=>{
 const H=require(root+'/PBZRouteHorizon'),start={x:-64783.269,y:219681.222,z:-11388.424},goal={x:-55527,y:213608,z:-15827};
 let reads=0;
 const result=run(H.preview({name:'pbz_xigu_wp'},{floorAt:()=>{reads++;return null;}},start,goal,()=>{throw Error('unexpected topology query');},[],{onHorizon(){}}));
 assert.equal(result,null);assert.equal(reads,0,'A-02 acquired a new far-goal search before its existing planner');
});

test('the real Xigu atlas supplies only the pending ground suffix after the bridge wallrun',()=>{
 const H=require(root+'/PBZRouteHorizon');
 const g=new R.Graph(require(root+'/PBZRouteWorlds/pbz_xigu_wp').data,require(root+'/PBZRouteFaces/pbz_xigu_wp').faces);
 const raw=require('../authoring/placed-passage-facts.json').rows.find(f=>f.guid.endsWith('_1997136039'));
 const start={x:-55647.689,y:213461.674,z:-15829.203},goal={x:-58421,y:196992,z:-17597};
 // Real atlas topology, with a substituted loaded-scene boundary and actor
 // availability. This does not reconstruct the game's collision or timing.
 const world={r:45,rise:50,slope:1.43,normal:.573576,floorAt:p=>R.dist(p,start)<7000?p:null,hit:()=>null,
  step:(a,b)=>R.dist(b,start)<7000?{p:b}:{why:'no supporting floor'}};
 const feature={...raw,conditional:false,requiresLoaded:false,runtimePath:raw.path.map(p=>({x:p[0],y:p[1],z:p[2]}))};
 const trip=run(H.preview(g,world,start,goal,()=>null,[feature],{clock:()=>0,onHorizon(){}}));
 assert.ok(trip?.legs[0].partial&&trip.legs[0].goalTopology?.provider==='atlas-ground','the real ordinary suffix cannot witness the pending bridge corridor');
 assert.ok(trip.legs[0].points.every(p=>R.dist(p,start)<7000),'offline geometry escaped the simulated loaded/collision frontier');
 assert.equal(trip.legs[0].goalTopology.action,raw.guid);
});

for(const baked of [false,true])test('a descending ladder follows its visible axis instead of the raised interaction-box centre ('+(baked?'baked':'runtime mesh')+')',()=>{
 const h=fixture(false);h.g.actors=[];
 const v=(x,z)=>({X:x,Y:0,Z:z}),component=(x,z)=>({K2_GetComponentLocation:()=>v(x,z)});
 // Captured ladder: upper interaction centre is 200cm behind the mesh and
 // about104cm above the platform. Physics below models the two standing decks.
 const actor={GetName:()=> 'offset-ladder',K2_GetActorLocation:()=>v(500,0),bFold:false,
  BottomCollision:component(500,0),TopCollision:component(300,704),
  BottomMeshComponent:baked?null:component(500,0),TopMeshComponent:baked?null:component(500,600),
  GetActorUpVector:()=>v(0,1)};
 h.UE.Class={Find:path=>path.includes('ClimLadder')?path:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 const floor=p=>({...p,z:p.z>300?600:0});
 const world={normal:.7,rise:50,slope:1,r:35,floorAt:floor,hit:()=>null,
  step:(a,b)=>Math.abs(floor(b).z-a.z)<80?{p:floor(b)}:{why:'different floor'}};
 const start={x:0,y:0,z:600},goal={x:900,y:0,z:0};
 const native=(a,b)=>Math.abs(a.z-b.z)<25?{points:[a,b],meters:R.dist(a,b)/100}:null;
 run(h.api.refreshLoadedJob(h.g,world,{},start,goal));
 const trip=run(h.api.liveRouteJob(h.g,world,start,goal,native,{clock:()=>0}));
 assert.ok(trip,'the native ladder lost its checked standing pads');
 const leg=trip.legs[0],move=leg.moves.find(m=>m.kind==='ladder');assert.ok(move&&move.end.z<move.p.z);
 const action=leg.points.slice(move.from,move.to+1);
 assert.ok(Math.max(...action.map(p=>p.z))<=600.01,'guidance climbs into the elevated interaction box before descending');
 assert.ok(action.some(p=>Math.abs(p.x-500)<.01&&Math.abs(p.z-600)<.01),'the upper mesh endpoint is absent from the ladder guide');
 assert.ok(action.slice(1,-1).every(p=>Math.abs(p.x-500)<.01),'descent follows the interaction volume through the platform instead of the visible ladder');
 assert.equal(move.p.x,300,'drawing correction changed the checked interaction standing pad');
});

test('the captured first-floor bell can join its long author-backed climb approach with full live checks',()=>{
 const h=fixture(),field=require('./fixtures/tower-bell-approach-20261114.json');
 const ascent=field.ascent,start=field.start;
 h.g.name='pbz_xigu_wp';h.g.actors=[{guid:ascent.guid,kind:'ascent',path:[ascent.entry,ascent.exit].map(p=>[p.x,p.y,p.z])}];
 let checks=0;const world={rise:50,normal:.573576,slope:1.43,r:45,hit:()=>null,floorAt:p=>p,
  step:(a,b)=>{checks++;return {p:b};}};
 const trip=run(h.api.liveRouteJob(h.g,world,start,field.goal,()=>null,{clock:()=>0}));
 assert.ok(trip&&!trip.legs[0].partial,'the45m grid-search limit also disabled the available64m author-backed approach from the first-floor bell');
 assert.ok(checks>0,'the author route bypassed live step validation');
 assert.deepEqual(trip.legs[0].moves.map(m=>m.guid),[field.goodAscent]);
 assert.ok(R.dist(trip.legs[0].points.at(-1),field.goal)<1);
 const blocked={...world,step:(a,b)=>Math.min(a.x,b.x)<-63000&&Math.max(a.x,b.x)>=-63000?
  {hit:{x:-63000,y:b.y,z:b.z},why:'locked wall',locked:true}:{p:b}};
 assert.equal(run(h.api.liveRouteJob(h.g,blocked,start,field.goal,()=>null,{clock:()=>0})),null,'the longer author connector bypassed a blocking wall/lock');
 h.g.name='pbz_houjie_wp';
 assert.equal(run(h.api.liveRouteJob(h.g,world,start,field.goal,()=>null,{clock:()=>0})),null,'a long unrecorded area gained an unbounded physical grid search');
});

test('resident condition refresh rotates beyond the first sixty-four movement actors',()=>{
 const h=fixture(),v=X=>({X,Y:0,Z:0});h.g.actors=[];h.world.feet=()=>h.start;
 let lastReady=true;const actors=Array.from({length:70},(_,i)=>({GetName:()=> 'wall-'+i,K2_GetActorLocation:()=>v(300),
  LowSpline:{GetSplineLength:()=>200,GetLocationAtDistanceAlongSpline:d=>v(300+d)},
  GetInteractRequirementMeet:()=>i===69&&!lastReady?2:1}));
 h.UE.EInteractRequirementState={NoRequirement:0,RequirementMeet:1,RequirementNotMeet:2};
 h.UE.Class={Find:name=>name.includes('SideRunning')?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>actors.length,Get:i=>actors[i]};}};
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,h.goal));assert.equal(h.g.passageStates.get('wall-69').ready,true);
 lastReady=false;h.api.refreshStates(h.g,h.world,{},true);h.api.refreshStates(h.g,h.world,{},true);
 assert.equal(h.g.passageStates.get('wall-69').ready,false,'late movement types never refreshed their requirements');
});
test('loaded placed hooks still bind their current requirements to the existing fixed guide',()=>{
 const h=fixture(),facts=require('../authoring/placed-passage-facts.json').rows;
 const f=facts.find(f=>f.kind==='hook'&&f.world==='pbz_zhengdaodaying_wp'&&f.origin),p=v=>({x:v[0],y:v[1],z:v[2]}),at=v=>({K2_GetComponentLocation:()=>({X:v[0],Y:v[1],Z:v[2]})});
 h.g.name=f.world;h.g.actors=[];h.start=p(f.path[0]);h.goal=p(f.path.at(-1));h.world.feet=()=>h.start;
 const a={GetName:()=>f.guid,K2_GetActorLocation:()=>({X:f.origin[0],Y:f.origin[1],Z:f.origin[2]}),
  TriggerSphere:at(f.path[0]),GrabPoint:at(f.path[1]),LandArea:at(f.path.at(-1)),GetInteractRequirementMeet:()=>2};
 h.UE.EInteractRequirementState={RequirementMeet:1,RequirementNotMeet:2};h.UE.Class={Find:name=>name===f.classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>a};}};
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,h.goal));
 const leg={guide:true,points:f.path.map(p),moves:[{kind:'hook',guid:'guide:existing-hook',from:0,to:f.path.length-1,p:h.start,end:h.goal}]};
 require(root+'/PBZRouteGuides').refreshActions(leg,h.g);
 assert.ok(leg.moves[0].block,'pre-indexing the placed hook hid it from existing guide requirement binding');
 assert.equal(leg.moves[0].block.unknown,false);
});

test('resident ascent reads its lower BoxA and native spline components instead of the actor origin',()=>{
 const h=fixture(),vec=(X,Y,Z)=>({X,Y,Z});
 h.UE.SceneComponent={StaticClass:()=> 'scene'};
 const box={GetName:()=> 'BoxA',K2_GetComponentLocation:()=>vec(0,0,100)};
 const edge={GetName:()=> 'EdgeSpline',GetSplineLength:()=>100,GetLocationAtDistanceAlongSpline:()=>vec(120,0,700)};
 const actor={K2_GetActorLocation:()=>vec(120,0,700),K2_GetComponentsByClass:()=>({Num:()=>2,Get:i=>i?edge:box})};
 const points=h.api.placedCurve(actor,'ascent');
 assert.ok(points,'inherited native component access lost the climb entirely');
 assert.equal(points[0].z,100);assert.equal(points.at(-1).z,700);
});

test('gap grapples use their authored trigger, grab point and landing area',()=>{
 const h=fixture(),at=(X,Y,Z)=>({K2_GetComponentLocation:()=>({X,Y,Z})});
 const actor={K2_GetActorLocation:()=>({X:0,Y:0,Z:0}),TriggerSphere:at(0,0,0),GrabPoint:at(150,500,500),LandArea:at(400,900,700)};
 const points=h.api.placedCurve(actor,'hook');
 assert.ok(points,'BP_GapBlocker was omitted from traversal extraction');
 assert.equal(points[0].x,0);assert.equal(points.at(-1).z,700);
});

test('the captured tower hook reaches its currency from the lower trigger platform before grappling',()=>{
 const f=require('./fixtures/tower-hook-currency-20261114.json'),h=fixture(),at=q=>({K2_GetComponentLocation:()=>({X:q.x,Y:q.y,Z:q.z})});
 h.g.name=f.world;h.start=f.start;h.goal=f.goal;h.g.actors=[];
 const actor={GetName:()=>f.guid,K2_GetActorLocation:()=>({X:f.root.x,Y:f.root.y,Z:f.root.z}),
  TriggerSphere:at(f.triggerSphere),TriggerBox:at(f.triggerBox),GrabPoint:at(f.grabPoint),LandArea:at(f.landArea),GetInteractRequirementMeet:()=>1};
 const floor=q=>q.y<219000?f.start.z:q.y>219350?f.landArea.z+(q.y-f.landArea.y)*.1043:null;
 const world={feet:()=>f.start,normal:.7,rise:50,slope:1,r:45,hit:()=>null,
  floorAt:q=>{const z=floor(q);return z===null?null:{...q,z};},
  step:(a,b)=>{const z=floor(b);return z!==null&&Math.abs(z-a.z)<90?{p:{...b,z}}:{why:'grapple gap'};}};
 h.UE.EInteractRequirementState={NoRequirement:0,RequirementMeet:1,RequirementNotMeet:2};
 h.UE.Class={Find:name=>name===f.classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,world,{},f.start,f.goal));
 const trip=run(h.api.liveRouteJob(h.g,world,f.start,f.goal,()=>null,{clock:()=>0}));
 assert.ok(trip&&!trip.legs[0].partial,'no route exists until the player has already used the hook');
 assert.deepEqual(trip.legs[0].moves.map(m=>m.kind),['hook']);
 assert.ok(trip.legs[0].moves[0].p.y<219000,'the standing approach still points at the airborne aiming sphere');
 assert.ok(trip.legs[0].points.some(q=>R.dist(q,f.grabPoint)<1),'the actual hook anchor disappeared from its action path');
 actor.GetInteractRequirementMeet=()=>2;h.api.refreshStates(h.g,world,{},true);
 assert.equal(run(h.api.liveRouteJob(h.g,world,f.start,f.goal,()=>null,{clock:()=>0})),null,'correcting the approach bypassed the hook requirement');
});

test('a resident grapple with an unmet game requirement cannot become a usable route',()=>{
 const h=fixture(),at=(X,Z)=>({K2_GetComponentLocation:()=>({X,Y:0,Z})});
 h.world.feet=()=>h.start;
 Object.assign(h.g.actors[0],{kind:'hook',guid:'gap-hook'});
 const actor={GetName:()=> 'gap-hook',K2_GetActorLocation:()=>({X:500,Y:0,Z:0}),
  TriggerSphere:at(500,0),GrabPoint:at(575,500),LandArea:at(650,600),
  GetNeedShaChiWeaponID:()=> 'Weapon_Hook',GetInteractRequirementMeet:()=>2};
 h.UE.EInteractRequirementState={NoRequirement:0,RequirementMeet:1,RequirementNotMeet:2};
 h.UE.Class={Find:p=>p.includes('BP_GapBlocker.')?p:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,h.goal));
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native)),null,'a missing grapple weapon was ignored');
 actor.GetInteractRequirementMeet=()=>1;
 h.api.refreshStates(h.g,h.world,{},true);
 assert.ok(run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native)),'satisfying the real requirement did not release the action');
});

test('prepared actions immediately join the atlas even when the final hook is not loaded',()=>{
 const h=fixture(false),columns={p:[0,0,0,500,0,0,650,0,600,900,0,600,1100,0,1200,1400,0,1200],v:[],
  e:[0,1,1,0,0,0,2,3,1,0,0,0,4,5,1,0,0,0],arc:[0,~0,1,~1,2,~2],lab:[0,0,1,1,2,2],cells:[0,0,0,6],
  strong:[0,0,1,1,2,2],dag:[],off:[0,1,2,3,4,5,6],weight:[500,250,300],sizes:[2,2,2],order:[0,1,2,3,4,5],metric:Array(24).fill(0)};
 for(const a of h.g.actors){a.kind='ascent';a.both=false;}
 h.g=new R.Graph({world:'fixture',n:6,actors:h.g.actors},null,columns);
 const unloaded={x:1700,y:0,z:1800};
 run(h.api.liveRouteJob(h.g,h.world,h.start,unloaded,h.native,{allowPartial:true}));
 const atlas=h.g.route(h.start,h.goal,{startNode:0,endNode:5});
 assert.ok(atlas,'preparing a real action chain left its atlas components disconnected');
 assert.deepEqual(atlas.moves.map(m=>m.guid),['ladder','hook']);
 assert.equal(h.g.path(5,0),null,'the two one-way ascents invented reverse movement');
 const F=require(root+'/PBZRouteFeasibility'),checked=run(F.check(h.world,atlas,h.start));
 assert.ok(checked.ok,'the graph lost walking/action boundaries while joining the chain');
});

test('real cave ascent metadata can reattach through simulated clear standing pads while retaining original upward edges',()=>{
 const audit=require('./audit-bells.cjs'),g=audit.load(),h=fixture(false);
 const suffixes=['1365678961','1894210710'];
 const original=g.actors,selected=original.filter(a=>a.path&&suffixes.some(s=>a.guid.endsWith(s)));
 assert.equal(selected.length,2);
 for(const actor of selected){const index=original.indexOf(actor)+1;let upward=0;
  for(let k=0;k<g.e.length;k+=6)if(g.e[k+2]===7&&g.e[k+5]===index)upward++;
  assert.ok(upward,'the one-based actor index must retain its original ascent arcs');
 }
 // Focus this physical fixture on the two known actors. Raw graph routing
 // below uses the restored complete actor table, not reindexed metadata.
 g.actors=selected;
 const levels=[-3589,-3300,-2641],floor=p=>{
  const z=levels.slice().sort((a,b)=>Math.abs(a-p.z)-Math.abs(b-p.z))[0];return Math.abs(z-p.z)<180?{...p,z}:null;
 };
 const world={normal:.7,rise:45,slope:1,r:35,floorAt:floor,
  hit:(a,b,body)=>{const p=floor(a);return !body&&p&&p.z<=a.z&&p.z>=b.z?{point:p,nz:1}:null;},
  step:(a,b)=>{const p=floor(b);return p&&Math.abs(p.z-a.z)<80?{p}:{why:'climb required'};}};
 const native=(a,b)=>Math.abs(a.z-b.z)<80?{points:[a,b],moves:[],walks:[],checks:[],gates:[],meters:R.dist(a,b)/100}:null;
 const start={x:-55727,y:120389,z:-3589},goal={x:-57007,y:120429,z:-2641};
 try{run(h.api.liveRouteJob(g,world,start,goal,native));}finally{g.actors=original;}
 for(const suffix of suffixes)assert.ok(g.liveEdges.some(e=>e.move.guid.endsWith(suffix)&&e.move.kind==='ascent'),
  'the checked standing pads for cave ascent '+suffix+' were not attached');
 const S=require(root+'/PBZRouteSurface'),s=S.anchors(g,start)[0],e=S.anchors(g,goal,true)[0];
 assert.ok(g.route(s.q,e.q,{startNode:s.id,endNode:e.id}),'restoring metadata broke the original atlas route');
});

test('a validated climb cannot attach through a wall between its entry and the atlas',()=>{
 const h=fixture(false),actor={...h.g.actors[0],both:false},columns={p:[0,0,0,650,0,600],v:[],e:[],arc:[],lab:[0,1],
  cells:[0,0,0,2],strong:[0,1],dag:[],off:[0,0,0],weight:[],sizes:[1,1],order:[0,1],metric:Array(8).fill(0)};
 h.g=new R.Graph({world:'fixture',n:2,actors:[actor]},null,columns);
 const old=h.world.step;
 h.world.step=(a,b)=>a.x<250&&b.x>=250?{hit:b,why:'wall before climb'}:old(a,b);
 run(h.api.liveRouteJob(h.g,h.world,{x:450,y:0,z:0},{x:800,y:0,z:600},h.native));
 assert.equal(h.g.liveEdges.length,0,'an action with a valid entry bypassed an unwalkable atlas connector');
});
test('static authored ladders are considered and can chain with a rope-swing action',()=>{
 const h=fixture(false),trip=run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native));
 assert.ok(trip,'static actions were excluded or only one action was tried');
 assert.deepEqual(Array.from(trip.legs[0].moves,m=>m.kind),['ladder','swing']);
});
test('two climbs use the existing checked atlas walk when their platforms exceed the local connector range',()=>{
 const h=fixture(),columns={p:[-1000,0,0,0,0,0,0,0,600,6000,0,600,6000,0,1200,7000,0,1200],v:[],
  e:[0,1,1,0,0,0,2,3,1,0,0,0,4,5,1,0,0,0],arc:[0,~0,1,~1,2,~2],lab:[0,0,1,1,2,2],
  cells:[-1,0,0,1,0,0,1,3,1,0,3,6],strong:[0,0,1,1,2,2],dag:[],off:[0,1,2,3,4,5,6],
  weight:[1000,6000,1000],sizes:[2,2,2],order:[0,1,2,3,4,5],metric:Array(24).fill(0)};
 const actors=[{guid:'first',kind:'ascent',both:false,fold:false,path:[[0,0,0],[0,0,600]]},
  {guid:'second',kind:'ascent',both:false,fold:false,path:[[6000,0,600],[6000,0,1200]]}];
 const graph=new R.Graph({world:'fixture',n:6,actors},null,columns);
 const world={normal:.7,rise:45,slope:1,r:35,floorAt:p=>({...p}),hit:()=>null,
  step:(a,b)=>Math.abs(a.z-b.z)<50?{p:b}:{why:'climb required'}};
 const trip=run(h.api.liveRouteJob(graph,world,{x:-1000,y:0,z:0},{x:7000,y:0,z:1200},()=>null,{clock:()=>0}));
 assert.ok(trip,'a real 60 m atlas corridor could not join the two climbs without native navmesh');
 assert.deepEqual(Array.from(trip.legs[0].moves,m=>m.guid),['first','second']);
 assert.ok(run(require(root+'/PBZRouteFeasibility').check(world,trip.legs[0],trip.legs[0].points[0])).ok);
});
test('a loaded down-slide starts at its supported top trigger before crossing the airborne ledge',()=>{
 const h=fixture();h.g.actors=[];
 const at=(X,Z)=>({K2_GetComponentLocation:()=>({X,Y:0,Z})});
 const spline=(X,Z)=>({GetSplineLength:()=>100,GetLocationAtDistanceAlongSpline:()=>({X,Y:0,Z})});
 const actor={GetName:()=> 'ledge-drop',K2_GetActorLocation:()=>({X:200,Y:0,Z:600}),
  TopCollision:at(-60,600),EdgeSpline:spline(200,600),EndEdgeSpline:spline(500,0)};
 const floor=p=>p.x<=0?600:p.x>=400?0:null;
 Object.assign(h.world,{floorAt:p=>floor(p)===null?null:{...p,z:floor(p)},hit:(a,b,body)=>{
  const z=floor(a);return !body&&z!==null&&z<=a.z&&z>=b.z?{point:{...a,z},nz:1}:null;
 },step:(a,b)=>floor(b)!==null&&Math.abs(a.z-floor(b))<50?{p:{...b,z:floor(b)}}:{why:'ledge'}});
 h.UE.Class={Find:p=>p.includes('DownSliding')?p:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 const start={x:-200,y:0,z:600},goal={x:700,y:0,z:0};
 run(h.api.refreshLoadedJob(h.g,h.world,{},start,goal));
 const trip=run(h.api.liveRouteJob(h.g,h.world,start,goal,()=>null,{clock:()=>0}));
 assert.ok(trip,'the spline midpoint in midair hid the usable top trigger');
 assert.equal(trip.legs[0].moves[0].kind,'drop');
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,goal,start,()=>null,{clock:()=>0})),null);
});
test('rappelling uses the native world landing transform beyond the suspended rope endpoint',()=>{
 const h=fixture(),v=(X,Z)=>({X,Y:0,Z});
 const actor={K2_GetActorLocation:()=>v(0,1000),
  RopeSpline:{GetSplineLength:()=>1000,GetLocationAtDistanceAlongSpline:d=>v(d*.5,1000-d*.7)},
  GetRappellingLandTargetWorldTransform:()=>({Translation:v(700,0)})};
 const points=h.api.placedCurve(actor,'rappel');
 assert.deepEqual(JSON.parse(JSON.stringify(points.at(-1))),{x:700,y:0,z:0});
 assert.ok(points.some(p=>p.x===500&&p.z===300),'the measured rope curve must remain in the action');
});
for(const blocked of ['wall','lock','action','floor'])test('an atlas action connector cannot bypass a '+blocked,()=>{
 const h=fixture(),a={x:0,y:0,z:600},b={x:6000,y:0,z:600};
 const world={normal:.7,floorAt:p=>p,hit:()=>null,step:(p,q)=>blocked==='wall'||blocked==='lock'?{why:blocked,hit:q,locked:blocked==='lock'}:{p:q}};
 const graph={routeJob:function*(){return {points:[a,blocked==='floor'?{...b,z:0}:b],meters:60,
  moves:blocked==='action'?[{from:0,to:1,kind:'hook'}]:[],walks:[],checks:[],gates:[]};}};
 assert.equal(run(h.api.checkedWalkJob(world,a,b,()=>null,{graph,clock:()=>0})),null);
});
test('an unfinished atlas connector respects its deadline and closes its generator',()=>{
 const h=fixture();let now=0,closed=false;
 const world={floorAt:p=>p,hit:()=>null},graph={routeJob:function*(){try{while(true){now+=100;yield;}}finally{closed=true;}}};
 assert.equal(run(h.api.checkedWalkJob(world,{x:0,y:0,z:0},{x:6000,y:0,z:0},()=>null,{graph,clock:()=>now,deadline:200})),null);
 assert.equal(closed,true);assert.ok(now<=300);
});
test('conditional traversal routing can chain multiple actions instead of requiring one to reach the goal',()=>{
 const h=fixture(true),trip=run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native));
 assert.ok(trip);assert.equal(trip.legs[0].moves.length,2);
});
test('bidirectional chains support returning downstairs, but locked and one-way links are not invented',()=>{
 const h=fixture(false);
 assert.ok(run(h.api.liveRouteJob(h.g,h.world,h.goal,h.start,h.native)));
 h.g.actors[0].fold=true;
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native)),null);
 h.g.openPassages.add('ladder');
 assert.ok(run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native)));
 h.g.actors[1].both=false;
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,h.goal,h.start,h.native)),null);
});
test('a newly discovered fixed ladder is not automatically treated as a locked folding ladder',()=>{
 const h=fixture(false);h.g.actors=[];
 const v=(x,z)=>({X:x,Y:0,Z:z});
 const actor={GetName:()=> 'plain-ladder',K2_GetActorLocation:()=>v(500,0),bTriggered:false,
  BottomCollision:{K2_GetComponentLocation:()=>v(500,0)},TopCollision:{K2_GetComponentLocation:()=>v(650,600)}};
 h.UE.Class={Find:path=>path.includes('ClimLadder')?path:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,{x:850,y:0,z:600}));
 const found=h.g.observedPassages.get('plain-ladder');assert.ok(found);assert.equal(found.fold,false);
 const trip=run(h.api.liveRouteJob(h.g,h.world,h.start,{x:850,y:0,z:600},h.native));
 assert.ok(trip);assert.equal(trip.legs[0].moves[0].guid,'plain-ladder');
});
test('lift and one-way rope-slide metadata are retained in a mixed action chain',()=>{
 const h=fixture(false);h.g.actors[0].kind='lift';h.g.actors[1].kind='zipline';h.g.actors[1].both=false;
 const trip=run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native));
 assert.ok(trip);assert.deepEqual(Array.from(trip.legs[0].moves,m=>m.kind),['lift','zipline']);
 for(const move of trip.legs[0].moves)assert.ok(move.from<move.to);
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,h.goal,h.start,h.native)),null);
});
test('climb anchors below their actual standing pads still connect, without drawing the anchor through the floor',()=>{
 const h=fixture(false);h.g.actors[0].kind='ascent';h.g.actors[0].both=false;
 h.g.actors[0].path=[[500,0,-134],[650,0,466]];
 const trip=run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native));
 assert.ok(trip,'134 cm actor/ground offset made a valid climb unavailable');
 const leg=trip.legs[0],move=leg.moves[0];assert.equal(move.kind,'ascent');
 assert.ok(leg.points.slice(move.from,move.to+1).every(p=>p.z>=move.p.z),'guide descends to an animation anchor below the ground');
 assert.equal(h.g.actors[0].path[0][2],-134,'authored data was mutated');
});
test('preflight does not cold-load distant irrelevant movement classes',()=>{
 const h=fixture(false);let loads=0;
 h.g.actors[0].classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_ClimLadder.BP_SpecialMove_ClimLadder_C';
 h.g.actors[0].path=[[20000,0,0],[20100,0,600]];
 h.UE.Class={Find:()=>null,Load:()=>{loads++;return {};}};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>0};}};
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,h.goal));
 assert.equal(loads,0,'an unrelated class package can stall and cancel the roof job');
});

test('preflight does not cold-load a class even when its known placement is nearby',()=>{
 const h=fixture(false);let loads=0;
 h.g.actors[0].classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_ClimLadder.BP_SpecialMove_ClimLadder_C';
 h.UE.Class={Find:()=>null,Load:()=>{loads++;return {};}};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>0};}};
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,h.goal));
 assert.equal(loads,0,'loading a class cannot spawn its unloaded map actors, but can stall the game thread');
});

test('many collectible approach points cannot starve a valid climb of its search time',()=>{
 const T=require(root+'/PBZRouteTransitions');let now=0;
 const start={x:0,y:0,z:0},goal={x:300,y:0,z:600};
 const goals=Array.from({length:17},(_,i)=>({...goal,x:goal.x+i}));
 const trip=run(T.route({name:'test',start,goal,goals,clock:()=>now,deadline:12000,
  features:[{guid:'climb',kind:'ascent',both:false,runtimePath:[start,{x:100,y:0,z:600}]}],
  canTraverse:()=>true,landing:function*(f,p){return p;},
  walk:function*(a,b){if(a.z!==b.z){now+=1200;yield;return null;}return {points:[a,b],meters:R.dist(a,b)/100};}}));
 assert.ok(trip,'17 variants of the same failed direct approach exhausted the budget before trying the climb');
 assert.equal(trip.legs[0].moves[0].guid,'climb');
});

test('a reachable third standing position is still tried and earlier connectors are reused',()=>{
 const T=require(root+'/PBZRouteTransitions'),start={x:0,y:0,z:0},goal={x:300,y:0,z:600},calls=new Map();
 const goals=[goal,{...goal,x:301},{...goal,x:302}];
 const trip=run(T.route({name:'test',start,goal,goals,clock:()=>0,
  features:[{guid:'climb',kind:'ascent',both:false,runtimePath:[start,{x:100,y:0,z:600}]}],
  canTraverse:()=>true,landing:function*(f,p){return p;},walk:function*(a,b){
   const key=[a.x,a.z,b.x,b.z].join('/');calls.set(key,(calls.get(key)||0)+1);
   return a.z===b.z&&(b.z===0||b.x===302)?{points:[a,b],meters:R.dist(a,b)/100}:null;
  }}));
 assert.ok(trip,'the search dropped every standing position after the first two');
 assert.equal(trip.legs[0].points.at(-1).x,302);
 assert.ok([...calls.values()].every(n=>n===1),'the fallback repeated a previously failed physical connector');
});
test('action preparation leaves a search budget for an already valid nearby climb',()=>{
 const T=require(root+'/PBZRouteTransitions');let now=0;
 const features=Array.from({length:8},(_,i)=>({guid:i?'far-'+i:'useful',kind:'ladder',both:false,
  runtimePath:[{x:i*1000,y:0,z:0},{x:i*1000,y:0,z:600}]}));
 const trip=run(T.route({name:'test',start:{x:0,y:0,z:0},goal:{x:100,y:0,z:600},features,
  clock:()=>now,deadline:12000,canTraverse:()=>true,
  landing:function*(f,p){now+=1000;yield;return p;},validate:function*(){return true;},
  walk:function*(a,b){return Math.abs(a.z-b.z)<25?{points:[a,b],meters:R.dist(a,b)/100}:null;}}));
 assert.ok(trip,'preparing other actors discarded the useful climb before graph search');
 assert.equal(trip.legs[0].moves[0].guid,'useful');
});

test('station roof coordinates can connect through their authored climb with overlapping floors',()=>{
 const h=fixture(false),a={x:-35577,y:264703,z:-25670},b={x:-35674,y:264390,z:-25287};
 const item={x:-33723.293,y:266338.12,z:-24843.48},ground=a.z+134,top=b.z+134;
 const dx=item.x-b.x,dy=item.y-b.y,length=Math.hypot(dx,dy);
 const roof=p=>{const along=((p.x-b.x)*dx+(p.y-b.y)*dy)/(length*length),side=Math.abs((p.x-b.x)*dy-(p.y-b.y)*dx)/length;
  return along>=-.1&&along<=1.1&&side<300?top+along*(item.z-140-top):null;};
 const support=p=>{const levels=[ground,roof(p)].filter(z=>z!==null&&z<=p.z+180&&z>=p.z-520);
  return levels.length?{...p,z:Math.max(...levels)}:null;};
 const body=p=>p.z<top-200&&R.xy(p,a)<60;
 h.world.floorAt=support;
 h.world.step=(from,to)=>{const q=support({...to,z:from.z});return q&&Math.abs(q.z-from.z)<80&&!body(q)?{p:q}:{why:'wall or another floor'};};
 h.world.hit=(from,to,isBody)=>{if(isBody)return body(from)?{point:from}:null;
  const levels=[ground,roof(from)].filter(z=>z!==null&&z<=from.z&&z>=to.z);
  return levels.length?{point:{...from,z:Math.max(...levels)},nz:1}:null;};
 h.g.actors=[{guid:'BP_SpecialMove_UpRunning_C_UAID_BCFCE7058A98E16E02_1736492004',kind:'ascent',both:false,fold:false,
  path:[[a.x,a.y,a.z],[b.x,b.y,b.z]],left:[[29404,[-35581,264707,-25671]]],right:[[29434,[-35674,264390,-25228]]]}];
 const start={x:a.x+500,y:a.y,z:ground},goal={...item,z:item.z-140};
 const native=(from,to)=>Math.abs(from.z-to.z)<250?{points:[from,to],checks:[],gates:[],walks:[],moves:[],meters:R.dist(from,to)/100}:null;
 const trip=run(h.api.liveRouteJob(h.g,h.world,start,goal,native));
 assert.ok(trip,'the station climb did not connect the ground and roof');
 const leg=trip.legs[0];assert.equal(leg.moves[0].kind,'ascent');assert.ok(R.dist(leg.points.at(-1),goal)<1);
 assert.ok(leg.points.every(p=>p.z>=ground),'guidance descended to a buried animation anchor');
});

for(const kind of ['ladder','mantle','swing','wallrun','lift'])test(kind+' also tolerates buried anchors and can rejoin walking',()=>{
 const h=fixture(false);h.g.actors[0].kind=kind;h.g.actors[0].path=[[500,0,-134],[650,0,466]];
 const trip=run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native));
 assert.ok(trip,kind+' was dropped by the same standing-pad bias');
 assert.equal(trip.legs[0].moves[0].kind,kind);
 assert.ok(trip.legs[0].points.every(p=>p.z>=0));
});

for(const kind of ['drop','slide','rappel','zipline'])test(kind+' keeps its downhill-only direction with biased anchors',()=>{
 const h=fixture(false);h.g.actors[0].kind=kind;h.g.actors[0].both=false;
 h.g.actors[0].path=[[650,0,466],[500,0,-134]];
 const trip=run(h.api.liveRouteJob(h.g,h.world,h.goal,h.start,h.native));
 assert.ok(trip,kind+' was dropped by the same standing-pad bias');
 assert.equal(trip.legs[0].moves.at(-1).kind,kind);
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native)),null,'invented an uphill '+kind);
});

test('preflight discovers a loaded zipline even without an offline placement',()=>{
 const h=fixture(false);h.g.actors=[];
 const p=t=>({X:650-150*t,Y:0,Z:600*(1-t)});
 const actor={GetName:()=> 'new-zipline',K2_GetActorLocation:()=>p(0),
  RopeSpline:{GetSplineLength:()=>620,GetLocationAtDistanceAlongSpline:d=>p(d/620)}};
 h.UE.Class={Find:name=>name.includes('RopeSliding')?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,h.goal));
 const found=h.g.observedPassages.get('new-zipline');
 assert.ok(found,'the first twelve class limit permanently excluded the zipline class');
 assert.equal(found.kind,'zipline');assert.equal(found.both,false);
});

test('many nearby bidirectional interactions cannot consume every connector before the second action',()=>{
 const T=require(root+'/PBZRouteTransitions');
 const features=Array.from({length:24},(_,i)=>({guid:'ladder-'+i,kind:'ladder',both:true,
  runtimePath:[{x:100+i*5,y:0,z:0},{x:100+i*5,y:0,z:600}]}));
 features[23]={guid:'hook',kind:'swing',both:true,runtimePath:[{x:300,y:0,z:600},{x:400,y:0,z:1200}]};
 const trip=run(T.route({name:'test',start:{x:0,y:0,z:0},goal:{x:500,y:0,z:1200},features,clock:()=>0,
  canTraverse:()=>true,landing:function*(f,p){return p;},
  walk:function*(a,b){return a.z===b.z?{points:[a,b],meters:R.dist(a,b)/100}:null;}}));
 assert.ok(trip,'all 48 probes were spent on start-to-action edges and the hook was never reached');
 assert.equal(trip.legs[0].moves.at(-1).guid,'hook');assert.equal(trip.legs[0].moves.length,2);
});

test('a validated two-climb chain remains available as partial guidance when the final hook is not loaded',()=>{
 const T=require(root+'/PBZRouteTransitions'),start={x:0,y:0,z:0},goal={x:1200,y:0,z:1400};
 const features=[{guid:'cave-climb-1',kind:'ascent',runtimePath:[{x:200,y:0,z:0},{x:300,y:0,z:300}]},
  {guid:'cave-climb-2',kind:'ascent',runtimePath:[{x:600,y:0,z:300},{x:700,y:0,z:900}]}];
 const trip=run(T.route({name:'test',start,goal,features,clock:()=>0,allowPartial:true,canTraverse:()=>true,
  landing:function*(f,p){return p;},validate:function*(){return true;},
  walk:function*(a,b){return a.z===b.z?{points:[a,b],meters:R.dist(a,b)/100}:null;}}));
 assert.ok(trip?.legs[0].partial,'the useful climbs disappeared because the final connector failed');
 assert.deepEqual(trip.legs[0].moves.map(m=>m.guid),['cave-climb-1','cave-climb-2']);
 assert.equal(trip.legs[0].points.at(-1).z,900);
});
