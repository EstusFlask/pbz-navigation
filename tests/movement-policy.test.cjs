'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute'),D=require(root+'/PBZRouteDrops'),T=require(root+'/PBZRouteTransitions');
const p=(x,z=0)=>({x,y:0,z}),run=job=>{let row,n=0;do{row=job.next();assert.ok(++n<100000);}while(!row.done);return row.value;};
const policy={maxHeightCm:1150,maxRunCm:900,gravityCm:2156,speedCm:600,jumpVelocityCm:420,canJump:true};
test('full-size air sweeps clear normal standing floor contact while still rejecting a real obstruction',()=>{
 const module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteWorld.js','utf8')+'\n})')(
  id=>['ue','puerts'].includes(id)?{}:require(path.resolve(root,id)),module,module.exports);
 const world=Object.create(module.exports.Ground.prototype),floor=q=>q.x<=40?{...q,z:500}:q.x>=220?{...q,z:0}:null;
 let obstruction=false;
 Object.assign(world,{r:45,h:95,rise:45,normal:.7,dropPolicy:()=>policy,floorAt:floor,step:()=>({why:'ledge'}),
  hit(a,b,body,owners,walking){
   assert.ok(body&&!walking);
   const support=floor(a),offset=a.z+2-(support?.z??-Infinity);
   if(b.z===a.z-190&&support)return {nz:1,center:{...support,z:support.z+this.h}};
   if(obstruction&&Math.max(a.x,b.x)>=110&&Math.min(a.x,b.x)<=110)return {point:p(110,390),normal:{x:-1,y:0,z:0}};
   return [a,b].some(q=>q.z+2<=(floor(q)?.z??-Infinity)+1e-8)?{point:offset<1e-8?a:b,normal:{x:0,y:0,z:1}}:null;
  }});
 const result=run(D.inspect(world,p(0,500),p(300)));
 assert.ok(result.ok,result.why);assert.equal(result.launch,'jump');
 obstruction=true;
 assert.equal(run(D.inspect(world,p(0,500),p(300))).why,'drop trajectory capsule obstructed');
});
test('the eroded navigation lip follows checked physical ground before jumping down',()=>{
 const floor=q=>q.x<=100?{...q,z:500}:q.x>=240?{...q,z:0}:null,trace=[];
 const world={r:45,dropPolicy:()=>policy,floorAt:floor,standAt:q=>q,step:(a,b)=>b.x<=100?{p:floor(b)}:{why:'ledge'},airHit:(a,b)=>{trace.push(a);return a.x<75&&a.z<520?{point:a}:null;}};
 const result=run(D.inspect(world,p(0,500),p(300)));
 assert.equal(result.ok,true,result.why);assert.equal(result.walkIn,4);assert.equal(result.points[4].x,100);assert.equal(trace[0].x,100);assert.equal(result.launch,'jump');
 world.airHit=(a,b)=>a.x<75&&a.z<520?{point:a}:null;world.step=()=>({why:'body wall'});
 assert.equal(run(D.inspect(world,p(0,500),p(300))).ok,false,'blocked approach was bypassed');
});
test('a blocked late launch can use an earlier capsule-checked pad on the same approach',()=>{
 const takes=[],floor=q=>q.x<=175?{...q,z:500}:q.x>=280?{...q,z:0}:null;
 const world={r:45,dropPolicy:()=>policy,floorAt:floor,standAt:q=>q,step:(a,b)=>({p:floor(b)}),airHit:(a,b)=>{
  if(a.z===500)takes.push(a.x);
  return a.x>=150&&a.x<=200&&b.z>523?{point:b}:null;
 }};
 const result=run(D.inspect(world,p(0,500),p(350)));
 assert.ok(result.ok,result.why);assert.equal(takes[0],175);assert.ok(result.walkIn<7);
 assert.equal(result.points[result.walkIn].x,result.walkIn*25,'the returned segment used unchecked ground beyond takeoff');
 assert.ok(result.points.at(-1).x===350&&Math.abs(result.points.at(-1).z)<1e-6);
 world.airHit=()=>({point:p(100,525)});
 assert.equal(run(D.inspect(world,p(0,500),p(350))).ok,false,'every possible takeoff is obstructed');
});
test('a computed drop respects the live damage envelope, locks, landing width and overhead capsule',()=>{
 const world={r:45,dropPolicy:()=>policy,floorAt:q=>q,standAt:q=>q,airHit:()=>null};
 assert.equal(run(D.inspect(world,p(0,1200),p(200))).ok,false);
 world.blockAt=()=>({p:p(40),locked:true});assert.equal(run(D.inspect(world,p(0,500),p(200))).why,'locked passage');delete world.blockAt;
 world.floorAt=q=>q.y>0?null:q;assert.equal(run(D.inspect(world,p(0,500),p(200))).why,'drop landing too narrow or unsupported');world.floorAt=q=>q;
 world.airHit=(a,b)=>b.z>510?{point:b}:null;assert.equal(run(D.inspect(world,p(0,500),p(200))).ok,false,'jump head collision was ignored');
});
test('a short drop cannot reuse the legacy fallback when the live pawn has no permitted launch',()=>{
 const world={r:45,dropPolicy:()=>null,floorAt:q=>q,hit:()=>null};
 const check={a:p(0,220),b:p(150),mode:'fall'};
 assert.equal(run(D.recheck(world,check)).ok,false);
 delete world.dropPolicy;
 assert.equal(run(D.recheck(world,check)).ok,true);
});
test('a low ceiling can use a checked walk-off when the current pawn permits it',()=>{
 const from=p(0,500),to=p(200),current={...policy,allowRunoff:true,maxJumpHeightCm:1036,maxRunoffHeightCm:1150};
 let ceiling=true,wall=false;
 const world={r:45,dropPolicy:()=>current,floorAt:q=>q.x<=0||q.x>=145?q:null,standAt:q=>q,
  airHit:(a,b)=>ceiling&&b.z>500||wall&&b.x>=80?{point:b}:null};
 const result=run(D.inspect(world,from,to));
 assert.ok(result.ok,result.why);
 assert.equal(result.launch,'runoff');
 assert.ok(result.points.every(q=>q.z<=500),'the runoff used a jump trajectory');
 const check={mode:'fall',a:from,b:to,trajectory:result};
 ceiling=false;
 assert.ok(run(D.recheck(world,check)).ok,'clearing the optional jump path discarded a still safe runoff');
 current.allowRunoff=false;
 assert.equal(run(D.recheck(world,check)).trajectoryChanged,true);
 ceiling=true;
 assert.equal(run(D.inspect(world,from,to)).ok,false,'ledge protection was ignored');
 current.allowRunoff=true;
 wall=true;
 assert.equal(run(D.inspect(world,from,to)).ok,false,'runoff bypassed capsule collision');
 wall=false;
 world.blockAt=(a,b)=>b.x>=80&&b.x<=120&&b.z<500?{p:b,locked:true}:null;
 assert.equal(run(D.inspect(world,from,to)).ok,false,'runoff crossed a lock on the actual flight path');
});

