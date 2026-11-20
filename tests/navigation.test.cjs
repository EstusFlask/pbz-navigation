'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
function load(name, mocks) {
    const filename = path.join(root, name + '.js'), module = {exports: {}};
    const local = id => Object.hasOwn(mocks, id) ? mocks[id] : require(path.resolve(root, id));
    vm.runInNewContext('(function(require,module,exports){' + fs.readFileSync(filename, 'utf8') + '\n})',
        {Date: mocks.Date || Date, console})(local, module, module.exports);
    return module.exports;
}
function ribbon(wall = Infinity) {
    let now = 1000;
    const {Threads} = load('PBZPrivateRibbon', {
        ue: {ESplineCoordinateSpace: {}}, puerts: {}, './PBZRouteWorld': {},
        './PBZRouteFiber': {}, Date: {now: () => now}
    });
    const threads = new Threads(() => {}), drawn = [];
    threads.vis = (row, on) => { if (row) row.on = on; };
    threads.make = i => threads.pool[i] ||= {on: false};
    threads.shape = (row, ps) => { row.on = true; row.ps = ps; drawn.push(ps); };
    const foot = {x: 0, y: 0, z: 0};
    const state = {line: [foot, {x: 3300, y: 0, z: 0}], version: 1, targetKey: 'test', active: 0,
        trip: {legs: [{world: 'map'}]}, threadEnd: {x: 3300, y: 0, z: 0}, pawn: {},
        arrival: {check: () => false, key: () => 'test'},
        world: {feet: () => foot, anchor: () => ({x: 0, y: 0, z: 48}), normal: .7,
            hit: () => null, step: (a, b) => ({p: b}),
            threadHit: (a, b) => a.x < wall && b.x >= wall ? {point: {x: wall, y: 0, z: 18}} : null}};
    return {threads, state, drawn, advance: dt => { now += dt; }};
}
test('far ribbon segments are collision checked beyond the moving first ten metres', () => {
    const r = ribbon(1700);
    for (let i = 0; i < 30; i++) { r.threads.show(r.state); r.advance(17); }
    assert.ok(r.drawn.some(ps => ps.at(-1).x > 1600), 'clear static section is still visible up to the wall');
    assert.ok(r.drawn.every(ps => ps.every(p => p.x < 1700)), 'a far section crosses the wall');
});
test('duplicate timer callbacks do not rebuild a moving ribbon twice within 16 ms', () => {
    const r = ribbon();
    r.threads.show(r.state);
    const before = r.drawn.length;
    r.advance(8);
    r.state.world.anchor = () => ({x: 8, y: 0, z: 48});
    r.threads.show(r.state);
    assert.equal(r.drawn.length, before);
});

test('cached ribbon visibility repairs an externally hidden actor and mesh',()=>{
 let now=1000,hidden=true,visible=false,meshHidden=true;
 const {Threads}=load('PBZPrivateRibbon',{ue:{},'./PBZRouteWorld':{alive:o=>!!o},'./PBZRouteFiber':{},Date:{now:()=>now}});
 const t=new Threads(()=>{}),row={on:false,meshN:1,a:{IsHidden:()=>hidden,SetActorHiddenInGame:value=>{hidden=value;}},fiber:{IsVisible:()=>visible,SetVisibility:value=>{visible=value;},SetHiddenInGame:value=>{meshHidden=value;}}};
 t.vis(row,true);assert.equal(hidden,false);hidden=true;visible=false;meshHidden=true;now+=300;
 t.vis(row,true);assert.equal(hidden,false,'cached on=true prevented restoring the actual hidden actor');assert.equal(visible,true);assert.equal(meshHidden,false);
});

