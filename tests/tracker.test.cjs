'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const root = path.resolve(__dirname, '../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {LuaTracker} = require(path.join(root, 'PBZRouteLuaTracker'));
const {Tracker} = require(path.join(root, 'PBZRouteTracker'));
function setup() {
    let now=100000, raw, written;
    const service=new LuaTracker({clock:()=>now,read:()=>raw,write:text=>{written=JSON.parse(text);return true;}});
    const events=[],tracker=new Tracker(id=>{if(id==='Mods/PbzTrackerTarget')return service;throw Error(id);},
        (item,reason)=>events.push({item,reason}),()=>{});
    function snapshot(target,revision=1,session='live') {raw=JSON.stringify({protocol:'PBZQuestRouteTracker',version:1,
        session,revision,writtenAt:now,target,reason:'selected'});}
    return {service,tracker,events,snapshot,advance:dt=>now+=dt,raw:text=>raw=text,command:()=>written};
}
const item={key:'accessory',mapID:'PBZ_PANGZHEN_WP',location:[10,20,30]};
test('actual route Tracker receives Lua selections and sends guarded cancellation',()=>{
    const h=setup();h.snapshot(item);h.tracker.poll();
    assert.deepEqual(h.events.at(-1).item.p,{x:10,y:20,z:30});
    assert.equal(h.events.at(-1).item.area,'pbz_pangzhen_wp');
    h.tracker.clear('route cleared');
    assert.equal(h.command().key,item.key);assert.equal(h.command().revision,1);
    h.advance(250);h.tracker.poll();
    assert.equal(h.events.length,1,'unchanged snapshot resurrected the locally cancelled route');
});
test('partial files are ignored and stopped trackers release their route',()=>{
    const h=setup();h.snapshot(item);h.tracker.poll();h.raw('{partial');h.advance(250);h.tracker.poll();
    assert.equal(h.events.length,1);h.advance(5000);h.tracker.poll();
    assert.equal(h.events.at(-1).item,null);assert.match(h.events.at(-1).reason,/stopped/);
});
test('heartbeat is quiet, automatic hints do not take over a quest, and new sessions reconnect',()=>{
    const h=setup();h.snapshot(item);h.tracker.poll();h.advance(1000);h.snapshot(item);h.tracker.poll();
    assert.equal(h.events.length,1);
    h.advance(250);h.snapshot({...item,key:'hint',hintOnly:true,trackingMode:'auto'},2);h.tracker.poll();
    assert.equal(h.events.length,1);
    h.advance(250);h.snapshot({...item,key:'new'},1,'new-session');h.tracker.poll();
    assert.equal(h.events.at(-1).item.id,'new');
});
test('stale snapshots from an earlier game do not start navigation',()=>{
    const h=setup();h.snapshot(item);h.advance(6000);h.tracker.poll();assert.equal(h.events.length,0);
});
test('a heartbeat timeout releases a route and the same service can recover',()=>{
    const h=setup();h.snapshot(item);h.tracker.poll();
    h.advance(4800);h.tracker.poll();h.advance(300);h.tracker.poll();
    assert.equal(h.events.at(-1).item,null);
    h.advance(250);h.snapshot(item);h.tracker.poll();
    assert.equal(h.events.at(-1).item.id,item.key);
});
