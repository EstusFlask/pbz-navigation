'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const Color=require(path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteColor'));
test('rope settings accept the saved ModConfig values and retain the last valid settings during a partial write',()=>{
 const red=Color.read(JSON.stringify({schemaVersion:1,values:{ThreadColor:'red',ThreadCustomColor:'#12aB34'}}));
 assert.deepEqual(red,{ThreadColor:'red',ThreadCustomColor:'#12AB34'});
 for(const raw of ['', '{', 'null', '{"schemaVersion":2,"values":{}}', '{"schemaVersion":1,"values":{"ThreadColor":"purple","ThreadCustomColor":"#FFFFFF"}}'])
  assert.equal(Color.read(raw,red),red);
});
test('blue remains the default and custom picker colors are converted from sRGB to linear RGB',()=>{
 assert.equal(Color.resolve().key,'blue');assert.equal(Color.resolve({ThreadColor:'red'}).key,'red');
 const green=Color.resolve({ThreadColor:'custom',ThreadCustomColor:'#008000'});
 assert.equal(green.key,'#008000');assert.equal(green.tint[0],0);assert.equal(green.tint[2],0);
 assert.ok(Math.abs(green.tint[1]-.2158605)<.000001);
 assert.equal(Color.resolve({ThreadColor:'custom',ThreadCustomColor:'bad'}).key,'blue');
 assert.equal(Color.resolve({ThreadColor:'blue',ThreadCustomColor:'#00FF00'}).key,'blue');
});
test('the navigation settings poll reads rope colors without freezing legacy navigation toggles',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZQuestRoute.js'),'utf8');
 const files=new Map(),S={cfg:{WorldThread:true,DisplayMode:'Always'}};
 const poll=vm.runInNewContext(source.slice(source.indexOf('function settings('),source.indexOf('function show('))+';settings',
  {Date,ThreadColor:Color,S,dir:'content/',lastCfg:0,textFile:p=>files.get(p)||'',log(){}});
 files.set('content/Paks/~mods/PBZQuestRoute.txt','WorldThread=false');poll(true);
 assert.equal(S.cfg.WorldThread,false);assert.equal(S.cfg.ThreadColor,'blue');
 files.set('content/../Saved/PBZQuestRoute-settings.json',JSON.stringify({schemaVersion:1,values:{ThreadColor:'red',ThreadCustomColor:'#008000'}}));poll(true);
 assert.equal(S.cfg.ThreadColor,'red');
 files.set('content/Paks/~mods/PBZQuestRoute.txt','WorldThread=true');
 files.set('content/../Saved/PBZQuestRoute-settings.json','{');poll(true);
 assert.equal(S.cfg.WorldThread,true);assert.equal(S.cfg.ThreadColor,'red');
});
