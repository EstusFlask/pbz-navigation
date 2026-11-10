"use strict";
const HOLD=600,DRAG=9;
// Only a press which started on the map paper owns a matching release.
class MapPress{
 constructor(){this.press=null;this.lastDown=false;this.suppress=false;this.fallbackUntil=0;}
 reset(down=false){this.press=null;this.lastDown=down;this.suppress=down;this.fallbackUntil=0;}
 sample({now,down,pulse=false,device,uv,width,height,allowed}){
  const rising=down&&!this.lastDown;this.lastDown=down;
  if(!allowed||!uv||!Number.isFinite(uv.x+uv.y)){this.reset(down);return null;}
  if(this.suppress){if(!down)this.suppress=false;return null;}
  if(rising||pulse&&!this.press&&now>=this.fallbackUntil){
   this.press={at:now,device,uv:{...uv},native:down,cancel:false,handed:false};
  }
  const p=this.press;if(!p)return null;
  if(down)p.native=true;
  if(p.device!==device||Math.hypot((p.uv.x-uv.x)*width,(p.uv.y-uv.y)*height)>DRAG)p.cancel=true;
  if(down&&now-p.at>=HOLD&&!p.cancel&&!p.handed){p.handed=true;return {type:'clear'};}
  if(!down&&(p.native||now-p.at>=100)){
   this.press=null;this.fallbackUntil=now+130;
   if(!p.cancel&&!p.handed)return {type:'pin',uv:p.uv};
  }
  return null;
 }
}
exports.MapPress=MapPress;
