'use strict';
// Read the existing jobs; displaying status never starts or pumps a search.
function message(planner,atlas,request,now,english=false){
 const job=planner.job,selected=job?.request||request;
 if(!selected)return '';
 const loading=[...new Set([selected.level,selected.world])].map(id=>atlas.pending.get(id)).find(Boolean);
 if(!job&&!loading)return '';
 const started=request?.key===selected.key?request.started:loading?.started??now;
 const seconds=Math.max(0,Math.floor((now-started)/1000));
 const title=loading?(english?'Loading map routes…':'正在加载地图路网…'):(english?'Calculating route…':'正在计算路线…');
 return title+(seconds>0?(english?' ('+seconds+'s elapsed)':'（已等待 '+seconds+' 秒）'):'');
}
class StatusHud{
 constructor(UE,W,report=()=>{}){Object.assign(this,{UE,W,report});this.host=null;this.label=null;this.text='';this.retry=0;}
 clear(){if(this.W.alive(this.host))this.host.RemoveFromParent();this.host=null;this.label=null;this.text='';}
 hide(){if(this.W.alive(this.host)&&this.text)this.host.SetVisibility(this.UE.ESlateVisibility.Collapsed);this.text='';}
 create(context){
  const UE=this.UE,W=this.W,V=(x,y)=>new UE.Vector2D(x,y),hidden=UE.ESlateVisibility.Collapsed,visible=UE.ESlateVisibility.HitTestInvisible;
  const cls=UE.Class.Load('/Game/PBZContent/UI/FrontEnd/Sense/W_Sense_Quest.W_Sense_Quest_C');
  if(!W.alive(cls))throw Error('status widget class unavailable');
  const host=UE.WidgetBlueprintLibrary.Create(context,cls,UE.GameplayStatics.GetPlayerController(context,0));
  if(!W.alive(host))throw Error('status widget unavailable');
  this.host=host;host.StopAnimationsAndLatentActions?.();
  const root=host.Overlay_32||host.WidgetTree?.RootWidget;
  if(!W.alive(root))throw Error('status widget root unavailable');
  for(let i=0;i<(root.GetChildrenCount?.()||0);i++)root.GetChildAt(i)?.SetVisibility(hidden);
  const canvas=UE.NewObject(UE.CanvasPanel.StaticClass(),host.WidgetTree);
  if(typeof root.AddChildToOverlay==='function'){
   const slot=root.AddChildToOverlay(canvas);slot.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill);slot.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
  }else if(typeof root.AddChildToCanvas==='function'){
   const slot=root.AddChildToCanvas(canvas);slot.SetAnchors(new UE.Anchors(V(0,0),V(1,1)));slot.SetOffsets(new UE.Margin(0,0,0,0));
  }else throw Error('status widget root is not a panel');
  const label=UE.NewObject(UE.TextBlock.StaticClass(),host.WidgetTree),slot=canvas.AddChildToCanvas(label);
  slot.SetAnchors(new UE.Anchors(V(.5,.12),V(.5,.12)));slot.SetAlignment(V(.5,0));slot.SetPosition(V(0,0));slot.SetAutoSize(true);
  const font=label.Font;font.Size=18;label.SetFont(font);label.SetShadowOffset(V(1,1));label.SetShadowColorAndOpacity(new UE.LinearColor(0,0,0,.95));
  label.SetColorAndOpacity(new UE.SlateColor(new UE.LinearColor(.3,.7,1,1),UE.ESlateColorStylingMode.UseColor_Specified));
  for(const widget of [root,canvas,label]){widget.SetRenderOpacity(1);widget.SetVisibility(visible);}
  host.SetRenderOpacity(1);host.SetVisibility(hidden);host.AddToViewport(80);this.label=label;
 }
 update(context,text,now=Date.now()){
  if(!text){this.hide();return;}
  if(!this.W.alive(this.host)||!this.W.alive(this.label)){
   if(now<this.retry)return;
   this.clear();
   try{this.create(context);}catch(error){this.clear();this.retry=now+5000;this.report('route status UI',String(error));return;}
  }
  if(this.text===text)return;
  this.label.SetText(text);this.host.SetVisibility(this.UE.ESlateVisibility.HitTestInvisible);this.text=text;
 }
}
exports.message=message;exports.StatusHud=StatusHud;
