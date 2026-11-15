'use strict';
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const catalog=require(root+'/PBZRouteSurveyTasks'),{Survey}=require(root+'/PBZRouteSurvey');
test('survey catalog includes the known Xigu chain and shadow-weapon field cases',()=>{
 const tasks=catalog.resolve(require(root+'/PBZRouteTables').data),ids=new Set(tasks.map(t=>t.worksheet));
 assert.ok(ids.has('worksheet-002'),'missing Xigu chain case');
 assert.ok(ids.has('worksheet-004'),'missing Xigu red-thread weapon case');
});
test('real tracker data has both numbered endpoints of every card with the original world XYZ',()=>{
 const file=path.resolve(__dirname,'../Quest_Navigation/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts/PBZSurveyCatalogData.lua');
 const data=JSON.parse(fs.readFileSync(file,'utf8').split('[=[')[1].split(']=]')[0]);
 const tasks=catalog.resolve(require(root+'/PBZRouteTables').data);assert.equal(data.points.length,tasks.length*2);
 for(const task of tasks)for(const role of ['start','end']){
  const point=data.points.find(p=>p.survey.id===task.id&&p.survey.role===role);assert.ok(point);assert.equal(point.survey.world,task.world);
  assert.deepEqual(point.location,[task[role].p.x,task[role].p.y,task[role].p.z]);assert.match(point.survey.name,new RegExp('^'+task.number+'号路线'));
 }
});
