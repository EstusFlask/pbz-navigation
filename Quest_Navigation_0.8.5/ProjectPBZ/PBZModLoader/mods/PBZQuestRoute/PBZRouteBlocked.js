'use strict';
const R=require('./PBZRouteCore');
function fromFailure(source,failure,goal){
 const prefix=(failure.prefix||[source.points[0]]).filter(R.finite).map(p=>({...p}));
 if(!prefix.length)return null;
 const verifiedEndIndex=prefix.length-1,safe=prefix[verifiedEndIndex],points=prefix.slice();
 const tail=source.points.slice((failure.segment??0)+1);
 for(const p of tail)if(R.dist(points[points.length-1],p)>.1)points.push({...p});
 if(goal&&R.dist(points[points.length-1],goal)>1)points.push({...goal});
 if(points.length<2)points.push({...safe});
 const unknown=!!failure.unknown;
 const block={id:'route:blocked',world:source.world,p:failure.p||safe,approach:safe,edge:failure.edge??-1,
  icon:failure.locked?'locked':'barrier',unknown,locked:!!failure.locked,reason:failure.why||'route pending',
  label:failure.locked?'通道未解锁':unknown?'前方通路待确认':'此处受阻，正在尝试绕行'};
 const meta=failure.prefixLeg||{};
 return {...source,points,walks:meta.walks||prefix.slice(1).map((b,i)=>({a:prefix[i],b,from:i,to:i+1,edge:-1})),
  moves:meta.moves||[],gates:[],checks:[],obstacles:[block],locks:[block],
  diagnostic:true,partial:true,scenePartial:false,verifiedEndIndex,meters:R.extent(points)/100};
}
function auditLeg(leg){
 if(!leg.diagnostic)return leg;
 const n=leg.verifiedEndIndex;
 return {...leg,points:leg.points.slice(0,n+1),walks:(leg.walks||[]).filter(w=>w.to<=n),
  moves:(leg.moves||[]).filter(m=>m.to<=n),checks:[]};
}
function offer(context,leg,start,goal){
 if(!leg)return;
 const safe=leg.points[leg.verifiedEndIndex],remaining=R.dist(safe,goal),score=R.dist(start,goal)-remaining;
 if(context.best&&score<context.bestScore-1)return;
 context.best={legs:[leg],transfer:null};context.bestScore=score;
 context.onDiagnostic?.(context.best);
}
function finish(context){
 for(const leg of context.best?.legs||[])for(const b of leg.obstacles||[])if(!b.unknown&&!b.locked)b.label='此处受阻，暂未找到绕行路线';
 return context.best||null;
}
exports.fromFailure=fromFailure;exports.auditLeg=auditLeg;exports.offer=offer;exports.finish=finish;
