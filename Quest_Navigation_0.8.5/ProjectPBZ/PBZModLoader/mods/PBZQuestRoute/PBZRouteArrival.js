'use strict';
const R=require('./PBZRouteCore');
// Completion belongs to a selected destination, not to a renderer instance or
// route version. Replans, map opening and an emitter restart cannot undo it.
class Arrival{
 constructor(){this.reset();}
 reset(){this.goal=null;this.done=new Set();this.restart();}
 restart(){this.done.clear();this.completedTarget=null;this.probe=null;this.status='';}
 select(dest){if(!this.goal||this.goal.key!==dest.key||this.goal.world!==dest.world||R.dist(this.goal.p,dest.p)>190){
  this.goal={key:dest.key,world:dest.world,p:{...dest.p},item:!!dest.item};this.restart();}}
 key(S){const leg=S.trip?.legs[S.active];if(!leg)return '';
  const via=S.active===0&&S.trip.transfer?.from;return S.targetKey+'|'+leg.world+'|'+(via?'bell:'+via.id:'goal');}
 isDone(S){const key=this.key(S);return !!key&&(this.completedTarget===S.targetKey||this.done.has(key));}
 check(S,feet,end,now){
  const key=this.key(S);if(!key)return false;if(this.isDone(S))return true;
  const leg=S.trip.legs[S.active];
  if(leg.partial){this.status='route incomplete';return false;}
  if(S.level&&leg.world!==S.level)return false;
  if(this.goal?.item&&S.active===S.trip.legs.length-1&&
      (R.xy(feet,this.goal.p)>185||Math.abs(feet.z-this.goal.p.z)>230)){
   this.probe=null;this.status='outside collectible interaction range';return false;
  }
  const run=R.xy(feet,end),height=Math.abs(feet.z-end.z);
  if(run>185||height>125){this.probe=null;this.status=run>185?'range':'different floor';return false;}
  const gates=S.trip.legs[S.active].locks||[];
  if(gates.some(g=>{const dx=end.x-feet.x,dy=end.y-feet.y,t=((g.p.x-feet.x)*dx+(g.p.y-feet.y)*dy)/(dx*dx+dy*dy||1),q=R.lerp(feet,end,R.clamp(t));
   return t>0&&t<1&&R.xy(g.p,q)<110&&Math.abs(g.p.z-q.z)<200;})){
   this.probe=null;this.status='locked gate';return false;
  }
  if(!this.probe||this.probe.key!==key||R.dist(feet,this.probe.feet)>26||now-this.probe.at>180){
   // Stop short of the destination object's own collision (NPC / bell). The
   // player's capsule still sweeps the approach, so a closed door blocks it.
   const w=S.world,margin=Math.max(90,(w.r||40)*2+22),approach=R.lerp(feet,end,Math.max(0,(run-margin)/(run||1)));
   const obstruction=w.hit?.(feet,approach,true);
   const floor=w.floorAt?.(approach);
   const supported=!w.floorAt||!!floor&&Math.abs(floor.z-approach.z)<80,clear=!obstruction&&supported;
   this.status=obstruction?'blocked approach':!supported?'no matching floor':'settling';
   this.probe={key,feet:{...feet},at:now,clear,since:clear?(this.probe?.key===key&&this.probe.clear?this.probe.since:now):now};
  }
  if(!this.probe.clear||now-this.probe.since<100)return false;
  this.done.add(key);
  if(S.active===S.trip.legs.length-1)this.completedTarget=S.targetKey;
  this.status='arrived';return true;
 }
}
exports.Arrival=Arrival;
