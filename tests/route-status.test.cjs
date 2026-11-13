'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {message,StatusHud}=require(root+'/PBZRouteStatus');
function widgets(){
 const made=[],created=[],reports=[];
 class Widget{
  constructor(type){this.type=type;this.Font={};this.children=[];this.visibility=1;this.text='';this.writes=0;this.valid=true;made.push(this);}
  SetVisibility(v){this.visibility=v;}SetRenderOpacity(v){this.opacity=v;}
  SetFont(v){this.Font=v;}SetShadowOffset(){}SetShadowColorAndOpacity(){}SetColorAndOpacity(){}
  SetText(v){this.text=v;this.writes++;}SetBrushFromTexture(){}SetRenderTransformPivot(){}SetRenderTransformAngle(){}
  RemoveFromParent(){this.removed=true;this.valid=false;}StopAnimationsAndLatentActions(){}
  AddToViewport(z){this.viewport=z;}GetChildrenCount(){return this.children.length;}GetChildAt(i){return this.children[i];}
  AddChildToOverlay(w){return this.add(w);}AddChildToCanvas(w){return this.add(w);}
  add(w){this.children.push(w);const slot={SetAnchors(v){this.anchors=v;},SetAlignment(v){this.align=v;},SetPosition(v){this.position=v;},SetSize(){},SetAutoSize(){},SetZOrder(){},SetOffsets(){},SetHorizontalAlignment(){},SetVerticalAlignment(){}};w.slot=slot;return slot;}
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
 assert.equal(loads,1);assert.equal(h.reports.length,1);
 h.hud.update({},'正在计算路线…',5300);assert.equal(loads,2);
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