test('a cached ribbon section is rebuilt after its native mesh sections are cleared',()=>{
 const {Threads}=load('PBZPrivateRibbon',{ue:{},'./PBZRouteWorld':{alive:o=>!!o},'./PBZRouteFiber':{}});
 const t=new Threads(()=>{});let built=0;
 const row={on:true,particles:false,meshOn:true,meshN:5,tag:'blue|same',a:{IsHidden:()=>false,SetActorHiddenInGame(){}},fiber:{GetNumSections:()=>0,IsVisible:()=>true,SetVisibility(){},SetHiddenInGame(){}}};
 t.pool=[row];t.color={key:'blue'};t.make=()=>row;t.shape=()=>{built++;};
 t.section(0,{pawn:{}},null,0,100,'same',{ps:[{x:0,y:0,z:0},{x:100,y:0,z:0}]});
 assert.equal(built,1,'the cached geometry tag kept an empty native section invisible');assert.equal(row.meshN,undefined);
});

test('throttled ribbon callbacks do not re-read capsule feet',t=>{
    const r=ribbon();let reads=0;
    r.state.world.feet=()=>{reads++;return {x:0,y:0,z:0};};
    r.threads.show(r.state);r.advance(8);r.threads.show(r.state);
    t.diagnostic('feet reads for an accepted callback plus a throttled callback: '+reads);
    assert.equal(reads,1,'the throttled callback still crossed into Unreal to read capsule state');
});

test('moving fiber uploads reuse unchanged vertex colors while positions continue updating',t=>{
    let now=1000,colors=0;const uploads=[];
    function Color(...rgba){colors++;this.rgba=rgba;}
    const {draw,mesh}=load('PBZRouteFiber',{Date:{now:()=>now},ue:{ESplineCoordinateSpace:{},
        NewArray:()=>({values:[],Add(value){this.values.push(value);}}),Vector:function(){},LinearColor:Color},
        './PBZRouteWorld':{plain:()=>({x:0,y:0,z:0}),vec:p=>p}});
    const row={fiber:{K2_GetComponentLocation(){},CreateMeshSection_LinearColor(...args){uploads.push(args);},UpdateMeshSection_LinearColor(...args){uploads.push(args);}}};
    const points=Array.from({length:49},(_,i)=>({x:i*20,y:0,z:18}));
    draw(row,true,()=>{},points);const first=colors;now+=40;
    const moved=points.map((p,i)=>({...p,y:Math.sin(i/10)*5}));draw(row,true,()=>{},moved);
    t.diagnostic('new color objects on second equal-topology update: '+(colors-first));
    assert.equal(uploads.length,2);assert.equal(colors,first,'identical colors were reconstructed across the native bridge');
    assert.notDeepEqual(uploads[0][1].values,uploads[1][1].values,'positions stopped updating with the color cache');
    const expected=mesh(moved,{x:0,y:0,z:0}),plain=value=>JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(uploads[1][1].values),plain(expected.v));assert.deepEqual(plain(uploads[1][2].values),plain(expected.normal));
    assert.equal(uploads[0][8],uploads[1][7]);assert.deepEqual(plain(uploads[1][7].values.map(c=>c.rgba)),plain(expected.col));
    now+=40;draw(row,true,()=>{},[...moved,{x:1000,y:0,z:18}]);assert.ok(colors>first,'a topology change did not rebuild colors');
});

test('changing rope color refreshes equal-topology vertex colors and the owned material tint',()=>{
    const Color=require(path.join(root,'PBZRouteColor'));let now=1000;
    const uploads=[],tints=[];
    const {draw}=load('PBZRouteFiber',{Date:{now:()=>now},ue:{NewArray:()=>({values:[],Add(v){this.values.push(v);}}),
        Vector:function(){},LinearColor:function(...rgba){this.rgba=rgba;}},'./PBZRouteWorld':{plain:()=>({x:0,y:0,z:0}),vec:p=>p}});
    const row={fiberMaterial:{SetVectorParameterValue:(key,v)=>tints.push([key,v.rgba])},fiber:{K2_GetComponentLocation(){},
        CreateMeshSection_LinearColor(...args){uploads.push(args[8]);},UpdateMeshSection_LinearColor(...args){uploads.push(args[7]);}}};
    const ps=[{x:0,y:0,z:105},{x:100,y:0,z:105}];
    for(const cfg of [{},{ThreadColor:'red'},{ThreadColor:'custom',ThreadCustomColor:'#00FF00'}]){
        draw(row,true,()=>{},ps,Color.resolve(cfg));now+=40;
    }
    assert.equal(uploads.length,3);assert.notEqual(uploads[0],uploads[1]);assert.notEqual(uploads[1],uploads[2]);
    assert.ok(uploads[0].values.every(c=>c.rgba[2]>c.rgba[0]));
    assert.ok(uploads[1].values.every(c=>c.rgba[0]>c.rgba[2]));
    assert.ok(uploads[2].values.every(c=>c.rgba[0]===0&&c.rgba[1]>0&&c.rgba[2]===0));
    assert.deepEqual(tints.at(-1),['Tint',[0,1,0,1]]);
    now+=40;draw(row,true,()=>{},ps,Color.resolve({ThreadColor:'custom',ThreadCustomColor:'#00FF00'}));
    assert.equal(uploads[2],uploads[3]);assert.equal(tints.length,9,'unchanged tint crossed the engine bridge again');
});

