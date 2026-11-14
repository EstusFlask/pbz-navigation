'use strict';
const R=require('./PBZRouteCore');
// Read only authored components/vectors. An actor origin, direction arrow or
// decoration spline alone cannot establish the opposite side of a movement.
function extract(actor,kind,{location,curve,point}){
 const read=name=>{
  try{
   const value=actor[name],p=location(name)||point(value?.Translation||value);
   if(R.finite(p))return p;
  }catch(_){}
  return null;
 };
 const first=(...names)=>names.map(read).find(R.finite)||null;
 const pole=ref=>{
  if(!ref)return null;
  try{return point(ref.StandPoint?.K2_GetComponentLocation?.());}catch(_){return null;}
 };
 let points;
 switch(kind){
  case 'wallrun':points=[first('StartPositionA','BoxA'),first('EndPositionStaticA','BoxB')];break;
  case 'walljump':points=[first('Box','BoxA'),read('EndPositionStatic')];break;
  case 'vault':points=[read('StartLedge'),read('EndLedge')];break;
  case 'pole':{
   const a=pole(actor.LinkedPoleA),b=pole(actor.LinkedPoleB),warp=read('WarpTarget');
   points=warp?[a,warp,b]:[a,b];break;
  }
  case 'boarding':{
   let end;try{end=point(actor.GetMoveToBoatLocation?.());}catch(_){}
   points=[first('MoveToPoint','InteractionPoint'),end];break;
  }
  // ThroughHoleFree exposes Box/InDir but its far-side target is calculated
  // by the movement ability. Direction/box size does not prove an exit.
  case 'crawl':case 'portal':case 'boat':case 'ride':case 'chase':return null;
  default:return null;
 }
 return points?.length>=2&&points.every(R.finite)&&R.dist(points[0],points.at(-1))>=36?points:null;
}
exports.extract=extract;