test('a higher runoff allowance does not authorize a jump from the same height',()=>{
 const from=p(0,1120),to=p(210),current={...policy,jumpVelocityCm:700,allowRunoff:true,maxHeightCm:1150,maxJumpHeightCm:1036,maxRunoffHeightCm:1150};
 const world={r:45,dropPolicy:()=>current,floorAt:q=>q,standAt:q=>q,airHit:()=>null};
 const result=run(D.inspect(world,from,to));
 assert.ok(result.ok,result.why);assert.equal(result.launch,'runoff');
 current.allowRunoff=false;
 assert.equal(run(D.inspect(world,from,to)).ok,false);
 current.allowRunoff=true;
 assert.equal(run(D.inspect(world,p(0,1160),to)).ok,false);
 assert.equal(run(D.inspect(world,to,from,'jump')).ok,false);
});

test('movement policy reads the current pawn and treats ledge-protection flags as counters',()=>{
 const module={exports:{}};vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteWorld.js','utf8')+'\n})')(id=>['ue','puerts'].includes(id)?{}:require(path.resolve(root,id)),module,module.exports);
 const world=Object.create(module.exports.Ground.prototype);world.rise=50;
 const m={GetGravityZ:()=>-2156,GetMaxSpeed:()=>600,JumpZVelocity:420,bCanWalkOffLedges:true,bForceDisableLedgeProtection:0,bForceEnableLedgeProtection:0};world.pawn={DamageDepth:1200,DeadDepth:2000,CharacterMovement:m,CanJump:()=>true};
 assert.ok(Math.abs(world.dropPolicy().maxHeightCm-(1150-420*420/(2*2156)))<.001);assert.equal(world.dropPolicy().jumpVelocityCm,420);assert.ok(Math.abs(world.dropPolicy().maxRiseCm-(420*420/(2*2156)-20))<.001);assert.equal(world.dropPolicy().allowRunoff,false);
 m.bForceDisableLedgeProtection=2;
 const both=world.dropPolicy();assert.equal(both.maxHeightCm,1150);assert.equal(both.maxRunoffHeightCm,1150);
 assert.ok(Math.abs(both.maxJumpHeightCm-(1150-420*420/(2*2156)))<.001);
 m.bForceDisableLedgeProtection=0;
 world.pawn.CanJump=()=>false;assert.equal(world.dropPolicy(),null);m.bForceDisableLedgeProtection=2;assert.equal(world.dropPolicy().allowRunoff,true);assert.equal(world.dropPolicy().maxRiseCm,0);m.bForceEnableLedgeProtection=1;assert.equal(world.dropPolicy(),null);
 m.GetGravityZ=()=>undefined;assert.equal(world.dropPolicy(),null,'missing current capability used an old character default');
});
test('lazy action search rejects blocked alternatives without spending walking connectors on them',()=>{
 const features=Array.from({length:70},(_,i)=>({guid:'ledge-'+i,kind:'fall',runtimePath:[p(100+i,500),p(100+i,0)]}));
 let checked=0,walks=0;
 const trip=run(T.route({name:'test',start:p(0,500),goal:p(300),features,lazyActions:true,clock:()=>0,maxConnectors:4,component:q=>q.z>250?0:1,
  canConnect:(a,b)=>a.z===b.z,canTraverse:()=>true,landing:function*(f,p){return p;},validate:function*(a){checked++;return a.feature.guid==='ledge-69'?{points:a.path,kind:'fall',launch:'jump'}:false;},
  walk:function*(a,b){walks++;return a.z===b.z?{points:[a,b],meters:Math.abs(a.x-b.x)/100}:null;}}));
 assert.ok(trip);assert.equal(checked,70);assert.equal(walks,2);assert.equal(trip.legs[0].moves[0].guid,'ledge-69');
});

