'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=process.env.PBZ_TEST_SOURCE||path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const R=require(root+'/PBZRouteCore');
function fixture(conditional=false){
 const W={alive:o=>!!o&&!o.destroyed,plain:p=>({x:p.X,y:p.Y,z:p.Z})};
 const module={exports:{}},mocks={ue:{ESplineCoordinateSpace:{World:0}},puerts:{$ref:value=>({value}),$unref:ref=>ref.value},'Library/TsHelper':{default:{}},'./PBZRouteWorld':W};
 const load=id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id));
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRoutePassages.js','utf8')+'\nexports.placedCurveJob=placedCurveJob;exports.checkedWalkJob=checkedWalkJob;exports.testLiveCache=liveCache;exports.triggerContains=triggerContains;\n})',{Date,console})(load,module,module.exports);
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
test('a checked run-off drop prompts the player to step off the ledge',()=>{
 const h=fixture(),move={kind:'fall',launch:'runoff'};
 assert.equal(h.api.title(move),'向前走出平台边缘');
 h.UE.KismetInternationalizationLibrary={GetCurrentLanguage:()=>'en'};
 assert.equal(h.api.title(move),'Step off the ledge');
 assert.equal(h.api.title({kind:'drop'}),'Slide down wall');
 assert.equal(h.api.title({kind:'fall',launch:'jump'}),'Run forward and jump down to the platform');
});
test('a one-way Recast descent can use a permitted walk-off beneath a ceiling',()=>{
 const h=fixture(),start={x:-70,y:0,z:500},entry={x:0,y:0,z:500},exit={x:200,y:0,z:0},goal={x:330,y:0,z:0};
 const policy={maxHeightCm:1150,maxRunCm:900,maxJumpHeightCm:1036,maxRunoffHeightCm:1150,
  gravityCm:2156,speedCm:600,jumpVelocityCm:700,canJump:true,allowRunoff:true};
 const floor=p=>p.x<=0?{...p,z:500}:p.x>=140?{...p,z:0}:null;
 const world={...h.world,dropPolicy:()=>policy,floorAt:floor,standAt:p=>p,
  step:(a,b)=>{const q=floor(b);return q&&Math.abs(q.z-a.z)<50?{p:q}:{why:'no ground'};},
  airHit:(a,b)=>b.z>500?{point:b}:null};
 h.g.actors=[];
 const guid='recast-movement:ceiling-ledge',component=p=>p[2]>250?0:1;
 const route=(a,b)=>run(h.api.liveRouteJob(h.g,world,a,b,()=>null,{recast:true,clock:()=>0,
  features:[{guid,kind:'fall',both:false,source:'recast-boundary',path:[[0,0,500],[200,0,0]]}],
  topologyJob:function*(features){return {features,component,componentConnectors:true,
   canConnect:(a,b)=>component(a)===component(b)};}
 }));
 const leg=route(start,goal)?.legs[0];assert.ok(leg);
 assert.equal(leg.moves[0].launch,'runoff');
 assert.deepEqual({...leg.moves[0].p},entry);
 assert.deepEqual({...leg.moves[0].end},exit);
 assert.equal(leg.checks[0].trajectory.launch,'runoff');
 assert.ok(run(require(root+'/PBZRouteDrops').recheck(world,leg.checks[0])).ok);
 assert.equal(route(goal,start),null);
 policy.allowRunoff=false;
 assert.equal(route(start,goal),null);
});
function mockHookBox(UE,volume){
 const at=([X,Y,Z])=>({X,Y,Z});
 UE.Vector=function(X,Y,Z){Object.assign(this,{X,Y,Z});};
 UE.KismetMathLibrary={TransformLocation:(t,q)=>at(t.center.map((x,i)=>x+t.axes[0][i]*q.X+t.axes[1][i]*q.Y+t.axes[2][i]*q.Z))};
 return {K2_GetComponentLocation:()=>at(volume.center),K2_GetComponentToWorld:()=>volume,GetUnscaledBoxExtent:()=>({X:1,Y:1,Z:1})};
}


test('a surface rise above the jump apex can be admitted only as a checked slope walk',()=>{
 const h=fixture(),module={exports:{}},manifest={schema:1,world:'fixture',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:1,coverage:[]},rows=[[3000,0,0,3500,0,180]];
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')(id=>id==='./PBZRouteCore'?R:id.endsWith('/index')?{data:manifest}:{rows},module,module.exports);
 const policy={maxHeightCm:1036,maxRunCm:814,maxRiseCm:93.64,gravityCm:2156,speedCm:600,jumpVelocityCm:700,canJump:true},start={x:0,y:0,z:0},goal={x:4000,y:0,z:180},component=p=>p.x<3250?0:1;
 const features=run(module.exports.candidates('fixture',{sourceIndexSHA256:'same'},start,goal,policy,[-100,-100,4100,100],null,[-100,300]));assert.equal(features.length,1,'the reader deleted a potentially walkable slope because it cannot be jumped');
 h.g.actors=[];let blocked=false,checks=0;const floor=p=>({...p,z:p.x<=3000?0:p.x>=3500?180:(p.x-3000)*.36}),world={...h.world,floorAt:floor,hit:()=>null,dropPolicy:()=>policy,step:(a,b)=>{checks++;return blocked&&a.x<=3300&&b.x>3300?{why:'slope wall'}:{p:floor(b)};}};
 const route=()=>run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{clock:()=>0,recast:true,features,topologyJob:function*(input){return{features:input,component:p=>component({x:p[0]}),canConnect:(a,b)=>component({x:a[0]})===component({x:b[0]})};},walkJob:function*(a,b){return component(a)===component(b)?{points:[a,b],checks:[],gates:[],walks:[],moves:[],meters:R.dist(a,b)/100}:null;}}));
 const trip=route();assert.ok(trip&&!trip.legs[0].partial);assert.equal(trip.legs[0].moves.length,0,'the ordinary slope was incorrectly displayed as a ballistic jump');assert.ok(checks>8);
 blocked=true;assert.equal(route(),null,'a blocked high slope bypassed the original jump ceiling or current body check');
});

test('a checked upward Recast surface is also offered for the downward route',()=>{
 const h=fixture(),module={exports:{}},manifest={schema:1,world:'fixture',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:1,coverage:[]},rows=[[400,0,0,550,0,100]];
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')(id=>id==='./PBZRouteCore'?R:id.endsWith('/index')?{data:manifest}:{rows},module,module.exports);
 h.g.actors=[];const policy={maxHeightCm:1036,maxRunCm:814,maxRiseCm:93.64,gravityCm:2156,speedCm:600,jumpVelocityCm:700,canJump:true},start={x:900,y:0,z:100},goal={x:100,y:0,z:0},features=run(module.exports.candidates('fixture',{sourceIndexSHA256:'same'},start,goal,policy,[-100,-100,1100,100],null,[-100,200]));
 const floor=x=>x<=400?0:x>=550?100:(x-400)*2/3,world={...h.world,dropPolicy:()=>policy,floorAt:p=>({...p,z:floor(p.x)}),hit:()=>null,step:(a,b)=>{const z=floor(b.x);return Math.abs(z-a.z)<55?{p:{...b,z}}:{why:'unsupported step'};}};
 const component=p=>p[0]<475?0:1,trip=run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{recast:true,features,topologyJob:function*(input){return{features:input,component,canConnect:(a,b)=>component(a)===component(b)};},walkJob:function*(a,b){return component([a.x,a.y,a.z])===component([b.x,b.y,b.z])&&Math.abs(a.z-b.z)<1?{points:[a,b],checks:[],gates:[],walks:[],moves:[],meters:R.dist(a,b)/100}:null;}}));
 assert.ok(trip&&!trip.legs[0].partial,'the planner did not offer the physically checked downward direction of an upward-capable surface');
});

test('a hook with a missing launch box cannot use its airborne aiming sphere as a walking entry',()=>{
 const h=fixture(),at=(x,y,z)=>({K2_GetComponentLocation:()=>({X:x,Y:y,Z:z})}),actor={K2_GetActorLocation:()=>({X:0,Y:0,Z:0}),TriggerSphere:at(0,0,1500),GrabPoint:at(0,0,1600),LandArea:at(500,0,1700)};
 assert.equal(run(h.api.placedCurveJob(actor,'hook')),null);
});

test('a cached hook guide requires the live launch volume even when both anchors have support',()=>{
 const h=fixture(),entry={x:400,y:0,z:0},exit={x:700,y:0,z:600};
 const cache=h.api.testLiveCache(h.g,h.world);
 const launchBox={K2_GetComponentLocation:()=>({X:400,Y:0,Z:96})};
 const actor={TriggerBox:launchBox};
 cache.actors.set('cached-hook',{actor});
 const edge={kind:9,mode:'hook',guid:'cached-hook',a:entry,b:exit,first:entry,last:exit};
 assert.equal(run(h.api.checkJob(h.world,edge)),false,'standing at both cached anchors is insufficient without a usable launch volume');
 h.UE.Vector=function(X,Y,Z){Object.assign(this,{X,Y,Z});};
 h.UE.KismetMathLibrary={TransformLocation:(t,p)=>({X:t.X+p.X,Y:t.Y+p.Y,Z:t.Z+p.Z})};
 launchBox.K2_GetComponentToWorld=()=>({X:400,Y:0,Z:96});
 launchBox.GetUnscaledBoxExtent=()=>({X:45,Y:45,Z:96});
 assert.equal(run(h.api.checkJob(h.world,edge)),true);
});