test('changing rope color redraws stationary far sections without changing the route version',()=>{
    const r=ribbon();for(let i=0;i<12;i++){r.threads.show(r.state);r.advance(40);}
    const before=r.drawn.length,version=r.state.version;
    r.state.cfg={ThreadColor:'red'};r.threads.show(r.state);
    assert.ok(r.drawn.length-before>=3,'only the moving head changed color');assert.equal(r.state.version,version);
});

test('an idle thread does not repeat its near collision sweep at render frequency',t=>{
    const r=ribbon();let nearProbes=0;
    r.state.world.threadHit=(a,b)=>{if(a.x<999)nearProbes++;return null;};
    for(let i=0;i<60;i++){r.threads.show(r.state);r.advance(17);}
    nearProbes=0;
    for(let i=0;i<60;i++){r.threads.show(r.state);r.advance(17);}
    t.diagnostic('idle near collision probes / 1.02 seconds: '+nearProbes);
    assert.ok(nearProbes<=300,'unchanged geometry was sphere-traced every render update: '+nearProbes);
});

test('moving mesh uploads are capped at thirty per second even with 125 Hz callbacks',t=>{
    const r=ribbon();let uploads=0;
    const shape=r.threads.shape;
    r.threads.shape=(row,...args)=>{if(row===r.threads.pool[0])uploads++;return shape(row,...args);};
    for(let i=0;i<125;i++){
        r.state.world.feet=()=>({x:i*4,y:0,z:0});
        r.state.world.anchor=()=>({x:i*4,y:0,z:48});
        r.threads.show(r.state);r.advance(8);
    }
    t.diagnostic('moving head mesh uploads / second: '+uploads);
    assert.ok(uploads<=31,'expensive mesh uploads still follow render frequency: '+uploads);
});

test('the idle head collision cache expires when a door closes',()=>{
    const r=ribbon();let closed=false;
    r.state.world.threadHit=(a,b)=>closed&&a.x<500&&b.x>=500?{point:{x:500,y:0,z:18}}:null;
    r.threads.show(r.state);closed=true;
    for(let i=0;i<20;i++){r.advance(17);r.threads.show(r.state);}
    assert.ok(r.threads.pool.filter(row=>row.on).every(row=>row.ps.every(p=>p.x<500)));
});
test('fiber uses the rendered samples without synchronous spline readbacks', () => {
    let reads = 0, writes = 0;
    const {draw} = load('PBZRouteFiber', {ue: {ESplineCoordinateSpace: {},
        NewArray: () => ({Add() {}}), Vector: function(){}, LinearColor: function(){}},
        './PBZRouteWorld': {plain: () => ({x: 0, y: 0, z: 0}), vec: p => p}});
    const ps = Array.from({length: 49}, (_, x) => ({x, y: 0, z: 0}));
    draw({fiber: {K2_GetComponentLocation() {}, CreateMeshSection_LinearColor() { writes++; }},
        spl: {GetSplineLength: () => 48, GetLocationAtDistanceAlongSpline() { reads++; return {}; }}}, true, () => {}, ps);
    assert.equal(writes, 1);
    assert.equal(reads, 0);
});
test('far collision work is limited to twelve probes per callback', () => {
    const r = ribbon();let probes = 0;
    r.state.world.threadHit = (a,b) => {if(a.x>=1000)probes++;return null;};
    for(let i=0;i<30;i++) {probes=0;r.threads.show(r.state);assert.ok(probes<=12);r.advance(17);}
    const farthest=Math.max(...r.drawn.map(ps=>ps.at(-1).x));
    assert.ok(farthest>3299,'clear far route did not finish auditing: '+farthest);
});
test('a wall which closes after auditing clips the cached far ribbon', () => {
    const r=ribbon();let closed=false;
    r.state.world.threadHit=(a,b)=>closed&&a.x<1700&&b.x>=1700?{point:{x:1700,y:0,z:18}}:null;
    for(let i=0;i<30;i++){r.threads.show(r.state);r.advance(17);}
    closed=true;r.advance(1000);
    for(let i=0;i<30;i++){r.threads.show(r.state);r.advance(17);}
    assert.ok(r.threads.pool.filter(row=>row.on).every(row=>row.ps.every(p=>p.x<1700)));
});

