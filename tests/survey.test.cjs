'use strict';
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {Survey}=require(root+'/PBZRouteSurvey'),cards=require(root+'/PBZRouteSurveyTasks');
const p=(x,z=0)=>({x,y:0,z}),task={id:'T1',revision:1,world:'w',start:{p:p(0),name:'from',area:'a'},end:{p:p(8000),name:'to',area:'a'}};
function setup(options={}){
 let now=0,selected=null;const files=options.files||new Map(),starts=[];
 const read=name=>files.get(name)||'',write=options.write||((name,text)=>{files.set(name,text);return true;});
 const s=new Survey({tasks:[task],build:{label:'test-dev'},root:'saved/',clock:()=>now,read,write,
  start:t=>{selected='survey:'+t.id;starts.push(t.id);},capture:()=>({routeVersion:1,target:{key:selected},trip:{legs:[{world:'w',provider:'native',searchDirection:'forward',points:[p(0),p(8000)]}]}})});
 const sample=(t,x=0,extra={})=>{now=t;s.sample({world:'w',context:'w/1',feet:p(x),physical:{mode:1,movementFloor:p(x)},targetKey:selected,routeVersion:1,...extra},!extra.menu,t);};
 const press=(key,t,allowed=true)=>{now=t;s.poll({light:false,defense:false},allowed,t-1);return s.poll({[key]:true},allowed,t);};
 const begin=()=>{for(let t=0;t<=800;t+=100)sample(t);assert.equal(s.active,null);press('light',800);assert.equal(s.active?.task.id,'T1');};
 return {s,files,sample,begin,starts,read,press};
}
test('field cards use exact audit identities, exclude already captured A01-A04 and leave coverage unchanged',()=>{
 const audit=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../authoring/roadbook-course-audit.json'))),resolved=cards.resolve(require(root+'/PBZRouteTables').data);
 assert.equal(resolved.length,47);
 for(const card of resolved){assert.ok(card.start.p&&card.end.p);assert.notEqual(card.start.id,card.end.id);
  if(card.worksheet){const row=audit.links.find(r=>r.id===card.worksheet);assert.equal(card.purpose,row.runtimeEnabled?'验证现有候选':'补连续几何');assert.equal(row.from,card.from);assert.equal(row.to,card.to);assert.ok(!['worksheet-014','worksheet-015','worksheet-016','worksheet-017'].includes(card.worksheet));}}
});
test('standing near a point never auto-starts; light attack requires the actual grounded start',()=>{
 const h=setup();for(let t=0;t<=1000;t+=100)h.sample(t,8000);assert.equal(h.s.active,null);
 for(let t=1100;t<=2200;t+=100)h.sample(t,0,{feet:p(0,400),physical:{mode:1,movementFloor:p(0,400)}});assert.equal(h.s.active,null);
 for(let t=2300;t<=3300;t+=100)h.sample(t,0,{menu:true});assert.equal(h.s.active,null);
 for(let t=3400;t<=4400;t+=100)h.sample(t,0,{physical:{mode:6,movementFloor:null}});assert.equal(h.s.active,null);
 for(let t=4500;t<=5300;t+=100)h.sample(t);assert.equal(h.s.active,null);h.press('light',5300);assert.equal(h.s.active?.task.id,'T1');
});
test('whole directed walk is chunked beyond the marker window and completion survives restart',()=>{
 const h=setup();h.begin();for(let t=900;t<=30900;t+=100){h.sample(t,Math.min(8000,(t-900)*.27));if(t===20000)h.s.event('user marker',{caseId:'problem-1'},t);}
 for(let t=31000;t<=32000;t+=100)h.sample(t,8000);
 assert.ok(h.s.active,'standing at end incorrectly auto-completed');h.press('light',32000);
 assert.equal(h.s.active,null);assert.equal(h.starts.length,1);assert.ok(h.s.completed.T1);
 const manifest=JSON.parse(h.read('saved/'+h.s.completed.T1.report));assert.equal(manifest.status,'completed');assert.ok(manifest.chunks.length>=6);assert.ok(manifest.sampleCount>280);
 const chunks=manifest.chunks.map(c=>JSON.parse(h.read('saved/'+c.file)));
 assert.equal(chunks.reduce((n,c)=>n+c.samples.length,0),manifest.sampleCount);assert.ok(chunks.some(c=>c.markers.some(e=>e.kind==='user marker')));
 assert.ok(manifest.observedMeters>=75);assert.ok(manifest.observedMeters<81);
 const again=setup({files:h.files});assert.equal(again.s.available('w').length,0);for(let t=0;t<=1000;t+=100)again.sample(t);assert.equal(again.s.active,null);
});
for(const [name,extra,t,x] of [['world',{world:'other',context:'other/1'},1000,10],['teleport',{},1000,7000],['sample gap',{},3000,10],['unavailable position',{feet:null},1000,10],['boat',{travel:{kind:'boat'}},1000,10],['dead or disabled movement',{physical:{mode:0}},1000,10]]){
 test(name+' closes the attempt as interrupted and never draws a synthetic connection',()=>{
  const h=setup();h.begin();h.sample(t,x,extra);assert.equal(h.s.active,null);assert.equal(h.s.completed.T1,undefined);
  const manifests=[...h.files].filter(([n])=>/survey-/.test(n)).map(([,s])=>JSON.parse(s));assert.equal(manifests[0].status,'interrupted');
  const samples=manifests[0].chunks.flatMap(c=>JSON.parse(h.read('saved/'+c.file)).samples);assert.equal(samples.length,1);
 });
}
test('wrong-floor and menu light presses cannot complete; a grounded end press does',()=>{
 const h=setup();h.begin();for(let t=900;t<=4900;t+=100)h.sample(t,Math.min(8000,(t-900)*2),{feet:p(Math.min(8000,(t-900)*2),400)});
 h.press('light',4900);assert.ok(h.s.active);
 for(let t=5000;t<=6000;t+=100)h.sample(t,8000,{menu:true});h.press('light',6000,false);assert.ok(h.s.active);assert.equal(h.s.completed.T1,undefined);
 for(let t=6100;t<=6900;t+=100)h.sample(t,8000);h.press('light',6900);assert.equal(h.s.active,null);assert.ok(h.s.completed.T1);
});
test('write failure cannot announce completion or permanently hide the card',()=>{
 const h=setup({write:()=>false});for(let t=0;t<=800;t+=100)h.sample(t);h.press('light',800);assert.equal(h.s.active,null);assert.equal(h.s.completed.T1,undefined);assert.equal(h.starts.length,0);assert.match(h.s.notice(800),/保存失败/);
});
test('restart marks an unfinished manifest interrupted and keeps committed chunks',()=>{
 const h=setup();h.begin();for(let t=900;t<=6100;t+=100)h.sample(t,Math.min(3000,t-900));
 const filename=h.s.active.file,committed=h.s.active.chunks.length;assert.ok(committed>0);
 const again=setup({files:h.files}),manifest=JSON.parse(again.read('saved/'+filename));assert.equal(manifest.status,'interrupted');assert.equal(manifest.chunks.length,committed);assert.equal(again.s.completed.T1,undefined);
});
test('heavy probe traffic is bounded without losing samples, planning or explicit drop counts',()=>{
 const h=setup();h.begin();h.s.event('planner finished',{ok:true},900);
 for(let i=0;i<10000;i++)h.s.event('walking probe rejected',{wall:i},900);
 h.s.finish('test interrupted',1000);const manifest=JSON.parse([...h.files].find(([n])=>/survey-/.test(n))[1]),chunk=JSON.parse(h.read('saved/'+manifest.chunks[0].file));
 assert.equal(chunk.samples.length,1);assert.equal(chunk.probes.length,128);assert.equal(chunk.dropped.probes,9872);assert.ok(chunk.events.some(e=>e.kind==='planner finished'));
});
test('a later chunk write failure leaves an explicit failed manifest and no completion progress',()=>{
 const files=new Map(),h=setup({files,write:(p,s)=>{if(p.includes('surveydata'))return false;files.set(p,s);return true;}});
 h.begin();h.s.finish('endpoint reached',1000);assert.equal(h.s.active,null);assert.equal(h.s.completed.T1,undefined);
 const manifest=JSON.parse([...files].find(([p])=>/survey-/.test(p))[1]);assert.equal(manifest.status,'write_failed');assert.match(h.s.notice(1000),/不计完成/);
});
test('task availability retains unfinished cards in their actual worlds',()=>{
 const h=setup();h.s.tasks=[...Array.from({length:4},(_,i)=>({...task,id:'A'+i,start:{...task.start,area:'a'}})),
  {...task,id:'B',start:{...task.start,area:'b'},end:{...task.end,area:'b'}}];
 assert.equal(h.s.available('w').length,5);assert.equal(h.s.available('other').length,0);
});
test('shared starts require selecting a numbered route; holding light cannot start or finish repeatedly',()=>{
 const h=setup();h.s.tasks.push({...task,id:'T2'});h.sample(0);h.press('light',100);assert.equal(h.s.active,null);assert.match(h.s.notice(100),/多条/);
 h.s.select('T2');h.sample(600);h.press('light',600);assert.equal(h.s.active.task.id,'T2');
 h.s.poll({light:true},true,700);assert.equal(h.starts.length,1);
});
test('map target changes preserve recording and defense returns a distinct personal-mistake action',()=>{
 const h=setup();h.begin();h.sample(1000,10,{targetKey:'item:another-endpoint'});assert.ok(h.s.active);
 assert.equal(h.press('defense',1000).kind,'player-mistake');assert.equal(h.s.poll({defense:true},true,1100),null);assert.ok(h.s.active);
});