test('a tall live hook trigger accepts a supported platform inside its actual volume',()=>{
 const h=fixture(),guid='tall-hook',at=(x,y,z)=>({K2_GetComponentLocation:()=>({X:x,Y:y,Z:z})});
 h.start={x:100,y:0,z:600};h.goal={x:1400,y:0,z:1800};h.g.actors=[];h.world.h=96;h.world.feet=()=>h.start;
 const floor=p=>p.x<=500?600:p.x>=1100?1800:null;
 h.world.floorAt=p=>{const z=floor(p);return z===null?null:{...p,z};};h.world.hit=()=>null;h.world.step=(a,b)=>floor(b)===a.z?{p:{...b,z:floor(b)}}:{why:'gap'};
 h.UE.Vector=function(X,Y,Z){Object.assign(this,{X,Y,Z});};h.UE.KismetMathLibrary={TransformLocation:(t,p)=>({X:t.X+p.X,Y:t.Y+p.Y,Z:t.Z+p.Z})};
 const box={...at(500,0,0),K2_GetComponentToWorld:()=>({X:500,Y:0,Z:0}),GetUnscaledBoxExtent:()=>({X:200,Y:150,Z:900})};
 const components=[['TriggerBox',box],['GrabPoint',at(700,0,1600)],['LandArea',at(1100,0,1800)]].map(([name,value])=>Object.assign(value,{GetName:()=>name})),actor={GetName:()=>guid,K2_GetActorLocation:()=>({X:500,Y:0,Z:0}),GrabPoint:components[1],LandArea:components[2],GetInteractRequirementMeet:()=>1,K2_GetComponentsByClass:()=>({Num:()=>components.length,Get:i=>components[i]})};
 h.UE.SceneComponent={StaticClass:()=> 'scene'};
 h.UE.EInteractRequirementState={RequirementMeet:1,RequirementNotMeet:2};h.UE.Class={Find:name=>name.includes('BP_GapBlocker.')?name:null};h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,h.goal));
 const route=()=>run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,()=>null,{clock:()=>0}));const trip=route();
 assert.ok(trip,'the hook was discarded because the trigger centre is 600cm below its standing platform');assert.equal(trip.legs[0].moves[0].p.z,600);assert.ok(trip.legs[0].points.some(p=>p.x===700&&p.z===1600));assert.ok(trip.legs[0].moves[0].from>0,'the planner skipped the ordinary walking connector into the in-volume standing pad');
 box.GetUnscaledBoxExtent=()=>({X:200,Y:150,Z:150});assert.equal(route(),null,'a platform outside the current launch volume was accepted');
 box.GetUnscaledBoxExtent=()=>({X:200,Y:150,Z:900});h.world.hit=(a,b,body)=>body?{blocked:true}:null;assert.equal(route(),null,'the volume overrode live capsule collision');
 h.world.hit=()=>null;actor.GetInteractRequirementMeet=()=>2;h.api.refreshStates(h.g,h.world,{},true);assert.equal(route(),null,'the volume overrode the current weapon requirement');
});

test('large movement input deduplication yields before reading the entire candidate set',()=>{
 const h=fixture();h.g.actors=[];let reads=0;const features=Array.from({length:3000},(_,i)=>({get guid(){reads++;return'movement-'+i;},kind:'surface',source:'recast-boundary',path:[[0,0,0],[100,0,0]],both:false}));
 const task=h.api.liveRouteJob(h.g,h.world,h.start,{x:100,y:0,z:0},h.native,{recast:true,clock:()=>0,features});let row,max=0;
 for(let i=0;i<100&&!row?.done;i++){const before=reads;row=task.next();max=Math.max(max,reads-before);}task.return();
 assert.ok(max<=128,'the complete input was mapped/deduplicated in one game-thread step');assert.ok(reads>0);
});

test('live unsupported geometry in the initial shortlist does not hide a later supported descent',()=>{
 const h=fixture(),start={x:0,y:0,z:500},goal={x:5000,y:0,z:0},features=Array.from({length:513},(_,i)=>({guid:'recast-boundary-refill-'+i,kind:'fall',source:'recast-boundary',both:false,path:[[3000+i,0,500],[3000+i,0,0]]}));
 h.g.actors=[];const world={...h.world,dropPolicy:()=>null,floorAt:p=>p.z>250?(p.x<100||Math.abs(p.x-3512)<1?{...p,z:500}:null):{...p,z:0},hit:()=>null,step:(a,b)=>{const p=world.floorAt(b);return p&&Math.abs(p.z-a.z)<80?{p}:{why:'unsupported'};}};
 const reports=[],trip=run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{clock:()=>0,recast:true,features,maxConnectors:4,report:(name,value)=>reports.push({name,value}),topologyJob:function*(input){return{features:input,component:p=>p[2]>250?0:1,canConnect:(a,b)=>(a[2]>250)===(b[2]>250)};},walkJob:function*(a,b){return a.z===b.z?{points:[a,b],checks:[],moves:[],gates:[],walks:[],meters:R.dist(a,b)/100}:null;}}));
 // The final drop is still 500cm, above the conservative no-policy 310cm
 // fallback. Refill must reach and validate it, never make it usable.
 assert.equal(trip,null);
 assert.ok(reports.some(r=>r.name==='action candidates refilled'));assert.ok(reports.some(r=>r.name==='action rejected'&&r.value.guid==='recast-boundary-refill-512'),'the later supported candidate never reached the unchanged live drop-safety check');
});

for(const mode of ['obstructed','unavailable','limited','clear'])test('live geometric rejection preserves the physical audit certainty: '+mode,()=>{
 const h=fixture(),start={x:0,y:0,z:0},goal={x:1000,y:0,z:-500},guid='recast-movement:certainty',features=[{guid,kind:'fall',source:'recast-boundary',both:false,path:[[200,0,0],[500,0,-500]]}],events=[];
 h.g.actors=[];
 const floor=p=>({...p,z:p.x<350?0:-500}),world={...h.world,dropPolicy:()=>({maxHeightCm:1100,maxRunCm:800,gravityCm:2156,speedCm:mode==='limited'?1:600,jumpVelocityCm:700,canJump:true}),
  floorAt:floor,standAt:p=>mode==='unavailable'?null:p,hit:()=>null,airHit:(a,b)=>mode==='obstructed'?{point:a}:null,
  step:(a,b)=>Math.abs(floor(b).z-a.z)<55?{p:floor(b)}:{why:'ledge'}};
 const trip=run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{clock:()=>0,recast:true,features,maxConnectors:4,report:(name,value)=>events.push({name,value}),
  topologyJob:function*(features){return{features,component:p=>p[2],componentConnectors:true,canConnect:(a,b)=>a[2]===b[2]};},
  walkJob:function*(a,b){return a.z===b.z?{points:[a,b],checks:[],moves:[],gates:[],walks:[],meters:R.dist(a,b)/100}:null;}}));
 if(mode==='clear')assert.ok(trip);
 else{
  assert.equal(trip,null);const rejected=events.find(e=>e.name==='action rejected'&&e.value.guid===guid)?.value;assert.ok(rejected);
  assert.equal(!!rejected.knownBlocked,mode==='obstructed');assert.equal(rejected.unknown,mode==='unavailable');
 }
});

for(const mode of ['wall','unloaded','blocked jump','clear jump'])test('a surface connection distinguishes walking and jumping failures: '+mode,()=>{
 const h=fixture(),start={x:0,y:0,z:0},goal={x:1100,y:0,z:0},guid='recast-movement:two-strategies',events=[];
 h.g.actors=[];
 const world={...h.world,floorAt:p=>p,standAt:p=>p,hit:()=>null,airHit:(a,b)=>mode==='blocked jump'?{point:b}:null,
  dropPolicy:()=>({maxHeightCm:1100,maxRunCm:['wall','unloaded'].includes(mode)?180:814,gravityCm:2156,speedCm:600,jumpVelocityCm:700,canJump:true}),
  step:(a,b)=>a.x<=600&&b.x>600?(mode==='unloaded'?{why:'no supporting floor'}:{hit:{x:600,y:0,z:0},why:'blocked body clearance'}):{p:b}};
 const features=[{guid,kind:'surface',source:'recast-boundary',both:false,path:[[350,0,0],[730,0,0]]}];
 const trip=run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{recast:true,clock:()=>0,features,report:(name,value)=>events.push({name,value}),
  topologyJob:function*(features){const component=p=>p[0]<=600?0:1;return{features,component,componentConnectors:true,canConnect:(a,b)=>component(a)===component(b)};}}));
 if(mode==='clear jump'){assert.ok(trip);assert.equal(trip.legs[0].moves[0].kind,'jump');return;}
 assert.equal(trip,null);
 const rejected=events.find(e=>e.name==='action rejected'&&e.value.guid===guid)?.value;
 assert.ok(rejected);
 assert.equal(rejected.knownBlocked,mode!=='unloaded');
 assert.equal(rejected.unknown,mode==='unloaded');
});

test('an airborne retry checks flight for the selected direction only',()=>{
 const h=fixture(),start={x:0,y:0,z:0},goal={x:1000,y:0,z:0},guid='flight-retry';h.g.actors=[];
 let blocked=false,airChecks=0;
 const world={...h.world,floorAt:p=>p,standAt:p=>p,hit:()=>null,step:(a,b)=>({p:b}),
  airHit:(a,b)=>{airChecks++;return blocked?{point:b}:null;},
  dropPolicy:()=>({maxHeightCm:1100,maxRunCm:800,gravityCm:2156,speedCm:600,jumpVelocityCm:700,canJump:true})};
 const features=[{guid,kind:'surface',source:'recast-boundary',both:true,path:[[600,0,0],[400,0,0]]}];
 const route=(a,b)=>run(h.api.liveRouteJob(h.g,world,a,b,()=>null,{recast:true,clock:()=>0,features,airborneDirections:new Map([[guid,2]]),
  topologyJob:function*(features){const component=p=>p[0]<500?0:1;return{features,component,componentConnectors:true,canConnect:(a,b)=>component(a)===component(b)};}}));
 assert.equal(route(goal,start).legs[0].moves.length,0);
 assert.equal(airChecks,0);
 assert.equal(route(start,goal).legs[0].moves[0].kind,'jump');
 assert.ok(airChecks>0);
 blocked=true;assert.equal(route(start,goal),null);
});

test('a surface connection retains the floor samples checked during a refined step',()=>{
 const h=fixture(),start={x:0,y:0,z:0},goal={x:700,y:0,z:0};
 h.g.actors=[];
 const midpoint={x:349,y:0,z:12};
 const world={...h.world,floorAt:p=>p,hit:()=>null,step:(a,b)=>a.x<midpoint.x&&b.x>=midpoint.x?{p:b,points:[midpoint,b]}:{p:b}};
 const features=[{guid:'refined-ground',kind:'surface',source:'recast-boundary',both:false,path:[[290,0,0],[410,0,0]]}];
 const trip=run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{recast:true,clock:()=>0,features,
  topologyJob:function*(features){const component=p=>p[0]<350?0:1;return{features,component,componentConnectors:true,canConnect:(a,b)=>component(a)===component(b)};}}));
 const leg=trip?.legs[0];assert.ok(leg);assert.equal(leg.moves.length,0);
 assert.ok(leg.walks.some(w=>w.b.x===midpoint.x&&w.b.z===midpoint.z),'walking guidance skipped a checked intermediate foot position');
});

test('a live ladder can disable ascent while retaining its permitted descent',()=>{
 const h=fixture(),ladder=h.g.actors[0];h.g.actors=[ladder];const actor={bEnableBottomToTop:false,bEnableTopToBottom:true},cache=h.api.testLiveCache(h.g,h.world);cache.actors.set('ladder',{actor,item:ladder});
 const up=run(h.api.liveRouteJob(h.g,h.world,{x:0,y:0,z:0},{x:800,y:0,z:600},h.native,{clock:()=>0}));assert.equal(up,null,'a disabled ascent was offered because the ladder was marked bidirectional');
 const down=run(h.api.liveRouteJob(h.g,h.world,{x:800,y:0,z:600},{x:0,y:0,z:0},h.native,{clock:()=>0}));assert.ok(down);assert.equal(down.legs[0].moves[0].kind,'ladder');
 actor.bEnableTopToBottom=false;assert.equal(run(h.api.checkJob(h.world,{kind:9,mode:'ladder',guid:'ladder',a:{x:800,y:0,z:600},b:{x:0,y:0,z:0},first:{x:650,y:0,z:600},last:{x:500,y:0,z:0}})),false,'revalidation retained a direction disabled after route creation');
});

