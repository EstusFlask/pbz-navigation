'use strict';
// Offline surface proposals contain no route or player history. Current
// Detour, floor, capsule, player capabilities and locks remain authoritative.
const R=require('./PBZRouteCore');
const movementKind=drop=>drop<100?'surface':'fall';
// Search nearby mesh seams even if the game supplies no current launch.
// These bounds only admit probes; the caller still checks ground and body.
const walkingEnvelope=Object.freeze({maxHeightCm:100,maxRunCm:315});
const movementID=(a,b)=>'recast-movement:'+a.map(Math.round).join(',')+'>'+b.map(Math.round).join(',');
const feature=(a,b,kind,guid)=>({guid,kind,both:kind==='surface',source:'recast-boundary',path:[a,b]});
function* boundaryFeatures(rows,recovered,walkingOnly=false){
 const result=[];
 for(let i=0;i<rows.length;i++){
  const {a,b}=rows[i],kind=movementKind(a[2]-b[2]);
  if(!walkingOnly||kind==='surface')
   (recovered&&rows[i].boundaryRecovery?recovered:result).push(feature(a,b,kind,movementID(a,b)));
  if((i&31)===31)yield;
 }
 return result;
}
function* candidates(world,index,start,goal,policy,bounds,navigationGrid,vertical,io){
 let manifest;try{manifest=io?.manifest||require('./PBZRouteMovementData/'+world+'/index').data;}catch(_){return null;}yield;
 if(manifest.navigationGrid&&manifest.navigationGrid!==navigationGrid)return null;
 const packed=manifest.schema===2&&manifest.kind==='spatial-geometry-movement-proposals';
 if(manifest.world!==world||manifest.sourceIndexSHA256!==index.sourceIndexSHA256||!packed&&(manifest.schema!==1||manifest.kind!=='geometry-movement-proposals'||manifest.pages>256))return null;
 const envelope=policy||walkingEnvelope;
 const rows=[],deferred=[],seen=new Set(),maximum=Number(envelope.maxRunCm),height=Number(envelope.maxHeightCm);
 const maxDetour=R.dist(start,goal)+15000;
 let pages,reader;
 if(packed){
  if(!io?.readText||!io?.core||!io?.state)return null;
  const key=world+'/'+manifest.sourceIndexSHA256+'/'+manifest.packedFromManifestSHA256;
  if(io.state.key!==key){io.state.reader?.clear();io.state.reader=new(require('./PBZRouteMovementStore').Reader)(manifest,io.readText,io.core());io.state.key=key;}
  reader=io.state.reader;const query=bounds||[Math.min(start.x,goal.x)-maximum,Math.min(start.y,goal.y)-maximum,Math.max(start.x,goal.x)+maximum,Math.max(start.y,goal.y)+maximum];pages=yield* reader.descriptorsJob(query);
 }else pages=Array.from({length:manifest.pages},(_,i)=>i);
 for(const page of pages){
  let data;if(reader)data=yield* reader.pageJob(page);else{try{data=require('./PBZRouteMovementData/'+world+'/'+page).rows;}catch(_){return null;}yield;}
  if(!Array.isArray(data)||data.length>512)return null;
  for(let i=0;i<data.length;i++){
   // Bound scanning even if every candidate in this page is rejected.
   if(i&&(i&63)===0)yield;
   const row=data[i];if(!Array.isArray(row)||row.length!==6||!row.every(Number.isFinite))return null;
   const [ax,ay,az,bx,by,bz]=row,drop=az-bz;
   // A surface proposal can be an ordinary checked stair/slope connector.
   // Its total elevation gain is not bounded by the pawn's jump apex.
   // Keep the generator's envelope; sweepJob must prove a walk before the
   // separate ballistic policy can certify a jump.
   if(drop>height||!policy&&drop>=100||drop< -200||bounds&&(
    Math.min(ax,bx)<bounds[0]||Math.max(ax,bx)>bounds[2]||
    Math.min(ay,by)<bounds[1]||Math.max(ay,by)>bounds[3]
   )||Math.hypot(ax-bx,ay-by)>maximum+1)continue;
   const a={x:ax,y:ay,z:az},b={x:bx,y:by,z:bz};
   const kind=movementKind(drop),both=kind==='surface';
   // Filter by an allowed direction. Physical checks still validate the
   // selected direction using the current floor and pawn capabilities.
   const outsideBand=R.dist(start,a)+R.dist(b,goal)>maxDetour&&
      (!both||R.dist(start,b)+R.dist(a,goal)>maxDetour);
   if(outsideBand&&!io?.priority?.size)continue;
   const ap=row.slice(0,3),bp=row.slice(3),guid=movementID(ap,bp);
   if(outsideBand&&!io.priority.has(guid)||seen.has(guid))continue;
   seen.add(guid);
   const candidate=feature(ap,bp,kind,guid);
   if(vertical&&[a,b].some(p=>p.z<vertical[0]||p.z>vertical[1]))deferred.push(candidate);else rows.push(candidate);
  }
 }
 if(bounds&&manifest.coverage?.length){
  const covers=manifest.coverage.filter(c=>c.boundsUE?.length===4&&(!vertical||c.heightBoundsUE?.[0]<=vertical[0]&&c.heightBoundsUE?.[1]>=vertical[1])),xs=[bounds[0],bounds[2]],ys=[bounds[1],bounds[3]];
  for(const c of covers){for(const x of[c.boundsUE[0],c.boundsUE[2]])if(x>bounds[0]&&x<bounds[2])xs.push(x);for(const y of[c.boundsUE[1],c.boundsUE[3]])if(y>bounds[1]&&y<bounds[3])ys.push(y);}
  xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);let complete=true,work=0;
  for(let i=1;i<xs.length&&complete;i++)for(let j=1;j<ys.length;j++){
   const x=(xs[i-1]+xs[i])/2,y=(ys[j-1]+ys[j])/2;
   if(!covers.some(c=>x>=c.boundsUE[0]&&x<=c.boundsUE[2]&&y>=c.boundsUE[1]&&y<=c.boundsUE[3])){complete=false;break;}
   if((++work&31)===0)yield;
  }
  rows.coverageComplete=complete;
 }
 rows.deferred=deferred;return rows;
}
exports.candidates=candidates;exports.boundaryFeatures=boundaryFeatures;
exports.walkingEnvelope=walkingEnvelope;