test('lazy action chains validate every selected move before spending walking connectors',()=>{
 const features=[{guid:'first',kind:'fall',runtimePath:[p(0,500),p(100)]},{guid:'blocked-later',kind:'fall',runtimePath:[p(200),p(300)]}],walks=[],reports=[];
 const component=q=>q.x<50?0:q.x<250?1:2,trip=run(T.route({name:'test',start:p(0,500),goal:p(400),features,lazyActions:true,clock:()=>0,maxConnectors:8,component,canConnect:(a,b)=>component(a)===component(b),canTraverse:()=>true,
  landing:function*(feature,point){yield;return point;},validate:function*(action){yield;return action.feature.guid==='first';},
  walk:function*(a,b){walks.push([a.x,b.x]);return{points:[a,b],meters:Math.abs(a.x-b.x)/100};},report:(phase,value)=>reports.push({phase,value})}));
 assert.equal(trip,null);assert.equal(walks.length,0,'walk connectors were spent before the full selected action chain passed physical validation');
 assert.ok(reports.some(r=>r.phase==='action rejected'&&r.value.guid==='blocked-later'));
});

test('a checked action pad that moves to another component can be reached by a different approach',()=>{
 const start=p(0,0),goal=p(250,600),actualEntry=p(100,300),exit=p(200,600);
 const features=[
  {guid:'upper-gate',kind:'ladder',runtimePath:[p(100,0),exit]},
  {guid:'lower-stair',kind:'ascent',runtimePath:[p(25,0),p(60,300)]}
 ];
 const attempts=[];
 const result=run(T.route({name:'test',start,goal,features,lazyActions:true,clock:()=>0,maxConnectors:3,
  component:q=>q.z,canConnect:(a,b)=>a.z===b.z,canTraverse:()=>true,
  landing:function*(f,point,side){return f.guid==='upper-gate'&&side==='left'?actualEntry:point;},
  walk:function*(a,b){attempts.push([a.z,b.z]);return a.z===b.z?{points:[a,b],meters:Math.abs(a.x-b.x)/100}:null;}
 }));
 assert.deepEqual(result?.legs[0].moves.map(m=>m.guid),['lower-stair','upper-gate']);
 assert.deepEqual(attempts,[[0,0],[300,300],[600,600]],'an optimistic connector spent the limited budget after its pad moved to another floor');
});

