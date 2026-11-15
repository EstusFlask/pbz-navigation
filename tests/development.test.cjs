'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const source=fs.readFileSync(root+'/PBZQuestRoute.js','utf8');
const start=source.indexOf(' if(Build.development){',source.indexOf('exports.install=')),end=source.indexOf(' const player=require(',start);
const initialize='(function(){'+source.slice(start,end)+'})';
test('standard initialization never loads the recorder, polls marker input or writes case files',()=>{
 const setup=vm.runInNewContext(initialize,{Build:{development:false},require(){throw Error('standard package loaded diagnostics');}});setup();
});
test('development input reaches the real capture adapter and saves exact target, route and effective solver',()=>{
 const files=new Map(),held=new Set(),feet={x:1,y:2,z:3},pc={IsInputKeyDown:key=>held.has(key.name)},row={on:true};
 const c={Build:{development:true,label:'1.5.0-dev'},developerAPI:null,diagnostics:null,surveyTracker:null,developerPC:null,developerPawn:null,developerWorld:null,developerKeys:null,
  require:id=>require(path.resolve(root,id)),UE:{KismetSystemLibrary:{GetProjectSavedDirectory:()=> 'actual-saved/',ConvertToAbsolutePath:p=>p},
   GameplayStatics:{GetPlayerController:()=>pc},Key:class{constructor(name){this.name=name;}},EasyCsv:{SaveStringToFileWithFullPath:(text,p)=>{files.set(p,text);return true;}}},
  W:{alive:x=>!!x},textFile:p=>files.get(p)||'',log(){},updateRouteStatus(){},menu:false,previous:null,
  notes:[],lockRows:[],threads:{shape(){}},ink:{},tables:require(root+'/PBZRouteTables').data,planning:{pending:false,stats:{}},
  S:{pawn:{},world:{feet:()=>feet,snapshot:()=>({profile:'Pawn'}),step:(a,b)=>({p:b})},level:'world',contextEpoch:1,cfg:{WorldThread:true},
   manual:{key:'gate',world:'world',p:{x:99,y:0,z:0}},line:[feet,{x:99,y:0,z:0}],active:0,version:1,
   trip:{legs:[{world:'world',provider:'native',searchDirection:'forward',points:[feet,{x:99,y:0,z:0}],moves:[],checks:[]}]}}};
 vm.createContext(c);vm.runInContext(initialize,c)();c.threads.pool=[row];c.threads.shape(row,[feet,{x:80,y:0,z:105}]);
 const tick=vm.runInContext(source.slice(source.indexOf('function developerTick('),source.indexOf('function tick('))+';developerTick',c);
 tick(0);held.add('Gamepad_FaceButton_Top');tick(16);assert.equal(files.size,1);
 const [name,text]=[...files][0],data=JSON.parse(text);assert.ok(name.startsWith('actual-saved/PBZQuestRoute-dev-'));
 assert.equal(data.snapshot.target.key,'gate');assert.equal(data.snapshot.settings.WorldThread,true);
 assert.equal(data.snapshot.trip.legs[0].searchDirection,'forward','requested direction disguised the solver actually used');
 assert.equal(data.snapshot.rendered[0].points[1].x,80);
 tick(32);assert.equal(files.size,1,'held attack created duplicate cases');
 let selected=null;Object.assign(c,{tracker:null,epoch:0,questGate:{pause(){}},questID:()=>'',narrative:()=>null,solve:dest=>selected=dest});
 c.S.arrival={restart(){}};
 c.diagnostics.survey.onStart(require(root+'/PBZRouteSurveyTasks').resolve(c.tables)[0]);
 assert.equal(selected.key,'survey:B03');assert.equal(selected.noTransfer,true);assert.equal(selected.bell,'Bell_XM_015');
 const task=require(root+'/PBZRouteSurveyTasks').resolve(c.tables)[0];Object.assign(feet,task.start.p);c.S.level=task.world;
 c.S.world.snapshot=()=>({mode:1,movementFloor:{...feet}});held.clear();tick(200);
 held.add('Gamepad_FaceButton_Left');tick(216);assert.equal(c.diagnostics.survey.active.task.id,'B03');const attempt=c.diagnostics.survey.active.attemptId;
 tick(232);assert.equal(c.diagnostics.survey.count,1);
 held.clear();tick(250);held.add('Gamepad_LeftShoulder');tick(270);
 const personal=[...files.values()].map(s=>JSON.parse(s)).find(r=>r.markerKind==='player-mistake');
 assert.ok(personal);assert.equal(personal.surveyAttempt,attempt);assert.match(personal.label,/wrong turn/);
});
