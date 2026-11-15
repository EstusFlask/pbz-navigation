'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const tables=require(root+'/PBZRouteTables').data;
const bell=tables.bells.bell_yxzr_004,goal={x:bell.at[0],y:bell.at[1],z:bell.at[2]};
const wrong={x:24160,y:67840,z:6769};
const field=require('./fixtures/controller-markers-20261113.json');
function fixture(options={}){
 const name=bell.world,area='zhengdaodaying',feet={x:-2174,y:77991,z:7876},logs=[];
 const project=options.project||(p=>({X:.5+(p.x-goal.x)*.038/(wrong.x-goal.x),Y:.5+(p.y-goal.y)*.000001}));
 const positions=options.positions||[wrong],g={name,p:positions.flatMap(p=>[p.x,p.y,p.z]),walkNodes:positions.length,
  pt:i=>positions[i],cells:[0,0,0,positions.length],order:positions.map((_,i)=>i),
  strong:positions.map((_,i)=>i),off:positions.map(()=>0).concat(0),arc:[],e:[],
  node:()=>0,reachable:()=>new Set([0]),sameComponent:(a,b)=>a===b};
 const vector=v=>({x:v.X??v.x,y:v.Y??v.y,z:v.Z??v.z});
 const W={alive:o=>!!o,vec:p=>p,plain:vector,norm:s=>String(s)};
 const map={ProjectWorldLocationToMap:project,GetMapIDByLocation:()=>area};
 const UE={BlueprintPathsLibrary:{FileExists:()=>false},ESlateVisibility:{HitTestInvisible:0,Collapsed:1,Hidden:2},ECommonInputType:{Gamepad:1},
  MapSubsystem:{StaticClass:()=> 'map'},BellManager:{StaticClass:()=> 'bell'},
  PBZUIActionRouterBase:{StaticClass:()=> 'router'},Key:function(name){this.KeyName=name;},Vector2D:function(X,Y){this.X=X;this.Y=Y;},
  KismetInputLibrary:{GetKey:e=>({KeyName:e.key}),InputEvent_IsRepeat:e=>!!e.repeat,PointerEvent_GetEffectingButton:e=>({KeyName:e.key})},
  WidgetBlueprintLibrary:{Handled:()=> 'handled',Unhandled:()=> 'unhandled'},
  PBZBlueprintFunctionLibrary:{GetPBZNarrativeComp:()=>null},WidgetLayoutLibrary:{SlotAsCanvasSlot:w=>w.slot}};
 const itemModule={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteItems.js','utf8')+'\n})')
  (id=>id==='ue'?UE:id==='./PBZRouteWorld'?W:require(path.resolve(root,id)),itemModule,itemModule.exports);
 const bm={ActivateBellIDs:{Num:()=>options.active?1:0,Get:()=>bell.id}};
 const mocks={ue:UE,puerts:{$ref:x=>({value:x})},'Library/TsHelper':{default:{getWorldSubsystem:(p,t)=>t==='map'?map:bm,getlocalPlayerSubsystem:()=>options.router||null}},
  'Library/MapAreaGroups':{isInSameMapGroup:(a,b)=>a===b||['pangzhen','houjie'].includes(a)&&['pangzhen','houjie'].includes(b)},'./PBZRouteWorld':W,
  './PBZRouteItems':itemModule.exports,'./PBZRouteTables':{data:{...tables,worlds:[name]}},
  './PBZRouteSurface':{anchors:()=>[{id:0,r:0,dz:0}]},'./PBZPrivateRibbon':{},'./PBZRouteInk':{},
  './PBZRoutePassages':{},'./PBZRouteMinimap':{},'./PBZRouteScout':{}};
 const module={exports:{}};
 const hook='\nexports.test={S,confirmMapItem,bindPadTap,frame:onMap,surveys(tasks){diagnostics={event(){},survey:new (require("./PBZRouteSurvey").Survey)({tasks,build:{},root:"",write:()=>true})};surveyTracker=new (require("./PBZRouteSurveyTracker").SurveyTracker)(tasks);},fromTracker:item=>trackerChanged(item,"selected"),bridge(value){globalThis.PBZMapTrackerBridge={target:value};tracker={choose:(host,item)=>value.choose(item.tracked)};},click(h,uv){pointers.set(h,{take:()=>[{type:"pin",uv}],hold(){},cancel(){}});onMap(h);},init(g){graphs.set(g.name,g);ink={draw(){},hide(){}};threads={hide(){}};solve=()=>{};}};';
 const Clock=options.now?class extends Date{static now(){return options.now();}}:Date;
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZQuestRoute.js','utf8')+hook+'\n})',{Date:Clock,console:{log:s=>logs.push(s)}})
  (id=>Object.hasOwn(mocks,id)?mocks[id]:require(path.resolve(root,id)),module,module.exports);
 const api=module.exports.test;api.init(g);Object.assign(api.S,{pawn:{},level:name,world:{feet:()=>feet}});
 const widget={GetVisibility:()=>0,slot:{GetPosition:()=>({X:500,Y:500}),GetSize:()=>({X:32,Y:32})}};
 const h={FocusPoint:{X:.5,Y:.5},focusItemMap:new Map([[bell.id,{itemType:0,widget}]]),CurrentDisplayMapID:area,CurrentMapSize:()=>({X:1000,Y:1000}),PBZMapCanvasSlotWeak:{GetPosition:()=>({X:0,Y:0})},
  getMouseLocalPosition:()=>({X:500,Y:500}),getCurrentInputType:()=>0,
  mapIDToBigMapID:id=>['pangzhen','houjie','ximeng'].includes(String(id).toLowerCase())?'pangzhen':String(id).toLowerCase()};
 return {api,h,g,project,logs,click:(uv={x:.5,y:.5})=>api.click(h,uv)};
}

