'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const facts=require('../authoring/placed-passage-facts.json'),audit=require('../authoring/roadbook-course-audit.json');
const data=require(root+'/PBZRouteRoadbookData'),placed=require(root+'/PBZRoutePlacedPassages');
const run=job=>{let r,count=0;do{r=job.next();assert.ok(++count<100000);}while(!r.done);return r.value;};
test('every roadbook worksheet link is accounted for without promoting unresolved geometry',()=>{
 assert.equal(audit.links.length,140);assert.equal(new Set(audit.links.map(x=>x.id)).size,140);
 const worlds=[...new Set(audit.links.map(x=>x.world).filter(Boolean))],courses=worlds.flatMap(w=>data.forWorld(w));
 assert.equal(courses.length,audit.links.filter(r=>r.status==='requires-scene-check').length);
 for(const row of audit.links){
  if(row.status==='requires-scene-check')assert.ok(courses.some(c=>c.id===row.course&&c.sourceBell===row.from&&c.targetBell===row.to));
  else if(row.status!=='measured-reference')assert.equal(row.runtimeEnabled,false);
 }
 for(const c of courses){
  assert.equal(c.validation,'current scene required');assert.equal(c.physicalVerified,undefined);
  for(const p of c.points)assert.ok([p.x,p.y,p.z].every(Number.isFinite));
  for(const m of c.actions){assert.ok(m.start>=0&&m.start<m.end&&m.end<c.points.length);assert.ok(m.guid);}
 }
});
test('all placed passage facts require the current loaded instance and retain provenance',()=>{
 const worlds=[...new Set(facts.rows.map(r=>r.world))];assert.equal(worlds.length,8);
 const digest=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../authoring/placed-passage-facts.json'))).digest('hex');
 assert.equal(audit.factsSHA256,digest);
 for(const world of worlds)assert.equal(require(root+'/PBZRoutePlacedPassages/'+world).data.factsSHA256,digest);
 assert.equal(worlds.flatMap(w=>placed.forWorld(w)).length,facts.rows.length);
 const ids=new Set();for(const f of facts.rows){
  const key=f.world+'/'+f.guid;assert.ok(!ids.has(key));ids.add(key);
  assert.equal(f.requiresLoaded,true);assert.equal(f.packageSHA256.length,64);
  assert.ok(f.path.every(p=>p.length===3&&p.every(Number.isFinite)));
  if(['ascent','drop','slide','mantle','hook','rappel','zipline'].includes(f.kind))assert.equal(f.both,false);
 }
 assert.deepEqual(placed.forWorld('../elsewhere'),[]);assert.deepEqual(data.forWorld('../elsewhere'),[]);
});
test('a derived course keeps normal physical floor validation rather than the measured-guide exemption',()=>{
 const RB=require(root+'/PBZRouteRoadbook'),F=require(root+'/PBZRouteFeasibility'),p=x=>({x,y:0,z:0});
 const c={id:'candidate',name:'candidate',world:'test',sourceBell:'a',targetBell:'b',target:p(1000),points:[p(0),p(500),p(1000)],actions:[]};
 const trip=run(RB.plan({step:(a,b)=>({p:b}),hit:()=>null},'test',{world:'test',bell:'b',p:p(1000)},p(0),{courses:[c]}));
 assert.ok(trip);assert.equal(trip.legs[0].guide,undefined);assert.ok(trip.legs[0].roadbook);
 assert.equal(run(F.check({floorAt:()=>null},trip.legs[0],p(0))).ok,false);
});
test('short-drop reference moves retain their mandatory takeoff/descent/landing check',()=>{
 const RB=require(root+'/PBZRouteRoadbook'),leg={checks:[],moves:[{kind:'fall',from:1,to:3,p:{x:0,y:0,z:300},end:{x:100,y:0,z:0}}]};
 RB.prepare(leg,{}, {},{});assert.equal(leg.checks[0].kind,12);assert.equal(leg.checks[0].from,1);assert.equal(leg.checks[0].to,3);
});
test('vehicle phase detection reads sailing state and exact attached ride classes without cold loading',()=>{
 const T=require(root+'/PBZRouteTravelMode');let loads=0;
 assert.equal(T.read({}, {ShipNavigationSystem:{StaticClass:()=>1}}, {getWorldSubsystem:()=>({IsInNavigation:()=>true})}).kind,'boat');
 const UE={Class:{Find:p=>p,Load(){loads++;}}};
 assert.equal(T.read({GetAttachParentActor:()=>({IsA:()=>true})},UE,{}).kind,'ride');
 assert.equal(T.read({GetAttachParentActor:()=>({IsA:()=>false})},UE,{}),null);assert.equal(loads,0);
});
test('scripted traversal cannot be certified from geometry when its requirements are unreadable',()=>{
 const M=require(root+'/PBZRouteMechanisms');
 for(const kind of ['walljump','vault','pole','boarding','boat','ride','chase','portal']){
  assert.equal(M.inspect({GetName:()=>kind},{guid:kind,kind},{UE:{}}).ready,false);
  const actor={GetName:()=>kind,GetInteractRequirementMeet:()=>1};
  assert.equal(M.inspect(actor,{guid:kind,kind},{UE:{EInteractRequirementState:{RequirementMeet:1}}}).ready,true);
 }
});
test('execution-style movement can wait for an interactable target without bypassing weapon requirements',()=>{
 const M=require(root+'/PBZRouteMechanisms'),actor={GetName:()=> 'execution',IsValidInteract:()=>false};
 assert.equal(M.inspect(actor,{kind:'walljump'}).ready,false);actor.IsValidInteract=()=>true;
 assert.equal(M.inspect(actor,{kind:'walljump'}).ready,true);
 actor.GetNeedShaChiWeaponID=()=> 'required';assert.equal(M.inspect(actor,{kind:'walljump'}).ready,false);
});
test('boarding availability follows the real boat-wharf query and never invokes boarding',()=>{
 const M=require(root+'/PBZRouteMechanisms');let ready=false,commands=0;
 const wharf={GetName:()=> 'wharf',BPGetBoat:()=>({CanInteractWithWharf:w=>{assert.equal(w,wharf);return ready;}}),DoInteract(){commands++;}};
 assert.equal(M.inspect(wharf,{guid:'wharf',kind:'boarding'}).ready,false);ready=true;
 assert.equal(M.inspect(wharf,{guid:'wharf',kind:'boarding'}).ready,true);assert.equal(commands,0);
});