test('a cooked ladder mesh axis never substitutes for missing native trigger endpoints',()=>{
 const h=fixture(),guid='cooked-ladder',classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_ClimLadder.BP_SpecialMove_ClimLadder_C',item={guid,kind:'ladder',classPath,source:'game-placement',endpointSource:'cooked-ladder-mesh-axis',requiresLoaded:true,requiresLiveEndpoints:true,origin:[0,0,0],path:[[0,0,0],[0,0,600]]};h.g.actors=[item];h.world.feet=()=>h.start;
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>({X:0,Y:0,Z:0}),bFold:false};h.UE.SceneComponent={StaticClass:()=> 'scene'};actor.K2_GetComponentsByClass=()=>({Num:()=>0});h.UE.Class={Find:name=>name===classPath?name:null};h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,h.goal));assert.equal(h.api.testLiveCache(h.g,h.world).paths.has(guid),false,'the cooked mesh model axis was treated as a current native trigger corridor');
});

test('Recast walking connectors can join a custom route longer than the old scene horizon',()=>{
 const h=fixture(),start={x:0,y:0,z:0},goal={x:24000,y:0,z:600},entry={x:12000,y:0,z:0},exit={x:12000,y:0,z:600};
 h.g.actors=[{guid:'custom-climb',kind:'ascent',both:false,path:[[entry.x,0,0],[exit.x,0,600]]}];
 h.world.floorAt=p=>p;h.world.hit=()=>null;h.world.step=(a,b)=>Math.abs(a.z-b.z)<60?{p:b}:{why:'vertical wall'};
 let providerCalls=0;const trip=run(h.api.liveRouteJob(h.g,h.world,start,goal,()=>null,{recast:true,clock:()=>0,walkJob:function*(a,b){providerCalls++;return Math.abs(a.z-b.z)<60?{points:[a,b],walks:[],checks:[],meters:R.dist(a,b)/100}:null;}}));
 assert.ok(trip,'the 190m scene discovery guard discarded the Recast action chain');assert.ok(providerCalls>0);assert.equal(trip.legs[0].moves[0].guid,'custom-climb');
});

test('an actual coarse action detour is retained outside the direct-distance candidate band',()=>{
 const h=fixture(),start={x:0,y:0,z:0},goal={x:2000,y:0,z:600},entry={x:0,y:18000,z:0},exit={x:2000,y:18000,z:600};h.g.actors=[{guid:'far-but-connected-climb',kind:'ascent',both:false,path:[[entry.x,entry.y,entry.z],[exit.x,exit.y,exit.z]]}];h.world.floorAt=p=>p;h.world.hit=()=>null;h.world.step=(a,b)=>Math.abs(a.z-b.z)<60?{p:b}:{why:'wall'};
 const reports=[],trip=run(h.api.liveRouteJob(h.g,h.world,start,goal,()=>null,{recast:true,clock:()=>0,priorityActions:['far-but-connected-climb'],report:(phase,value)=>reports.push({phase,value}),walkJob:function*(a,b){return Math.abs(a.z-b.z)<60?{points:[a,b],walks:[],checks:[],meters:R.dist(a,b)/100}:null;}}));assert.equal(reports.find(r=>r.phase==='action candidates')?.value.count,1,'the real coarse detour action was filtered by Euclidean distance');assert.ok(reports.some(r=>r.phase==='action connector start'&&r.value.guid==='far-but-connected-climb'),'the retained action never reached the ordinary physical connector checks');assert.equal(trip,null,'the distant candidate bypassed the existing loaded-physics horizon');
 h.g.passageStates=new Map([['far-but-connected-climb',{ready:false,block:{locked:true}}]]);h.g.canTraverse=f=>h.g.passageStates.get(f.guid)?.ready!==false;assert.equal(run(h.api.liveRouteJob(h.g,h.world,start,goal,()=>null,{recast:true,clock:()=>0,priorityActions:['far-but-connected-climb']})),null,'a prioritized action bypassed its known closed state');
});

test('Recast action topology classifies checked standing pads rather than elevated trigger centres',()=>{
 const h=fixture();h.g.actors=[{guid:'raised-trigger',kind:'ascent',path:[[500,0,144],[650,0,744]],both:false}];let checked=false;
 const trip=run(h.api.liveRouteJob(h.g,h.world,h.start,{x:800,y:0,z:600},h.native,{recast:true,clock:()=>0,topologyJob:function*(features){
  const f=features.find(f=>f.guid==='raised-trigger');assert.equal(f.path[0][2],0,'the 144cm trigger was classified as a missing floor');assert.equal(f.path.at(-1)[2],600);checked=true;
  return{features,canConnect:(a,b)=>a[2]===b[2],component:a=>a[2]};
 }}));
 assert.equal(checked,true);assert.ok(trip,'checked landing pads were not used for action graph search');
});

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

test('a selected corridor action reads its resident actor and condition beyond both endpoint scans',()=>{
 const h=fixture(),v=X=>({X,Y:0,Z:0}),goal={x:40000,y:0,z:0};
 const classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SideRunning.BP_SpecialMove_SideRunning_C';
 const placed=guid=>({kind:'wallrun',guid,classPath,path:[[20000,0,0],[20800,0,0]],requiresLoaded:true});
 const selected=placed('wall-selected'),unrelated=placed('wall-unrelated'),unloaded=placed('wall-unloaded'),near=placed('wall-near');
 h.g.actors=[selected,unrelated,unloaded,near];
 const locationReads=[];
 const resident=(f,requirement,x=20000)=>({GetName:()=>f.guid,K2_GetActorLocation:()=>{locationReads.push(f.guid);return v(x);},
  LowSpline:{GetSplineLength:()=>800,GetLocationAtDistanceAlongSpline:d=>v(x+d)},GetInteractRequirementMeet:()=>requirement});
 let requirement=2;
 const selectedActor=resident(selected,2);selectedActor.GetInteractRequirementMeet=()=>requirement;
 const actors=[resident(unrelated,1),selectedActor,resident(near,1,200)];
 h.UE.EInteractRequirementState={RequirementMeet:1,RequirementNotMeet:2};
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>actors.length,Get:i=>actors[i]};}};
 const refreshedActions=new Set();
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,goal,{refreshedActions}));
 assert.equal(h.g.passageStates.has(selected.guid),false);
 locationReads.length=0;
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,goal,{corridorActions:['WALL-SELECTED',unloaded.guid,near.guid],refreshedActions}));
 assert.deepEqual([...new Set(locationReads)],[selected.guid],'the targeted pass rescanned unrelated or already refreshed actors');
 assert.equal(h.g.passageStates.get(selected.guid).ready,false,'a resident closed passage was not read');
 assert.equal(h.g.passageStates.get(selected.guid).block.locked,true);
 assert.equal(h.g.passageStates.has(unloaded.guid),false,'a placement was mistaken for a resident actor');
 assert.equal(h.g.passageStates.has(unrelated.guid),false);
 assert.deepEqual(Array.from(refreshedActions),[near.guid,selected.guid]);
 requirement=1;
 run(h.api.refreshLoadedJob(h.g,h.world,{},h.start,goal,{corridorActions:[selected.guid],refreshedActions:new Set()}));
 assert.equal(h.g.passageStates.get(selected.guid).ready,true,'a fresh request reused the earlier locked requirement');
});

test('an elevated native action can approach on the standing pad floor below another floor',()=>{
 const h=fixture(),p=(x,z)=>({x,y:0,z}),entry=p(0,0),exit=p(1500,0);
 const edge={kind:9,mode:'wallrun',a:entry,b:exit,first:p(390,300),last:p(1500,100)};
 const complete=[];
 let blocked=false;
 const world={...h.world,hit:()=>null,floorAt:q=>({...q,z:q.x>=220&&q.x<=340&&q.z>150?210:0}),
  step:(a,b)=>{
   if(b.z>60||blocked&&a.x<170&&b.x>=170)return{why:'another floor or blocked passage'};
   complete.push(b.x);
   return{p:{...b,z:0}};
  }};
 assert.equal(run(h.api.checkJob(world,edge)),true,'the upper floor hid the reachable approach on the standing floor');
 assert.ok(complete.includes(300),'the complete connector to the action approach was not walked');
 blocked=true;
 assert.equal(run(h.api.checkJob(world,edge)),false,'the earlier floor probe bypassed a scene obstruction');
 blocked=false;
 assert.equal(run(h.api.checkJob(world,{...edge,first:p(390,700)})),false,'the lower approach exceeded the original vertical reach');
});

