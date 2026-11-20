'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),V=require(path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteHookVolume'));
test('oriented hook box uses its authored rotation, scale and the current capsule centre',()=>{
 const box={center:[100,200,300],axes:[[0,20,0],[-40,0,0],[0,0,500]]};
 assert.equal(V.contains(box,[139,219,204],96),true);assert.equal(V.contains(box,[141,219,204],96),false);assert.equal(V.contains(box,[100,200,705],96),false);
 const samples=V.samples(box,[200,300,400]);assert.ok(samples.length<=83);assert.ok(samples.every(p=>V.contains(box,p,96)));
 assert.deepEqual(V.samples({center:box.center,axes:[[0,0,0],...box.axes.slice(1)]}),[]);
 assert.equal(V.valid({center:box.center,axes:[[0,20,0],[0,40,0],[0,0,500]]}),false);
});

test('native launch boxes intersect the actual standing capsule with round caps and rotated axes',()=>{
 const box={center:[0,0,0],axes:[[10,0,0],[0,10,0],[0,0,10]]};
 assert.equal(V.overlapsCapsule(box,[0,0,0],96,45),true);
 assert.equal(V.overlapsCapsule(box,[35,0,0],96,45),true);
 assert.equal(V.overlapsCapsule(box,[40,0,0],96,45),false,'an expanded rectangular capsule bypassed its round lower cap');
 box.center[2]=100;
 assert.equal(V.overlapsCapsule(box,[55,0,0],96,45),true);
 assert.equal(V.overlapsCapsule(box,[55.1,0,0],96,45),false);
 const s=Math.SQRT1_2,tilted={center:[0,0,100],axes:[[10*s,0,10*s],[0,10,0],[-100*s,0,100*s]]};
 assert.equal(V.overlapsCapsule(tilted,[100,0,0],96,45),true);
 assert.equal(V.overlapsCapsule(tilted,[130,0,0],96,45),false);
 assert.equal(V.overlapsCapsule(box,[0,0,0],20,45),false);
});
test('the live hook box reconstructs its current rotated and scaled world axes',()=>{
 const transform={X:10,Y:20,Z:30},box={K2_GetComponentToWorld:()=>transform,GetUnscaledBoxExtent:()=>({X:100,Y:50,Z:25})},UE={Vector:function(X,Y,Z){Object.assign(this,{X,Y,Z});},KismetMathLibrary:{TransformLocation:(t,p)=>({X:t.X-p.Y*2,Y:t.Y+p.X*2,Z:t.Z+p.Z*3})}},plain=p=>({x:p.X,y:p.Y,z:p.Z}),live=V.live(box,UE,plain);
 assert.deepEqual(live.center,[10,20,30]);assert.deepEqual(live.axes,[[0,200,0],[-100,0,0],[0,0,75]]);assert.equal(V.contains(live,[110,10,-66]),true);assert.equal(V.contains(live,[110.1,10,-66]),false);
});
test('every cooked hook launch volume is finite and contains its own probe positions',()=>{
 const mod=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute'),worlds=['pbz_xigu_wp','pbz_fujizhilin_wp','pbz_zhengdaodaying_wp','pbz_pangzhen_wp','pbz_houjie_wp','pbz_ximeng_wp','pbz_dengdingshandao_wp','pbz_duanhun_wp'];
 let count=0;for(const world of worlds)for(const f of require(mod+'/PBZRouteHookData').forWorld(world)){count++;assert.equal(V.valid(f.entryVolume),true,f.guid);assert.ok(V.samples(f.entryVolume).every(p=>V.contains(f.entryVolume,p)));}assert.equal(count,75);
});
test('hook volume window anchors retain a small real polygon between the regular probes',async()=>{
 const {hookVolumePoints}=await import('../offline-navigation/hook-volume-anchors.mjs'),box={center:[100,200,0],axes:[[300,0,0],[0,300,0],[0,0,900]]},vertices=[.12,6,-.1,.16,6,-.1,.14,6,-.14],planner={origin:[100,200,0],navMesh:{getTileAndPolyByRef:()=>({success:true,poly:{vertCount:()=>3,verts:i=>i},tile:{verts:i=>vertices[i]}})},query:{queryPolygons:()=>({success:true,polyRefs:[1]}),closestPointOnPoly:()=>({success:true,closestPoint:{x:.14,y:6,z:-.12}})}};
 const points=hookVolumePoints(planner,box,V);assert.equal(points.length,1);assert.deepEqual(points[0],[114,212,600]);assert.ok(V.contains(box,points[0]));
 planner.query.queryPolygons=()=>({success:true,polyRefs:new Array(8192).fill(1)});assert.throws(()=>hookVolumePoints(planner,box,V),/budget/);
});
