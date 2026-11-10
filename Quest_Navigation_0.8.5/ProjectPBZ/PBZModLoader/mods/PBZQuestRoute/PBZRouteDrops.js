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
// Larger drops remain the responsibility of authored traversal actors.
function* inspect(w,a,b){
 if(a.z-b.z<100||a.z-b.z>310||R.xy(a,b)>315)return {ok:false,unknown:false,p:a,why:'outside short drop envelope'};
 const top=w.floorAt(a,true);yield;
 const bottom=w.floorAt(b,true);yield;
 if(!top||!bottom||Math.abs(top.z-a.z)>55||Math.abs(bottom.z-b.z)>55)return {ok:false,unknown:true,p:a,why:'drop support not loaded'};
 const radius=Math.max(20,Math.min(48,Number(w.r)||34));
 for(const [x,y] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
  const foot=w.floorAt({x:bottom.x+x,y:bottom.y+y,z:bottom.z});yield;
  if(!foot||Math.abs(foot.z-bottom.z)>42)return {ok:false,unknown:true,p:bottom,why:'drop landing too narrow or unsupported'};
 }
 const air={x:bottom.x,y:bottom.y,z:top.z+8};
 const out=w.hit(top,air,true);yield;
 if(out)return {ok:false,unknown:false,p:out.point,normal:out.normal,why:'drop takeoff obstructed'};
 const down=w.hit(air,bottom,true);yield;
 if(down)return {ok:false,unknown:false,p:down.point,normal:down.normal,why:'drop descent obstructed'};
 return {ok:true,points:[top,air,bottom]};
}
function check(w,a,b){const job=inspect(w,a,b);let row;do{row=job.next();}while(!row.done);return row.value;}
exports.install=install;exports.inspect=inspect;exports.check=check;

exports.installJob=installJob;