test('native wallrun direction is matched to its live boxes even when its spline starts on side B',()=>{
 const h=fixture(),[lower,upper]=[{x:500,y:0,z:0},{x:650,y:0,z:600}],raw=p=>({X:p.x,Y:p.y,Z:p.z});
 const guid='one-way-wall',classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SideRunning.BP_SpecialMove_SideRunning_C';
 h.g.actors=[{guid,kind:'wallrun',both:true,classPath,requiresLoaded:true,source:'game-placement',path:[[upper.x,0,upper.z],[lower.x,0,lower.z]]}];
 const componentBox=(name,p)=>({...mockHookBox(h.UE,{center:[p.x,0,p.z+96],axes:[[25,0,0],[0,25,0],[0,0,60]]}),GetName:()=>name});
 const components=[componentBox('BoxA',lower),componentBox('BoxB',upper)];
 let warpCalls=0;
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>raw(lower),bEnableAToB:true,bEnableBToA:false,
  K2_GetComponentsByClass:()=>({Num:()=>components.length,Get:i=>components[i]}),
  LowSpline:{GetSplineLength:()=>615,GetLocationAtDistanceAlongSpline:d=>raw(R.lerp(upper,lower,d/615))},
  CalculateSideRunningWarpTarget:()=>{warpCalls++;throw Error('the planner invoked the native warp calculator');}};
 h.UE.SceneComponent={StaticClass:()=> 'scene'};
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 const start=h.start,goal={x:800,y:0,z:600};
 h.world.feet=()=>start;
 run(h.api.refreshLoadedJob(h.g,h.world,{},start,goal));
 const component=p=>p[2]>300?1:0,topologyRows=[],unavailable=[];
 const options={clock:()=>0,recast:true,priorityActions:[guid],onUnavailable:(id,mask)=>unavailable.push([id,mask]),topologyJob:function*(rows){
  topologyRows.push(...rows);return{features:rows,component,canConnect:(a,b)=>component(a)===component(b)};
 }};
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,goal,start,h.native,options)),null,'a blocked B-to-A direction offered a complete route');
 const trip=run(h.api.liveRouteJob(h.g,h.world,start,goal,h.native,options));
 assert.equal(trip?.legs[0].moves[0].guid,guid,'the allowed reverse of the stored spline was lost');
 assert.ok(topologyRows.length>0&&topologyRows.every(f=>!f.both&&f.path[0][2]===0&&f.path[1][2]===600),'topology admitted the disabled direction');
 assert.deepEqual(unavailable,[[guid,1],[guid,1]],'only the blocked direction in authored spline order should be passed to coarse routing');
 h.api.testLiveCache(h.g,h.world).paths.get(guid).path.reverse();
 assert.ok(run(h.api.liveRouteJob(h.g,h.world,start,goal,h.native,options)));
 assert.deepEqual(unavailable.at(-1),[guid,1],'a reversed live spline changed the direction of the coarse exclusion');
 h.api.testLiveCache(h.g,h.world).paths.get(guid).path.reverse();
 const move=trip.legs[0].moves[0];
 assert.equal(move.wallrunAToB,true,'the reversed authored view lost the actual native A-to-B direction');
 assert.equal(h.api.referenceState(h.g,h.world,move).ready,true,'the permitted roadbook direction was lost');
 assert.equal(h.api.referenceState(h.g,h.world,{...move,p:move.end,end:move.p}).ready,false,'roadbook reused the disabled direction');
 components.pop();
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,start,goal,h.native,options)),null,'the allowed side was guessed when a native box was missing');
 actor.bEnableAToB=false;
 assert.equal(run(h.api.checkJob(h.world,trip.legs[0].checks[0])),false,'an existing route kept a newly disabled direction');
 assert.equal(h.api.refreshStates(h.g,h.world,{},true),true);
 assert.equal(h.g.passageStates.get(guid).ready,false,'disabling both sides did not invalidate the mechanic state');
 assert.equal(warpCalls,0);
});

for(const outcome of ['clear','blocked','too low'])test('native wallrun can find an off-axis landing within the checked envelope: '+outcome,()=>{
 const h=fixture(),start=h.start,a={x:300,y:0,z:0},b={x:1400,y:0,z:600};
 const goal={x:1790,y:34,z:600},guid='wallrun-diagonal-pad',native=p=>({X:p.x,Y:p.y,Z:p.z});
 const feet=p=>p.x<=420?{...p,z:0}:p.x>=1460&&p.y>=25&&p.y<=43?{...p,z:outcome==='too low'?100:600}:null;
 const world={...h.world,floorAt:feet,hit:()=>null,step:(from,to)=>{
  const floor=feet(to);
  return floor&&Math.abs(floor.z-from.z)<80&&!(outcome==='blocked'&&from.x>=1460&&from.x<1600&&to.x>from.x)?{p:floor}:{why:'wall or gap'};
 }};
 const classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SideRunning.BP_SpecialMove_SideRunning_C';
 const box=p=>mockHookBox(h.UE,{center:[p.x,p.y,p.z+96],axes:[[24,0,0],[0,24,0],[0,0,65]]});
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>native(a),bEnableAToB:true,bEnableBToA:false,BoxA:box(a),BoxB:box(b),
  LowSpline:{GetSplineLength:()=>1253,GetLocationAtDistanceAlongSpline:d=>native(R.lerp(a,b,d/1253))}};
 h.g.actors=[{guid,kind:'wallrun',classPath,both:true,requiresLoaded:true,source:'game-placement',path:[[a.x,a.y,a.z],[b.x,b.y,b.z]]}];
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,world,{},start,goal));
 const trip=run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{recast:true,clock:()=>0,
  actionPads:new Map([[guid,{entry:[300,0,0],exit:[1400,0,600]}]]),
  topologyJob:function*(features){const component=p=>p[2]>=300?1:0;return{features,component,componentConnectors:true,canConnect:(a,b)=>component(a)===component(b)};}}));
 if(outcome!=='clear'){assert.equal(trip,null);return;}
 const leg=trip?.legs[0];assert.ok(leg,'the direction has a checked landing between the old 45-degree probes');
 assert.ok(leg.moves[0].end.y>30&&leg.moves[0].end.y<40);
 assert.equal(run(h.api.checkJob(world,leg.checks[0])),true);
});

for(const mode of ['clear','blocked','wrong floor'])test('a native landing can join a mesh without moving the traversal endpoint: '+mode,()=>{
 const h=fixture(),start=h.start,entry={x:300,y:0,z:0},landing={x:1400,y:0,z:600},mesh={x:1650,y:0,z:600},goal={x:2050,y:0,z:600};
 const guid='native-wallrun-off-mesh',raw=p=>({X:p.x,Y:p.y,Z:p.z});
 const floor=p=>p.x<=420?{...p,z:0}:p.x>=1400?{...p,z:600}:null;
 const world={...h.world,floorAt:floor,hit:()=>null,step:(a,b)=>{
  const q=floor(b);
  return q&&Math.abs(q.z-a.z)<80&&!(mode==='blocked'&&a.x<1520&&b.x>=1520)?{p:q}:{why:'wall or unsupported floor'};
 }};
 const classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SideRunning.BP_SpecialMove_SideRunning_C';
 const box=p=>mockHookBox(h.UE,{center:[p.x,p.y,p.z+96],axes:[[26,0,0],[0,26,0],[0,0,60]]});
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>raw(entry),bEnableAToB:true,bEnableBToA:false,BoxA:box(entry),BoxB:box(landing),
  LowSpline:{GetSplineLength:()=>1253,GetLocationAtDistanceAlongSpline:d=>raw(R.lerp(entry,landing,d/1253))}};
 h.g.actors=[{guid,kind:'wallrun',classPath,both:true,requiresLoaded:true,source:'game-placement',path:[[300,0,0],[1400,0,600]]}];
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,world,{},start,goal));
 const topology=[],component=p=>p[0]<=420?0:p[0]>=1600&&p[2]>=550?1:undefined;
 const trip=run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{recast:true,clock:()=>0,
  actionPadCandidates:function*(p){return p.x===landing.x?[mode==='wrong floor'?{...mesh,z:50}:mesh]:[];},
  topologyJob:function*(features){topology.push(...features);return{features,component,componentConnectors:true,canConnect:(a,b)=>component(a)!==undefined&&component(a)===component(b)};}}));
 assert.equal(topology[0].path.at(-1)[0],mode==='clear'?mesh.x:landing.x);
 if(mode!=='clear'){assert.equal(trip,null);return;}
 const leg=trip?.legs[0];assert.ok(leg);
 assert.deepEqual({...leg.moves[0].end},landing);
 assert.deepEqual({...leg.checks[0].b},landing);
 assert.ok(leg.walks.some(w=>w.from>=leg.moves[0].to&&w.b.x===mesh.x),'the mesh join was hidden inside the traversal');
 assert.equal(run(h.api.checkJob(world,leg.checks[0])),true);
});

for(const mode of ['clear','blocked toward trigger','wrong floor'])test('a native wallrun can reach an off-mesh trigger from the walking mesh: '+mode,()=>{
 const h=fixture(),start=h.start,mesh={x:220,y:0,z:0},entry={x:430,y:0,z:0},landing={x:1400,y:0,z:600},goal={x:1800,y:0,z:600};
 const guid='native-wallrun-off-mesh-trigger',raw=p=>({X:p.x,Y:p.y,Z:p.z});
 const floor=p=>p.x<=475?{...p,z:0}:p.x>=1400?{...p,z:600}:null;
 const world={...h.world,floorAt:floor,hit:()=>null,step:(a,b)=>{
  const q=floor(b);
  return q&&Math.abs(q.z-a.z)<80&&!(mode==='blocked toward trigger'&&a.x<320&&b.x>=320)?{p:q}:{why:'wall or unsupported floor'};
 }};
 const classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SideRunning.BP_SpecialMove_SideRunning_C';
 const box=p=>mockHookBox(h.UE,{center:[p.x,p.y,p.z+96],axes:[[24,0,0],[0,24,0],[0,0,60]]});
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>raw(entry),bEnableAToB:true,bEnableBToA:false,BoxA:box(entry),BoxB:box(landing),
  LowSpline:{GetSplineLength:()=>1141,GetLocationAtDistanceAlongSpline:d=>raw(R.lerp(entry,landing,d/1141))}};
 h.g.actors=[{guid,kind:'wallrun',classPath,both:true,requiresLoaded:true,source:'game-placement',path:[[430,0,0],[1400,0,600]]}];
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,world,{},start,goal));
 const row=[],component=p=>p[0]<=250&&Math.abs(p[2])<35?0:p[0]>=1400&&p[2]>=550?1:undefined;
 const trip=run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{recast:true,clock:()=>0,
  actionPads:new Map([[guid,{entry:[entry.x,entry.y,entry.z],exit:[landing.x,landing.y,landing.z]}]]),
  actionPadCandidates:function*(p){
   return p.x===entry.x?[mode==='wrong floor'?{...mesh,z:180}:mesh]:[];
  },
  topologyJob:function*(features){row.push(...features);return{features,component,componentConnectors:true,canConnect:(a,b)=>component(a)!==undefined&&component(a)===component(b)};}}));
 assert.equal(row[0].path[0][0],mode==='clear'?mesh.x:entry.x);
 if(mode!=='clear'){assert.equal(trip,null);return;}
 const leg=trip?.legs[0];assert.ok(leg);
 const move=leg.moves[0],check=leg.checks[0];
 assert.deepEqual({...move.p},entry);
 assert.deepEqual({...check.a},entry);
 assert.deepEqual({...leg.points[move.from]},entry);
 assert.ok(leg.walks.some(w=>w.to===move.from&&w.b.x===entry.x),'the walking approach was hidden inside the traversal');
 assert.equal(run(h.api.checkJob(world,check)),true);
});