test('component connectors reuse each standing point classification while rejecting another floor',()=>{
 const start=p(0),goal=p(500,800),unknown=p(410,800),known=p(200,800),checked=new Map(),walking=[];
 const features=Array.from({length:64},(_,i)=>({guid:'blocked-'+i,kind:'surface',runtimePath:[p(i+1),known]}));
 features.unshift({guid:'unknown-landing',kind:'ladder',runtimePath:[p(1),unknown]});
 features.push({guid:'stairs',kind:'ascent',runtimePath:[p(150),known]});
 const result=run(T.route({name:'test',start,goal,features,lazyActions:true,componentConnectors:true,clock:()=>0,maxConnectors:2,
  component:q=>{checked.set(q,(checked.get(q)||0)+1);return q===unknown?undefined:q.z;},
  canTraverse:()=>true,landing:function*(f,q){return q;},validate:function*(a){return a.feature.guid==='stairs';},
  walk:function*(a,b){walking.push([a,b]);return a.z===b.z?{points:[a,b],meters:Math.abs(a.x-b.x)/100}:null;}
 }));
 assert.equal(result?.legs[0].moves[0].guid,'stairs');
 assert.ok([...checked.values()].every(count=>count===1));
 assert.deepEqual(walking,[[start,features.at(-1).runtimePath[0]],[known,goal]]);
});