function padFixture(options){
 const h=fixture(options),focused=[],chosen=[];
 const item=(key,x,y,z=2300)=>({key,mapID:'zhengdaodaying',location:[goal.x+(x-.5)*(wrong.x-goal.x)/.038,goal.y+(y-.5)/.000001,z]});
 const markers=[item('right',.58,.5),item('far-right',.7,.5),item('left',.42,.5),item('up',.5,.42),item('down',.5,.58),
  item('pbz:bell:closer',.52,.5),{...item('collected',.51,.5),collected:true}];
 h.api.bridge({markers:()=>markers,focus:p=>{focused.push(p.key);return true;},choose:p=>{chosen.push(p.key);return true;}});
 const proto={updateGamepadSnap(){this.FocusPoint={X:.5,Y:.5};this.nativeSnaps=(this.nativeSnaps||0)+1;}};
 h.api.bindPadTap(proto);Object.setPrototypeOf(h.h,proto);h.h.getCurrentInputType=()=>1;
 h.h.FocusToPoint=function(p){this.FocusPoint=p;};
 return {...h,markers,focused,chosen,press:(key,repeat=false)=>{if(!repeat&&key.startsWith('Gamepad_DPad_'))h.h.OnKeyUp({}, {key});return h.h.OnPreviewKeyDown({}, {key,repeat});}};
}

test('D-pad chooses the nearest collectible in each direction and A retains its real height',()=>{
 for(const [direction,key] of [['Right','right'],['Left','left'],['Up','up'],['Down','down']]){
  const h=padFixture();assert.equal(h.press('Gamepad_DPad_'+direction),'handled');
  assert.equal(h.focused.at(-1),key,'a native bell or another direction stole the focus');
  assert.equal(h.press('Gamepad_FaceButton_Bottom'),'handled');
  assert.equal(h.chosen.at(-1),key);assert.equal(h.api.S.manual.p.z,2300);
 }
});

test('held D-pad input selects an item when CommonUI never delivers a preview event',()=>{
 const h=padFixture();let held='';
 h.h.GetOwningPlayer=()=>({IsInputKeyDown:key=>key.KeyName===held});
 h.api.frame(h.h);held='Gamepad_DPad_Right';h.api.frame(h.h);
 assert.equal(h.focused.at(-1),'right','D-pad polling never reached collectible selection');
});

test('the CommonUI held-key router can select collectibles without a raw player-controller reader',()=>{
 let held='';const h=padFixture({router:{IsUIKeyHeld:key=>key.KeyName===held}});
 h.api.frame(h.h);held='Gamepad_DPad_Up';h.api.frame(h.h);
 assert.equal(h.focused.at(-1),'up');
});

