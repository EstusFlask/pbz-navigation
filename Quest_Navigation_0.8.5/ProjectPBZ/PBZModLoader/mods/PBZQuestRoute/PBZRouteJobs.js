'use strict';
// A generator yields to the engine between chunks of graph work. Only one
// planner owns the graph's temporary A* buffers at a time.
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const clock=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
class Planner {
 constructor(report=()=>{},timer=clock){this.report=report;this.clock=timer;this.job=null;this.failed=null;this.nextPump=0;this.stats={requests:0,pumps:0,maxSlice:0,steps:0};}
 same(a,b){return !!a&&!!b&&a.key===b.key&&a.world===b.world&&a.level===b.level&&dist(a.p,b.p)<190;}
 changed(a,b){return !this.same(a,b)||a.revision!==b.revision||a.originRevision!==b.originRevision||Math.abs(a.start.z-b.start.z)>=75||Math.hypot(a.start.x-b.start.x,a.start.y-b.start.y)>=1200;}
 stale(request){return !!this.job&&this.changed(this.job.request,request);}
 cancel(reason='cancelled'){
  const old=this.job;this.job=null;
  if(old){try{old.iterator.return?.();}catch(e){this.report('planner close',String(e));}this.report('planner cancelled',reason);}
 }
 clear(reason){this.cancel(reason);this.failed=null;}
 blocked(request){const f=this.failed;return this.same(f,request)&&f.revision===request.revision&&f.originRevision===request.originRevision&&Math.abs(f.start.z-request.start.z)<75&&dist(f.start,request.start)<600;}
 request(request,factory,done,force=false){
  const changed=this.stale(request);
  if(this.same(this.job?.request,request)&&!changed)return false;
  if(!force&&!changed&&this.blocked(request))return false;
  this.cancel('new target');this.stats.requests++;
  // Search budgets count execution, not time spent suspended between frames.
  // Keep the separate wall-time limit below for the whole request.
  const budget={cpu:0,active:null},searchClock=()=>budget.cpu+(budget.active===null?0:this.clock()-budget.active);
  const iterator=factory(searchClock);
  this.failed=null;
  this.job={request:{...request,start:{...request.start},p:{...request.p}},iterator,done,budget,started:this.clock(),cpu:0,pumps:0,maxSlice:0};
  this.report('planner queued',request.key);return true;
 }
 pump(){
  const t=this.clock();if(!this.job||t<this.nextPump)return false;
  this.nextPump=t+16;const job=this.job;let result,steps=0;job.budget.active=t;
  try{
   // Leave most of the game thread's frame for gameplay. The step bound also
   // works when a host has only a coarse millisecond clock.
   do{result=job.iterator.next();steps++;if(result.done)break;}while(steps<24&&this.clock()-t<1.25);
  }catch(error){
   job.budget.active=null;
   this.cancel('planner error');this.failed=job.request;this.report('planner error',String(error));job.done(null,job.request,{error:String(error)});return true;
  }
  const elapsed=this.clock()-t;job.budget.cpu+=elapsed;job.budget.active=null;job.cpu+=elapsed;job.pumps++;job.maxSlice=Math.max(job.maxSlice,elapsed);this.stats.pumps++;this.stats.steps+=steps;this.stats.maxSlice=Math.max(this.stats.maxSlice,elapsed);
  if(elapsed>50){
   this.cancel('slow native or setup step');this.failed=job.request;
   this.report('planner paused',job.request.key+' step='+Math.round(elapsed)+'ms; explicit retry required');
   job.done(null,job.request,{cpu:Math.round(job.cpu),wall:Math.round(this.clock()-job.started),paused:true});return true;
  }
  if(result.done){
   this.job=null;this.failed=result.value?null:job.request;
   const metrics={cpu:Math.round(job.cpu),wall:Math.round(this.clock()-job.started),pumps:job.pumps,maxSlice:+job.maxSlice.toFixed(2)};
   this.report('planner finished',job.request.key+' '+JSON.stringify(metrics)+' found='+!!result.value);job.done(result.value,job.request,metrics);
  }else if(this.clock()-job.started>30000){
   this.cancel('planning time limit');this.failed=job.request;job.done(null,job.request,{timeout:true,cpu:Math.round(job.cpu),wall:Math.round(this.clock()-job.started)});
  }
  return true;
 }
 get pending(){return !!this.job;}
}
exports.Planner=Planner;
