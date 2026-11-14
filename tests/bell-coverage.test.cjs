'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../authoring/bell-network-coverage.json');
const courses=require('../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteGuideData').data.courses;

test('the authoring audit accounts for every ordered game-table bell pair on all eight maps',()=>{
 assert.deepEqual(data.maps.map(m=>m.id),[251,252,253,254,255,256,257,258]);
 for(const map of data.maps){
  const pairs=data.pairs.filter(p=>p.mapId===map.id),expected=new Set();
  for(const a of map.bells)for(const b of map.bells)if(a!==b)expected.add(a.id+'/'+b.id);
  assert.equal(pairs.length,expected.size);assert.deepEqual(new Set(pairs.map(p=>p.from+'/'+p.to)),expected);
 }
 assert.equal(data.pairs.length,4324);
});

test('only existing 3D courses count as enabled coverage, with explicit directed continuity',()=>{
 const lookup=new Map(courses.map(c=>[c.id,c]));
 for(const pair of data.pairs){
  assert.equal(pair.status==='authored-reference',pair.courses.length>0);
  if(!pair.courses.length)continue;
  let at=pair.from;
  for(const id of pair.courses){const c=lookup.get(id);assert.ok(c);assert.equal(c.sourceBell,at);at=c.targetBell;}
  assert.equal(at,pair.to);
 }
 assert.equal(data.pairs.filter(p=>p.courses.length).length,2,'do not silently promote 2D worksheet links');
 const generated=require('../authoring/roadbook-course-audit.json');
 for(const link of data.worksheetLinks){const row=generated.links.find(r=>r.id===link.id);assert.ok(row);
  assert.equal(link.runtimeEnabled,row.runtimeEnabled);assert.equal(link.status,row.status);}
});

test('duplicate or missing public landmark identities remain explicit rather than matching the nearest bell',()=>{
 const unresolved=data.maps.flatMap(m=>m.markers.filter(p=>!p.gameBell));
 assert.equal(unresolved.filter(p=>p.name==='幻术师遗迹').length,7);
 assert.equal(unresolved.filter(p=>p.name==='湖畔').length,1);
 for(const map of data.maps)for(const marker of map.markers){
  if(marker.gameBell)assert.ok(map.bells.some(b=>b.id===marker.gameBell));
  else assert.equal(marker.status,'identity-unresolved');
 }
 const special=new Set(data.maps.flatMap(m=>m.bells.filter(b=>b.specialEntry).map(b=>b.id)));
 assert.ok(data.worksheetLinks.every(p=>!special.has(p.from)&&!special.has(p.to)));
 assert.ok(data.worksheetLinks.some(p=>p.toName==='圣母娘娘宗祠'&&p.to==='Bell_DDSD_007'));
});
