'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {message,StatusHud}=require(root+'/PBZRouteStatus');
test('a stationary timed-out or paused request keeps its visible failure until a new context',()=>{
 const {Planner}=require(root+'/PBZRouteJobs');let wall=0;
 const planner=new Planner(()=>{},()=>wall),atlas={pending:new Map()},request={key:'field-005',world:'forest',level:'forest',p:{x:100,y:0,z:0},start:{x:0,y:0,z:0},revision:1,started:0};
 planner.request(request,function*(){while(true)yield;},()=>{});
 wall=31001;planner.pump();assert.equal(planner.pending,false);
 assert.match(message(planner,atlas,request,60000),/超时/);
 assert.match(message(planner,atlas,request,60000,true),/timed out/i);
 planner.request(request,function*(){wall+=60;yield;},()=>{},true);wall+=20;planner.pump();
 assert.match(message(planner,atlas,request,90000),/中断/);
 assert.equal(message(planner,atlas,{...request,key:'other'},90000),'');
 planner.clear();assert.equal(message(planner,atlas,request,90000),'');
});
function widgets(){
 const made=[],created=[],reports=[];
 class Widget{
  constructor(type){this.type=type;this.Font={};this.children=[];this.visibility=1;this.text='';this.writes=0;this.valid=true;made.push(this);}
  SetVisibility(v){this.visibility=v;}SetRenderOpacity(v){this.opacity=v;}
  SetFont(v){this.Font=v;}SetShadowOffset(){}SetShadowColorAndOpacity(){}SetColorAndOpacity(){}
  SetText(v){this.text=v;this.writes++;}SetBrushFromTexture(){}SetRenderTransformPivot(){}SetRenderTransformAngle(v){this.angle=v;}
  RemoveFromParent(){this.removed=true;this.valid=false;}StopAnimationsAndLatentActions(){}
  AddToViewport(z){this.viewport=z;}GetChildrenCount(){return this.children.length;}GetChildAt(i){return this.children[i];}
  AddChildToOverlay(w){return this.add(w);}AddChildToCanvas(w){return this.add(w);}
  add(w){this.children.push(w);const slot={SetAnchors(v){this.anchors=v;},SetAlignment(v){this.align=v;},SetPosition(v){this.position=v;},SetSize(v){this.size=v;},SetAutoSize(){},SetZOrder(){},SetOffsets(){},SetHorizontalAlignment(){},SetVerticalAlignment(){}};w.slot=slot;return slot;}
 }
 const vector=function(X,Y){Object.assign(this,{X,Y});},object=function(...values){this.values=values;};
 const UE={Vector2D:vector,LinearColor:object,SlateColor:object,Anchors:object,Margin:object,
  ESlateVisibility:{HitTestInvisible:0,Collapsed:1},ESlateColorStylingMode:{UseColor_Specified:0},
  EHorizontalAlignment:{HAlign_Fill:3},EVerticalAlignment:{VAlign_Fill:3},
  Class:{Load:p=>({p})},CanvasPanel:{StaticClass:()=> 'canvas'},TextBlock:{StaticClass:()=> 'text'},Image:{StaticClass:()=> 'image'},
  NewObject:type=>new Widget(type),GameplayStatics:{GetPlayerController:()=>({})},
  WidgetBlueprintLibrary:{Create:()=>{const host=new Widget('host'),overlay=new Widget('overlay');overlay.add(new Widget('original-child'));host.WidgetTree={RootWidget:overlay};created.push(host);return host;}},
  KismetRenderingLibrary:{ImportFileAsTexture2D:()=>({})}};
 const W={alive:o=>!!o&&o.valid!==false};
 return {UE,W,Widget,made,created,reports,hud:new StatusHud(UE,W,(...row)=>reports.push(row))};
}

