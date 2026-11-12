'use strict';
// Real authored data audit. This deliberately makes no claim about live scene
// collision, current keys, folding ladders or streamed actor availability.
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const R=require(root+'/PBZRouteCore'),Surface=require(root+'/PBZRouteSurface'),tables=require(root+'/PBZRouteTables').data;
const point=bell=>({x:bell.at[0],y:bell.at[1],z:bell.at[2]});
function load(){return new R.Graph(require(root+'/PBZRouteWorlds/pbz_zhengdaodaying_wp').data,require(root+'/PBZRouteFaces/pbz_zhengdaodaying_wp').faces);}
function inspect(g,from,to){
 const start=point(from),goal=point(to),starts=Surface.anchors(g,start),ends=Surface.anchors(g,goal,true);
 const result={from:from.id,to:to.id,fromName:from.name,toName:to.name,starts:starts.map(r=>r.id),ends:ends.map(r=>r.id)};
 if(!starts.length||!ends.length)return {...result,status:'missing-anchor'};
 let connected=false,best=null;
 for(const a of starts)for(const b of ends){
  if(!g.sameComponent(a.id,b.id))continue;connected=true;
  const route=g.route(a.q,b.q,{startNode:a.id,endNode:b.id});
  if(route&&(!best||route.meters<best.meters))best=route;
 }
 return {...result,status:best?'candidate':connected?'no-directed-path':'disconnected-components',
  ...(best?{meters:+best.meters.toFixed(2),actions:best.moves.map(m=>({kind:m.kind,guid:m.guid||null})),checks:best.checks.length}:{}),
  liveVerification:'required'};
}
if(require.main===module){
 const g=load(),bells=Object.values(tables.bells).filter(b=>b.area==='lujiacun'),pairs=[];
 for(const from of bells)for(const to of bells)if(from!==to)pairs.push(inspect(g,from,to));
 const named=[['bell_sxc_01_11','bell_ljc_xiaozhang_002'],['bell_yxzr_003','bell_yxzr_004']]
  .flatMap(([a,b])=>[[a,b],[b,a]]).map(([a,b])=>inspect(g,tables.bells[a],tables.bells[b]));
 const counts={};for(const row of pairs)counts[row.status]=(counts[row.status]||0)+1;
 const report={world:g.name,bells:bells.length,directedPairs:pairs.length,counts,named,pairs,
  scope:'Original offline atlas only; no scene collision, inventory or live actor verification. A candidate is not proof of a traversable route.'};
 const output=path.resolve(__dirname,'../build/bell-route-audit.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output,bells:report.bells,directedPairs:report.directedPairs,counts,named},null,2));
}
exports.load=load;exports.inspect=inspect;exports.point=point;