test('native wallrun searches both directions with launch and landing on distinct pads',()=>{
 const h=fixture(),p=(x,z)=>({x,y:0,z}),raw=q=>({X:q.x,Y:q.y,Z:q.z});
 const a=p(480,0),b=p(700,600),guid='native-two-pads';
 const classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SideRunning.BP_SpecialMove_SideRunning_C';
 const box=(x,z)=>mockHookBox(h.UE,{center:[x,0,z+96],axes:[[22,10,0],[-10,22,0],[0,0,70]]});
 let overlaps=true;
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>raw(a),bEnableAToB:true,bEnableBToA:true,
  BoxA:{...box(260,0),GetGenerateOverlapEvents:()=>overlaps},BoxB:box(830,600),
  LowSpline:{GetSplineLength:()=>640,GetLocationAtDistanceAlongSpline:d=>raw(R.lerp(a,b,d/640))}};
 h.g.actors=[{guid,kind:'wallrun',both:true,classPath,requiresLoaded:true,source:'game-placement',path:[[480,0,0],[700,0,600]]}];
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 const start=h.start,goal=p(890,600);
 run(h.api.refreshLoadedJob(h.g,h.world,{},start,goal));
 const rows=[],component=v=>v[2]>300?1:0;
 const plan=(from,to,excludedPlacements)=>run(h.api.liveRouteJob(h.g,h.world,from,to,h.native,{clock:()=>0,recast:true,excludedPlacements,
  actionPads:new Map([[guid,{entry:[480,0,0],exit:[700,0,600]}]]),topologyJob:function*(features){
   rows.push(...features);return{features,component,canConnect:(l,r)=>component(l)===component(r)};
  }}));
 const forward=plan(start,goal)?.legs[0],backward=plan(goal,start)?.legs[0];
 const left=forward?.moves[0],right=backward?.moves[0];
 assert.ok(left?.p.x>220&&left.p.x<300,'forward approach ended at the spline, outside the actual A trigger');
 assert.ok(right?.p.x>790&&right.p.x<870,'reverse used the forward landing pad instead of the B trigger');
 assert.deepEqual([left.wallrunAToB,right.wallrunAToB],[true,false]);
 assert.equal(left.end.x,700,'the forward landing was displaced to the reverse trigger');
 assert.equal(right.end.x,480,'the reverse landing was displaced to the forward trigger');
 assert.equal(rows.length,4);assert.ok(rows.every(f=>!f.both));
 assert.ok(rows.some(f=>f.path[0][0]<300&&f.path[1][0]===700));
 assert.ok(rows.some(f=>f.path[0][0]>790&&f.path[1][0]===480));
 const excludedPlacements=new Map([[guid,2]]);
 assert.equal(plan(goal,start,excludedPlacements),null,'the failed authored reverse remained in the same-window retry');
 assert.ok(plan(start,goal,excludedPlacements),'the same-window retry removed the other wallrun direction');
 overlaps=false;
 assert.equal(run(h.api.checkJob(h.world,forward.checks[0])),false,'revalidation ignored the live A trigger turning off');
 assert.equal(plan(start,goal),null);
 assert.ok(plan(goal,start),'disabling the A trigger incorrectly blocked landing on the A side');
 actor.destroyed=true;
 assert.equal(run(h.api.checkJob(h.world,backward.checks[0])),false,'an unloaded actor bypassed the established native trigger check');
});

for(const mode of ['disconnected component','blocked connector','both blocked'])test('wallrun can use a second standing pad in the same launch box: '+mode,()=>{
 const h=fixture(),start={x:0,y:-155,z:0},entry={x:500,y:0,z:0},exit={x:1400,y:0,z:600},goal={x:1800,y:0,z:600};
 const guid='wallrun-straddles-wall',raw=p=>({X:p.x,Y:p.y,Z:p.z});
 const blockedConnector=mode==='blocked connector',hintY=blockedConnector?-148:148;
 const floor=p=>p.x>=1400?{...p,z:600}:p.x<=550&&(blockedConnector||Math.abs(p.y)>=65)?{...p,z:0}:null;
 const behindWall=p=>p.z===0&&p.x>=400&&p.y<0;
 let blockedApproaches=0;
 const world={...h.world,floorAt:floor,
  hit:(a,b,body)=>body&&mode==='both blocked'&&b.x>=420&&b.x<=550&&b.y<0?{point:b}:null,
  step:(a,b)=>{
   const p=floor(b);
   if(!p||Math.abs(a.z-p.z)>80||!blockedConnector&&p.z===0&&Math.sign(a.y)!==Math.sign(p.y))return {why:'separated by a wall'};
   if(blockedConnector&&behindWall(a)!==behindWall(p)){blockedApproaches++;return {why:'blocked body clearance'};}
   return {p};
  }};
 const classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SideRunning.BP_SpecialMove_SideRunning_C';
 const box=(p,side)=>mockHookBox(h.UE,{center:[p.x,p.y,p.z+96],axes:[[30,0,0],[0,side,0],[0,0,60]]});
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>raw(entry),bEnableAToB:true,bEnableBToA:false,
  BoxA:box(entry,185),BoxB:box(exit,30),
  LowSpline:{GetSplineLength:()=>1082,GetLocationAtDistanceAlongSpline:s=>raw(R.lerp(entry,exit,s/1082))}};
 h.g.actors=[{guid,kind:'wallrun',classPath,both:true,requiresLoaded:true,source:'game-placement',path:[[500,0,0],[1400,0,600]]}];
 h.UE.Class={Find:s=>s===classPath?s:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 run(h.api.refreshLoadedJob(h.g,world,{},start,goal));
 const topo=[],component=p=>p[2]>500?2:p[1]<0||blockedConnector?0:1;
 const trip=run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{recast:true,clock:()=>0,
  actionPads:new Map([[guid,{entry:[500,hintY,0],exit:[1400,0,600]}]]),
  actionPadCandidates:function*(){return[];},
  topologyJob:function*(features){
   topo.push(...features.map(f=>({guid:f.guid,path:f.path})));return{features,component,componentConnectors:true,
    canConnect:(a,b)=>component(a)===component(b)};
  }
 }));
 assert.ok(topo.every(f=>f.guid===guid),'standing pad choices must share the real actor identity');
 assert.equal(topo[0].path[0][1],hintY,'the successful standing hint was discarded before checking accessibility');
 if(mode==='both blocked'){assert.equal(trip,null);return;}
 const leg=trip?.legs[0];assert.ok(leg,'the first standing point hid the reachable side of the trigger');
 assert.equal(leg.moves.length,1);
 if(blockedConnector){
  assert.ok(blockedApproaches>0,'the connector never tried the preferred pad before falling back');
  assert.ok(leg.moves[0].p.y>=0,'the cached preferred pad replaced the accessible alternative');
 }else assert.ok(leg.moves[0].p.y<=-65);
 assert.equal(leg.moves[0].wallrunAToB,true);
 assert.deepEqual({...leg.checks[0].a},{...leg.moves[0].p});
 assert.equal(run(h.api.checkJob(world,leg.checks[0])),true);
});

test('a confirmed wallrun exchange needs only outside pads and both live directions',()=>{
 const h=fixture(),p=(x,z)=>({x,y:0,z}),raw=q=>({X:q.x,Y:q.y,Z:q.z});
 h.g.name='pbz_fujizhilin_wp';
 const relay=require(root+'/PBZRouteWallrunRelays').forWorld(h.g.name)[0];
 const classPath=require(root+'/PBZPassageClasses').classes.find(r=>r.kind==='wallrun'&&r.classPath.includes('BP_SpecialMove_SideRunning.')).classPath;
 const box=q=>mockHookBox(h.UE,{center:[q.x,0,q.z+96],axes:[[38,0,0],[0,38,0],[0,0,70]]});
 const makeActor=(guid,a,b)=>{
  const length=R.dist(a,b);
  return {GetName:()=>guid,K2_GetActorLocation:()=>raw(a),bEnableAToB:true,bEnableBToA:true,BoxA:box(a),BoxB:box(b),
   LowSpline:{GetSplineLength:()=>length,GetLocationAtDistanceAlongSpline:d=>raw(R.lerp(a,b,d/length))}};
 };
 const endpoints=[[p(400,0),p(1600,380)],[p(2650,600),p(1780,430)]];
 const actors=relay.steps.map((step,i)=>makeActor(step.guid,...endpoints[i]));
 h.g.actors=relay.steps.map((step,i)=>({guid:step.guid,kind:'wallrun',classPath,both:true,source:'game-placement',
  requiresLoaded:true,path:endpoints[i].map(q=>[q.x,q.y,q.z])}));
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>actors.length,Get:i=>actors[i]};}};
 const start=p(100,0),goal=p(2950,600);
 const floor=q=>q.x<=550?{...q,z:0}:q.x>=2550?{...q,z:600}:null;
 const world={...h.world,floorAt:floor,hit:()=>null,step:(a,b)=>{
  const q=floor(b);return q&&Math.abs(a.z-q.z)<40?{p:q}:{why:'no standing ground'};
 }};
 const loaded=new Set();
 run(h.api.refreshLoadedJob(h.g,world,{},start,goal,{corridorActions:[relay.guid],refreshedActions:loaded}));
 assert.deepEqual([...loaded],relay.steps.map(step=>step.guid.toLowerCase()));
 const walk=function*(a,b){const l=floor(a),r=floor(b);return l&&r&&l.z===r.z?{points:[a,b],checks:[],gates:[],walks:[],moves:[],meters:R.dist(a,b)/100}:null;};
 const route=(a,b,excludedPlacements)=>run(h.api.liveRouteJob(h.g,world,a,b,()=>null,
  {recast:true,clock:()=>0,priorityActions:[relay.guid],excludedPlacements,walkJob:walk}));
 const leg=route(start,goal)?.legs[0];assert.ok(leg);
 assert.deepEqual(Array.from(leg.moves,m=>m.guid),[relay.guid]);
 const check=leg.checks[0];
 assert.deepEqual(Array.from(check.wallrunRelay,step=>step.wallrunAToB),[true,false]);
 assert.ok(leg.walks.every(row=>floor(row.a)?.z===floor(row.b)?.z),'the switch was painted as walking');
 assert.equal(route(goal,start),null);
 assert.equal(route(start,goal,new Map([[actors[1].GetName().toLowerCase(),2]])),null);
 actors[1].bEnableBToA=false;
 assert.equal(run(h.api.checkJob(world,check)),false);
 assert.equal(route(start,goal),null);
 actors[1].bEnableBToA=true;
 actors[1].destroyed=true;
 assert.ok(h.api.placementBlock(world,check,{}).unknown);
 assert.equal(run(h.api.checkJob(world,check)),false);
});

