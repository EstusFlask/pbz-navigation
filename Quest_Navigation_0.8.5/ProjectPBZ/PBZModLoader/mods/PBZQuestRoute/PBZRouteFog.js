"use strict";
const {decode}=require("./PBZRouteCore"),regions=require("./PBZRouteFogAtlas").data;
const cached=new Map();
const alias={houjie:"pangzhen",huanshushi:"meiguhu",duanhunya:"duanhunshan",xuesesenlin:"fujizhilin",test:"zhengdaodaying"};
const chart=s=>alias[s]||s;
function locate(area,uv,cleared,valid){
 if(!Number.isFinite(uv?.x+uv?.y)||!uv.x&&!uv.y)return null;
 area=chart(area);let rows=cached.get(area);
 if(!rows){rows=(regions[area]||[]).map(([id,x,y,w,h,s])=>({id,x,y,w,h,p:decode(s,Uint8Array)}));cached.set(area,rows);}
 let a=0,uncovered=0,which=null;
 for(const r of rows){if(valid&&!valid.has(r.id))continue;
  const x=Math.floor((uv.x-r.x)/r.w*96),y=Math.floor((uv.y-r.y)/r.h*96);if(x<0||x>=96||y<0||y>=96)continue;
  const idx=y*96+x,b=r.p[idx>>1],alpha=idx%2?b&15:b>>4;
  if(cleared.has(r.id)){uncovered=Math.max(uncovered,alpha);continue;}
  if(alpha>a){a=alpha;which=r.id;}}
 return a>=6&&a>=uncovered*.53?which:null;
}
exports.chart=chart;exports.locate=locate;
