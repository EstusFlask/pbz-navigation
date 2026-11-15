'use strict';
// Development-only recording. No geometry is inserted into the navigation graph.
const copy=v=>JSON.parse(JSON.stringify(v));
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const near=(p,end)=>finite(p)&&Math.hypot(p.x-end.p.x,p.y-end.p.y)<=450&&Math.abs(p.z-end.p.z)<=150;
const empty=()=>({samples:[],events:[],markers:[],probes:[],guideProbes:[],candidates:[],snapshots:[],dropped:{}});
class Survey{
 constructor({tasks,build,root,write,read=()=>'',capture=()=>({}),start=()=>{},end=()=>{},clock=Date.now,report=()=>{}}){
  Object.assign(this,{tasks,build,root,write,read,capture,onStart:start,onEnd:end,clock,report});
  this.session=new Date(clock()).toISOString().replace(/[^0-9TZ]/g,'');this.count=0;this.active=null;this.completed={};this.blocked=new Set();
  this.version=0;this.totalCharacters=0;this.lastSample=-Infinity;this.candidate=null;this.last=null;
  this.statePath=root+'PBZQuestRoute-surveys.json';
  this.selected=null;this.held={light:true,defense:true};this.lastLight=-Infinity;this.lastDefense=-Infinity;
  try{const state=JSON.parse(read(this.statePath)||'{}');if(state.schema===1){
   for(const task of tasks)if(state.completed?.[task.id]?.revision===task.revision)this.completed[task.id]=state.completed[task.id];
   if(/^PBZQuestRoute-survey-[0-9TZ]+-\d{3}\.json$/.test(state.active||'')){const old=JSON.parse(read(root+state.active)||'{}');
    if(old.kind==='survey'&&old.status==='recording'){
     old.status='interrupted';old.reason='previous session ended before endpoint';old.endedAt=new Date(clock()).toISOString();
     this.put(root+state.active,old);this.report('recovered interrupted survey '+old.attemptId);
    }
   }
  }}catch(error){this.report('survey state read: '+String(error));}
 }
 put(path,data){
  const text=JSON.stringify(data);if(text.length>2500000)throw Error('survey file size limit');
  if(this.totalCharacters+text.length>64000000)throw Error('survey session size limit');
  if(this.write(path,text)===false)throw Error('survey write/readback failed');this.totalCharacters+=text.length;return text.length;
 }
 state(){return {schema:1,completed:this.completed,active:this.active?.file||null};}
 notice(now=this.clock()){
  if(now<this.toast?.until)return this.toast.text;
  if(this.active)return this.title(this.active.task)+' · 记录中 → '+this.active.task.end.name+'（终点轻攻击结束；重攻击标错；防御记误走）';
  if(this.selected){const task=this.tasks.find(t=>t.id===this.selected);if(task)return this.title(task)+' · 到开始点附近轻攻击开录';}
  return '';
 }
 tell(text,now){this.toast={text,until:now+6000};}
 title(task){return task.number?task.number+'号路线':'补采 '+task.id;}
 select(id){if(this.tasks.some(t=>t.id===id)){this.selected=id;this.version++;}}
 available(world){return this.tasks.filter(t=>(!world||t.world===world)&&!this.completed[t.id]&&!this.blocked.has(t.id));}
 event(kind,data,now=this.clock()){
  if(!this.active)return;
  const group=kind==='user marker'?'markers':kind==='walking probe rejected'?'probes':kind==='guide probe'?'guideProbes':kind==='native full candidate'?'candidates':'events';
  const rows=this.buffer[group],limit=group==='events'?256:group==='markers'?100:group==='candidates'?8:128;
  if(rows.length>=limit){this.buffer.dropped[group]=(this.buffer.dropped[group]||0)+1;return;}
  let row=copy({at:now,kind,data}),text=JSON.stringify(row);
  if(text.length>24000)row={at:now,kind,data:{truncated:true,totalCharacters:text.length,preview:text.slice(0,2000)}};
  rows.push(row);
 }
 checkpoint(now){
  const snapshot=copy(this.capture()),rows=this.buffer.snapshots;
  if(rows.length>=2){rows.splice(1);this.buffer.dropped.snapshots=(this.buffer.dropped.snapshots||0)+1;}
  rows.push({at:now,snapshot});this.lastCapture=now;
 }
 begin(task,row,now){
  if(this.count>=20||this.totalCharacters>=60000000){this.tell('补采已达到本次会话上限，请重启后继续',now);return;}
  const attemptId=this.session+'-'+String(++this.count).padStart(3,'0'),file='PBZQuestRoute-survey-'+attemptId+'.json';
  this.active={schema:1,kind:'survey',attemptId,build:this.build,task:copy(task),status:'recording',file,
   startedAt:new Date(now).toISOString(),context:row.context,trigger:{xyCm:450,zCm:150,input:'light attack'},chunks:[],sampleCount:0,observedMeters:0,
   scope:'Observed directed travel; unreviewed. No automatic navigation edge, reverse direction or shortest-path claim.'};
  this.buffer=empty();this.lastFlush=now;this.startTime=now;this.lastRecorded=null;this.lastVersion=undefined;this.endSince=null;
  try{
   // Write an initial manifest before changing the selected navigation target.
   this.put(this.root+file,this.active);this.put(this.statePath,this.state());
   this.onStart(task);this.checkpoint(now);this.version++;this.tell(this.title(task)+' 已开始记录 → '+task.end.name,now);
  }catch(error){this.fail(error,now);}
 }
 flush(now){
  if(!this.active||!this.buffer.samples.length&&!this.buffer.events.length&&!this.buffer.snapshots.length)return;
  const a=this.active,index=a.chunks.length+1,file='PBZQuestRoute-surveydata-'+a.attemptId+'-'+String(index).padStart(3,'0')+'.json';
  if(index>240)throw Error('survey chunk limit');
  const chunk={schema:1,kind:'survey-chunk',attemptId:a.attemptId,index,...this.buffer};
  // Keep samples intact. Overflow of repeated route snapshots is explicit.
  while(JSON.stringify(chunk).length>2400000&&chunk.snapshots.length){chunk.snapshots.pop();chunk.dropped.snapshots=(chunk.dropped.snapshots||0)+1;}
  const characters=this.put(this.root+file,chunk);
  a.chunks.push({file,index,characters,samples:chunk.samples.length,dropped:chunk.dropped});
  this.buffer=empty();this.lastFlush=now;this.put(this.root+a.file,a);
 }
 finish(reason,now=this.clock()){
  if(!this.active)return;
  try{
   this.checkpoint(now);this.flush(now);const a=this.active;
   a.status=reason==='endpoint reached'?'completed':'interrupted';a.reason=reason;a.endedAt=new Date(now).toISOString();
   this.put(this.root+a.file,a);
   if(a.status==='completed')this.completed[a.task.id]={revision:a.task.revision,report:a.file,at:a.endedAt};
   else this.blocked.add(a.task.id);
   this.active=null;this.version++;this.candidate=null;this.onEnd(a);if(this.selected===a.task.id)this.selected=null;
   this.tell(a.status==='completed'?this.title(a.task)+' 已结束并保存，等待分析':this.title(a.task)+' 已中断保存：'+reason,now);
   try{this.put(this.statePath,this.state());}catch(error){this.report('survey progress write failed: '+String(error));this.tell('补采文件已保存，进度保存失败；请查看日志',now);}
  }catch(error){this.fail(error,now);}
 }
 fail(error,now){
  const a=this.active;if(a){this.blocked.add(a.task.id);a.status='write_failed';a.reason=String(error);
   try{this.put(this.root+a.file,a);}catch(_){}this.active=null;this.version++;this.onEnd(a);}
  this.candidate=null;this.report('survey failed: '+String(error));this.tell('补采保存失败，请查看导航日志；本次不计完成',now);
 }
 poll(input,allowed,now=this.clock()){
  const light=!!input.light&&!this.held.light,defense=!!input.defense&&!this.held.defense;
  this.held={light:!!input.light,defense:!!input.defense};
  if(!allowed){this.held={light:true,defense:true};return null;}
  const row=this.last;if(!row||now-row.at>300)return null;
  if(defense&&this.active&&now-this.lastDefense>=1000){this.lastDefense=now;return {kind:'player-mistake'};}
  if(!light||now-this.lastLight<350)return null;this.lastLight=now;
  const grounded=finite(row.feet)&&row.physical?.mode===1&&finite(row.physical?.movementFloor);
  if(!grounded){this.tell('补采：请落地后在开始/结束点附近轻攻击',now);return null;}
  if(this.active){
   if(row.world!==this.active.task.world||!near(row.feet,this.active.task.end)){this.tell(this.title(this.active.task)+' 记录中；到对应结束点附近轻攻击结束',now);return null;}
   this.record(row,true,now);this.active.completionInput={kind:'light attack',at:now,feet:copy(row.feet)};this.finish('endpoint reached',now);return {kind:'completed'};
  }
  const nearby=this.available(row.world).filter(t=>near(row.feet,t.start));
  const task=this.selected?nearby.find(t=>t.id===this.selected):nearby.length===1?nearby[0]:null;
  if(!task){if(nearby.length>1)this.tell('此处有多条路线：先在地图选择对应编号的开始或结束标记',now);
   else if(this.selected)this.tell('请到所选路线的开始点附近轻攻击',now);return null;}
  this.begin(task,row,now);if(this.active){this.record({...row,targetKey:'survey:'+task.id},true,now);return {kind:'started',task:task.id};}return null;
 }
 record(row,allowed,now){
  const a=this.active;if(!a)return;
  this.buffer.samples.push(copy({...row,at:now,menu:!allowed}));a.sampleCount++;
  if(this.lastRecorded&&finite(row.feet))a.observedMeters+=distance(this.lastRecorded,row.feet)/100;
  this.lastRecorded=finite(row.feet)?{...row.feet}:null;
 }
 sample(row,allowed,now=this.clock()){
  if(now-this.lastSample<100)return;this.lastSample=now;
  const previous=this.last;this.last=copy({...row,at:now});
  for(const id of this.blocked){const task=this.tasks.find(t=>t.id===id);if(task&&(row.world!==task.world||!near(row.feet,task.start))){this.blocked.delete(id);this.version++;}}
  const boundary=previous&&(row.context!==previous.context?'context changed':now-previous.at>1000?'sampling gap':
   row.travel?.kind==='boat'||row.travel?.kind==='ride'?'vehicle movement':
   row.physical?.mode===0?'movement unavailable':
   !finite(row.feet)||!finite(previous.feet)?'position unavailable':distance(row.feet,previous.feet)>1200?'position discontinuity':null);
  if(boundary&&this.active){this.event('observation boundary',{reason:boundary,from:previous.feet,to:row.feet},now);this.finish(boundary,now);return;}
  if(!this.active)return;
  const a=this.active;
  try{
   if(row.world!==a.task.world){this.finish('world changed',now);return;}
   this.record(row,allowed,now);
   if(now-this.lastCapture>=1000&&row.routeVersion!==this.lastVersion){this.checkpoint(now);this.lastVersion=row.routeVersion;}
   if(now-this.startTime>=1200000){this.finish('20 minute recording limit',now);return;}
   if(now-this.lastFlush>=5000)this.flush(now);
  }catch(error){this.fail(error,now);}
 }
}
exports.Survey=Survey;exports.near=near;