test('the viewport status stays visible across frames, reuses widgets and hides on completion',()=>{
 const h=widgets();
 for(let i=0;i<300;i++)h.hud.update({},'正在计算路线…',i*16);
 assert.equal(h.created.length,1);assert.equal(h.hud.label.writes,1);
 assert.equal(h.hud.host.visibility,0);assert.equal(h.hud.host.WidgetTree.RootWidget.children[0].visibility,1);
 assert.equal(h.hud.label.slot.anchors.values[0].Y,.12);
 h.hud.update({},'正在计算路线…（已等待 5 秒）',5000);assert.equal(h.hud.label.writes,2);
 h.hud.update({},'',5100);assert.equal(h.hud.host.visibility,1);
 h.hud.update({},'Calculating route…',6000);assert.equal(h.created.length,1);assert.equal(h.hud.host.visibility,0);
 h.hud.clear();assert.equal(h.created[0].removed,true);
});

test('status recreates a lost viewport and backs off after a missing widget class',()=>{
 const h=widgets();h.hud.update({},'正在计算路线…',0);h.hud.host.valid=false;
 h.hud.update({},'正在计算路线…',100);assert.equal(h.created.length,2);
 h.hud.clear();let loads=0;h.UE.Class.Load=()=>{loads++;return null;};
 for(let i=0;i<300;i++)h.hud.update({},'正在计算路线…',200+i*16);
 assert.equal(loads,1);assert.equal(h.reports.filter(([,text])=>text.includes('unavailable')).length,1);
 h.hud.update({},'正在计算路线…',5300);assert.equal(loads,2);
});

test('status restores visibility when the game hides a reused widget between equal updates',()=>{
 const h=widgets();h.hud.update({},'该区域导航暂不可用',0);
 h.hud.host.SetVisibility(h.UE.ESlateVisibility.Collapsed);h.hud.host.SetRenderOpacity(0);
 h.hud.update({},'该区域导航暂不可用',200);
 assert.equal(h.hud.host.visibility,h.UE.ESlateVisibility.HitTestInvisible);
 assert.equal(h.hud.host.opacity,1);
});

test('status uses the cooked game font and a DPI-correct viewport instead of zero intrinsic canvas size',()=>{
 const h=widgets(),create=h.UE.WidgetBlueprintLibrary.Create,gameFont={FontObject:{name:'cooked-CJK-font'},Size:24};
 let width=1920,scale=1.5;
 h.UE.WidgetBlueprintLibrary.Create=()=>{const host=create();host.DistanceText={Font:{...gameFont}};host.SetDesiredSizeInViewport=v=>{host.desired=v;};return host;};
 h.UE.WidgetLayoutLibrary={GetViewportSize:()=>({X:width,Y:1080}),GetViewportScale:()=>scale};
 h.hud.update({},'正在加载导航… 3/105',0);
 assert.equal(h.hud.label.Font.FontObject,gameFont.FontObject);assert.equal(h.hud.host.desired.X,1280);assert.equal(h.hud.host.desired.Y,720);assert.equal(h.hud.host.viewport,10050);
 width=2560;h.hud.update({},'正在加载导航… 3/105',200);assert.equal(h.hud.host.desired.X,2560/scale);
 h.hud.clear();h.hud.update({},'该区域导航暂不可用',400);assert.equal(h.hud.host.desired.X,2560/scale,'new host skipped layout because old geometry was cached');
});

test('status reuses the cooked localized label and its PBZ text setter',()=>{
 const h=widgets(),create=h.UE.WidgetBlueprintLibrary.Create,label=new h.Widget('cooked-PBZCommonLocText');
 label.RemoveFromParent=()=>{label.detached=true;};label.SetText=()=>{throw Error('SetText is ignored when a PBZ localization key is present');};
 label.SetPBZFormatText=text=>{label.formatted=text;};
 h.UE.WidgetBlueprintLibrary.Create=()=>{const host=create();host.DistanceText=label;return host;};
 h.hud.update({},'正在加载导航…',0);
 assert.equal(h.hud.label,label);assert.equal(label.formatted,'正在加载导航…');assert.equal(label.detached,true);
});