test('rejected geometry frees an existing lazy action slot for a later physical alternative',()=>{
 const features=Array.from({length:513},(_,i)=>({guid:'boundary-'+i,kind:'fall',source:'recast-boundary',both:false,runtimePath:[p(100+i,500),p(100+i)]})),checked=[],reports=[];let walks=0;
 const trip=run(T.route({name:'test',start:p(0,500),goal:p(1000),features,lazyActions:true,clock:()=>0,maxConnectors:4,component:q=>q.z>250?0:1,canConnect:(a,b)=>a.z===b.z,canTraverse:()=>true,
  landing:function*(f,p){return p;},validate:function*(a){checked.push(a.feature.guid);return a.feature.guid==='boundary-512'?{points:a.path,kind:'fall',launch:'jump'}:false;},
  walk:function*(a,b){walks++;return a.z===b.z?{points:[a,b],meters:Math.abs(a.x-b.x)/100}:null;},report:(name,value)=>reports.push({name,value})}));
 assert.ok(trip,'a permanently failed first geometry slot prevented the checked 513th alternative from being considered');assert.equal(trip.legs[0].moves[0].guid,'boundary-512');assert.equal(walks,2);assert.equal(checked.length,513);
 assert.ok(reports.every(r=>r.name!=='action candidates refilled'||r.value.active<=512));
});
test('a geometric action frees its ranked slot only after both permitted directions fail',()=>{
 const start=p(0),goal=p(1000),left=p(100),right=p(200);
 const both={guid:'two-way',kind:'surface',source:'recast-boundary',both:true,runtimePath:[left,right]};
 const unused=Array.from({length:511},(_,i)=>({guid:'unrelated-'+i,kind:'fall',source:'recast-boundary',runtimePath:[p(700,500),p(800,500)]}));
 const later={guid:'checked-alternative',kind:'surface',source:'recast-boundary',runtimePath:[p(300),p(700)]};
 const attempt=allowReverse=>{
  const checked=[],reports=[];
  const result=run(T.route({name:'test',start,goal,features:[both,...unused,later],clock:()=>0,maxConnectors:4,lazyActions:true,
   component:q=>q.z,canConnect:(a,b)=>a.z===b.z,canTraverse:()=>true,
   landing:function*(f,q){return q;},validate:function*(a){
    checked.push([a.feature.guid,a.entry.x]);
    return a.feature===later||a.feature===both&&allowReverse&&a.entry===right?{points:a.path,kind:'jump'}:false;
   },
   walk:function*(a,b){if(a===start&&b===goal)return null;return {points:[a,b],meters:Math.abs(a.x-b.x)/100};},
   report:(name,detail)=>{if(name==='action candidates refilled')reports.push(detail);}
  }));
  return {result,checked,reports};
 };
 const rejected=attempt(false);
 assert.equal(rejected.result?.legs[0].moves[0].guid,later.guid);
 assert.deepEqual(rejected.checked,[[both.guid,left.x],[both.guid,right.x],[later.guid,300]]);
 assert.equal(rejected.reports.length,1);assert.equal(rejected.reports[0].active,512);
 const reverse=attempt(true);
 assert.equal(reverse.result?.legs[0].moves[0].guid,both.guid);
 assert.deepEqual(reverse.checked,[[both.guid,left.x],[both.guid,right.x]]);
 assert.equal(reverse.reports.length,0);
});
test('lazy geometry refill can validate candidates through the full 512 plus 512 window',()=>{
 const features=Array.from({length:1024},(_,i)=>({guid:'boundary-window-'+i,kind:'fall',source:'recast-boundary',both:false,runtimePath:[p(100+i,500),p(100+i)]}));let checked=0;
 const trip=run(T.route({name:'test',start:p(0,500),goal:p(2000),features,lazyActions:true,clock:()=>0,maxConnectors:4,component:q=>q.z>250?0:1,canConnect:(a,b)=>a.z===b.z,canTraverse:()=>true,
  landing:function*(feature,point){return point;},validate:function*(action){checked++;return action.feature.guid==='boundary-window-1023'?{points:action.path,kind:'fall',launch:'jump'}:false;},
  walk:function*(a,b){return a.z===b.z?{points:[a,b],meters:Math.abs(a.x-b.x)/100}:null;}}));
 assert.ok(trip,'the 1024th ranked candidate was not validated after 512 initial candidates and 512 refills');
 assert.equal(trip.legs[0].moves[0].guid,'boundary-window-1023');assert.equal(checked,1024);
});
test('unused refill capacity does not enlarge the initial action-attempt budget',()=>{
 const features=Array.from({length:1024},(_,i)=>({guid:'bidirectional-window-'+i,kind:'surface',source:'recast-boundary',both:i<512,runtimePath:[p(100+i,500),p(100+i)]}));let checked=0;
 const trip=run(T.route({name:'test',start:p(0,500),goal:p(2000,500),features,lazyActions:true,clock:()=>0,maxConnectors:4,component:()=>0,canConnect:(_a,b)=>b.z===500,canTraverse:()=>true,
  landing:function*(feature,point){return point;},validate:function*(){checked++;return false;},walk:function*(){return null;}}));
 assert.equal(trip,null);assert.equal(checked,512,'a failed descent alone retired an untested ascent');
});
test('geometry refill remains bounded and cannot turn a later closed mechanism into an open move',()=>{
 const geometry=Array.from({length:512},(_,i)=>({guid:'bad-'+i,kind:'fall',source:'recast-boundary',runtimePath:[p(100+i,500),p(100+i)]})),closed={guid:'late-closed-ladder',kind:'ladder',source:'game-placement',both:true,runtimePath:[p(800,500),p(800)]};let checked=0,closedSeen=false;
 const request=features=>run(T.route({name:'test',start:p(0,500),goal:p(1000),features,lazyActions:true,clock:()=>0,maxConnectors:4,component:q=>q.z>250?0:1,canConnect:(a,b)=>a.z===b.z,canTraverse:f=>f.guid!=='late-closed-ladder',
  landing:function*(f,p){return p;},validate:function*(){checked++;return false;},walk:function*(a,b){return a.z===b.z?{points:[a,b],meters:1}:null;},onClosed:(prefix,action)=>{closedSeen=true;assert.equal(action.feature.guid,closed.guid);assert.equal(prefix.points.at(-1).z,500);}}));
 assert.equal(request([...geometry,closed]),null);assert.equal(closedSeen,true);
 checked=0;const many=Array.from({length:2000},(_,i)=>({...geometry[0],guid:'reject-'+i}));assert.equal(request(many),null);assert.ok(checked<=1024,'initial candidates plus 512 refills exceeded their hard bound');assert.ok(checked>0);
});
test('an unavailable mechanism stops at its checked entry after reachable movement actions',()=>{
 const features=[{guid:'down',kind:'fall',runtimePath:[p(100,500),p(200)]},{guid:'closed-lift',kind:'lift',runtimePath:[p(300),p(300,1000)]}];let prefix;
 const trip=run(T.route({name:'test',start:p(0,500),goal:p(500,1000),features,lazyActions:true,clock:()=>0,maxConnectors:8,canConnect:(a,b)=>a.z===b.z,component:q=>q.z,
  canTraverse:f=>f.guid!=='closed-lift',landing:function*(f,p){return p;},validate:function*(a){return{points:a.path,kind:'fall'};},walk:function*(a,b){return a.z===b.z?{points:[a,b],meters:1}:null;},onClosed:(leg,action)=>{prefix={leg,action};}}));
 assert.equal(trip,null);assert.equal(prefix.action.feature.guid,'closed-lift');assert.equal(prefix.leg.points.at(-1).x,300);assert.equal(prefix.leg.moves.length,1);assert.equal(prefix.leg.moves[0].guid,'down');
});


