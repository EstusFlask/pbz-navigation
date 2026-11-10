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
