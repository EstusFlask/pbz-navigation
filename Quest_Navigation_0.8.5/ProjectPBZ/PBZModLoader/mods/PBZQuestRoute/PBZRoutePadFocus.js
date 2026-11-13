'use strict';
const directions={Gamepad_DPad_Left:[-1,0],Gamepad_DPad_Right:[1,0],Gamepad_DPad_Up:[0,-1],Gamepad_DPad_Down:[0,1]};
class PadFocus{
 constructor(){this.states=new WeakMap();this.inputs=new WeakMap();}
 release(host){this.states.delete(host);}
 clear(host){this.release(host);this.inputs.delete(host);}
 resetInput(host){this.inputs.delete(host);}
 input(host,key,down,now){
  let keys=this.inputs.get(host);
  if(!keys){if(!down)return null;keys=new Map();this.inputs.set(host,keys);}
  const old=keys.get(key);
  if(!down){keys.delete(key);return null;}
  if(old&&now<old.next)return {state:old,fire:false};
  const state={next:now+(old?180:350),handled:old?.handled||false};keys.set(key,state);
  return {state,fire:true,repeat:!!old};
 }
 current(host,width,height){
  const state=this.states.get(host),p=host.FocusPoint;
  if(!state)return null;
  if(state.area!==String(host.CurrentDisplayMapID).toLowerCase()||state.layer!==host.CurrentLayer||!p||
   !(width>0&&height>0)||!Number.isFinite(Number(p.X)+Number(p.Y))||
   Math.hypot((Number(p.X)-state.item.uv.x)*width,(Number(p.Y)-state.item.uv.y)*height)>2||
   Number(host.timeSinceAxisInput)<.12){this.release(host);return null;}
  return state.item;
 }
 move(host,items,key,width,height,now,repeat=false){
  const dir=directions[key];if(!dir)return null;
  this.current(host,width,height);
  const previous=this.states.get(host);
  if(repeat&&previous?.key===key&&now-previous.at<180&&items.some(p=>p.id===previous.item.id))return previous.item;
  const origin=host.FocusPoint;if(!origin)return null;
  let best=null,score=Infinity,side=Infinity;
  for(const item of items){
   const dx=(item.uv.x-Number(origin.X))*width,dy=(item.uv.y-Number(origin.Y))*height;
   const forward=dx*dir[0]+dy*dir[1],lateral=Math.abs(dx*dir[1]-dy*dir[0]),distance=dx*dx+dy*dy;
   if(forward<=2||lateral>forward+.01)continue;
   if(distance<score-.01||Math.abs(distance-score)<=.01&&(lateral<side||lateral===side&&String(item.id)<String(best?.id))){
    best=item;score=distance;side=lateral;
   }
  }
  if(best)this.states.set(host,{item:best,area:String(host.CurrentDisplayMapID).toLowerCase(),layer:host.CurrentLayer,at:now,key});
  return best;
 }
}
exports.PadFocus=PadFocus;exports.directions=directions;
