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