test('expired far proofs hide their unchecked suffix on the first refresh frame', () => {
    const r=ribbon();let closed=false;
    r.state.world.threadHit=(a,b)=>closed&&a.x<1700&&b.x>=1700?{point:{x:1700,y:0,z:105}}:null;
    for(let i=0;i<30;i++){r.threads.show(r.state);r.advance(34);}
    assert.ok(r.threads.pool.some(row=>row.on&&row.ps.at(-1).x>3200));
    closed=true;r.advance(1000);r.threads.show(r.state);
    assert.ok(r.threads.pool.filter(row=>row.on).every(row=>row.ps.every(p=>p.x<1700)),
        'an expired safe endpoint released the old wall-crossing suffix while revalidation was still pending');
});
test('route auditing does not consume two trace budgets within one frame',()=>{
    const {Auditor}=require(path.join(root,'PBZRouteObstacles'));
    const auditor=new Auditor();let steps=0,now=1000;
    auditor.job=(function*(){while(true){steps++;yield;}})();
    auditor.pump(()=>now);assert.equal(steps,12);
    now+=8;auditor.pump(()=>now);assert.equal(steps,12);
    now+=8;auditor.pump(()=>now);assert.equal(steps,24);
});
test('short obstacle-clipped sections do not compress stock particles into a ball',()=>{
    const {Threads}=load('PBZPrivateRibbon',{ue:{ESplineCoordinateSpace:{}},puerts:{},'./PBZRouteWorld':{},'./PBZRouteFiber':{}});
    let active=0,visible;
    const row={span:35,meshN:2,fiber:{SetVisibility:on=>visible=on,SetHiddenInGame(){}},
        a:{SetActorHiddenInGame(){}},sys:{},n:{SetVisibility(){},SetHiddenInGame(){},Activate(){active++;},DeactivateImmediate(){}}};
    new Threads(()=>{}).vis(row,true);
    assert.equal(active,0,'full Niagara emitter activated on a 35 cm strand');
    assert.equal(visible,true,'the clean mesh strand should remain visible');
});
test('short sections keep a useful sample spacing instead of packing 49 points together',()=>{
    const B=require(path.join(root,'PBZRibbonMath'));
    const r=B.road([{x:0,y:0,z:0},{x:1000,y:0,z:0}]);
    const f=B.frame(r,B.match(r,{x:0,y:0,z:0}),{x:0,y:0,z:48},{vx:0,vy:0});
    const slice=B.section(r,f,0,24);
    assert.ok(slice.ps.length<=4,'too many samples for a 24 cm clipped section');
});
test('Lua hover hit testing retains item height and rejects a stale icon elsewhere',()=>{
    const {pickTrackerItem}=load('PBZRouteItems',{ue:{},'./PBZRouteWorld':{}});
    const raw={key:'third-floor',mapID:'PangZhen',location:[100,200,2300]};
    const project=()=>({x:.4,y:.5});
    const item=pickTrackerItem(raw,{x:.4,y:.5},1000,1000,project);
    assert.equal(item.p.z,2300);assert.equal(item.provider,'187');
    assert.equal(pickTrackerItem(raw,{x:.8,y:.5},1000,1000,project),null);
});
test('a lit strand is cleared immediately when an obstacle compresses its spline',()=>{
    const {Threads}=load('PBZPrivateRibbon',{ue:{ESplineCoordinateSpace:{}},puerts:{},'./PBZRouteWorld':{},'./PBZRouteFiber':{}});
    let cleared=0,active=0;
    const row={span:1000,meshN:48,fiber:{SetVisibility(){},SetHiddenInGame(){}},a:{SetActorHiddenInGame(){}},sys:{},
        n:{SetVisibility(){},SetHiddenInGame(){},Activate(){active++;},DeactivateImmediate(){cleared++;}}};
    const threads=new Threads(()=>{});threads.vis(row,true);row.span=20;threads.vis(row,true);
    assert.equal(active,0);assert.ok(cleared>=1);assert.equal(row.lit,false);
});
test('turning in place never activates the stock trailing particles even on a long strand',()=>{
    const {Threads}=load('PBZPrivateRibbon',{ue:{ESplineCoordinateSpace:{}},puerts:{},'./PBZRouteWorld':{},'./PBZRouteFiber':{}});
    let active=0;
    const row={span:1000,meshN:48,fiber:{SetVisibility(){},SetHiddenInGame(){}},a:{SetActorHiddenInGame(){}},sys:{},
        n:{SetVisibility(){},SetHiddenInGame(){},Activate(){active++;},DeactivateImmediate(){}}};
    const threads=new Threads(()=>{});
    for(let angle=0;angle<360;angle+=15){threads.vis(row,false);threads.vis(row,true);}
    assert.equal(active,0,'rotating strands still use a particle system that leaves a tangled trail');
});
test('the end of the drawn ribbon stays above a flat supporting floor',()=>{
    const B=require(path.join(root,'PBZRibbonMath'));
    const r=B.road([{x:0,y:0,z:0},{x:1000,y:0,z:0}]);
    for(let s=0;s<=r.length;s+=10)assert.ok(B.at(r,s,null).z>=6,'rendered endpoint goes under the floor');
});

