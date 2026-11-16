// Platform-neutral Recast/Detour query adapter. No filesystem, browser or Node API.
import { init, importNavMesh, NavMeshQuery, Detour, statusSucceed,UnsignedCharArray,Raw } from 'recast-navigation';
import {navHeader} from './nav-set.mjs';
export { navHeader,parseNavSet,assembleNavSet,selectVariants,decodeBase64 } from './nav-set.mjs';

export function capabilities(){
 const w=globalThis.WebAssembly;
 return !!w&&typeof w.Module==='function'&&typeof w.Instance==='function'&&
  typeof w.Memory==='function'&&typeof w.Table?.prototype?.get==='function';
}
export async function initialize(moduleFactory){
 if(!moduleFactory&&!capabilities())throw Error('Standard WebAssembly is unavailable; navigation remains disabled');
 await init(moduleFactory);
}
function valid(point){return Array.isArray(point)&&point.length===3&&point.every(v=>Number.isFinite(v)&&Math.abs(v)<1e10);}
function toNav(p,o){return{x:(p[0]-o[0])/100,y:(p[2]-o[2])/100,z:-(p[1]-o[1])/100};}
function fromNav(p,o){return[o[0]+p.x*100,o[1]-p.z*100,o[2]+p.y*100];}
function distance(a,b){return Math.hypot(...a.map((v,k)=>v-b[k]));}