test('loading status uses wall time, relevant atlas jobs and English without inventing a percentage',()=>{
 const request={key:'item',level:'here',world:'there',started:1000};
 const planner={job:{request,cpu:3}},atlas={pending:new Map([['other',{started:0}]])};
 assert.equal(message(planner,atlas,request,11000),'正在计算路线…（已等待 10 秒）');
 assert.equal(message(planner,atlas,request,11000,true),'Calculating route… (10s elapsed)');
 atlas.pending.set('there',{started:1000});planner.job=null;
 assert.match(message(planner,atlas,request,11000),/正在加载地图路网/);
 atlas.pending.delete('there');assert.equal(message(planner,atlas,request,11000),'');
});

test('map loading replaces the premature no-route label, then clears when the search settles',()=>{
 const h=widgets(),module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteInk.js','utf8')+'\n})')(
  id=>id==='ue'?h.UE:id==='./PBZRouteWorld'?h.W:id==='./PBZRoutePassages'?{}:require(path.resolve(root,id)),module,module.exports);
 const ink=new module.exports.Ink('',()=>{}),host={WidgetTree:{RootWidget:new h.Widget('map-root')},
  PBZMapCanvasSlotWeak:{GetPosition:()=>({X:0,Y:0})},CurrentDisplayMapID:'here',CurrentLayer:0,CurrentMapSize:()=>({X:1000,Y:1000})};
 const S={world:{feet:()=>({x:0,y:0,z:0})},arrival:{completedTarget:null},cfg:{MapRoute:true},manual:{key:'item',area:'here',item:true,uv:{x:.5,y:.5}},
  targetKey:'item',version:1,active:0,routeStatus:'正在计算路线…',trip:null};
 const labels=()=>h.made.filter(w=>w.type==='text'&&w.visibility===0).map(w=>w.text);
 ink.draw(host,S,()=>({x:.5,y:.5}),'here',()=>true,true);
 assert.deepEqual(labels(),['正在计算路线…']);
 S.routeStatus='正在计算路线…（已等待 5 秒）';ink.draw(host,S,()=>({x:.5,y:.5}),'here',()=>true,true);
 assert.deepEqual(labels(),['正在计算路线…（已等待 5 秒）'],'elapsed time did not invalidate the map label cache');
 S.routeStatus='';ink.draw(host,S,()=>({x:.5,y:.5}),'here',()=>true,true);assert.deepEqual(labels(),['暂未找到连通道路']);
 ink.clearAll();assert.equal(ink.hosts.size,0);
});

test('the map preserves a checked right-angle detour instead of rounding through the inside wall',()=>{
 const h=widgets(),module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteInk.js','utf8')+'\n})')(
  id=>id==='ue'?h.UE:id==='./PBZRouteWorld'?h.W:id==='./PBZRoutePassages'?{}:require(path.resolve(root,id)),module,module.exports);
 const ink=new module.exports.Ink('',()=>{}),points=[{x:100,y:100,z:0},{x:500,y:100,z:0},{x:500,y:500,z:0}];
 const host={WidgetTree:{RootWidget:new h.Widget('map-root')},PBZMapCanvasSlotWeak:{GetPosition:()=>({X:0,Y:0})},
  CurrentDisplayMapID:'here',CurrentLayer:0,CurrentMapSize:()=>({X:1000,Y:1000})};
 const S={world:{feet:()=>points[0]},arrival:{},cfg:{MapRoute:true},targetKey:'corner',version:1,active:0,
  trip:{legs:[{world:'here',physicalVerified:true,points}]}};
 ink.draw(host,S,p=>({x:p.x/1000,y:p.y/1000}),'here',()=>true,true);
 const images=h.made.filter(w=>w.type==='image'&&w.visibility===0);assert.ok(images.length);
 for(const w of images){const p=w.slot.position;
  assert.ok(!(p.X<500-.01&&p.Y>100+.01),'cosmetic smoothing drew a shortcut inside the wall at '+JSON.stringify(p));
 }
});
