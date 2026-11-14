'use strict';
// Algorithm-work comparison on recorded requests. This is deliberately not a
// game collision reconstruction or an elapsed-time/FPS benchmark.
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),get=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const root=path.resolve(__dirname,'..'),source=path.resolve(get('--source',root+'/Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute'));
const events=JSON.parse(fs.readFileSync(path.resolve(get('--events',root+'/build/field-1.2.6-a01-logs/events.json')),'utf8'));
const Local=require(source+'/PBZRouteLocalWalk'),Hints=require(source+'/PBZRouteWalkHints');
const rows=[];
for(const event of events.filter(r=>r.phase==='nearby walking search')){
 const {start,goal}=event.data;let probes=0,floors=0,samples=0,report,result,iterations=0;
 const world={rise:50,slope:1.43,floorAt:p=>{floors++;return p;},step:(a,b)=>{probes++;samples+=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/35));return {p:b};}};
 const job=Local.search(world,start,goal,{hints:Hints.forWorld('pbz_xigu_wp'),hintsOnly:true,maxNodes:192,maxGraphNodes:768,maxChecks:64,maxMs:200,
  clock:()=>probes*.2,report:(phase,data)=>report=data});
 do{result=job.next();if(++iterations>100000)throw new Error('unbounded algorithm replay');}while(!result.done);
 rows.push({time:event.time,start,goal,found:!!result.value,meters:result.value?.meters??null,stepChecks:probes,floorQueries:floors,
  sampled35cmSegments:samples,expanded:report?.expanded,reason:report?.reason,proposals:report?.proposals??null});
}
const value={scope:'Open-space candidate graph and validation-operation model, NOT game collision, elapsed-time or FPS',
 model:{stepExecutionCostMs:.2,maxExecutionMs:200,legacyExpandedPhysicalNodes:192,newGraphNodes:768,newPhysicalChecks:64},source,queries:rows};
const out=get('--output');if(out)fs.writeFileSync(path.resolve(out),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({source:source.split(path.sep).at(-1),queries:rows.length,found:rows.filter(r=>r.found).length,
 stepChecks:rows.reduce((n,r)=>n+r.stepChecks,0),sampled35cmSegments:rows.reduce((n,r)=>n+r.sampled35cmSegments,0),rows:rows.map(r=>({time:r.time,found:r.found,stepChecks:r.stepChecks,reason:r.reason}))}));