test('the blue strand stays at crouched-head height along the whole route and checks that height',()=>{
 const r=ribbon();r.state.world.anchor=()=>({x:0,y:0,z:105});
 r.state.world.threadHit=(a,b)=>a.z>80&&b.z>80&&a.x<1700&&b.x>=1700?{point:{x:1700,y:0,z:105}}:null;
 for(let i=0;i<35;i++){r.threads.show(r.state);r.advance(17);}
 assert.ok(r.drawn.some(ps=>ps.at(-1).x>1600));
 assert.ok(r.drawn.every(ps=>ps.every(p=>p.z>=90&&p.z<=120)),'part of the strand still drops to knee or floor height');
 assert.ok(r.drawn.every(ps=>ps.every(p=>p.x<1700)),'collision was checked below the actual raised strand');
 const {mesh}=load('PBZRouteFiber',{ue:{ESplineCoordinateSpace:{}},'./PBZRouteWorld':{}});
 const cols=mesh([{x:0,y:0,z:105},{x:100,y:0,z:105}],{x:0,y:0,z:0}).col;
 assert.ok(cols.every(c=>c[2]>c[0]*2&&c[2]>c[1]),'the mesh is not blue');
});
test('a walking step cannot skip a hole or a high ledge between its endpoints',()=>{
    const {Ground}=load('PBZRouteWorld',{ue:{},puerts:{}});
    const make=floor=>({rise:45,slope:1,normal:.7,hit(a,b,body){if(body)return null;const z=floor(b.x);return z!==null&&z<=a.z&&z>=b.z?{point:{x:b.x,y:b.y,z},nz:1}:null;}});
    const hole=make(x=>x>45&&x<95?null:0),ledge=make(x=>x>=60?120:0);
    assert.equal(Ground.prototype.step.call(hole,{x:0,y:0,z:0},{x:140,y:0,z:0},true).p,undefined,'the path crosses an unsupported hole');
    assert.equal(Ground.prototype.step.call(ledge,{x:0,y:0,z:0},{x:140,y:0,z:120},true).p,undefined,'the path walks up a 120 cm vertical ledge');
});
test('a short start join is still checked for a blocking wall',()=>{
    const Surface=require(path.join(root,'PBZRouteSurface'));
    const joined=Surface.join({step:()=>({why:'wall'})},{x:0,y:0,z:0},{q:{x:16,y:0,z:0},r:16,dz:0});
    assert.equal(joined,null);
});
test('floor projection keeps the current floor under a low overpass',()=>{
    const {Ground}=load('PBZRouteWorld',{ue:{},puerts:{}});
    const ground={rise:45,normal:.7,hit(a,b){const z=[180,0].find(z=>z<=a.z&&z>=b.z);return z===undefined?null:{point:{x:b.x,y:b.y,z},nz:1};}};
    assert.equal(Ground.prototype.floorAt.call(ground,{x:0,y:0,z:0},true).z,0);
    ground.hit=(a,b)=>0<=a.z&&0>=b.z?{point:{x:0,y:0,z:0},nz:1}:null;
    assert.equal(Ground.prototype.floorAt.call(ground,{x:0,y:0,z:-134},true).z,0,'atlas height correction could not find the real floor');
});
test('every rotating head segment is exactly the polyline checked against scene collision',()=>{
    const r=ribbon();r.state.line=[{x:0,y:0,z:0},{x:900,y:0,z:0}];r.state.threadEnd=r.state.line[1];
    const edge=(a,b)=>JSON.stringify([a,b]);
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/6){
        const checked=new Set();r.state.world.anchor=()=>({x:11*Math.cos(angle),y:11*Math.sin(angle),z:48});
        r.state.world.threadHit=(a,b)=>{checked.add(edge(a,b));return null;};
        const begin=r.drawn.length;r.threads.show(r.state);
        for(const ps of r.drawn.slice(begin))for(let i=1;i<ps.length;i++)assert.ok(checked.has(edge(ps[i-1],ps[i])));
        r.advance(17);
    }
});
test('a small steep floor contact can use nearby capsule support without ignoring a large rock collision',()=>{
    const {Ground}=load('PBZRouteWorld',{ue:{},puerts:{}});
    const world={rise:45,slope:1,normal:.7,r:40,hit(a,b,body){
        if(body)return this.blockBody?{point:{x:60,y:0,z:60},normal:{x:-1,y:0,z:0}}:null;
        const steep=Math.abs(b.x-70)<2&&Math.abs(b.y)<2;
        return {point:{x:b.x,y:b.y,z:steep?10:0},nz:steep?.4:1};
    }};
    assert.ok(Ground.prototype.step.call(world,{x:0,y:0,z:0},{x:70,y:0,z:0},true).p);
    world.blockBody=true;
    assert.equal(Ground.prototype.step.call(world,{x:0,y:0,z:0},{x:70,y:0,z:0},true).p,undefined);
});
test('an approach endpoint does not cause arrival while still far from the actual collectible',()=>{
    const {Arrival}=require(path.join(root,'PBZRouteArrival'));
    const arrival=new Arrival();arrival.select({key:'item:test',world:'test',p:{x:1000,y:0,z:120},item:true});
    const S={trip:{legs:[{world:'test',partial:false,locks:[]}]},active:0,targetKey:'item:test',level:'test',
        world:{hit:()=>null,floorAt:p=>p,r:35}};
    const end={x:860,y:0,z:0};
    arrival.check(S,{x:700,y:0,z:0},end,0);
    assert.equal(arrival.check(S,{x:700,y:0,z:0},end,150),false);
    arrival.check(S,{x:850,y:0,z:0},end,200);
    assert.equal(arrival.check(S,{x:850,y:0,z:0},end,350),true);
});
test('capsule feet follow resized interaction/crouch dimensions instead of a stale standing height',()=>{
    const {Ground}=load('PBZRouteWorld',{ue:{},puerts:{}});
    const ground={h:90,r:40,cap:{GetScaledCapsuleHalfHeight:()=>45,GetScaledCapsuleRadius:()=>30,
        K2_GetComponentLocation:()=>({X:0,Y:0,Z:145})}};
    assert.equal(Ground.prototype.feet.call(ground).z,100);assert.equal(ground.h,45);assert.equal(ground.r,30);
});


