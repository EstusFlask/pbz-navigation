'use strict';
const R=require('./PBZRouteCore');
const point=(row,i)=>({x:row[i],y:row[i+1],z:row[i+2]});
function install(g){const task=installJob(g);while(!task.next().done){}}
function* installJob(g){
 if(g.dropsInstalled)return;
 const rows=require('./PBZRouteDropsData/'+g.name).rows;
 for(let i=g.dropCursor||0;i<rows.length;i++){const row=rows[i];
  const a=point(row,2),b=point(row,5),air={x:b.x,y:b.y,z:a.z+8};
  g.addLiveEdge(row[0],row[1],[g.pt(row[0]),a,air,b,g.pt(row[1])],
   {kind:'fall',guid:'drop:'+row[0]+':'+row[1],drop:true,p:a,end:b,walkIn:1,walkOut:3});
  g.dropCursor=i+1;if((g.dropCursor&127)===0)yield;
 }
 g.dropsInstalled=true;g.dropCursor=0;
}
// A candidate is not a bidirectional shortcut. A supported landing and a
// clear capsule through the outward movement AND descent are mandatory.
// Extended proposals require capabilities read from the current player.
function launchOptions(policy,mode,drop,preferred){
 const options=[],g=policy.gravityCm,v=policy.jumpVelocityCm;
 if(!(g>0&&policy.speedCm>0))return options;
 const maxRise=v>0?Math.max(0,v*v/(2*g)-20):0;
 const minimum=mode==='jump'?-maxRise:100,maximum=policy.maxJumpHeightCm??policy.maxHeightCm;
 if(policy.canJump===true&&v>0&&drop>=minimum&&drop<=maximum)
  options.push({v,minimum,maximum,launch:'jump',kind:mode==='jump'?'jump':'fall'});
 const runoff=policy.maxRunoffHeightCm??policy.maxHeightCm;
 if(policy.allowRunoff===true&&drop>=100&&drop<=runoff)
  options.push({v:0,minimum:100,maximum:runoff,launch:'runoff',kind:'fall'});
 // Keep a published walk-off if it still passes. A newly clear jump should
 // not replace the instruction or the trajectory beneath the player.
 if(preferred==='runoff')options.reverse();
 return options;
}
function* inspect(w,a,b,mode='fall',preferred){
 const policy=w.dropPolicy?.(),runLimit=policy?.maxRunCm??315,rawDrop=a.z-b.z;
 if(!policy&&typeof w.dropPolicy==='function')
  return {ok:false,unknown:true,p:a,why:'no current launch policy'};
 const launches=policy?launchOptions(policy,mode,rawDrop,preferred):null;
 const inRange=launches?launches.length>0:mode!=='jump'&&rawDrop>=100&&rawDrop<=310;
 if(!inRange||R.xy(a,b)>runLimit)return {ok:false,unknown:false,p:a,why:policy?'outside current safe drop envelope':'outside short drop envelope'};
 const locked=w.blockAt?.(a,b);if(locked)return{ok:false,unknown:false,p:locked.p,why:'locked passage',block:locked};
 const top=w.floorAt(a,true);yield;
 const bottom=w.floorAt(b,true);yield;
 if(!top||!bottom||Math.abs(top.z-a.z)>55||Math.abs(bottom.z-b.z)>55)return {ok:false,unknown:true,p:a,why:'drop support not loaded'};
 const radius=Math.max(20,Math.min(48,Number(w.r)||34));
 for(const [x,y] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
  const foot=w.floorAt({x:bottom.x+x,y:bottom.y+y,z:bottom.z});yield;
  if(!foot||Math.abs(foot.z-bottom.z)>42)return {ok:false,unknown:true,p:bottom,why:'drop landing too narrow or unsupported'};
 }
 if(policy){
  let first=w.standAt?w.standAt(top):top;const last=w.standAt?w.standAt(bottom):bottom;yield;
  if(!first||!last)return{ok:false,unknown:true,p:a,why:'drop capsule standing position unavailable'};
  const approach=[first],initial=first,direction=R.xy(first,last);
  // Recast erodes a ledge by the agent radius. It is not the physical
  // takeoff lip: follow checked floor towards it before testing flight.
  if(w.step&&direction>100)for(let distance=25;distance<=Math.min(175,direction-75);distance+=25){
   const expected={x:initial.x+(last.x-initial.x)*distance/direction,y:initial.y+(last.y-initial.y)*distance/direction,z:first.z},row=w.step(first,expected,false);yield;
   if(!row.p||Math.abs(row.p.z-initial.z)>55)break;
   const stood=w.standAt?w.standAt(row.p):row.p;yield;if(!stood)break;first=stood;approach.push(first);
  }
  const g=policy.gravityCm;
  let failure;
  // Preserve the preferred lip, then try earlier checked foot positions if
  // the last takeoff is blocked. The walk-in never passes the chosen launch.
  for(const {v,minimum,maximum,launch,kind} of launches)for(let takeoff=approach.length-1;takeoff>=0;takeoff--){
   first=approach[takeoff];
   if(takeoff+1<approach.length&&R.dist(first,approach[takeoff+1])<.1)continue;
   const fall=first.z-last.z,time=(v+Math.sqrt(v*v+2*g*fall))/g,run=R.xy(first,last);
   if(!(fall>=minimum&&fall<=maximum&&time>0&&run/time<=policy.speedCm)){
    failure??={ok:false,unknown:false,p:a,why:'drop exceeds current movement velocity'};continue;
   }
   const points=approach.slice(0,takeoff+1),steps=Math.max(2,Math.ceil((run+Math.abs(fall)+v*v/g)/35));let previous=first,blocked=false;
   for(let i=1;i<=steps;i++){
    const t=i/steps,next={x:first.x+(last.x-first.x)*t,y:first.y+(last.y-first.y)*t,z:first.z+v*time*t-.5*g*time*time*t*t};
    const locked=w.blockAt?.(previous,next);
    if(locked){failure??={ok:false,unknown:false,p:locked.p,why:'locked passage',block:locked};blocked=true;break;}
    const hit=w.airHit?w.airHit(previous,next):w.hit(previous,next,true);yield;
    if(hit){failure??={ok:false,unknown:false,obstructed:true,p:hit.point||previous,why:'drop trajectory capsule obstructed'};blocked=true;break;}
    points.push(next);previous=next;
   }
   if(!blocked)return{ok:true,points,walkIn:takeoff,launch,kind};
  }
  return failure;
 }
 const air={x:bottom.x,y:bottom.y,z:top.z+8};
 const out=w.hit(top,air,true);yield;
 if(out)return {ok:false,unknown:false,obstructed:true,p:out.point,normal:out.normal,why:'drop takeoff obstructed'};
 const down=w.hit(air,bottom,true);yield;
 if(down)return {ok:false,unknown:false,obstructed:true,p:down.point,normal:down.normal,why:'drop descent obstructed'};
 return {ok:true,points:[top,air,bottom]};
}
// The selected trajectory is part of the route. A new safe jump does not
// certify the old line when the takeoff, landing or movement policy changed.
function* recheck(w,check){
 const trajectory=check.trajectory;
 const result=yield* inspect(w,check.a,check.b,check.mode,trajectory?.launch);
 if(!result.ok||!trajectory)return result;
 const samePath=result.points.length===trajectory.points.length&&result.points.every((p,i)=>R.dist(p,trajectory.points[i])<=.1);
 if(samePath&&result.walkIn===trajectory.walkIn&&result.launch===trajectory.launch)return result;
 return {ok:false,unknown:false,trajectoryChanged:true,p:check.a,why:'drop trajectory changed'};
}
exports.recheck=recheck;
function check(w,a,b){const job=inspect(w,a,b);let row;do{row=job.next();}while(!row.done);return row.value;}
exports.install=install;exports.inspect=inspect;exports.check=check;

exports.installJob=installJob;
