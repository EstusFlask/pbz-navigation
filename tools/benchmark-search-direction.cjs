'use strict';
// Recorded endpoints + substituted open-space physics. Local CPU is reported
// separately; neither result reconstructs game collision, latency or FPS.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=root+'/Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute';
const R=require(source+'/PBZRouteCore'),H=require(source+'/PBZRouteWalkHints'),Local=require(source+'/PBZRouteLocalWalk'),Surface=require(source+'/PBZRouteSurface');
function run(job){let row,n=0;do{row=job.next();assert.ok(++n<1000000);}while(!row.done);return row.value;}
const events=JSON.parse(fs.readFileSync(root+'/build/field-1.2.6-a01-logs/events.json','utf8'));
const requests=events.filter(e=>e.phase==='nearby walking search').map(e=>({time:e.time,...e.data}));
const walking=requests.map(({time,start,goal})=>{
 const result={time,start,goal};
 for(const direction of ['forward','reverse']){
  let probes=0,samples=0,report;const began=performance.now();
  const world={rise:50,slope:1.43,floorAt:p=>p,step:(a,b)=>{probes++;samples+=Math.max(1,Math.ceil(R.xy(a,b)/35));return {p:b};}};
  const leg=run(Local.search(world,start,goal,{direction,hints:H.forWorld('pbz_xigu_wp'),hintsOnly:true,maxGraphNodes:768,maxChecks:64,
   maxMs:200,clock:()=>probes*.2,report:(_,value)=>report=value}));
  result[direction]={found:!!leg&&!leg.partial,meters:leg?.meters??null,expanded:report.expanded,checks:probes,samples,reason:report.reason,localCpuMs:+(performance.now()-began).toFixed(3)};
 }
 return result;
});
const g=new R.Graph(require(source+'/PBZRouteWorlds/pbz_xigu_wp').data,require(source+'/PBZRouteFaces/pbz_xigu_wp').faces);
const began=performance.now();run(g.incomingJob());const setupMs=performance.now()-began;
const bells=require(source+'/PBZRouteTables').data.bells,atlas=[];
function compare(row){
 for(const direction of ['forward','reverse']){
  const began=performance.now(),arcs=g.path(row.startNode,row.endNode,new Set(),{direction});
  row[direction]={found:!!arcs,cost:arcs?.reduce((n,a)=>n+g.weight[a<0?~a:a],0)??null,expanded:g.lastSearch.expanded,localCpuMs:+(performance.now()-began).toFixed(3)};
 }
 assert.equal(row.forward.found,row.reverse.found);assert.equal(row.forward.cost,row.reverse.cost,JSON.stringify(row));atlas.push(row);
}
for(const [from,to] of [['bell_nles_005','bell_nles_012'],['bell_nles_012','bell_nles_006'],['bell_nles_006','bell_nles_007'],['bell_nles_007','bell_nles_018']]){
 if(!bells[from]||!bells[to])continue;
 const a=bells[from].at,b=bells[to].at,start={x:a[0],y:a[1],z:a[2]},goal={x:b[0],y:b[1],z:b[2]};
 const starts=Surface.anchors(g,start),ends=Surface.anchors(g,goal,true);if(!starts.length||!ends.length)continue;
 const row={from,to,startNode:starts[0].id,endNode:ends[0].id};
 compare(row);
}
// Bell anchors alone can lie on disconnected islands until resident actions
// are added. Also compare actual reachable topology rather than count those
// early rejections as evidence of a faster search.
const counts=new Map();for(const id of g.strong)counts.set(id,(counts.get(id)||0)+1);
const largest=[...counts].sort((a,b)=>b[1]-a[1])[0][0],nodes=[];
for(let i=0;i<g.n;i++)if(g.strong[i]===largest)nodes.push(i);
for(let i=0;i<8;i++){
 const startNode=nodes[Math.floor(nodes.length*(i+1)/10)],endNode=nodes[Math.floor(nodes.length*(9-i)/10)];
 if(startNode!==endNode)compare({source:'largest-strong-component real atlas control',startNode,endNode});
}
const summary=Object.fromEntries(['forward','reverse'].map(direction=>[direction,{walkingFound:walking.filter(r=>r[direction].found).length,
 checks:walking.reduce((n,r)=>n+r[direction].checks,0),samples:walking.reduce((n,r)=>n+r[direction].samples,0),
 walkingExpanded:walking.reduce((n,r)=>n+r[direction].expanded,0),atlasExpanded:atlas.reduce((n,r)=>n+r[direction].expanded,0)}]));
const result={scope:'Recorded endpoints with open-space physics substitutes and real offline atlas. NOT game collision, elapsed-time or FPS evidence.',
 incomingIndex:{localSetupCpuMs:+setupMs.toFixed(3),bytes:g.incoming.off.byteLength+g.incoming.arc.byteLength,preparedDuringStreamedAtlasLoad:true},summary,walking,atlas};
const output=root+'/build/search-direction-140.json';fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,...result.incomingIndex,summary,atlas}));
