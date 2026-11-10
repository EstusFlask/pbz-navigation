'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
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