export class Planner{
 constructor(bytes,metadata,options={}){
  if(!valid(metadata.originUE)||metadata.engine!=='recast-navigation@0.44.0')throw Error('Unsupported navigation metadata');
  this.origin=metadata.originUE;this.metadata=metadata;
  this.navMesh=importNavMesh(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes)).navMesh;
  this.query=new NavMeshQuery(this.navMesh,{maxNodes:options.maxNodes??65535});this.destroyed=false;this.jobs=new Set();
  this.header=navHeader(bytes);this.tileBuffers=new Map();
 }
 replaceTile(slot,value){
  if(this.destroyed||this.header.tiles!==0||!Number.isInteger(slot)||slot<0||slot>=this.header.maxTiles)throw Error('Invalid conditional tile update');
  this.cancelQueries();const ref=this.header.maxTiles*this.header.maxPolys+slot*this.header.maxPolys,old=this.tileBuffers.get(slot);
  if(old){const result=this.navMesh.removeTile(ref);try{if(!statusSucceed(result.raw.status))throw Error('Detour tile removal failed');}finally{Raw.destroy(result.raw);}old.destroy();this.tileBuffers.delete(slot);}
  if(!value)return;
  // flags=0: the adapter owns the byte array until removal or graph disposal.
  // Keeping its wrapper alive avoids both dangling pointers and double frees.
  const data=new UnsignedCharArray();data.copy(value instanceof Uint8Array?value:new Uint8Array(value));
  const result=this.navMesh.addTile(data,0,ref);
  if(!statusSucceed(result.status)||result.tileRef!==ref){data.destroy();throw Error('Detour conditional tile insertion failed');}
  this.tileBuffers.set(slot,data);
 }
 route(start,goal,options={}){
  const job=this.routeJob(start,goal,options);let row;
  do{row=job.next();}while(!row.done);
  return row.value;
 }
 routeJob(start,goal,options={}){
  const owner=this;let job;
  job=(function*(){try{return yield* owner._routeJob(start,goal,options);}finally{owner.jobs.delete(job);}})();
  this.jobs.add(job);return job;
 }
 *_routeJob(start,goal,options={}){
  if(this.destroyed||!valid(start)||!valid(goal))throw Error('Invalid navigation request');
  const q=this.query,halfExtents={x:(options.horizontalProjectionCm??100)/100,y:(options.verticalProjectionCm??75)/100,z:(options.horizontalProjectionCm??100)/100};
  const first=q.findNearestPoly(toNav(start,this.origin),{halfExtents}),last=q.findNearestPoly(toNav(goal,this.origin),{halfExtents});
  let path,straight,surface,complete=false,reason='endpoint missing',corners=[],points=[],heightFailure=null;
  const free=value=>{value?.straightPath.destroy();value?.straightPathFlags.destroy();value?.straightPathRefs.destroy();};
  try{
   if(first.success&&last.success&&first.nearestRef&&last.nearestRef){
    path=q.findPath(first.nearestRef,last.nearestRef,first.nearestPoint,last.nearestPoint,{maxPathPolys:options.maxPolygons??16384});
    yield;
    const n=path.polys.size;
    if(path.success&&n){
     const finalRef=path.polys.get(n-1),end=finalRef===last.nearestRef?last.nearestPoint:q.closestPointOnPoly(finalRef,last.nearestPoint).closestPoint;
     straight=q.findStraightPath(first.nearestPoint,end,path.polys,{maxStraightPathPoints:16384});
     if(straight.success)for(let i=0;i<straight.straightPathCount;i++)corners.push(fromNav({x:straight.straightPath.get(i*3),y:straight.straightPath.get(i*3+1),z:straight.straightPath.get(i*3+2)},this.origin));
     // Standard Detour all-crossings output identifies each traversed polygon.
     // Sample its detail height instead of drawing long chords through ramps.
     surface=q.findStraightPath(first.nearestPoint,end,path.polys,{maxStraightPathPoints:16384,straightPathOptions:2});
     let supported=surface.success;
     if(surface.success)for(let i=0;i<surface.straightPathCount-1;i++){
      const a={x:surface.straightPath.get(i*3),y:surface.straightPath.get(i*3+1),z:surface.straightPath.get(i*3+2)},
       b={x:surface.straightPath.get((i+1)*3),y:surface.straightPath.get((i+1)*3+1),z:surface.straightPath.get((i+1)*3+2)};
      const ref=surface.straightPathRefs.get(i)||path.polys.get(Math.min(i,n-1)),steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)*100/(options.spacingCm??50)));
      for(let j=0;j<steps;j++){
       if(points.length>=16384){supported=false;break;}
       const t=j/steps,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},h=q.getPolyHeight(ref,p);
       if(!h.success){
        const projected=q.closestPointOnPoly(ref,p),shift=projected.success?Math.hypot(projected.closestPoint.x-p.x,projected.closestPoint.z-p.z):Infinity;
        // Portal points can lie a floating-point epsilon outside the entering
        // polygon. Clamp only to that same polygon, never a different floor.
        if(!projected.success||shift>.02){supported=false;heightFailure={ref,point:fromNav(p,this.origin),horizontalClampCm:shift*100};break;}
        p.x=projected.closestPoint.x;p.y=projected.closestPoint.y;p.z=projected.closestPoint.z;
       }else p.y=h.height;
       const value=fromNav(p,this.origin);if(!points.length||distance(points.at(-1),value)>.1)points.push(value);
       if(points.length%32===0)yield;
      }
      if(!supported)break;
     }
     if(supported)points.push(fromNav(end,this.origin));
     const bad=Detour.DT_PARTIAL_RESULT|Detour.DT_OUT_OF_NODES|Detour.DT_BUFFER_TOO_SMALL;
     complete=finalRef===last.nearestRef&&points.length>1&&supported&&statusSucceed(path.status)&&!(path.status&bad)&&straight.success&&!(straight.status&bad)&&!(surface.status&bad);
     reason=complete?'complete':!supported?'corridor height unavailable':finalRef!==last.nearestRef?'disconnected':'query budget or buffer';
    }else reason='no corridor';
   }
   const projectedStart=first.nearestRef?fromNav(first.nearestPoint,this.origin):null,projectedGoal=last.nearestRef?fromNav(last.nearestPoint,this.origin):null;
   return{schema:1,provider:'recast',searchDirection:'forward',complete,partial:!complete,reason,points,corners,
    start,goal,projectedStart,projectedGoal,startProjectionErrorCm:projectedStart?distance(start,projectedStart):null,
    goalProjectionErrorCm:projectedGoal?distance(goal,projectedGoal):null,corridorPolygons:path?.polys.size??0,
    pathStatus:path?.status??0,straightStatus:straight?.status??0,meters:points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0)/100,
    heightFailure,physicalVerified:false};
  }finally{path?.polys.destroy();free(straight);free(surface);}
 }
 cancelQueries(){for(const job of [...this.jobs])job.return();this.jobs.clear();}
 destroy(){if(!this.destroyed){this.cancelQueries();this.query.destroy();this.navMesh.destroy();for(const data of this.tileBuffers.values())data.destroy();this.tileBuffers.clear();this.destroyed=true;}}
}
