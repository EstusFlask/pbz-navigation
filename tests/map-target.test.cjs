'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const tables=require(root+'/PBZRouteTables').data;
const bell=tables.bells.bell_yxzr_004,goal={x:bell.at[0],y:bell.at[1],z:bell.at[2]};
const wrong={x:24160,y:67840,z:6769};
function fixture(options={}){
 const name=bell.world,area='zhengdaodaying',feet={x:-2174,y:77991,z:7876},logs=[];
 const project=p=>({X:.5+(p.x-goal.x)*.038/(wrong.x-goal.x),Y:.5+(p.y-goal.y)*.000001});
 const positions=options.positions||[wrong],g={name,p:positions.flatMap(p=>[p.x,p.y,p.z]),walkNodes:positions.length,
  pt:i=>positions[i],cells:[0,0,0,positions.length],order:positions.map((_,i)=>i),
  strong:positions.map((_,i)=>i),off:positions.map(()=>0).concat(0),arc:[],e:[],
  node:()=>0,reachable:()=>new Set([0]),sameComponent:(a,b)=>a===b};
 const vector=v=>({x:v.X??v.x,y:v.Y??v.y,z:v.Z??v.z});
 const W={alive:o=>!!o,vec:p=>p,plain:vector,norm:s=>String(s)};
 const map={ProjectWorldLocationToMap:project,GetMapIDByLocation:()=>area};
 const UE={BlueprintPathsLibrary:{FileExists:()=>false},ESlateVisibility:{HitTestInvisible:0,Collapsed:1,Hidden:2},ECommonInputType:{Gamepad:1},
  MapSubsystem:{StaticClass:()=> 'map'},BellManager:{StaticClass:()=> 'bell'},
  PBZUIActionRouterBase:{StaticClass:()=> 'router'},Key:function(){},Vector2D:function(X,Y){this.X=X;this.Y=Y;},
  PBZBlueprintFunctionLibrary:{GetPBZNarrativeComp:()=>null},WidgetLayoutLibrary:{SlotAsCanvasSlot:w=>w.slot}};
 const itemModule={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteItems.js','utf8')+'\n})')
  (id=>id==='ue'?UE:id==='./PBZRouteWorld'?W:require(path.resolve(root,id)),itemModule,itemModule.exports);
 const bm={ActivateBellIDs:{Num:()=>options.active?1:0,Get:()=>bell.id}};
 const mocks={ue:UE,puerts:{$ref:x=>({value:x})},'Library/TsHelper':{default:{getWorldSubsystem:(p,t)=>t==='map'?map:bm,getlocalPlayerSubsystem:()=>null}},
  'Library/MapAreaGroups':{isInSameMapGroup:()=>true},'./PBZRouteWorld':W,
  './PBZRouteItems':itemModule.exports,'./PBZRouteTables':{data:{...tables,worlds:[name]}},
  './PBZRouteSurface':{anchors:()=>[{id:0,r:0,dz:0}]},'./PBZPrivateRibbon':{},'./PBZRouteInk':{},
  './PBZRoutePassages':{},'./PBZRouteMinimap':{},'./PBZRouteScout':{}};
 const module={exports:{}};
 const hook='\nexports.test={S,confirmMapItem,click(h,uv){pointers.set(h,{take:()=>[{type:"pin",uv}],hold(){},cancel(){}});onMap(h);},init(g){graphs.set(g.name,g);ink={draw(){},hide(){}};threads={hide(){}};solve=()=>{};}};';
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZQuestRoute.js','utf8')+hook+'\n})',{Date,console:{log:s=>logs.push(s)}})
  (id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id)),module,module.exports);
 const api=module.exports.test;api.init(g);Object.assign(api.S,{pawn:{},level:name,world:{feet:()=>feet}});
 const widget={GetVisibility:()=>0,slot:{GetPosition:()=>({X:500,Y:500}),GetSize:()=>({X:32,Y:32})}};
 const h={FocusPoint:{X:.5,Y:.5},focusItemMap:new Map([[bell.id,{itemType:0,widget}]]),CurrentDisplayMapID:area,CurrentMapSize:()=>({X:1000,Y:1000}),PBZMapCanvasSlotWeak:{GetPosition:()=>({X:0,Y:0})},
  getMouseLocalPosition:()=>({X:500,Y:500}),getCurrentInputType:()=>0,mapIDToBigMapID:()=>area};
 return {api,h,g,project,logs,click:(uv={x:.5,y:.5})=>api.click(h,uv)};
}
test('clicking the tomb bell preserves its location instead of a road 101 metres away',()=>{
 const h=fixture();h.click();
 assert.equal(h.api.S.manual?.bell,bell.id,'the native bell was treated as a generic road pin');
 assert.deepEqual(JSON.parse(JSON.stringify(h.api.S.manual.p)),goal);
 assert.equal(h.api.S.manual.node,undefined,'a disconnected bell was forced onto a different component');
});
test('empty map paper does not silently choose a remote road beyond the snap radius',()=>{
 const h=fixture();h.click({x:.8,y:.8});
 assert.equal(h.api.S.manual?.p,undefined,'a distant road became the destination of an unrelated click');
 assert.equal(h.api.S.manual?.node,undefined);
});
test('activated bells outside the native focus map retain their target coordinates',()=>{
 const h=fixture({active:true});h.h.focusItemMap.clear();h.click();
 assert.equal(h.api.S.manual.bell,bell.id);assert.equal(h.api.S.manual.p.x,goal.x);
});
test('hidden bells are not selected through the activated-bell fallback',()=>{
 const h=fixture({active:true});h.h.focusItemMap.get(bell.id).widget.GetVisibility=()=>2;h.click();
 assert.equal(h.api.S.manual?.bell,undefined);
});
test('gamepad confirmation selects a bell and consumes repeats without reverting to a road pin',()=>{
 const h=fixture();h.h.getCurrentInputType=()=>1;
 assert.equal(h.api.confirmMapItem(h.h,'pad'),true);
 const selected=h.api.S.manual;
 assert.equal(selected.bell,bell.id);assert.equal(h.api.confirmMapItem(h.h,'pad',true),true);
 assert.equal(h.api.S.manual,selected);assert.equal(selected.p.x,goal.x);
});
test('a nearby disconnected road wins over a reachable but more distant road on empty map paper',()=>{
 const close={x:goal.x+8000,y:goal.y+80000,z:goal.z},h=fixture({positions:[wrong,close]});
 h.h.focusItemMap.clear();const p=h.project(close);h.click({x:p.X,y:p.Y});
 assert.equal(h.api.S.manual.node,1,'route reachability changed the selected map location');
 assert.equal(h.api.S.manual.p.x,close.x);
});
