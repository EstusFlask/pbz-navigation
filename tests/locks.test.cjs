'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const L=require(root+'/PBZRouteLocks'),Local=require(root+'/PBZRouteLocalWalk'),O=require(root+'/PBZRouteObstacles');
const lock={id:'key-door',world:'test',p:{x:280,y:0,z:0},locked:true,icon:'keylock',label:'需钥匙/物品解锁'};
function run(job){let r,n=0;do{r=job.next();assert.ok(++n<100000);}while(!r.done);return r.value;}
test('known locks can be bypassed by a physically checked alternative and do not block another floor',()=>{
 const world={floorAt:p=>p,step:(a,b)=>({p:b})},view=L.constrain(world,[lock],'test');
 const route=run(Local.search(view,{x:0,y:0,z:0},{x:560,y:0,z:0},{clock:()=>0}));
 assert.ok(route);assert.ok(route.points.some(p=>Math.abs(p.y)>75));
 for(let i=1;i<route.points.length;i++)assert.equal(L.crossing([lock],'test',route.points[i-1],route.points[i]),null);
 assert.equal(L.crossing([lock],'test',{x:0,y:0,z:600},{x:560,y:0,z:600}),null);
 assert.equal(L.crossing([lock],'other',{x:0,y:0,z:0},{x:560,y:0,z:0}),null);
});
test('live auditing retains the key requirement instead of replacing it with an anonymous wall',()=>{
 const view=L.constrain({floorAt:p=>p,step:(a,b)=>({p:b})},[lock],'test');
 const leg={world:'test',points:[{x:0,y:0,z:0},{x:560,y:0,z:0}],walks:[],moves:[],checks:[]};
 const audit=new O.Auditor();audit.begin(leg,view,leg.points[0],0);
 const result=run(audit.job);assert.equal(result.mark.icon,'keylock');assert.equal(result.mark.id,lock.id);
});
test('map reading enumerates nonstandard layers and detects changed item requirements',()=>{
 const row={GuidString:'AB31',bUnLocked:false,ActorLocation:{X:0,Y:0,Z:0},NeedItems:{Num:()=>1,Get:()=> 'key-a'},IsA:()=>false};
 const group={Num:()=>1,GetKey:()=>7,GetRef:()=>({LockObjArray:{Num:()=>1,Get:()=>row}})};
 const map={Num:()=>1,GetKey:()=> 'region',GetRef:()=>({MapLockGroups:group})};
 const options={alive:()=>true,point:p=>({x:p.X,y:p.Y,z:p.Z}),worldOf:()=> 'test',UE:{}};
 const first=L.read(map,{},options);assert.equal(first.length,1);assert.equal(first[0].icon,'keylock');
 row.NeedItems.Get=()=> 'key-b';assert.notEqual(L.signature(first),L.signature(L.read(map,{},options)));
 row.bUnLocked=true;assert.equal(L.read(map,{},options).length,0);
});

test('actual NeedItems maps expose key names, counts and owned quantities',()=>{
 const row={GuidString:'opaque-guid',bUnLocked:false,ActorLocation:{X:0,Y:0,Z:0},
  NeedItems:{Num:()=>1,GetKey:()=> 'Key_Cave',Get:id=>id==='Key_Cave'?2:undefined},IsA:()=>false};
 const groups={GetRef:()=>({LockObjArray:{Num:()=>1,Get:()=>row}})};
 const map={GetRef:()=>({MapLockGroups:groups})};
 const options={alive:()=>true,point:p=>({x:p.X,y:p.Y,z:p.Z}),worldOf:()=> 'test',UE:{},
  item:id=>({name:'山洞钥匙',owned:1})};
 const rows=L.read(map,{region:{}},options);
 assert.equal(rows[0].requiredItems[0],'Key_Cave');
 assert.ok(rows[0].label.includes('山洞钥匙'));assert.ok(rows[0].label.includes('1/2'));
});

test('weapon blockers with opaque GUIDs retain the actual weapon requirement',()=>{
 const row={GuidString:'opaque-guid',bUnLocked:false,ActorLocation:{X:0,Y:0,Z:0},
  NeedShaChiWeaponIds:{Num:()=>1,Get:()=> 'Weapon_Hook'},IsA:cls=>cls==='weapon'};
 const map={GetRef:()=>({MapLockGroups:{GetRef:()=>({LockObjArray:{Num:()=>1,Get:()=>row}})}})};
 const rows=L.read(map,{region:{}},{alive:()=>true,point:p=>({x:p.X,y:p.Y,z:p.Z}),worldOf:()=> 'test',
  UE:{ShaChiWeaponLockObject:{StaticClass:()=> 'weapon'}}});
 assert.equal(rows.length,1);assert.deepEqual(rows[0].requiredWeapons,['Weapon_Hook']);
});

test('physical doors expose their real item map without invoking an interaction',()=>{
 const M=require(root+'/PBZRouteMechanisms');let queried=0;
 const actor={GetName:()=> 'door-guid',DoorOpen:false,K2_GetActorLocation:()=>({X:280,Y:0,Z:0}),
  GetCheckItems:out=>{queried++;out.value={Num:()=>1,GetKey:()=> 'CaveKey',Get:()=>2};},
  OnInteract(){assert.fail('read-only navigation activated the door');},CheckLockItems(){assert.fail('read-only navigation changed the lock');}};
 const options={P:{$ref:value=>({value}),$unref:r=>r.value},point:p=>({x:p.X,y:p.Y,z:p.Z}),item:()=>({name:'山洞钥匙',owned:1})};
 const block=M.describe(actor,options);assert.equal(block.icon,'keylock');assert.ok(block.label.includes('山洞钥匙 1/2'));
 actor.DoorOpen=true;assert.equal(M.describe(actor,options),null);assert.equal(queried,1);
});

test('folding ladders and lifts retain their actual activation and motion conditions',()=>{
 const M=require(root+'/PBZRouteMechanisms'),base={GetName:()=> 'mechanism'},feature={guid:'mechanism',path:[[0,0,0],[0,0,600]]};
 const ladder={...base,bFold:true,bTriggered:false,HookTimelineComponent:{IsPlaying:()=>false}};
 assert.equal(M.inspect(ladder,{...feature,kind:'ladder'}).ready,false);
 ladder.bTriggered=true;assert.equal(M.inspect(ladder,{...feature,kind:'ladder'}).ready,true);
 ladder.HookTimelineComponent.IsPlaying=()=>true;assert.equal(M.inspect(ladder,{...feature,kind:'ladder'}).ready,false);
 ladder.bFold=false;assert.equal(M.inspect(ladder,{...feature,kind:'ladder'}).ready,true,'fixed ladders do not need a folding state');
 const lift={...base,GearIsDoing:true};assert.equal(M.inspect(lift,{...feature,kind:'lift'}).ready,false);
 lift.GearIsDoing=false;assert.equal(M.inspect(lift,{...feature,kind:'lift'}).ready,true);
 lift.bIsBroken=true;assert.equal(M.inspect(lift,{...feature,kind:'lift'}).ready,false);
});