test('automatic slopes form one downhill move and recheck the real trigger and final landing',()=>{
 const h=fixture(),p=(x,z)=>({x,y:0,z}),raw=q=>({X:q.x,Y:q.y,Z:q.z});
 h.g.name='pbz_zhengdaodaying_wp';
 const slide=require(root+'/PBZRouteSlideRelay').forWorld(h.g.name);
 const classPath=require(root+'/PBZPassageClasses').classes.find(r=>r.kind==='slide').classPath;
 const paths=[[p(400,600),p(950,420)],[p(1100,370),p(1650,200)]];
 const actors=paths.map(([a,b],i)=>{
  const length=R.dist(a,b),box=mockHookBox(h.UE,{center:[a.x,0,a.z+96],axes:[[40,0,0],[0,40,0],[0,0,70]]});
  return {GetName:()=>slide.steps[i],K2_GetActorLocation:()=>raw(a),bAutoStartOnOverlap:true,
   GeneratedSlideTriggers:{Num:()=>1,Get:()=>box},
   Spline:{GetSplineLength:()=>length,GetLocationAtDistanceAlongSpline:d=>raw(R.lerp(a,b,d/length))}};
 });
 h.g.actors=paths.map((path,i)=>({guid:slide.steps[i],kind:'slide',classPath,source:'game-placement',
  requiresLoaded:true,path:path.map(q=>[q.x,q.y,q.z])}));
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>actors.length,Get:i=>actors[i]};}};
 const start=p(100,600),goal=p(2200,0),entry=[400,0,600],exit=[1900,0,0];
 let landingOpen=true;
 const floor=q=>q.x<=550?{...q,z:600}:q.x>=1820&&landingOpen?{...q,z:0}:null;
 const world={...h.world,floorAt:floor,hit:()=>null,step:(a,b)=>{
  const q=floor(b);return q&&Math.abs(a.z-q.z)<40?{p:q}:{why:'no standing ground'};
 }};
 run(h.api.refreshLoadedJob(h.g,world,{},start,goal,{corridorActions:[slide.guid]}));
 const walk=function*(a,b){const l=floor(a),r=floor(b);return l&&r&&l.z===r.z?{points:[a,b],checks:[],gates:[],walks:[],moves:[],meters:R.dist(a,b)/100}:null;};
 const route=(a,b)=>run(h.api.liveRouteJob(h.g,world,a,b,()=>null,{recast:true,clock:()=>0,priorityActions:[slide.guid],
  actionPads:new Map([[slide.guid.toLowerCase(),{entry,exit}]]),walkJob:walk}));
 const leg=route(start,goal)?.legs[0];assert.ok(leg);
 assert.deepEqual(Array.from(leg.moves,m=>m.guid),[slide.guid]);
 const check=leg.checks[0];
 assert.ok(leg.walks.every(row=>floor(row.a)?.z===floor(row.b)?.z));
 assert.equal(route(goal,start),null);
 landingOpen=false;
 assert.equal(run(h.api.checkJob(world,check)),false);
 landingOpen=true;
 actors[1].bAutoStartOnOverlap=false;
 assert.equal(run(h.api.checkJob(world,check)),false);
 assert.equal(route(start,goal),null);
});

test('a native wallrun can launch from supported ground overlapping the top of its trigger',()=>{
 const h=fixture(),guid='upper-wallrun-pad';
 const start={x:-200,y:0,z:810},entry={x:0,y:0,z:664},exit={x:1000,y:0,z:830},goal={x:1150,y:0,z:830};
 const raw=p=>({X:p.x,Y:p.y,Z:p.z});
 let enabled=true;
 const launch=mockHookBox(h.UE,{center:[0,0,664],axes:[[100,0,0],[0,100,0],[0,0,160]]});
 launch.GetGenerateOverlapEvents=()=>enabled;
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>raw(entry),BoxA:launch,bEnableAToB:true,bEnableBToA:false,
  BoxB:mockHookBox(h.UE,{center:[1000,0,830],axes:[[50,0,0],[0,50,0],[0,0,100]]}),
  LowSpline:{GetSplineLength:()=>1000,GetLocationAtDistanceAlongSpline:s=>raw(R.lerp(entry,exit,s/1000))}};
 const classPath=require(root+'/PBZPassageClasses').classes.find(r=>r.kind==='wallrun'&&r.classPath.includes('BP_SpecialMove_SideRunning.')).classPath;
 h.g.actors=[{guid,kind:'wallrun',classPath,both:true,requiresLoaded:true,source:'game-placement',path:[[0,0,664],[1000,0,830]]}];
 h.UE.Class={Find:p=>p===classPath?p:null};h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 const floor=p=>p.x<=10?810:p.x>=980?830:null;
 const world={...h.world,floorAt:p=>{const z=floor(p);return z!==null&&Math.abs(p.z-z)<=55?{...p,z}:null;},
  hit:(a,b,body)=>{const z=floor(a);return !body&&z!==null&&z<=a.z&&z>=b.z?{point:{...a,z},nz:1}:null;},
  step:(a,b)=>floor(b)===a.z?{p:{...b,z:a.z}}:{why:'gap'}};
 run(h.api.refreshLoadedJob(h.g,world,{},start,goal));
 const plan=()=>run(h.api.liveRouteJob(h.g,world,start,goal,()=>null,{recast:true,clock:()=>0}));
 const leg=plan()?.legs[0];assert.ok(leg,'floor above the trigger centre was never sampled');
 assert.equal(leg.moves[0].p.z,810);
 enabled=false;assert.equal(plan(),null);
});

for(const kind of ['hook','ascent'])test('a native '+kind+' can use checked walking at both off-mesh endpoints',()=>{
 const h=fixture(),guid='off-mesh-'+kind;
 const entry={x:430,y:0,z:0},exit={x:600,y:0,z:600},before={x:220,y:0,z:0},after={x:850,y:0,z:600},goal={x:1040,y:0,z:600};
 const raw=p=>({X:p.x,Y:p.y,Z:p.z}),point=p=>({K2_GetComponentLocation:()=>raw(p)});
 let blocked,enabled=true;
 const box={...mockHookBox(h.UE,{center:[entry.x,0,96],axes:[[25,0,0],[0,25,0],[0,0,62]]}),
  GetGenerateOverlapEvents:()=>enabled};
 const classPath=require(root+'/PBZPassageClasses').classes.find(row=>row.kind===kind).classPath;
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>raw(entry),GetInteractRequirementMeet:()=>1};
 if(kind==='hook')Object.assign(actor,{TriggerBox:box,GrabPoint:point({x:515,y:0,z:730}),LandArea:point(exit)});
 else Object.assign(actor,{UpRunningTargetHeight:600,BoxA:box,EdgeSpline:{GetSplineLength:()=>100,
  GetLocationAtDistanceAlongSpline:()=>raw(exit),FindLocationClosestToWorldLocation:()=>raw(exit)}});
 h.UE.EInteractRequirementState={RequirementMeet:1};
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 h.g.actors=[{guid,kind,classPath,both:false,requiresLoaded:true,source:'game-placement',path:[[430,0,0],[600,0,600]]}];
 const floor=p=>p.x<=475?{...p,z:0}:p.x>=600?{...p,z:600}:null;
 const world={...h.world,floorAt:floor,hit:()=>null,step:(a,b)=>{
  const p=floor(b),stops=blocked==='entry'&&a.x<330&&b.x>=330||blocked==='exit'&&a.x<730&&b.x>=730;
  return p&&p.z===a.z&&!stops?{p}:{why:'blocked body clearance'};
 }};
 const component=([x,,z])=>z===0&&x<=250?0:z===600&&x>=800?1:undefined;
 let view;
 const plan=(a=h.start,b=goal)=>run(h.api.liveRouteJob(h.g,world,a,b,()=>null,{recast:true,clock:()=>0,
  actionPads:new Map([[guid,{entry:[430,0,0],exit:[600,0,600]}]]),
  actionPadCandidates:function*(p){return p.x===entry.x?[before]:p.x===exit.x?[after]:[];},
  topologyJob:function*(features){view=features[0]?.path;return {features,component,componentConnectors:true,
   canConnect:(l,r)=>component(l)!==undefined&&component(l)===component(r)};}
 }));
 run(h.api.refreshLoadedJob(h.g,world,{},h.start,goal));
 const leg=plan()?.legs[0];
 assert.ok(leg,'the real standing pads were outside the walking mesh');
 assert.deepEqual(Array.from(view,p=>Array.from(p)),[[220,0,0],[850,0,600]]);
 const move=leg.moves[0],check=leg.checks[0];
 assert.deepEqual({...move.p},entry);assert.deepEqual({...move.end},exit);
 assert.ok(leg.walks.some(row=>row.to===move.from&&row.b.x===entry.x));
 assert.ok(leg.walks.some(row=>row.from>=move.to&&row.b.x===after.x));
 assert.equal(run(h.api.checkJob(world,check)),true);
 assert.equal(plan(goal,h.start),null);
 for(const side of ['entry','exit']){blocked=side;assert.equal(plan(),null,'the '+side+' connector ignored a directional obstruction');}
 blocked=null;enabled=false;
 assert.equal(plan(),null,'the route kept using a trigger after it was disabled');
 assert.equal(run(h.api.checkJob(world,check)),false);
});

