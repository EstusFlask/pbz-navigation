'use strict';
const R=require('./PBZRouteCore'),Network=require('./PBZRouteBellNetwork'),Guides=require('./PBZRouteGuides');
const Data=require('./PBZRouteRoadbookData');
// Derived courses are candidates. They do not acquire the measured fixed
// guides' exemption from floor validation or become certified remote walks.
function* plan(w,world,dest,start,options={}){
 const courses=options.courses||Data.forWorld(world);
 if(!courses.length||!dest.bell||world!==dest.world)return null;
 const trip=yield* Network.plan(w,world,dest,start,{...options,courses,joinJob:Guides.joinJob,refreshActions:Guides.refreshActions});
 if(!trip)return null;
 const leg=trip.legs[0],meta=leg.guide;delete leg.guide;
 leg.roadbook=meta;leg.provider='roadbook';delete leg.physicalVerified;
 const definitions=new Map(courses.flatMap(c=>c.actions.map(m=>[String(m.guid).toLowerCase(),m])));
 for(const move of leg.moves){
  const source=definitions.get(String(move.guid).toLowerCase());
  if(source){move.requiresLive=source.requiresLive;move.referenceFirst=source.first;move.referenceLast=source.last;}
 }
 options.report?.('roadbook candidate',{courses:meta.courses,requiresSceneCheck:true});
 return trip;
}
exports.plan=plan;
exports.prepare=function(leg,g,w,passages){
 for(const move of leg.moves){
  if(move.kind==='fall')leg.checks.push({kind:12,edge:-1,a:move.p,b:move.end,from:move.from,to:move.to});
  if(!move.requiresLive)continue;
  const state=passages.referenceState?.(g,w,move);
  if(state?.ready!==true){move.block=state?.block||{unknown:true,label:'路书动作条件待确认'};continue;}
  delete move.block;
  if(state.path?.length)leg.checks.push({kind:9,mode:move.kind,guid:move.guid,edge:-1,a:move.p,b:move.end,
   first:state.path[0],last:state.path.at(-1),from:move.from,to:move.to});
 }
};
