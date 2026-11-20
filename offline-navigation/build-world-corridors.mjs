// Coarse components come from baked polygons; every cross-tile edge is an
// actual upstream Detour link. Optimistic actor states are query hints only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {initialize,Planner} from './query.mjs';
import {decodeBase64} from './nav-set.mjs';
const folder=path.resolve(process.argv[2]??'build/offline-navigation/worlds/pbz_pangzhen_wp');
const raw=fs.readFileSync(path.join(folder,'navigation-index.json')),index=JSON.parse(raw),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(index.remainingTiles||index.failures.length)throw Error('Incomplete world');
await initialize();
const key=t=>t.x+','+t.y+','+t.layer,tiles=new Map(),nodes=[],edges=[],cache=new Map();
function bytes(id){
 if(cache.has(id)){const b=cache.get(id);cache.delete(id);cache.set(id,b);return b;}
 const b=fs.readFileSync(path.join(folder,index.blobs[id].file));if(hash(b)!==id)throw Error('Changed corridor input blob');cache.set(id,b);if(cache.size>32)cache.delete(cache.keys().next().value);return b;
}
function components(tile){
 const b=bytes(tile.blob),v=new DataView(b.buffer,b.byteOffset,b.byteLength),n=v.getInt32(24,true),nv=v.getInt32(28,true),at=100+nv*12;
 const parent=Int32Array.from({length:n},(_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let i=0;i<n;i++)for(let j=0;j<v.getUint8(at+i*32+30);j++){
  const neighbor=v.getUint16(at+i*32+16+j*2,true);if(neighbor&&!(neighbor&0x8000)){const a=find(i),c=find(neighbor-1);if(a!==c)parent[a]=c;}
 }
 const groups=new Map(),byPoly=new Int32Array(n),external=[];
 for(let i=0;i<n;i++){
  const comp=find(i);if(!groups.has(comp)){
   const id=nodes.length,count=v.getUint8(at+i*32+30),p=[0,0,0];
   for(let j=0;j<count;j++){const vi=v.getUint16(at+i*32+4+j*2,true);for(let k=0;k<3;k++)p[k]+=v.getFloat32(100+vi*12+k*4,true)/count;}
   groups.set(comp,id);nodes.push([tile.x,tile.y,tile.layer,p[0]*100,-p[2]*100,p[1]*100,[]]);edges.push(new Set());
  }
  byPoly[i]=groups.get(comp);
  if(Array.from({length:v.getUint8(at+i*32+30)},(_,j)=>v.getUint16(at+i*32+16+j*2,true)).some(n=>n&0x8000))external.push(i);
 }
 return{byPoly,external,seeds:[...groups.values()]};
}
let done=0;
for(const row of index.tiles){
 const blob=row.variants['0'.repeat(row.conditions.length)];if(!blob)continue;
 const tile={...row,blob};Object.assign(tile,components(tile));tiles.set(key(tile),tile);
 if(++done%10000===0)console.log('CORRIDOR COMPONENTS',done,'/',index.tiles.length,nodes.length);
}
const maxPolys=Math.max(16384,2**Math.ceil(Math.log2(Object.values(index.blobs).reduce((n,b)=>Math.max(n,b.polygons??16384),1)))),maxTiles=2**22/maxPolys;
const header=decodeBase64(index.navHeaderBase64),hv=new DataView(header.buffer);hv.setInt32(32,maxTiles,true);hv.setInt32(36,maxPolys,true);
const planner=new Planner(header,index),xy=new Map();
for(const tile of tiles.values()){const k=tile.x+','+tile.y;if(!xy.has(k))xy.set(k,[]);xy.get(k).push(tile);}
function connect(a,b,slot){
 const nav=planner.navMesh,tile=nav.getTile(slot),base=nav.getPolyRefBase(tile);
 for(const i of a.external){
  const poly=tile.polys(i);let at=poly.firstLink()>>>0,count=0;
  while(at!==0xffffffff&&++count<=tile.header().maxLinkCount()){
   const link=tile.links(at);at=link.next()>>>0;if(link.side()===0xff)continue;
   const ref=link.ref(),decoded=nav.decodePolyId(ref);if(decoded.tileIndex!==1-slot)continue;
   const first=a.byPoly[i],last=b.byPoly[decoded.tilePolygonIndex];if(last===undefined)throw Error('Invalid coarse neighbor polygon');edges[first].add(last);
  }
 }
 // Project representatives onto the exact detail surface of their polygon.
 for(const id of a.seeds){const node=nodes[id],poly=a.byPoly.indexOf(id),h=planner.query.getPolyHeight(base+poly,{x:node[3]/100,y:node[5]/100,z:-node[4]/100});if(h.success)node[5]=h.height*100;}
}
try{
 done=0;
 for(const a of tiles.values()){
  planner.replaceTile(0,bytes(a.blob));
  for(const [x,y]of [[a.x+1,a.y],[a.x,a.y+1]])for(const b of xy.get(x+','+y)??[]){
   if(a.verticalBoundsUE[0]>b.verticalBoundsUE[1]+100||b.verticalBoundsUE[0]>a.verticalBoundsUE[1]+100)continue;
   planner.replaceTile(1,bytes(b.blob));connect(a,b,0);connect(b,a,1);planner.replaceTile(1,null);
  }
  if(++done%10000===0)console.log('CORRIDOR LINKS',done,'/',tiles.size);
 }
}finally{planner.destroy();}
for(let i=0;i<nodes.length;i++)nodes[i][6]=[...edges[i]].sort((a,b)=>a-b);
const result={schema:1,world:index.world,kind:'detour-component-corridors',sourceIndexSHA256:hash(raw),
 sourcePolicy:'optimistic actor variants; all final segments require current-state Detour and live physical checks',nodes,
 seeds:Object.fromEntries([...tiles].map(([id,t])=>[id,t.seeds])),directedEdges:edges.reduce((sum,s)=>sum+s.size,0),physicalVerified:false};
fs.writeFileSync(path.join(folder,'corridors.json.tmp'),JSON.stringify(result));fs.renameSync(path.join(folder,'corridors.json.tmp'),path.join(folder,'corridors.json'));
console.log('CORRIDOR RESULT',nodes.length,'components;',result.directedEdges,'directed Detour links');
