'use strict';
// Development archive only. Plain data in bounded rings; no OS input hooks,
// screenshots, network access, process readers or changes to navigation rules.
const copy=value=>JSON.parse(JSON.stringify(value));
const point=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)?{x:p.x,y:p.y,z:p.z}:null;
function fields(row,names){const out={};for(const name of names)if(row?.[name]!==undefined)out[name]=row[name];return out;}
function target(row){return row?{...fields(row,['key','world','area','bell','provider','item','label','name','title','survey','surveyRole','noTransfer']),p:point(row.p),start:point(row.start)}:null;}
function snapshot(S,planner,threads,notes){
 let remaining=20000;
 const points=rows=>{const count=rows?.length||0,taken=(rows||[]).slice(0,remaining).map(point).filter(Boolean);remaining-=taken.length;
  return {points:taken,total:count,truncated:taken.length<count};};
 const legs=(S.trip?.legs||[]).map((leg,index)=>({index,...fields(leg,['world','provider','searchDirection','partial','diagnostic','physicalVerified','verifiedEndIndex','meters','scenePartial','goalTopology']),
  ...(index===S.active?points(leg.points):{total:leg.points?.length||0,points:[],metadataOnly:true}),
  moves:(leg.moves||[]).map(m=>fields(m,['kind','guid','edge','from','to','p','end','pending','fold','scripted'])),
  checks:(leg.checks||[]).map(c=>fields(c,['kind','mode','guid','edge','from','to','a','b','first','last','verified','unknown'])),
  obstacles:(leg.obstacles||[]).map(o=>fields(o,['id','p','approach','edge','reason','label','unknown','locked']))}));
 return copy({target:target(S.manual||planner.job?.request||planner.failed),targetKey:S.targetKey||null,planningOrigin:point(S.captureOrigin),world:S.level,area:S.area,
  routeVersion:S.version,activeLeg:S.active,line:points(S.line),trip:{legs,transfer:S.trip?.transfer?{
   from:S.trip.transfer.from?.id,to:S.trip.transfer.to?.id,arrivalPending:S.trip.transfer.arrivalPending}:null},
  settings:S.cfg,travel:S.travelPhase||null,routeStatus:S.routeStatus,
  lockObservation:{version:S.lockVersion,scope:'Only returned map locks; absence does not prove unlocked or equipped',
   rows:(S.observedLocks||[]).map(row=>fields(row,['id','world','p','locked','unknown','requiredItems','requiredWeapons','requiredTags','requirements','weaponRequirements','requirementCount','source']))},
  planner:{pending:planner.pending,request:target(planner.job?.request),failed:target(planner.failed),stats:planner.stats,
   cpu:planner.job?.cpu,pumps:planner.job?.pumps,maxSlice:planner.job?.maxSlice},
  renderState:{threadEnd:point(S.threadEnd),attachment:threads?.attachment||null,branch:threads?.branch||null,branchOK:threads?.branchOK,hint:threads?.hint,motion:threads?.motion||null},
  rendered:(threads?.pool||[]).filter(r=>r.on&&r.meshOn!==false).map(r=>({points:r.__devPoints||[],total:r.__devTotal||0})),
  lastLogs:notes.slice(-100)});
}
class Recorder{
 constructor({build,root,write,report=()=>{},clock=Date.now}){
  Object.assign(this,{build,root,write,report,clock});this.session=new Date(clock()).toISOString().replace(/[^0-9TZ]/g,'');
  this.samples=[];this.events=[];this.probes=[];this.guideProbes=[];this.candidates=[];this.pending=[];this.down=true;this.lastMark=-Infinity;this.lastSample=-Infinity;this.count=0;this.context=null;
 }
 event(kind,data,now=this.clock()){
  const row={at:now,kind,data},group=kind==='walking probe rejected'?'probes':kind==='guide probe'?'guideProbes':kind==='native full candidate'?'candidates':'events';
  const rows=this[group],limit=group==='probes'||group==='guideProbes'?128:group==='candidates'?8:400;rows.push(row);
  this.observe?.(kind,data,now);
  while(rows.length>limit||rows[0]?.at<now-20000)rows.shift();
  if(group==='candidates')while(rows.length>1&&rows.reduce((n,r)=>n+(r.data.points?.length||0),0)>16000)rows.shift();
  for(const item of this.pending)if(item.context===this.context&&now<=item.until&&item.after[group].length<limit)item.after[group].push(row);
 }
 sample(row,now=this.clock()){
  const context=row.context;
  const previous=this.samples.at(-1),jump=previous?.feet&&row.feet&&Math.hypot(previous.feet.x-row.feet.x,previous.feet.y-row.feet.y,previous.feet.z-row.feet.z)>1200;
  const gap=previous&&now-previous.at>1000;
  if(this.context!==context||jump||gap){
   const reason=this.context!==context?'context changed':jump?'position discontinuity':'sampling gap';
   for(const item of this.pending)this.finish(item,reason);this.pending=[];
   const first=this.context===null;this.samples=[];this.events=[];this.probes=[];this.guideProbes=[];this.candidates=[];this.context=context;this.down=true;
   if(jump||gap)this.event('observation boundary',{reason,from:previous.feet,to:point(row.feet)},now);
   if(first)this.toast={until:now+6000,text:'开发版已启用：重攻击 Y 保存问题标记'};
  }
  if(now-this.lastSample<100)return;this.lastSample=now;
  const value={at:now,...row,feet:point(row.feet)};this.samples.push(value);
  while(this.samples.length>220||this.samples[0]?.at<now-20000)this.samples.shift();
  for(const item of this.pending)if(item.context===context&&now<=item.until&&item.after.samples.length<60)item.after.samples.push(value);
 }
 poll(down,allowed,capture,now=this.clock()){
  const rising=down&&!this.down;this.down=!!down;
  if(!allowed||!rising||now-this.lastMark<2000)return null;
  if(this.count>=100){this.toast={until:now+5000,text:'开发版：本次会话已保存100个标记，请重启后继续'};return null;}
  this.lastMark=now;return this.mark(capture(),now);
 }
 mark(state,now=this.clock(),markerKind='navigation-issue'){
  if(this.count>=100){this.toast={until:now+5000,text:'开发版：本次会话已保存100个标记，请重启后继续'};return {saved:false};}
  const number=++this.count,id=String(number).padStart(3,'0');
  const item={schema:1,caseId:this.session+'-'+id,build:this.build,at:new Date(now).toISOString(),
   label:markerKind==='player-mistake'?'User defense marker: player took a wrong turn':'User heavy-attack marker: investigate here',markerKind,context:this.context,surveyAttempt:this.survey?.active?.attemptId||null,
   before:{samples:this.samples.slice(),events:this.events.slice(),probes:this.probes.slice(),guideProbes:this.guideProbes.slice(),candidates:this.candidates.slice()},snapshot:state,
   after:{samples:[],events:[],probes:[],guideProbes:[],candidates:[],complete:false},until:now+5000};
  item.path=this.root+'PBZQuestRoute-dev-'+item.caseId+'.json';
  const saved=this.save(item);this.observe?.('user marker',{caseId:item.caseId,path:item.path,markerKind,at:now,saved},now);
  if(saved){this.pending.push(item);this.toast={until:now+4000,text:markerKind==='player-mistake'?'开发版：已保存个人误走标记 #'+id:'开发版：已保存问题标记 #'+id};}
  else this.toast={until:now+5000,text:'开发版：标记保存失败，请查看导航日志'};
  return {caseId:item.caseId,path:item.path,saved:item.saved};
 }
 save(item){
  try{
   const {saved,...data}=item;let text=JSON.stringify(data);
   // Preserve the current route and render geometry; trim only old event text.
   while(text.length>2500000&&item.before.events.length>16){item.before.events.splice(0,Math.ceil(item.before.events.length/2));item.eventsTruncated=true;text=JSON.stringify({...data,before:item.before,eventsTruncated:true});}
   if(text.length>2500000)throw Error('case exceeds bounded export size');
   if(this.write(item.path,text)===false)throw Error('file write/readback failed');
   item.saved=true;this.report('case '+item.caseId+' saved '+item.path);return true;
  }catch(error){item.saved=false;this.report('case save failed '+String(error));return false;}
 }
 finish(item,reason='post window complete'){
  item.after.complete=reason==='post window complete';item.after.reason=reason;this.save(item);
 }
 advance(now=this.clock()){
  const pending=[];for(const item of this.pending){if(now>=item.until)this.finish(item);else pending.push(item);}this.pending=pending;
 }
 notice(now=this.clock()){return now<this.toast?.until?this.toast.text:'';}
}
exports.Recorder=Recorder;exports.snapshot=snapshot;exports.target=target;