test('an auditor cannot certify the displayed drop using a different successful takeoff',()=>{
 const from=p(0,500),to=p(300),floor=q=>({...q,z:q.x<=175?500:0});let shifted=false;
 const world={r:45,dropPolicy:()=>policy,floorAt:floor,standAt:q=>q,step:(a,b)=>({p:floor(b)}),
  airHit:(a,b)=>shifted&&a.x>=175&&a.z===500?{point:a}:null};
 const f={guid:'recast-movement:stale-launch',kind:'fall',source:'recast-boundary',runtimePath:[from,to]};
 const trip=run(T.route({name:'test',start:from,goal:p(500),features:[f],lazyActions:true,clock:()=>0,maxConnectors:4,
  component:q=>q.z,componentConnectors:true,canTraverse:()=>true,landing:function*(f,q){return q;},
  validate:function*(action){return yield* D.inspect(world,action.entry,action.exit);},
  walk:function*(a,b){return{points:[a,b],meters:Math.abs(a.x-b.x)/100};}}));
 assert.ok(trip);
 const leg=trip.legs[0],check=leg.checks.find(c=>c.kind===12),O=require(root+'/PBZRouteObstacles');
 const move=leg.moves[0],takeoff=check.trajectory.points[check.trajectory.walkIn];
 assert.deepEqual(move.p,takeoff,'the action prompt must mark the checked launch, not the start of the approach');
 assert.deepEqual(leg.points[move.from],takeoff);
 assert.equal(leg.walks.at(-2).to,move.from,'the checked approach must remain walkable all the way to takeoff');
 assert.deepEqual(check.a,from,'revalidation still starts before the approach');
 assert.ok(check.from<move.from);
 const later=O.mark(leg,{kind:12,edge:-1,a:p(7000),b:p(7250,-500)},'drop landing pending',p(7000),true);
 leg.obstacles=[O.mark(leg,check,'drop landing pending',check.a,true),later];
 check.verifiedAt=0;
 const stableAudit=new O.Auditor();stableAudit.begin(leg,world,from,2000);
 assert.ok(run(stableAudit.job).complete);
 assert.equal(check.verifiedAt,2000);
 assert.deepEqual(leg.obstacles,[later],'a successful recheck cleared another drop with the same sentinel edge');
 shifted=true;
 const fresh=run(D.inspect(world,from,to));assert.ok(fresh.ok);assert.ok(fresh.walkIn<7);
 const auditor=new O.Auditor();check.verifiedAt=0;
 auditor.begin(leg,world,from,2000);const result=run(auditor.job);
 assert.ok(result.mark,'the old trajectory was released after a different takeoff passed');
 assert.match(result.mark.reason,/trajectory changed/);
 assert.equal(result.mark.unknown,false,'a known trajectory change did not request a fresh route');
 assert.equal(check.verifiedAt,0);
});


