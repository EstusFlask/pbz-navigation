'use strict';
const R=require('./PBZRouteCore');
function fromFailure(source,failure,goal){
 const prefix=(failure.prefix||[source.points[0]]).filter(R.finite).map(p=>({...p}));
 if(!prefix.length)return null;
 const verifiedEndIndex=prefix.length-1,safe=prefix[verifiedEndIndex],points=prefix.slice();
 const speculative=source.provider!=='atlas'||!failure.unknown,indices=new Map();
 // Raw provider chords beyond the measured frontier are not route guidance.
 // An authored corridor may remain on the map as a pending, dashed candidate.
 const segment=failure.segment??0;
 for(let i=0;i<=segment&&i<source.points.length;i++){
  let best=-1,d=201;for(let j=0;j<prefix.length;j++){const v=R.dist(source.points[i],prefix[j]);if(v<d){d=v;best=j;}}
  if(best>=0)indices.set(i,best);
 }
 if(!speculative)for(let i=segment+1;i<source.points.length;i++){
  const p=source.points[i];if(R.dist(points[points.length-1],p)>.1)points.push({...p});indices.set(i,points.length-1);
 }
 if(!speculative&&goal&&R.dist(points[points.length-1],goal)>1)points.push({...goal});
 if(points.length<2)points.push({...safe});
 const unknown=!!failure.unknown;
 const block={id:'route:blocked',world:source.world,p:failure.p||safe,approach:safe,edge:failure.edge??-1,
  icon:failure.locked?'locked':unknown?'mechanism':'barrier',unknown,locked:!!failure.locked,reason:failure.why||'route pending',
  label:failure.locked?'通道未解锁':unknown?'前方通路待确认':'此处受阻，正在尝试绕行',...failure.block};
 const meta=failure.prefixLeg||{};
 const moves=(meta.moves||[]).filter(m=>m.to<=verifiedEndIndex).map(m=>({...m}));
 if(!speculative)for(const m of source.moves||[]){
  const from=indices.get(m.from),to=indices.get(m.to);
  if(from===undefined||to===undefined||from>=to||moves.some(n=>n.edge===m.edge&&n.guid===m.guid&&n.kind===m.kind))continue;
  moves.push({...m,from,to,pending:to>verifiedEndIndex});
 }
 return {...source,points,walks:meta.walks||prefix.slice(1).map((b,i)=>({a:prefix[i],b,from:i,to:i+1,edge:-1})),
  moves,gates:source.gates||[],checks:[],obstacles:[block],locks:[block],
  diagnostic:true,partial:true,scenePartial:false,verifiedEndIndex,meters:R.extent(points)/100};
}
function auditLeg(leg){
 if(!leg.diagnostic)return leg;
 const n=leg.verifiedEndIndex;
 return {...leg,points:leg.points.slice(0,n+1),walks:(leg.walks||[]).filter(w=>w.to<=n),
  moves:(leg.moves||[]).filter(m=>m.to<=n),checks:[]};
}
function regressesFromActions(current,candidate,goal){
 if(!current||!candidate?.partial||!goal||current.world!==candidate.world)return false;
 const end=leg=>leg.diagnostic?leg.verifiedEndIndex:leg.points.length-1;
 const index=end(current),a=current.points[index],b=candidate.points[end(candidate)];
 if(!a||!b||!(current.moves||[]).some(m=>!m.pending&&m.to<=index))return false;
 // A longer pending walk away from the goal is not a better result than a
 // reached action chain. Complete checked alternatives remain eligible.
 return R.dist(b,goal)>R.dist(a,goal)+200;
}
function offer(context,leg,start,goal){
 if(!leg||context.bellTransfer)return;
 const rank=l=>l.provider==='atlas'?2:l.provider==='native'||l.provider==='direct'?0:1;
 const priority=rank(leg),previous=context.best?.legs[0];
 if(previous?.goalTopology&&!leg.goalTopology)return;
 if(regressesFromActions(previous,leg,goal))return;
 const safe=leg.points[leg.verifiedEndIndex],score=R.extent(leg.points.slice(0,leg.verifiedEndIndex+1));
 if(previous&&priority<rank(previous)&&(priority===0||score<context.bestScore+50))return;
 if(previous&&priority>=1&&score<context.bestScore-1)return;
 const old=context.best?.legs[0],oldSafe=old?.points[old.verifiedEndIndex],block=leg.obstacles?.[0],oldBlock=old?.obstacles?.[0];
 if(oldSafe&&score<context.bestScore+50&&R.dist(safe,oldSafe)<75&&block&&oldBlock&&
  block.unknown===oldBlock.unknown&&block.locked===oldBlock.locked&&R.dist(block.p,oldBlock.p)<75)return;
 context.best={legs:[leg],transfer:null};context.bestScore=score;
 context.onDiagnostic?.(context.best);
}
function finish(context){
 if(context.bellTransfer)return context.bellTransfer;
 for(const leg of context.best?.legs||[])for(const b of leg.obstacles||[])if(!b.unknown&&!b.locked)b.label='此处受阻，暂未找到绕行路线';
 return context.best||null;
}
// A prefix of a rejected straight/native candidate is collision evidence,
// not a discovered connection towards the destination. Keep its map marker.
function canGuide(leg){
 return !!leg&&!(leg.diagnostic&&['native','direct'].includes(leg.provider)&&
  !(leg.moves||[]).some(m=>!m.pending&&m.to<=leg.verifiedEndIndex));
}
function keepComplete(leg,world,foot,pending){
 if(!leg?.physicalVerified||leg.partial||leg.diagnostic||(leg.obstacles||[]).length||!world?.step)return false;
 const near=R.nearestOnLine(foot,leg.points);
 if(!near.p||near.d>260||Math.abs(near.p.z-foot.z)>75)return false;
 if((pending?.obstacles||[]).some(b=>!b.unknown&&(!R.finite(b.p)||R.nearestOnLine(b.p,leg.points).d<200)))return false;
 const join=world.step(foot,near.p,true);
 return !!join.p&&R.dist(join.p,near.p)<50;
}
exports.fromFailure=fromFailure;exports.auditLeg=auditLeg;exports.offer=offer;exports.finish=finish;exports.regressesFromActions=regressesFromActions;
exports.canGuide=canGuide;exports.keepComplete=keepComplete;
