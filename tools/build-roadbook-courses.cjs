'use strict';
// Offline candidates from actual game navigation/interaction data. The public
// roadbook supplies direction and identity, never interpolated world height.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),JS=path.join(ROOT,'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const R=require(JS+'/PBZRouteCore'),S=require(JS+'/PBZRouteSurface');
const coverage=require(ROOT+'/authoring/bell-network-coverage.json'),tables=require(JS+'/PBZRouteTables').data;
const facts=require(ROOT+'/authoring/placed-passage-facts.json').rows;
const fixed=require(JS+'/PBZRouteGuideData').data.courses;
const output=JS+'/PBZRouteRoadbookData';fs.mkdirSync(output,{recursive:true});
const point=a=>({x:a[0],y:a[1],z:a[2]}),xyz=p=>[p.x,p.y,p.z].map(v=>Math.round(v*100)/100);
function pads(g,p,kind){
 const rows=[],cx=Math.floor(p.x/3200),cy=Math.floor(p.y/3200),below=['hook','swing','wallrun','rappel','zipline'].includes(kind)?475:240;
 for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){
  const k=g.bin.get(x+','+y);if(k===undefined)continue;
  for(let j=g.cells[k+2];j<g.cells[k+3];j++){
   const id=g.order[j];if(id>=g.walkNodes)continue;
   const q=S.surface(g,id,p),r=R.xy(q,p),dz=q.z-p.z;
   if(r<=760&&dz<=180&&dz>=-below)rows.push({id,q,score:r+Math.abs(dz)*2});
  }
 }
 rows.sort((a,b)=>a.score-b.score);const picked=[];
 for(const row of rows){if(picked.some(p=>g.strong[p.id]===g.strong[row.id]))continue;picked.push(row);if(picked.length===4)break;}
 return picked;
}
function attach(g){
 for(const f of facts.filter(f=>f.world===g.name)){
  const travel=f.path.map(point),first=travel[0],last=travel.at(-1);
  for(const a of pads(g,first,f.kind))for(const b of pads(g,last,f.kind)){
   if(a.id===b.id)continue;
   const ps=[g.pt(a.id),a.q,...travel,b.q,g.pt(b.id)],move={kind:f.kind,guid:f.guid,p:a.q,end:b.q,
    referenceFirst:first,referenceLast:last,requiresLive:true,walkIn:1,walkOut:ps.length-2};
   g.addLiveEdge(a.id,b.id,ps,move);
   if(f.both)g.addLiveEdge(b.id,a.id,ps.slice().reverse(),{...move,p:b.q,end:a.q,referenceFirst:last,referenceLast:first});
  }
 }
}
const records=[],worlds=[...new Set(coverage.maps.flatMap(m=>m.bells.map(b=>b.world)))];
for(const world of worlds){
 let g=new R.Graph(require(JS+'/PBZRouteWorlds/'+world).data,require(JS+'/PBZRouteFaces/'+world).faces);
 g.allowBlockedTraverse=true;require(JS+'/PBZRouteDrops').install(g);g.allowDrops=true;
 require(JS+'/PBZRouteObstacles').installSeams(g);g.allowSeams=true;attach(g);
 const courses=[];
 for(const link of coverage.worksheetLinks){
  const a=tables.bells[String(link.from).toLowerCase()],b=tables.bells[String(link.to).toLowerCase()];
  if(!a||!b){if(world===worlds[0])records.push({...link,status:'identity-unresolved',runtimeEnabled:false});continue;}
  if(a.world!==world)continue;
  if(b.world!==world){records.push({...link,world,toWorld:b.world,status:'scene-transition-unresolved',runtimeEnabled:false});continue;}
  const authored=fixed.find(c=>c.sourceBell===a.id&&c.targetBell===b.id);
  if(authored){records.push({...link,world,status:'measured-reference',runtimeEnabled:true,course:authored.id});continue;}
  const starts=S.anchors(g,point(a.at)),ends=S.anchors(g,point(b.at),true);let best=null;
  for(const s of starts)for(const e of ends){const leg=g.route(s.q,e.q,{startNode:s.id,endNode:e.id});if(leg&&(!best||leg.meters<best.meters))best=leg;}
  if(!best){records.push({...link,world,status:!starts.length||!ends.length?'anchor-unresolved':'geometry-unresolved',runtimeEnabled:false});continue;}
  const actions=best.moves.map(m=>{
   const actor=m.edge<g.e.length/6?g.actors[g.e[m.edge*6+5]-1]:null;
   return {...m,kind:({2:'ladder',3:'ascent',6:'drop'})[m.kind]||m.kind,guid:m.guid||actor?.guid,
    start:m.from,end:m.to,requiresLive:!!m.requiresLive||!!(m.guid||actor?.guid)&&!String(m.guid||actor?.guid).startsWith('drop:'),
    first:m.referenceFirst?xyz(m.referenceFirst):undefined,last:m.referenceLast?xyz(m.referenceLast):undefined};
  });
  const course={id:'roadbook-'+link.id,name:link.fromName+' → '+link.toName,world,sourceBell:a.id,targetBell:b.id,target:b.at,
   points:best.points.map(xyz),actions:actions.map(m=>({kind:m.kind,guid:m.guid,start:m.start,end:m.end,
    requiresLive:!!m.requiresLive,first:m.first,last:m.last})),checks:best.checks.map(c=>({...c,edge:-1})),
   sourceNode:link.sourceNode,hints:link.hints,validation:'current scene required'};
  courses.push(course);records.push({...link,world,status:'requires-scene-check',runtimeEnabled:true,course:course.id,
   points:course.points.length,meters:best.meters,actions:course.actions.length});
 }
 fs.writeFileSync(output+'/'+world+'.js',"'use strict';\nexports.courses="+JSON.stringify(courses)+';\n');
 console.log(world,courses.length,'candidate courses');
 // Discard large base64 module strings between worlds; never edit originals.
 for(const key of Object.keys(require.cache))if(/PBZRoute(Worlds|Faces|Chunks|DropsData)[\\/]/.test(key))delete require.cache[key];
 g=null;global.gc?.();
}
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const manifest={schema:1,sourceRoadbook:coverage.source,factsSHA256:sha(ROOT+'/authoring/placed-passage-facts.json'),
 worksheetSHA256:sha(ROOT+'/authoring/roadbook-bell-links.tsv'),links:records};
fs.writeFileSync(ROOT+'/authoring/roadbook-course-audit.json',JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(output+'/manifest.js',"'use strict';\nexports.data="+JSON.stringify(manifest)+';\n');
console.log('TOTAL',records.reduce((c,r)=>(c[r.status]=(c[r.status]||0)+1,c),{}));
