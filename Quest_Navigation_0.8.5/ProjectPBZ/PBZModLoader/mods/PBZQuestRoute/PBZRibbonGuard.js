'use strict';
const R=require('./PBZRouteCore'),B=require('./PBZRibbonMath');
// Audit the exact static polyline that will be rendered. Work is shared across
// frames; a long route never releases an unchecked section in one burst.
class RibbonGuard{
 constructor(){this.rows=new Map();}
 reset(){this.rows.clear();}
 check(route,w,version,tiles,front,end,now,clock=Date.now){
  let budget=12,started=clock(),limit=front;
  for(let k=Math.floor(front/1100);k<Math.ceil(end/1100);k++){
   const a=k*1100,b=Math.min((k+1)*1100,route.length),tag=version+'/'+(tiles[k]||0);
   let row=this.rows.get(k);
   if(!row||row.tag!==tag||row.blocked&&front>row.safe+30){
    const ps=B.section(route,null,a,b)?.ps;if(!ps)break;
    row={tag,ps,a,b,safe:a,cursor:1,until:0};this.rows.set(k,row);
   }
   if(row.cursor>=row.ps.length&&now>=row.until){row.cursor=1;row.blocked=false;}
   while(row.cursor<row.ps.length&&budget>0){
    const i=row.cursor,s0=a+(b-a)*(i-1)/(row.ps.length-1),s1=a+(b-a)*i/(row.ps.length-1);
    if(s1<=front){row.safe=Math.max(row.safe,s1);row.cursor++;continue;}
    const p=s0<front?R.lerp(row.ps[i-1],row.ps[i],(front-s0)/(s1-s0)):row.ps[i-1];
    budget--;const hit=w.threadHit(p,row.ps[i]);
    if(hit){row.safe=Math.max(front,s0-12);row.blocked=true;row.cursor=row.ps.length;row.until=now+500;break;}
    row.safe=Math.max(row.safe,s1);row.cursor++;
    if(row.cursor===row.ps.length)row.until=now+900;
    if(clock()-started>=2){budget=0;break;}
   }
   limit=Math.min(end,Math.max(front,row.safe));
   if(row.blocked||limit<b-.1)break;
  }
  return limit;
 }
 section(k,a,b){
  const row=this.rows.get(k);if(!row||b-a<1)return null;
  const ps=[],n=row.ps.length-1,at=s=>{const t=R.clamp((s-row.a)/(row.b-row.a))*n,i=Math.min(n-1,Math.floor(t));return R.lerp(row.ps[i],row.ps[i+1],t-i);};
  ps.push(at(a));for(let i=1;i<n;i++){const s=row.a+(row.b-row.a)*i/n;if(s>a&&s<b)ps.push(row.ps[i]);}ps.push(at(b));
  return {ps,before:null,after:null};
 }
}
exports.RibbonGuard=RibbonGuard;