test('PangZhen grouped-map focus includes a HouJie collectible from another streamed world',()=>{
 // The 1.2.0 field log selected this HouJie marker while CurrentDisplayMapID
 // was PangZhen. World equality is not the displayed-chart membership rule.
 const h=padFixture();h.h.CurrentDisplayMapID='pangzhen';
 h.markers.splice(1);h.markers[0]={...h.markers[0],mapID:'houjie',
  key:'pbz:world:pbz_houjie_wp-bp_rubbish_c_uaid_60cf8480990991fd02_1722142275'};
 assert.equal(h.press('Gamepad_DPad_Right'),'handled');
 assert.equal(h.focused.at(-1),h.markers[0].key,'a visible grouped-world collectible was filtered out');
 assert.equal(h.press('Gamepad_FaceButton_Bottom'),'handled');
 assert.equal(h.api.S.manual.world,'pbz_houjie_wp','the displayed chart replaced the item world');
});

test('live HouJie marker replays through map polling and A confirmation without preview callbacks',()=>{
 const point=field.markers.find(p=>p.mapID==='HouJie');assert.ok(point);
 const h=padFixture({project:p=>({X:.58+(p.x-point.location[0])/10000,Y:.5+(p.y-point.location[1])/10000})});
 h.h.CurrentDisplayMapID=field.displayMapID;h.markers.splice(0,h.markers.length,point);
 let held='';h.h.GetOwningPlayer=()=>({IsInputKeyDown:key=>key.KeyName===held});h.api.frame(h.h);
 held='Gamepad_DPad_Right';h.api.frame(h.h);assert.equal(h.focused.at(-1),point.key);
 held='Gamepad_FaceButton_Bottom';h.api.frame(h.h);assert.equal(h.chosen.at(-1),point.key);
 assert.equal(h.api.S.manual.world,'pbz_houjie_wp');
 assert.deepEqual(JSON.parse(JSON.stringify(h.api.S.manual.p)),{x:point.location[0],y:point.location[1],z:point.location[2]});
});

test('a streamed XiMeng item uses native chart membership while unrelated maps stay excluded',()=>{
 const h=padFixture();h.h.CurrentDisplayMapID='pangzhen';h.markers.splice(1);
 h.markers[0]={...h.markers[0],mapID:'XiMeng'};
 assert.equal(h.press('Gamepad_DPad_Right'),'handled');assert.equal(h.focused.at(-1),'right');
 const g=padFixture();g.h.CurrentDisplayMapID='pangzhen';g.markers.splice(1);g.markers[0]={...g.markers[0],mapID:'xigu'};
 assert.equal(g.press('Gamepad_DPad_Right'),'unhandled');assert.equal(g.focused.length,0);
});

test('grouped collectibles project with their own map ID and reject the missing-projection origin',()=>{
 const point=field.markers.find(p=>p.mapID==='XiMeng'&&!p.key.startsWith('pbz:bell:'));
 const h=padFixture({project:(p,mapID)=>mapID===point.mapID?{X:.58,Y:.5}:{X:0,Y:0}});
 h.h.CurrentDisplayMapID='pangzhen';h.markers.splice(0,h.markers.length,point);
 h.press('Gamepad_DPad_Right');assert.equal(h.focused.at(-1),point.key,'projection used the displayed chart instead of the collectible map ID');
 const g=padFixture({project:()=>({X:0,Y:0})});g.press('Gamepad_DPad_Left');
 assert.equal(g.focused.length,0,'an unavailable map projection became a selectable top-left icon');
});

test('event and polling share one press and bounded repeat instead of skipping two items',()=>{
 let now=1000,held='';const h=padFixture({now:()=>now});
 h.h.GetOwningPlayer=()=>({IsInputKeyDown:key=>key.KeyName===held});h.api.frame(h.h);
 held='Gamepad_DPad_Right';h.api.frame(h.h);assert.deepEqual(h.focused,['right']);
 h.h.OnPreviewKeyDown({}, {key:held});assert.deepEqual(h.focused,['right'],'one physical press advanced twice');
 now+=100;h.api.frame(h.h);assert.deepEqual(h.focused,['right']);
 now+=250;h.api.frame(h.h);assert.deepEqual(h.focused,['right','far-right']);
 h.h.OnPreviewKeyDown({}, {key:held,repeat:true});assert.equal(h.focused.length,2);
 held='';h.api.frame(h.h);held='Gamepad_DPad_Left';now++;h.api.frame(h.h);assert.equal(h.focused.at(-1),'right');
 held='';h.api.frame(h.h);h.h.FocusPoint={X:.5,Y:.5};held='Gamepad_DPad_Right';now++;h.api.frame(h.h);
 const before=h.focused.length;h.h.OnPreviewKeyDown({}, {key:held});
 assert.equal(h.focused.length,before,'releasing a stale item latch also erased the current physical press');
});

