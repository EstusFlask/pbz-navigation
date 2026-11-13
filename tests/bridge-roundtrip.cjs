'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const {LuaTracker}=require(path.join(root,'PBZRouteLuaTracker'));
const {Tracker}=require(path.join(root,'PBZRouteTracker'));
const folder=process.argv[2],events=[];
const api=new LuaTracker({read:()=>fs.readFileSync(path.join(folder,'PBZQuestRoute-tracker.json'),'utf8'),
    write:text=>fs.writeFileSync(path.join(folder,'PBZQuestRoute-command.json'),text)});
const tracker=new Tracker(()=>api,item=>events.push(item),()=>{});
tracker.poll();assert.equal(events[0]?.id,'roundtrip');assert.equal(events[0]?.p.z,333);
if(process.argv[3]==='controller'){
    assert.equal(api.hovered(),null,'the directional test must start without a hover');
    const point=api.markers().find(p=>p.key==='upper-roundtrip');assert.equal(point.location[2],2333);
    assert.equal(api.focus(point),true);assert.equal(tracker.choose({}, {provider:'187',tracked:point}),true);
}else if(process.argv[3]==='middle'){
    const point=api.hovered();assert.equal(point.location[2],2333);
    assert.equal(tracker.choose({}, {provider:'187',tracked:point}),true);
}else tracker.clear('route cleared');
