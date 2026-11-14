'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
function run(job){let r,n=0;do{r=job.next();assert.ok(++n<100000);}while(!r.done);return r.value;}
test('endpoint repair joins a long atlas route to nearby stairs across a disconnected mesh island',()=>{
 const C=require(root+'/PBZRouteConnectivity');
 const points=[{x:0,y:0,z:0},{x:18000,y:0,z:0},{x:18000,y:0,z:500}],links=[];
 const g={n:3,walkNodes:3,bin:new Map([['5,0',0]]),cells:[5,0,0,2],order:[1,2],
  pt:i=>points[i],strong:[0,0,1],sameComponent:(a,b)=>a<2===b<2||links.length>0,
  addLiveEdge(a,b,ps,move){links.push({a,b,ps,move});return true;}};
 const floor=p=>p.x>=17930&&p.x<=18070&&p.y>=0&&p.y<=500?p.y:p.y>=430&&p.y<=570?500:p.y>=-70&&p.y<=70?0:null;
 const world={floorAt:p=>{const z=floor(p);return z===null?null:{...p,z};},
  step:(a,b)=>{const z=floor(b);return z!==null&&Math.abs(z-a.z)<=80?{p:{...b,z}}:{why:'wall'};}};
 const result=run(C.installJob(g,world,[{id:0}],[{id:2}],points[0],{x:18000,y:500,z:500},{clock:()=>0}));
 assert.ok(result>0,'a 180 m trip could not use a short local staircase at its destination');
 assert.equal(links[0].a,1);assert.equal(links[0].b,2);assert.equal(links[0].move.walk,true);
 assert.ok(links[0].ps.some(p=>p.z>0&&p.z<500));
 for(let i=1;i<links[0].ps.length;i++)assert.ok(world.step(links[0].ps[i-1],links[0].ps[i]).p);
});

test('the real cemetery-to-tomb atlas exposes short endpoint repair candidates without inventing a bridge',()=>{
 const audit=require('./audit-bells.cjs'),C=require(root+'/PBZRouteConnectivity'),Surface=require(root+'/PBZRouteSurface');
 const tables=require(root+'/PBZRouteTables').data,g=audit.load();
 const a=audit.point(tables.bells.bell_yxzr_003),b=audit.point(tables.bells.bell_yxzr_004);
 const starts=Surface.anchors(g,a),ends=Surface.anchors(g,b,true);
 assert.ok(starts.length&&ends.length);assert.equal(g.sameComponent(starts[0].id,ends[0].id),false);
 const candidates=run(C.candidatesJob(g,b,ends,starts));assert.ok(candidates.length);
 assert.ok(candidates.every(c=>g.sameComponent(c.id,starts[0].id)));
 assert.equal(g.liveEdges.length,0,'candidate discovery itself installed an unmeasured walking bridge');
});

test('a failed physical endpoint search cannot join disconnected platforms',()=>{
 const C=require(root+'/PBZRouteConnectivity');let added=0;
 const g={n:2,walkNodes:2,bin:new Map([['0,0',0]]),cells:[0,0,0,2],order:[0,1],strong:[0,1],
  pt:i=>({x:i*500,y:0,z:i*500}),sameComponent:(a,b)=>a===b,addLiveEdge(){added++;return true;}};
 const world={floorAt:p=>p,step:()=>({why:'solid wall'})};
 assert.equal(run(C.installJob(g,world,[{id:0}],[{id:1}],g.pt(0),g.pt(1),{clock:()=>0})),0);
 assert.equal(added,0);
});
