'use strict';
// Node-only loading/query measurements; this does not measure Puerts or game FPS.
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const H=require(root+'/PBZRouteMapHints'),base=root+'/PBZRouteMapData';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^'use strict';exports\.data=/,'').trim().replace(/;$/,''));
const rows=[];
for(const world of read(base+'/index.js').worlds){
 // Select the input without warming Node's module cache for the measured pages.
 const meta=read(base+'/'+world+'/index.js'),page=Object.values(meta.tiles)[0][0];
 const bytes=Buffer.from(read(base+'/'+page.name+'.js').p,'base64');
 const p={x:bytes.readInt32LE(0)/10,y:bytes.readInt32LE(4)/10,z:bytes.readInt32LE(8)/10};
 const began=performance.now(),index=H.forWorld(world),near=index.near(p,350,16),coldMs=performance.now()-began;
 const warm=performance.now();for(let i=0;i<100;i++)index.near(p,350,16);
 rows.push({world,coldMs:Math.round(coldMs*1000)/1000,warmMeanMs:Math.round((performance.now()-warm)*10)/1000,
  coldPages:index.pages.size,nearby:near.length,totalPoints:meta.points});
}
const report={runtime:process.version,scope:'Node cold module loading and repeated local queries; not game FPS',rows};
const output=path.resolve(__dirname,'../build/heybox-map-benchmark.json');fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
