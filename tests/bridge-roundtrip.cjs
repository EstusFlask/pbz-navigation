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
tracker.clear('route cleared');
