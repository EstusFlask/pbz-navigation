"use strict";
const UE=require("ue"),W=require("./PBZRouteWorld"),R=require("./PBZRouteCore"),UV=require("./PBZRoutePicker");
const Charts=require("./PBZRouteCartography");
const Passages=require("./PBZRoutePassages"),Obstacles=require("./PBZRouteObstacles");
const V=(x,y)=>new UE.Vector2D(x,y),C=(r,g,b,a)=>new UE.LinearColor(r,g,b,a);
const visible=UE.ESlateVisibility.HitTestInvisible,hidden=UE.ESlateVisibility.Collapsed;
function simplify(points,tolerance){
 if(points.length<3)return points;const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
 while(stack.length){const [i,j]=stack.pop(),a=points[i],b=points[j],dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy||1;let far=tolerance,idx=-1;
  for(let k=i+1;k<j;k++){const p=points[k],t=R.clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/den),d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(d>far){idx=k;far=d;}}
  if(idx>=0){keep.add(idx);stack.push([i,idx],[idx,j]);}}
 return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
function rounded(points){
 const out=[points[0]],mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 for(let i=1;i+1<points.length;i++){const a=points[i-1],p=points[i],b=points[i+1],l=R.xy(a,p),r=R.xy(b,p),k=Math.min(l*.42,r*.42,11);
  if(k<1.1){out.push(p);continue;}const m=mix(p,a,k/l),n=mix(p,b,k/r);out.push(m);
  for(let j=1;j<=6;j++){const t=j/6;out.push(mix(mix(m,p,t),mix(p,n,t),t));}}
 if(points.length>1)out.push(points[points.length-1]);return out;
}
class Ink{
 constructor(path,log){this.path=path;this.log=log;this.state=new WeakMap();this.hosts=new Set();}
 remove(host){const s=this.state.get(host);if(s&&W.alive(s.canvas))s.canvas.RemoveFromParent();this.state.delete(host);this.hosts.delete(host);}
 clearAll(){for(const host of this.hosts)this.remove(host);}
 hide(host){const s=this.state.get(host);if(s?.shown&&W.alive(s.canvas)){s.canvas.SetVisibility(hidden);s.shown=false;s.sig="";}}
 layer(host){
  let s=this.state.get(host);if(s&&W.alive(s.canvas))return s;const root=host.WidgetTree?.RootWidget;
  if(!W.alive(root)||typeof root.AddChildToCanvas!=="function")return null;
  const canvas=UE.NewObject(UE.CanvasPanel.StaticClass(),host.WidgetTree),slot=root.AddChildToCanvas(canvas);
  slot.SetAnchors(new UE.Anchors(V(0,0),V(0,0)));slot.SetAlignment(V(0,0));slot.SetAutoSize(false);slot.SetZOrder(54);canvas.SetVisibility(visible);
  s={canvas,slot,images:[],labels:[],textures:{},sig:"",geom:"",shown:true};this.state.set(host,s);this.hosts.add(host);return s;
 }
 draw(host,S,project,displayWorld,allowed,enabled){
  let s=this.state.get(host);
  if(!S.world||S.arrival.completedTarget&&S.arrival.completedTarget===S.targetKey){this.hide(host);return;}
  const overview=!!host.BigMapMode,transfer=enabled&&S.active===0?S.trip?.transfer:null;
  const chart=id=>String(host.mapIDToBigMapID?.(id)||id||'').toLowerCase();
  const display=chart(host.CurrentDisplayMapID);
  const cross=transfer&&chart(transfer.from.area)!==chart(transfer.to.area);
  const flag=enabled&&!overview&&S.arrival.completedTarget!==S.manual?.key&&S.manual?.area===String(host.CurrentDisplayMapID).toLowerCase()?S.manual:null;
  const lookoutHint=enabled&&!overview&&display==='zhengdaodaying'&&S.lookoutHint;
  if(!S.cfg.MapRoute||(overview&&!cross)||(!lookoutHint&&!flag&&(!enabled||!S.trip))){this.hide(host);return;}
  const map=host.PBZMapCanvasSlotWeak;if(!W.alive(map))return;s=this.layer(host);if(!s)return;if(!s.shown){s.canvas.SetVisibility(visible);s.shown=true;}
  const size=host.CurrentMapSize(),w=Number(size.X),h=Number(size.Y);
  const origin=map.GetPosition(),left=Number(origin.X),top=Number(origin.Y),geom=[left,top,w,h].join('/');
  if(geom!==s.geom){s.slot.SetPosition(V(left,top));s.slot.SetSize(V(w,h));s.geom=geom;}
  const active=S.trip?.legs[S.active],feet=S.world.feet(),close=active?.world===displayWorld?R.nearestOnLine(feet,active.points):null;
  const trim=close?.p&&close.d<235?close:null;
  const focus=String(host.SlotWidgetGroup?.GetSelectedSlotID?.()||"").toLowerCase();
  const sig=[overview,focus,S.version,S.active,S.contextEpoch,S.arrival.completedTarget,flag?.key,enabled,S.lockVersion,host.CurrentDisplayMapID,host.CurrentLayer,w,h,trim?.i,trim?Math.round(trim.t*6):0].join('/');
  if(s.sig===sig||w<=0||h<=0)return;
  const uvKey=[S.version,overview,display,host.CurrentLayer].join('/');
  if(s.uvKey!==uvKey){s.uvKey=uvKey;s.legUV=new WeakMap();}
  let ni=0,nt=0,count=0,gateCount=0,breaks=0,travelled=0;
  const tex=(name)=>s.textures[name]||(s.textures[name]=UE.KismetRenderingLibrary.ImportFileAsTexture2D(host,this.path+name+".png"));
  const img=(name,x,y,sx,sy,angle,col,z)=>{let ob=s.images[ni++];
   if(!ob){const wid=UE.NewObject(UE.Image.StaticClass(),host.WidgetTree),sl=s.canvas.AddChildToCanvas(wid);wid.SetVisibility(hidden);sl.SetAlignment(V(.5,.5));sl.SetAutoSize(false);wid.SetRenderTransformPivot(V(.5,.5));ob={wid,sl};s.images.push(ob);}
   if(ob.name!==name){const t=tex(name);if(!t){ob.wid.SetVisibility(hidden);return;}ob.wid.SetBrushFromTexture(t,false);ob.name=name;}
   ob.sl.SetZOrder(z);ob.sl.SetPosition(V(x,y));ob.sl.SetSize(V(sx,sy));ob.wid.SetRenderTransformAngle(angle);ob.wid.SetColorAndOpacity(col);ob.wid.SetVisibility(visible);};
  const label=(str,x,y,col)=>{let ob=s.labels[nt++];if(!ob){const wid=UE.NewObject(UE.TextBlock.StaticClass(),host.WidgetTree),sl=s.canvas.AddChildToCanvas(wid);sl.SetAutoSize(true);sl.SetAlignment(V(0,.5));sl.SetZOrder(4);
    const f=wid.Font;f.Size=13;wid.SetFont(f);wid.SetShadowOffset(V(1,1));wid.SetShadowColorAndOpacity(C(.16,.10,.06,.92));ob={wid,sl};s.labels.push(ob);}
   ob.wid.SetText(str);ob.wid.SetColorAndOpacity(new UE.SlateColor(col,UE.ESlateColorStylingMode.UseColor_Specified));ob.sl.SetPosition(V(x,y));ob.wid.SetVisibility(visible);};
  const px=u=>({x:u.x*w,y:u.y*h});const chalk=C(1,1,1,1),light=C(.99,.955,.83,1);
  const legs=!overview&&enabled&&S.trip?S.trip.legs.slice(S.active).filter(l=>l.world===displayWorld):[];
  const paintRun=(raw,style="walk")=>{if(raw.length<2)return;const ps=simplify(rounded(simplify(raw,1.1)),.42);
   for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],len=R.xy(a,b);if(len<.55)continue;
    if(style!=='walk'){
     const tint=style==='blocked'?C(1,.13,.09,1):C(.8,.77,.66,.95);
     for(const [m,n] of Charts.dashes(a,b,6,5))img('pencil',(m.x+n.x)/2,(m.y+n.y)/2,R.xy(m,n),8,Math.atan2(n.y-m.y,n.x-m.x)*180/Math.PI,tint,2);
     continue;
    }
    const n=Math.max(1,Math.ceil(len/48));for(let k=0;k<n;k++){const t=(k+.5)/n;
     img("pencil",a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,len/n+1.75,12.2+1.25*Math.sin((travelled+len*t)/54)+.7*Math.cos((travelled+len*t)/19),Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,chalk,1);count++;}travelled+=len;}};
  const bellUV=bell=>{
   if(chart(bell.area)!==display)return null;
   const widget=host.focusItemMap?.get(String(bell.id).toLowerCase())?.widget;
   if(W.alive(widget)){const pos=UE.WidgetLayoutLibrary.SlotAsCanvasSlot(widget)?.GetPosition();if(pos){const uv={x:Number(pos.X)/w,y:Number(pos.Y)/h};if(UV.valid(uv))return uv;}}
   const p={x:bell.at[0],y:bell.at[1],z:bell.at[2]},u=project(p,bell.area);return UV.valid(u)?u:null;
  };
  for(const leg of legs){
   let trace=s.legUV.get(leg);
   if(!trace){
    let startUV=null,endUV=null;const t=S.trip.transfer;
    if(t&&leg===S.trip.legs[0])endUV=bellUV(t.from);
    if(t&&leg===S.trip.legs[1])startUV=bellUV(t.to);
    if(flag?.item&&leg===S.trip.legs[S.trip.legs.length-1]&&R.xy(leg.points[leg.points.length-1],flag.p)<220)endUV=flag.uv;
    trace=Charts.projectLeg(leg.points,project,allowed,startUV,endUV);s.legUV.set(leg,trace);
   }
   breaks+=trace.repairs;
   const skip=leg===active&&trim?trace.offsets[trim.i]+(trace.offsets[trim.i+1]-trace.offsets[trim.i])*trim.t:0;
   const cuts=Obstacles.intervals(leg);
   for(const rows of trace.runs)for(const part of Obstacles.portions(rows,skip,cuts))for(const run of Charts.visible(part.points))paintRun(run.map(px),part.style);
   const used=new Set();
   for(const move of leg.moves||[]){
    const title=Passages.title(move);if(!title||used.has(move.guid)||!allowed(move.p))continue;
    const u=project(move.p);if(!UV.valid(u))continue;used.add(move.guid);
    const pos=px(u);label(title,pos.x+10,pos.y-13,light);
    if(move.kind==='lift'&&move.end&&allowed(move.end)){const out=project(move.end);if(UV.valid(out)&&R.xy(px(out),pos)>36){const v=px(out);label('↥',v.x+4,v.y-6,light);}}
   }
   for(const gate of leg.locks||[]){if(!allowed(gate.p))continue;const uv=project(gate.p);if(!UV.valid(uv))continue;
    const p=px(uv),tint=gate.unknown?C(.86,.79,.62,1):C(1,.12,.075,1);
    if(gate.icon==='barrier'){
     for(const [x1,y1,x2,y2]of [[-13,-11,13,11],[-13,11,13,-11],[-16,15,-7,15],[7,15,16,15]])
      img('pencil',p.x+(x1+x2)/2,p.y+(y1+y2)/2,Math.hypot(x2-x1,y2-y1)+1,8.5,Math.atan2(y2-y1,x2-x1)*180/Math.PI,tint,3);
    }else img(gate.icon||'mechanism',p.x,p.y,38,40,0,tint,3);
    if(focus===String(gate.id).toLowerCase()||gate.id.startsWith('route:')||gate.id==='native-frontier')label(gate.label||'门待解锁',p.x+22,p.y,tint);gateCount++;}}
  const dotted=(a,b)=>{for(const [m,n] of Charts.dashes(a,b,10,7)){
   const length=R.xy(m,n);img('pencil',(m.x+n.x)/2,(m.y+n.y)/2,length,8.8,Math.atan2(n.y-m.y,n.x-m.x)*180/Math.PI,C(.91,.82,.62,.96),2);}};
  if(transfer){
   const from=transfer.from,to=transfer.to;
   const regionPoint=bell=>{const id=chart(bell.area),key=host.getBigMapAnchorName?.('QuestAnchor',id),widget=key&&host.findBigMapAnchor?.(key);
    if(!W.alive(widget))return null;const q=UE.WidgetLayoutLibrary.SlotAsCanvasSlot(widget)?.GetPosition();return q?{x:Number(q.X),y:Number(q.Y)}:null;};
   const ua=overview?null:bellUV(from),ub=overview?null:bellUV(to);
   const a=overview?regionPoint(from):ua&&px(ua),b=overview?regionPoint(to):ub&&px(ub);
   if(a&&b){dotted(a,b);label('传送 · '+from.name,a.x+12,a.y+15,light);label('抵达 · '+to.name,b.x+12,b.y+15,light);}
   else if(!overview&&(a||b)){const p=a||b,dir=p.x>w-190?-1:1,end={x:p.x+58*dir,y:p.y-20};
    dotted(p,end);label(a?'传往 '+to.name:'来自 '+from.name,Math.max(3,end.x+(dir>0?3:-125)),end.y-7,light);}
  }
  if(lookoutHint&&!S.trip){
   for(const [p,zh,en] of [[{x:3601,y:87142,z:4495},'洞内走左后隧道','Take the back-left tunnel'],[{x:4063,y:81945,z:6207},'乘升降梯上层','Ride the lift up'],[{x:5571,y:79989,z:8000},'红门右侧沿墙跑','Wall-run right of the red gate']]){
    const u=project(p);if(UV.valid(u)){const v=px(u);label(/^en/i.test(String(UE.KismetInternationalizationLibrary?.GetCurrentLanguage?.()||'zh'))?en:zh,v.x+8,v.y-10,light);}
   }
  }
  if(flag&&flag.uv){const p=px(flag.uv),scale=flag.item ? .63 : 1;
   img('pinned',p.x+17.5*scale+(flag.item?8:0),p.y-26*scale-(flag.item?7:0),60*scale,60*scale,0,chalk,4);
   if(!S.trip)label('暂未找到连通道路',p.x+24,p.y+18,C(.95,.76,.57,1));}
  for(let i=ni;i<s.images.length;i++)s.images[i].wid.SetVisibility(hidden);for(let i=nt;i<s.labels.length;i++)s.labels[i].wid.SetVisibility(hidden);
  s.sig=sig;
  const summary=[S.version,overview,display,legs.length,breaks,!!transfer].join('/');
  if(s.logged!==summary){s.logged=summary;this.log('ink','chart='+display+' legs='+legs.length+' repaired seams='+breaks+' transfer='+!!transfer);}
 }
}
exports.Ink=Ink;
