'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
function fixture(){
 const module={exports:{}},UE={ESplineCoordinateSpace:{World:0}},W={alive:o=>!!o,plain:p=>p?{x:p.X,y:p.Y,z:p.Z}:null};
 const mocks={ue:UE,puerts:{$ref:value=>({value}),$unref:ref=>ref.value},'./PBZRouteWorld':W};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRoutePassages.js','utf8')+'\nexports.placedCurve=placedCurve;})',{Date,console})
  (id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id)),module,module.exports);
 return {...module.exports,UE};
}
const v=(X,Y=0,Z=0)=>({X,Y,Z}),at=(...args)=>({K2_GetComponentLocation:()=>v(...args)}),actor=props=>({K2_GetActorLocation:()=>v(0),...props});
const plain=x=>JSON.parse(JSON.stringify(x));

test('an interrupted action connector records its unfinished boundary for field replay',()=>{
 const T=require(root+'/PBZRouteTransitions'),reports=[];
 const job=T.route({name:'test',world:{},start:{x:0,y:0,z:0},goal:{x:100,y:0,z:0},features:[],clock:()=>0,
  canTraverse:()=>true,landing:function*(f,p){return p;},
  report:(phase,data)=>reports.push({phase,...data}),walk:function*(){yield;yield;return null;}});
 for(let n=0;n<20&&!reports.some(r=>r.phase==='action connector start');n++){if(job.next().done)break;}
 assert.ok(reports.some(r=>r.phase==='action connector start'),'connector start is not observable');
 job.return();
 assert.ok(reports.some(r=>r.phase==='action connector interrupted'&&r.id===1),'cancellation lost the connector that was holding the planner');
});
test('legacy lateral wall-running uses the authored directional start and end components',()=>{
 const api=fixture(),a=actor({StartPositionA:at(0,0,100),EndPositionStaticA:at(1000,0,100),StartPositionB:at(1000,0,100),EndPositionStaticB:at(0,0,100)});
 assert.deepEqual(plain(api.placedCurve(a,'wallrun')),[{x:0,y:0,z:100},{x:1000,y:0,z:100}]);
});
test('vaults read world ledge vectors without making the obstacle a walkable ground chord',()=>{
 const api=fixture(),a=actor({StartLedge:v(0,0,100),EndLedge:v(300,0,100)});
 assert.deepEqual(plain(api.placedCurve(a,'vault')),[{x:0,y:0,z:100},{x:300,y:0,z:100}]);
});
test('pole wall-jumps retain their real entry and upper end and are never reversed implicitly',()=>{
 const api=fixture(),a=actor({Box:at(0),EndPositionStatic:at(200,0,1000)});
 const path=api.placedCurve(a,'walljump');assert.ok(path);assert.equal(path[0].z,0);assert.equal(path.at(-1).z,1000);
});
test('lion-dance links use the two linked poles standing points, preserving the intermediate warp target',()=>{
 const api=fixture(),a=actor({LinkedPoleA:{StandPoint:at(0,0,200)},LinkedPoleB:{StandPoint:at(800,0,350)},WarpTarget:at(400,0,600)});
 const path=api.placedCurve(a,'pole');assert.ok(path);assert.equal(path[0].x,0);assert.equal(path.at(-1).x,800);assert.ok(path.some(p=>p.z===600));
});
test('a through-hole with only an entry direction stays unresolved instead of inventing an exit',()=>{
 assert.equal(fixture().placedCurve(actor({Box:at(0),InDir:at(100)}),'crawl'),null);
});
test('ambient boat meshes and character origins cannot create a transport route',()=>{
 const spline={GetSplineLength:()=>1000,GetLocationAtDistanceAlongSpline:t=>v(t)};
 for(const kind of ['boat','ride','chase'])assert.equal(fixture().placedCurve(actor({Spline:spline}),kind),null);
});
test('boarding reads the actual wharf interaction point and native boarding target',()=>{
 const api=fixture(),a=actor({MoveToPoint:at(0,0,100),GetMoveToBoatLocation:()=>v(300,0,100)});
 const path=api.placedCurve(a,'boarding');assert.ok(path);assert.equal(path[0].x,0);assert.equal(path.at(-1).x,300);
});
test('a story teleport never draws a physical chord into a remote scene copy',()=>{
 assert.equal(fixture().placedCurve(actor({MoveToTarget:at(0),TeleportLocation:at(0,0,2000000)}),'portal'),null);
});
test('crowded movement volumes do not discard a later unique wall-jump beyond twenty-four candidates',()=>{
 const T=require(root+'/PBZRouteTransitions'),R=require(root+'/PBZRouteCore'),p=(x,z=0)=>({x,y:0,z});
 const features=Array.from({length:30},(_,i)=>({guid:'near-wall-'+i,kind:'mantle',both:false,runtimePath:[p(5000+i),p(5000+i,100)]}));
 features.push({guid:'required-wall-jump',kind:'walljump',both:false,runtimePath:[p(0),p(0,1000)]});
 const job=T.route({name:'test',start:p(0),goal:p(200,1000),features,clock:()=>0,canTraverse:()=>true,
  landing:function*(f,p){return p;},walk:function*(a,b){return Math.abs(a.z-b.z)<10?{points:[a,b],meters:R.dist(a,b)/100}:null;}});
 let r,count=0;do{r=job.next();assert.ok(++count<100000);}while(!r.done);
 assert.equal(r.value?.legs[0].moves[0].guid,'required-wall-jump');
});
test('cached open state alone cannot certify a roadbook action whose actor is no longer loaded',()=>{
 const api=fixture(),g={passageStates:new Map([['wall',{ready:true}]])};
 assert.equal(api.referenceState(g,{}, {guid:'wall'}).ready,false);
});
for(const both of [false,true])test('reference action endpoint matching '+(both?'accepts an authored reverse':'rejects an invented reverse'),()=>{
 const api=fixture(),raw=[v(0,0,100),v(1000,0,100)];
 const f={guid:'wall',kind:'wallrun',both,fold:false,classPath:'/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_SideRunning.BP_SpecialMove_SideRunning_C',path:raw.map(p=>[p.X,p.Y,p.Z])};
 const a=actor({GetName:()=>f.guid,LowSpline:{GetSplineLength:()=>1000,GetLocationAtDistanceAlongSpline:t=>v(t,0,100)}});
 api.UE.Class={Find:p=>p===f.classPath?p:null};api.UE.GameplayStatics={GetAllActorsOfClass:(pawn,cls,out)=>{out.value={Num:()=>1,Get:()=>a};}};
 const g={name:'fixture',actors:[f],observedPassages:new Map(),foldedPassages:new Set(),openPassages:new Set()};
 const w={feet:()=>({x:0,y:0,z:100})};let r;const job=api.refreshLoadedJob(g,w,{}, {x:0,y:0,z:100},{x:1000,y:0,z:100});do{r=job.next();}while(!r.done);
 const state=api.referenceState(g,w,{guid:'wall',p:{x:1000,y:0,z:100},end:{x:0,y:0,z:100},referenceFirst:[1000,0,100],referenceLast:[0,0,100]});
 assert.equal(state.ready,both);if(both)assert.equal(state.path[0].x,1000);
});