test('a native ascent searches its inherited trigger volume and upper ledge before classifying its standing pads',()=>{
 const h=fixture(),guid='inherited-native-ascent',classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_UpRunning.BP_SpecialMove_UpRunning_C';
 const volume={center:[500,0,96],axes:[[300,0,0],[0,35,0],[0,0,70]]};
 let enabled=true,correctLedge=true,warps=0;
 const box={...mockHookBox(h.UE,volume),GetName:()=> 'BoxA',GetGenerateOverlapEvents:()=>enabled};
 const upper={GetName:()=> 'EdgeSpline',GetSplineLength:()=>100,GetLocationAtDistanceAlongSpline:()=>({X:650,Y:0,Z:600}),
  FindLocationClosestToWorldLocation:()=>correctLedge?{X:650,Y:0,Z:600}:{X:1400,Y:0,Z:1200}};
 const components=[box,upper],actor={GetName:()=>guid,UpRunningTargetHeight:600,K2_GetActorLocation:()=>({X:500,Y:0,Z:0}),
  K2_GetComponentsByClass:()=>({Num:()=>components.length,Get:i=>components[i]}),
  CalculateUpRunningWarpTarget:()=>{warps++;throw Error('native warp was called');}};
 h.UE.SceneComponent={StaticClass:()=> 'scene'};
 h.UE.Class={Find:name=>name===classPath?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 h.g.actors=[{guid,kind:'ascent',both:false,classPath,requiresLoaded:true,source:'game-placement',path:[[500,0,96],[650,0,600]]}];
 const start=h.start,goal={x:800,y:0,z:600},world={...h.world,
  hit:(a,b,body)=>body&&a.x>340&&a.x<600?{point:a}:null,
  step:(a,b)=>b.x>340&&b.x<600?{why:'wall'}:h.world.step(a,b)};
 run(h.api.refreshLoadedJob(h.g,world,{},start,goal));
 let view;
 const plan=()=>run(h.api.liveRouteJob(h.g,world,start,goal,h.native,{clock:()=>0,recast:true,
  actionPads:new Map([[guid,{entry:[490,0,0],exit:[899,0,600]}]]),topologyJob:function*(rows){
   view=rows[0];return{features:rows,component:p=>p[2]>300?1:0,canConnect:(a,b)=>(a[2]>300)===(b[2]>300)};
  }}));
 const trip=plan();
 assert.equal(trip?.legs[0].moves[0].guid,guid,'the native trigger and ledge were hidden by inherited component access');
 const move=trip.legs[0].moves[0];assert.ok(move.p.x>=200&&move.p.x<=340);
 assert.ok(require(root+'/PBZRouteHookVolume').contains(volume,[move.p.x,move.p.y,move.p.z]));
 assert.equal(view.path[0][0],move.p.x,'topology classified the wall-centred launch anchor');
 correctLedge=false;
 assert.equal(run(h.api.checkJob(world,trip.legs[0].checks[0])),false,'an unrelated upper platform substituted for the authored ledge');
 assert.equal(plan(),null);
 correctLedge=true;
 volume.center[2]=0;
 assert.ok(plan(),'the standing capsule overlaps the low trigger even though its centre is above the box');
 enabled=false;
 assert.equal(run(h.api.checkJob(world,trip.legs[0].checks[0])),false,'the old ascent kept its disabled trigger');
 assert.equal(plan(),null);
 enabled=true;actor.destroyed=true;
 assert.equal(run(h.api.checkJob(world,trip.legs[0].checks[0])),false,'an unloaded ascent actor kept its native launch authorization');
 assert.equal(plan(),null);
 assert.equal(warps,0);
});

test('loaded placed hooks still bind their current requirements to the existing fixed guide',()=>{
 const h=fixture(),world='pbz_zhengdaodaying_wp';
 const f={...require(root+'/PBZRouteHookData').forWorld(world)[0],world},p=v=>({x:v[0],y:v[1],z:v[2]}),at=v=>({K2_GetComponentLocation:()=>({X:v[0],Y:v[1],Z:v[2]})});
 h.g.name=f.world;h.g.actors=[];h.start=p(f.path[0]);h.goal=p(f.path.at(-1));h.world.feet=()=>h.start;
 const a={GetName:()=>f.guid,K2_GetActorLocation:()=>({X:f.origin[0],Y:f.origin[1],Z:f.origin[2]}),
  TriggerBox:at(f.path[0]),TriggerSphere:at(f.path[1]),GrabPoint:at(f.path[1]),LandArea:at(f.path.at(-1)),GetInteractRequirementMeet:()=>2};
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
 const points=run(h.api.placedCurveJob(actor,'ascent'));
 assert.ok(points,'inherited native component access lost the climb entirely');
 assert.equal(points[0].z,100);assert.equal(points.at(-1).z,700);
});

test('gap grapples use their authored trigger, grab point and landing area',()=>{
 const h=fixture(),at=(X,Y,Z)=>({K2_GetComponentLocation:()=>({X,Y,Z})});
 const actor={K2_GetActorLocation:()=>({X:0,Y:0,Z:0}),TriggerBox:at(0,0,0),TriggerSphere:at(150,500,500),GrabPoint:at(150,500,500),LandArea:at(400,900,700)};
 const points=run(h.api.placedCurveJob(actor,'hook'));
 assert.ok(points,'BP_GapBlocker was omitted from traversal extraction');
 assert.equal(points[0].x,0);assert.equal(points.at(-1).z,700);
});

test('the captured tower hook reaches its currency from the lower trigger platform before grappling',()=>{
 const f=require('./fixtures/tower-hook-currency-20261114.json'),h=fixture(),at=q=>({K2_GetComponentLocation:()=>({X:q.x,Y:q.y,Z:q.z})});
 h.g.name=f.world;h.start=f.start;h.goal=f.goal;h.g.actors=[];
 const volume=require(root+'/PBZRouteHookData').forWorld(f.world).find(row=>row.guid===f.guid).entryVolume;
 const actor={GetName:()=>f.guid,K2_GetActorLocation:()=>({X:f.root.x,Y:f.root.y,Z:f.root.z}),
  TriggerSphere:at(f.triggerSphere),TriggerBox:mockHookBox(h.UE,volume),GrabPoint:at(f.grabPoint),LandArea:at(f.landArea),GetInteractRequirementMeet:()=>1};
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
  TriggerBox:mockHookBox(h.UE,{center:[500,0,0],axes:[[130,0,0],[0,100,0],[0,0,200]]}),TriggerSphere:at(575,500),GrabPoint:at(575,500),LandArea:at(650,600),
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
test('a native down-slide uses supported ground at the edge of its live trigger',()=>{
 const h=fixture(),pawn={},guid='native-down-slide';h.g.actors=[];
 const at=(X,Z)=>({X,Y:0,Z});
 const spline=(X,Z)=>({GetSplineLength:()=>100,GetLocationAtDistanceAlongSpline:()=>at(X,Z)});
 const box=mockHookBox(h.UE,{center:[200,0,696],axes:[[250,0,0],[0,80,0],[0,0,100]]});
 let enabled=true;box.GetGenerateOverlapEvents=()=>enabled;
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>at(200,600),GetDownSlidingDepth:()=>600,
  TopCollision:{K2_GetComponentLocation:()=>at(200,696)},
  GetCollisionComponent:character=>{assert.equal(character,pawn);return box;},
  EdgeSpline:spline(350,600),EndEdgeSpline:spline(520,0)};
 const floor=p=>p.x<=0?600:p.x>=440?0:null;
 Object.assign(h.world,{pawn,floorAt:p=>floor(p)===null?null:{...p,z:floor(p)},hit:(a,b,body)=>{
  const z=floor(a);return !body&&z!==null&&z<=a.z&&z>=b.z?{point:{...a,z},nz:1}:null;
 },step:(a,b)=>floor(b)!==null&&Math.abs(a.z-floor(b))<50?{p:{...b,z:floor(b)}}:{why:'ledge'}});
 h.UE.Class={Find:p=>p.includes('BP_SpecialMove_DownSliding.')?p:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(character,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 const start={x:-250,y:0,z:600},goal={x:680,y:0,z:0};
 run(h.api.refreshLoadedJob(h.g,h.world,pawn,start,goal));
 const route=(a=start,b=goal)=>run(h.api.liveRouteJob(h.g,h.world,a,b,()=>null,{clock:()=>0}));
 const leg=route()?.legs[0];assert.ok(leg,'the unsupported trigger centre hid the supported edge');
 assert.equal(leg.moves[0].guid,guid);
 assert.ok(leg.moves[0].p.x>=-85&&leg.moves[0].p.x<=0);
 assert.equal(route(goal,start),null);
 enabled=false;
 assert.equal(run(h.api.checkJob(h.world,leg.checks[0])),false,'a cached route survived the closed trigger');
 assert.equal(route(),null);
 enabled=true;
 assert.ok(route(),'re-enabling the trigger did not restore the standing approach');
});
test('rappelling uses the native world landing transform beyond the suspended rope endpoint',()=>{
 const h=fixture(),v=(X,Z)=>({X,Y:0,Z});
 const actor={K2_GetActorLocation:()=>v(0,1000),
  RopeSpline:{GetSplineLength:()=>1000,GetLocationAtDistanceAlongSpline:d=>v(d*.5,1000-d*.7)},
  GetRappellingLandTargetWorldTransform:()=>({Translation:v(700,0)})};
 const points=run(h.api.placedCurveJob(actor,'rappel'));
 assert.deepEqual(JSON.parse(JSON.stringify(points.at(-1))),{x:700,y:0,z:0});
 assert.ok(points.some(p=>p.x===500&&p.z===300),'the measured rope curve must remain in the action');
});
test('non-hook corridor pads can seed an off-axis standing point only after action approach checks',()=>{
 const h=fixture(false),guid='off-axis-swing',feature={guid,kind:'swing',both:false,source:'game-placement',path:[[0,0,0],[6000,0,600]]};h.g.actors=[feature];
 const entry=[300,124,0],exit=[6000,0,600],length=Math.hypot(entry[0],entry[1]),supported=p=>{
  const t=(p.x*entry[0]+p.y*entry[1])/(length*length),x=t*entry[0],y=t*entry[1];
  if(t>=.19&&t<=1.02&&Math.hypot(p.x-x,p.y-y)<=12)return 0;
  if(p.x>=5900&&p.x<=6100&&Math.abs(p.y)<=100)return 600;
  return null;
 };
 const makeWorld=blocked=>({...h.world,floorAt:p=>{const z=supported(p);return z===null?null:{...p,z};},hit:()=>null,
  step:(a,b)=>{const z=supported(b),t=(b.x*entry[0]+b.y*entry[1])/(length*length);if(blocked&&t>.19&&t<.99)return{why:'wall'};return z!==null&&Math.abs(a.z-z)<80?{p:{...b,z}}:{why:'unsupported'};}});
 const start={x:entry[0],y:entry[1],z:0},goal={x:exit[0],y:exit[1],z:exit[2]},pads=new Map([[guid,{entry,exit}]]);
 const route=(actionPads,blocked=false)=>run(h.api.liveRouteJob(h.g,makeWorld(blocked),start,goal,()=>null,{recast:true,clock:()=>0,features:[feature],actionPads,
  topologyJob:function*(input){const component=p=>p[0]<3000?0:1;return{features:input,component,canConnect:(a,b)=>component(a)===component(b)};},
  walkJob:function*(a,b){const za=supported(a),zb=supported(b);return za!==null&&za===zb&&Math.abs(a.z-za)<1&&Math.abs(b.z-zb)<1?{points:[a,b],checks:[],gates:[],walks:[],moves:[],meters:R.dist(a,b)/100}:null;}}));
 assert.equal(route(undefined),null,'the sparse radial probes unexpectedly found the authored action entry');
 const trip=route(pads);assert.ok(trip,'the planner ignored a current-scene-checked coarse action pad');
 assert.equal(trip.legs[0].moves[0].guid,guid);
 assert.equal(route(pads,true),null,'the coarse pad bypassed the current wall/body sweep');
});
for(const blocked of ['wall','lock','action','floor'])test('an atlas action connector cannot bypass a '+blocked,()=>{
 const h=fixture(),a={x:0,y:0,z:600},b={x:6000,y:0,z:600};
 const world={normal:.7,floorAt:p=>p,hit:()=>null,step:(p,q)=>blocked==='wall'||blocked==='lock'?{why:blocked,hit:q,locked:blocked==='lock'}:{p:q}};
 const graph={routeJob:function*(){return {points:[a,blocked==='floor'?{...b,z:0}:b],meters:60,
  moves:blocked==='action'?[{from:0,to:1,kind:'hook'}]:[],walks:[],checks:[],gates:[]};}};
 assert.equal(run(h.api.checkedWalkJob(world,a,b,()=>null,{graph,clock:()=>0})),null);
});
for(const mode of ['blocked','clear','fallback'])test('the walking provider must join the actual departure pad: '+mode,()=>{
 const h=fixture(),a={x:0,y:0,z:0},b={x:1000,y:0,z:0},meshStart={x:50,y:0,z:0},mid={x:25,y:0,z:10};
 const world={...h.world,floorAt:p=>p,step:(from,to)=>{
  if(from.x<25&&to.x>=25&&Math.abs(to.y)<5){
   if(mode!=='clear')return {why:'blocked body clearance',hit:{...to,x:25}};
   return {p:to,points:[mid,to]};
  }
  return {p:to};
 }};
 const detour=[a,{x:0,y:70,z:0},{x:100,y:70,z:0},b];
 const providerWalk=function*(){return {points:[meshStart,b]};};
 const native=()=>mode==='fallback'?{points:detour}:null;
 const points=run(h.api.checkedWalkJob(world,a,b,native,{providerWalk,clock:()=>0}));
 if(mode==='blocked'){assert.equal(points,null);return;}
 assert.ok(points);
 assert.equal(R.dist(points[0],a),0);
 assert.equal(R.dist(points.at(-1),b),0);
 if(mode==='clear')assert.ok(points.some(p=>R.dist(p,mid)===0),'checked join must retain its floor trace');
 else assert.ok(points.some(p=>p.y>=60),'a rejected mesh join must allow a checked alternate provider');
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

test('a folded ladder replans when its loaded animation finishes and revokes access if it folds again',()=>{
 const h=fixture(),g=h.api.recastContext('fixture'),guid='live-folding-ladder';
 const v=(x,z)=>({X:x,Y:0,Z:z}),goal={x:850,y:0,z:600};
 let moving=false,topX=650;
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>v(500,0),bFold:true,bTriggered:false,
  LadderTimelineComponent:{IsPlaying:()=>moving},
  BottomCollision:{K2_GetComponentLocation:()=>v(500,0)},TopCollision:{K2_GetComponentLocation:()=>v(topX,600)}};
 const item={guid,kind:'ladder',both:true,fold:true,requiresLoaded:true,requiresLiveEndpoints:true,source:'game-placement',
  classPath:'/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_ClimLadder.BP_SpecialMove_ClimLadder_C',
  path:[[500,0,0],[650,0,600]]};
 g.actors=[item];h.world.feet=()=>h.start;
 h.UE.Class={Find:name=>name.includes('ClimLadder')?name:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 const preflight=()=>run(h.api.refreshLoadedJob(g,h.world,{},goal,h.start));
 const route=()=>run(h.api.liveRouteJob(g,h.world,goal,h.start,h.native));
 preflight();
 assert.equal(route(),null);
 actor.bTriggered=true;moving=true;
 assert.equal(h.api.refreshStates(g,h.world,{},true),true);
 assert.equal(route(),null,'the moving ladder was treated as passable');
 moving=false;topX=750;
 assert.equal(h.api.refreshStates(g,h.world,{},true),true);
 assert.equal(g.canTraverse(item),true,'the graph stayed locked after the live state became ready');
 assert.equal(route(),null,'the folded endpoint was usable before current endpoints were read');
 h.api.refreshLadders(g,{},false);
 assert.equal(g.canTraverse(item),true,'the legacy refresh erased the current actor state');
 preflight();
 const move=route()?.legs[0].moves[0];
 assert.equal(move?.guid,guid);
 assert.equal(move.p.x,topX,'the planner reused the folded ladder endpoint');
 actor.bTriggered=false;
 assert.equal(h.api.refreshStates(g,h.world,{},true),true);
 assert.equal(g.openPassages.has(guid),false);
 assert.equal(route(),null);
 actor.bTriggered=true;
 preflight();
 assert.ok(route(),'preflight could not recover a ladder restored to its opened state');
 actor.destroyed=true;
 assert.equal(h.api.refreshStates(g,h.world,{},true),true);
 assert.equal(g.openPassages.has(guid),false);
 assert.equal(route(),null);
});

test('lift and one-way rope-slide metadata are retained in a mixed action chain',()=>{
 const h=fixture(false);h.g.actors[0].kind='lift';h.g.actors[1].kind='zipline';h.g.actors[1].both=false;
 const trip=run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native));
 assert.ok(trip);assert.deepEqual(Array.from(trip.legs[0].moves,m=>m.kind),['lift','zipline']);
 for(const move of trip.legs[0].moves)assert.ok(move.from<move.to);
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,h.goal,h.start,h.native)),null);
});
test('live state reports unavailable coarse-selected placements without opening them',()=>{
 const h=fixture(false),unavailable=[];
 Object.assign(h.g.actors[0],{source:'game-placement',requiresLoaded:true});
 Object.assign(h.g.actors[1],{source:'game-placement',requiresLoaded:true});
 const options={recast:true,clock:()=>0,priorityActions:['LADDER'],onUnavailable:guid=>unavailable.push(guid)};
 assert.equal(run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native,options)),null);
 assert.deepEqual(unavailable,['ladder']);
 assert.equal(h.g.openPassages.size,0);
 for(const item of h.g.actors)item.requiresLoaded=false;
 unavailable.length=0;
 assert.ok(run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native,options)));
 assert.deepEqual(unavailable,[]);
});
test('a current placed lift must still be ready when the route is reviewed',()=>{
 const h=fixture(),item={guid:'lift',kind:'lift',requiresLoaded:true,source:'game-placement',path:[[500,0,0],[650,0,600]]};
 const actor={GearIsDoing:false},cache=h.api.testLiveCache(h.g,h.world);
 const check={guid:item.guid,mode:item.kind,source:item.source,requiresLoaded:true};
 cache.actors.set('lift',{actor,item});
 assert.equal(h.api.placementBlock(h.world,check,{}),null);
 actor.GearIsDoing=true;
 assert.match(h.api.placementBlock(h.world,check,{}).label,/运动中/);
 actor.destroyed=true;
 assert.equal(h.api.placementBlock(h.world,check,{}).unknown,true);
 assert.equal(h.api.placementBlock(h.world,{...check,requiresLoaded:false},{}),null);
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


test('an unloaded live mechanism invalidates its cached path and bumps planning revision',()=>{
 const h=fixture(),g=h.api.recastContext('fixture'),actor={GetName:()=> 'current-lift',destroyed:false},item={guid:'current-lift',kind:'lift',path:[[0,0,0],[0,0,600]]};
 const cache=h.api.testLiveCache(g,h.world);cache.actors.set('current-lift',{actor,item});cache.paths.set('current-lift',{path:[{x:0,y:0,z:0},{x:0,y:0,z:600}],at:Date.now()});g.passageStates.set('current-lift',{ready:true});
 const before=g.passageRevision;actor.destroyed=true;h.world.feet=()=>h.start;
 assert.equal(h.api.refreshStates(g,h.world,{},true),true);assert.equal(cache.paths.has('current-lift'),false);assert.equal(g.passageStates.get('current-lift').ready,false);assert.equal(g.passageStates.get('current-lift').block.source,'live-mechanism','an unloaded condition must be removable after the actor returns');assert.ok(g.passageRevision>before);
});

test('preflight samples a long native spline across slices and discards an unloaded actor',()=>{
 const h=fixture(),guid='long-rope',kind='zipline';
 const classPath=require(root+'/PBZPassageClasses').classes.find(row=>row.kind===kind&&row.classPath.includes('RopeSliding')).classPath;
 let calls=0;
 const actor={GetName:()=>guid,K2_GetActorLocation:()=>({X:0,Y:0,Z:1200}),RopeSpline:{
  GetSplineLength:()=>24000,
  GetLocationAtDistanceAlongSpline:d=>{calls++;return {X:d,Y:0,Z:1200-d/24};}
 }};
 h.UE.Class={Find:x=>x===classPath?x:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>actor};}};
 const job=h.api.refreshLoadedJob(h.g,h.world,{},h.start,h.goal);
 for(let i=0;i<200&&calls===0;i++)assert.equal(job.next().done,false);
 assert.ok(calls>0&&calls<=8,'all native spline points were read in one step');
 actor.destroyed=true;
 run(job);
 assert.equal(h.g.observedPassages.has(guid),false);
});

