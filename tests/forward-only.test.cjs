'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
test('runtime and settings expose one forward solver without an incoming search index',()=>{
 assert.equal(fs.existsSync(root+'/PBZRouteSearch.js'),false,'retired direction switch is still shipped');
 for(const name of ['PBZQuestRoute.js','PBZRouteCore.js','PBZRouteHintWalk.js','PBZRouteTransitions.js']){
  const source=fs.readFileSync(root+'/'+name,'utf8');
  assert.doesNotMatch(source,/PBZRouteSearch|ReverseSearch|incomingJob|reverseCandidate/);
 }
 const config=fs.readFileSync(path.resolve(__dirname,'../Quest_Navigation/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts/PBZRouteConfig.lua'),'utf8');
 assert.doesNotMatch(config,/ReverseSearch/);
});