test('a disconnected active shortlist admits a complete directed chain from its existing reserve',()=>{
 const start=p(0,600),goal=p(900),components=q=>q.z,visited=[],reports=[];
 const fall=(guid,a,b)=>({guid,kind:'fall',source:'recast-boundary',both:false,runtimePath:[a,b]});
 const first=fall('first-drop',p(100,600),p(200,300));
 const noise=Array.from({length:511},(_,i)=>fall('other-floor-'+i,p(100+i,1500),p(200+i,1200)));
 const trap={...fall('closed-bridge',p(300,300),p(400)),source:'game-placement'};
 const wrong=fall('wrong-direction',p(400),p(300,300));
 const last=fall('last-drop',p(300,300),p(400));
 const options={name:'reserve-test',start,goal,features:[first,...noise,trap,wrong,last],lazyActions:true,clock:()=>0,maxConnectors:3,
  component:components,componentConnectors:true,canTraverse:f=>f!==trap,landing:function*(f,q){return q;},
  validate:function*(action){visited.push(action.feature.guid);return{kind:'fall',points:action.path};},
  walk:function*(a,b){assert.equal(a.z,b.z);return{points:[a,b],meters:Math.abs(a.x-b.x)/100};},report:(name,value)=>reports.push({name,value})};
 const trip=run(T.route(options));
 assert.ok(trip,'the reserve could close the component gap but search terminated before checking it');
 assert.deepEqual(trip.legs[0].moves.map(m=>m.guid),['first-drop','last-drop']);
 assert.deepEqual(visited,['first-drop','last-drop']);
 const accepted=reports.find(r=>r.name==='action chain accepted');
 assert.equal(accepted.value.connectors,3);
 assert.ok(reports.some(r=>r.name==='action candidates refilled'&&r.value.active<=512));
 visited.length=0;
 assert.equal(run(T.route({...options,features:options.features.slice(0,-1)})),null);
 assert.equal(visited.length,0,'a closed mechanism or inverted fall became an active route');
});