test('native bell snapping cannot steal D-pad focus; stick movement releases the item',()=>{
 const h=padFixture();h.press('Gamepad_DPad_Right');h.h.updateGamepadSnap();
 assert.equal(h.h.nativeSnaps,undefined,'the native snap moved the reticle back to a bell');
 assert.equal(h.press('Gamepad_FaceButton_Bottom'),'handled');assert.equal(h.chosen.at(-1),'right');
 h.h.FocusPoint={X:.2,Y:.2};h.h.updateGamepadSnap();assert.equal(h.h.nativeSnaps,1);
});

test('D-pad focus respects modal input, hidden/removed markers and map changes',()=>{
 const h=padFixture();h.h.isModalOpen=()=>true;
 assert.equal(h.press('Gamepad_DPad_Right'),'unhandled');assert.equal(h.focused.length,0);
 h.h.isModalOpen=()=>false;h.h.IsOpenByBell=()=>true;
 assert.equal(h.press('Gamepad_DPad_Right'),'unhandled','collectibles intercepted the bell teleport menu');
 h.h.IsOpenByBell=()=>false;h.press('Gamepad_DPad_Right');h.markers.length=0;
 h.h.updateGamepadSnap();assert.equal(h.h.nativeSnaps,1,'a removed collectible retained focus');
 const g=padFixture();g.press('Gamepad_DPad_Right');g.h.CurrentDisplayMapID='other';g.h.updateGamepadSnap();
 assert.equal(g.h.nativeSnaps,1,'another map inherited the previous map focus');
});

test('directional repeats are bounded and a new press advances to the next item',()=>{
 const h=padFixture();h.press('Gamepad_DPad_Right');h.press('Gamepad_DPad_Right',true);
 assert.equal(h.focused.at(-1),'right','an immediate repeat skipped the first item');
 h.press('Gamepad_DPad_Right');assert.equal(h.focused.at(-1),'far-right');
 h.press('Gamepad_DPad_Right');assert.equal(h.focused.at(-1),'far-right','directional selection wrapped backwards');
 h.h.timeSinceAxisInput=0;h.h.updateGamepadSnap();assert.equal(h.h.nativeSnaps,1,'stick input did not release the latch');
});

test('legacy collectible slots keep their slot identity and hidden icons cannot be focused',()=>{
 const h=padFixture();h.markers.length=0;
 const widget={__pbzPoint:{key:'legacy-item',mapID:'zhengdaodaying',location:[111,222,333]},
  GetVisibility:()=>0,slot:{GetPosition:()=>({X:550,Y:500}),GetSize:()=>({X:25,Y:25})}};
 h.h.focusItemMap.set('legacy-slot',{itemType:2,widget});h.press('Gamepad_DPad_Right');
 h.h.updateGamepadSnap();assert.equal(h.h.nativeSnaps,undefined,'the original slot key was lost');
 assert.equal(h.press('Gamepad_FaceButton_Bottom'),'handled');assert.equal(h.api.S.manual.p.z,333);
 widget.GetVisibility=()=>2;h.h.updateGamepadSnap();assert.equal(h.h.nativeSnaps,1);
});
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
test('real tracker survey key arms the matching card and preserves the selected end/world/height',()=>{
 const h=fixture(),task={id:'R1',number:1,world:h.g.name,start:{p:goal,area:'zhengdaodaying'},end:{p:{x:3000,y:4000,z:600},area:'zhengdaodaying'}};
 h.api.surveys([task]);h.api.fromTracker({id:'pbz:world:pbz-survey:r1:end',p:task.end.p,area:'zhengdaodaying',provider:'187',name:'1号路线结束'});
 assert.equal(h.api.S.manual.survey,'R1');assert.equal(h.api.S.manual.surveyRole,'end');assert.equal(h.api.S.manual.p.z,600);assert.equal(h.api.S.manual.noTransfer,true);assert.equal(h.api.S.manual.world,h.g.name);
});