test('ribbon preserves a validated jump path across floor adjustment and redraw',()=>{
 const r=ribbon(),p=(x,z)=>({x,y:0,z});
 r.state.line=[p(0,0),p(150,0),p(230,80),p(320,100),p(410,0),p(620,0)];
 r.state.trip.legs[0].points=r.state.line;
 r.state.trip.legs[0].checks=[{kind:12,from:1,to:4,trajectory:{points:r.state.line.slice(1,5),walkIn:0,launch:'jump'}}];
 r.state.threadEnd=r.state.line.at(-1);
 r.state.world.hit=(a,b)=>({point:{...b,z:b.z+105},nz:1});
 const check=()=>{
  const {points,offset}=r.threads.route;
  for(const knot of r.state.line.slice(1,5)){
   assert.ok(points.some(q=>q.x===knot.x&&q.z===knot.z),'a checked action knot was rounded away');
   assert.ok(r.threads.pool[0].ps.some(q=>Math.hypot(q.x-knot.x,q.y-knot.y,q.z-knot.z-105)<1e-6),'the drawn head displaced a checked action knot');
  }
  for(let i=0;i<points.length;i++)if(points[i].x>=150&&points[i].x<=410)assert.equal(offset[i],0,'floor correction shifted the checked trajectory');
  assert.ok(points.some((q,i)=>q.x<150&&offset[i]>0),'ordinary approach stopped following the floor');
 };
 for(let i=0;i<24;i++){r.threads.show(r.state);r.advance(35);}
 check();r.state.version++;
 for(let i=0;i<7;i++){r.threads.show(r.state);r.advance(35);}
 check();
});


