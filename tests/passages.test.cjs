'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const R=require(root+'/PBZRouteCore');
function fixture(conditional=false){
 const W={alive:o=>!!o,plain:p=>({x:p.X,y:p.Y,z:p.Z})};
 const module={exports:{}},mocks={ue:{ESplineCoordinateSpace:{World:0}},puerts:{$ref:value=>({value}),$unref:ref=>ref.value},'./PBZRouteWorld':W};
 const load=id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id));
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRoutePassages.js','utf8')+'\n})',{Date,console})(load,module,module.exports);
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
test('static authored ladders are considered and can chain with a rope-swing action',()=>{
 const h=fixture(false),trip=run(h.api.liveRouteJob(h.g,h.world,h.start,h.goal,h.native));
 assert.ok(trip,'static actions were excluded or only one action was tried');
 assert.deepEqual(Array.from(trip.legs[0].moves,m=>m.kind),['ladder','swing']);
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
