'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Color=require(path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteColor'));
const cfg=Color.read(fs.readFileSync(path.join(process.argv[2],'rope-roundtrip.json'),'utf8'));
assert.equal(cfg.ThreadColor,'custom');assert.deepEqual(Color.resolve(cfg).tint,[0,1,0,1]);
console.log('PASS: ModConfig Lua apply -> saved JSON -> JavaScript linear rope color');
const Search=require(path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteSearch'));
assert.equal(Search.read(fs.readFileSync(path.join(process.argv[2],'navigation-roundtrip.json'),'utf8')),false);
console.log('PASS: ModConfig Lua reverse-search toggle -> saved JSON -> JavaScript search direction');