test('a distant action knot uses the same arc to check and clip the drawn ribbon',()=>{
 const B=require(path.join(root,'PBZRibbonMath')),{RibbonGuard}=require(path.join(root,'PBZRibbonGuard'));
 const p=(x,z)=>({x,y:0,z});
 const route=B.road([p(0,0),p(1230,0),p(1268,50),p(1307,80),p(1423,0),p(1900,0)],
  [{kind:12,from:1,to:4,trajectory:{}}]);
 const guard=new RibbonGuard(),probes=[];
 const world={threadHit:(a,b)=>{probes.push([a,b]);return a.x>=1268&&b.x>1268?{point:b}:null;}};
 let safe=1000;
 for(let i=0;i<10;i++)safe=guard.check(route,world,1,[],1000,route.length,1000,()=>0);
 const knot=route.actionKnots[1];
 assert.equal(safe,knot-12);
 assert.ok(probes.some(([,b])=>b.x===1268&&b.z===155),'the action knot was absent from the collision probes');
 const segment=guard.section(1,1100,safe);
 assert.ok(segment);
 assert.ok(segment.ps.some(q=>q.x===1230&&q.z===105));
 assert.ok(segment.ps.every(q=>q.x<1268),'a clipped static section went beyond its last clear segment');
});

test('static and moving ribbon slices reuse the checked action segments',()=>{
 const B=require(path.join(root,'PBZRibbonMath')),p=(x,z=0)=>({x,y:0,z});
 const points=[p(0),p(300),p(355,100),p(420,170),p(500,200),p(565,120),p(620),p(950)];
 const route=B.road(points,[{kind:12,from:1,to:6,trajectory:{}}]);
 const frame=B.frame(route,{arc:0},p(0,105),{vx:0,vy:0});
 const [entry,exit]=route.actionSpans[0];
 for(const f of [null,frame]){
  const span=B.section(route,f,0,route.length);
  assert.deepEqual(span.arcs.filter(s=>s>=entry&&s<=exit),route.actionKnots,
   'extra samples split the same straight swept segments inside the fixed action');
  assert.deepEqual(span.ps.filter((_,i)=>span.arcs[i]>=entry&&span.arcs[i]<=exit),
   points.slice(1,7).map(q=>({...q,z:q.z+105})));
  const inside=B.section(route,f,entry+3,exit-3);
  assert.deepEqual(inside.arcs,[entry+3,...route.actionKnots.slice(1,-1),exit-3]);
 }
});