for(const load of ['route search','background refresh'])test('a new live instance does not inherit the previous instance path or cooldown: '+load,()=>{
 const h=fixture(),g=h.api.recastContext('fixture'),guid='streamed-wall';
 const classPath=require(root+'/PBZPassageClasses').classes.find(row=>row.kind==='wallrun'&&row.classPath.includes('BP_SpecialMove_SideRunning.')).classPath;
 const newActor=x=>({GetName:()=>guid,K2_GetActorLocation:()=>({X:x,Y:0,Z:0}),
  LowSpline:{GetSplineLength:()=>600,GetLocationAtDistanceAlongSpline:d=>({X:x+d,Y:0,Z:0})}});
 const old=newActor(0),replacement=newActor(300);
 let current=old;
 h.UE.Class={Find:x=>x===classPath?x:null};
 h.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>current};}};
 h.world.feet=()=>h.start;
 const cache=h.api.testLiveCache(g,h.world);
 const read=()=>{
  if(load==='route search')run(h.api.refreshLoadedJob(g,h.world,{},h.start,h.goal));
  else{
   cache.next=0;
   cache.index=cache.classes.findIndex(([asset])=>asset===classPath);
   const pawn={};h.api.updateLoaded(g,h.world,pawn);
   for(let step=0;cache.background&&step<200;step++)h.api.updateLoaded(g,h.world,pawn);
  }
 };
 read();assert.equal(cache.paths.get(guid)?.path[0].x,0);
 const revision=g.passageRevision;
 current=replacement;old.destroyed=true;
 read();
 assert.equal(cache.paths.get(guid)?.path[0].x,300);
 assert.ok(g.passageRevision>revision);
});

test('ascent entry uses the actual trigger transform and rejects pads outside its volume',()=>{
 const h=fixture();h.UE.Vector=class{constructor(X,Y,Z){Object.assign(this,{X,Y,Z});}};h.UE.KismetMathLibrary={InverseTransformLocation:(transform,p)=>({X:p.X-100,Y:p.Y-200,Z:p.Z-300})};
 const actor={BoxA:{K2_GetComponentToWorld:()=>({}),GetUnscaledBoxExtent:()=>({X:300,Y:120,Z:90})}};
 assert.equal(h.api.triggerContains(actor,{x:150,y:200,z:204},{h:96}),true);assert.equal(h.api.triggerContains(actor,{x:150,y:500,z:204},{h:96}),false);
});


test('the custom-route distance band grows with a long Recast trip while scene search remains bounded',()=>{
 const h=fixture(),start={x:0,y:0,z:0},goal={x:36000,y:0,z:600};h.g.actors=[{guid:'far-needed-lift',kind:'lift',path:[[18000,0,0],[18000,0,600]]}];h.world.floorAt=p=>p;h.world.hit=()=>null;let inspected=false;
 run(h.api.liveRouteJob(h.g,h.world,start,goal,()=>null,{recast:true,clock:()=>0,topologyJob:function*(features){assert.ok(features.some(f=>f.guid==='far-needed-lift'),'the 260m score band discarded an actor on a longer route');inspected=true;return{features:[],canConnect:()=>false,component:()=>0};}}));
 assert.equal(inspected,true);
});
