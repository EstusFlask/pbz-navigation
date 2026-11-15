'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const root=process.env.PBZ_TEST_SOURCE||path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const R=require(root+'/PBZRouteCore'),{Index}=require(root+'/PBZRouteMapHints'),Local=require(root+'/PBZRouteLocalWalk');
function run(job){let row,n=0;do{row=job.next();assert.ok(++n<100000);}while(!row.done);return row.value;}
function fixture(points){
 const p=Buffer.from(Int32Array.from(points.flat().map(v=>Math.round(v*10))).buffer).toString('base64');
 const row={name:'fixture/0',lo:Math.min(...points.map(p=>p[2])),hi:Math.max(...points.map(p=>p[2])),n:points.length};
 let loads=0;
 const index=new Index({schema:1,tileSize:3200,scale:10,points:points.length,tiles:{'0,0':[row]}},()=>{loads++;return {p};});
 return {index,loads:()=>loads,row,p};
}

test('surface geometry loads locally on demand and keeps overlapping floors separate',()=>{
 const f=fixture([[140,0,0],[280,0,0],[140,0,600]]);
 assert.equal(f.loads(),0);
 assert.deepEqual(f.index.near({x:0,y:0,z:0}),[{x:140,y:0,z:0}]);
 assert.equal(f.loads(),1);
 const upper=f.index.near({x:0,y:0,z:600});assert.deepEqual(upper,[{x:140,y:0,z:600}]);
 upper[0].z=0;assert.equal(f.index.near({x:0,y:0,z:600})[0].z,600);
 assert.deepEqual(f.index.candidates({x:0,y:0,z:0},Infinity),[]);
});

test('one candidate query bounds cold module reads and a corrupt page cannot become ground',()=>{
 const f=fixture([[140,0,0]]);let loads=0;
 const rows=Array.from({length:20},(_,i)=>({...f.row,name:'page'+i}));
 const index=new Index({schema:1,tileSize:3200,scale:10,tiles:{'0,0':rows}},()=>{loads++;return {p:f.p};});
 index.near({x:0,y:0,z:0});assert.equal(loads,8);
 const broken=new Index({schema:1,tileSize:3200,scale:10,tiles:{'0,0':[f.row]}},()=>({p:''}));
 assert.deepEqual(broken.near({x:0,y:0,z:0}),[]);assert.equal(broken.failed.size,1);
 assert.deepEqual(broken.near({x:0,y:0,z:0}),[]);
});

test('a first query can use embedded surfaces, and each new route checks a changed gate again',()=>{
 const f=fixture(Array.from({length:9},(_,i)=>[i*140,0,0]));let locked=false,checks=0;
 const world={floorAt:p=>p,step:(a,b)=>{checks++;return locked&&Math.min(a.x,b.x)<560&&Math.max(a.x,b.x)>=560?
  {locked:true,why:'closed gate'}:{p:b};}};
 const start={x:0,y:0,z:0},goal={x:1120,y:0,z:0},options={hints:f.index,hintsOnly:true,clock:()=>0};
 const route=run(Local.search(world,start,goal,options));assert.ok(route&&!route.partial&&route.physicalVerified);
 assert.ok(checks>0&&checks<=64);assert.equal(f.loads(),1);
 locked=true;assert.equal(run(Local.search(world,start,goal,options)),null);
 const upper={...goal,z:600};assert.equal(run(Local.search(world,start,upper,{...options,
  hints:fixture([[0,0,0],[1120,0,600]]).index})),null);
});

test('surface fallback shares reviewed-graph physics and time budgets',()=>{
 const f=fixture(Array.from({length:9},(_,i)=>[i*140,0,0]));
 const observed={near:()=>[],candidates:()=>[]},hints={observed,surface:f.index};
 let checks=0,now=0;
 const world={floorAt:p=>p,step:(a,b)=>{checks++;now+=10;return {p:b};}};
 assert.equal(run(Local.search(world,{x:0,y:0,z:0},{x:1120,y:0,z:0},
  {hints,hintsOnly:true,maxChecks:1,clock:()=>0})),null);
 assert.equal(checks,1);
 checks=0;assert.equal(run(Local.search(world,{x:0,y:0,z:0},{x:1120,y:0,z:0},
  {hints,hintsOnly:true,maxMs:1,clock:()=>now})),null);
 assert.equal(checks,1);
});

test('a failed surface proposal keeps the original live-grid coordinate phase',()=>{
 const f=fixture([[13.7,29.1,0]]),start={x:0,y:0,z:0},goal={x:1400,y:0,z:0};let checks=0;
 const world={floorAt:p=>p,step:(a,b)=>{checks++;
  if(R.dist(b,goal)>.1){assert.ok(Math.abs(b.x/70-Math.round(b.x/70))<1e-7);assert.ok(Math.abs(b.y/70-Math.round(b.y/70))<1e-7);}
  return {p:b};}};
 const route=run(Local.search(world,start,goal,{hints:f.index,clock:()=>0,maxNodes:100}));
 assert.ok(route&&!route.partial);assert.ok(checks<1000);
});

test('every embedded candidate page matches its authoring hash, tile and floor bounds',()=>{
 const base=path.join(root,'PBZRouteMapData'),manifest=JSON.parse(fs.readFileSync(base+'/manifest.json','utf8'));
 assert.equal(manifest.sources.length,2);assert.equal(Object.keys(manifest.worlds).length,11);
 let total=0,maxBytes=0;
 for(const [world,audit]of Object.entries(manifest.worlds)){
  const meta=require(base+'/'+world+'/index').data;let count=0;
  assert.equal(meta.zBandCm,3200);
  for(const [cell,pages]of Object.entries(meta.tiles))for(const row of pages){
   const file=base+'/'+row.name+'.js',bytes=Buffer.from(require(file).data.p,'base64'),values=new Int32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
   maxBytes=Math.max(maxBytes,fs.statSync(file).size);
   assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256);
   assert.equal(values.length,row.n*3);assert.ok(row.n<=4096);
   assert.equal(Math.floor(row.lo/3200),Math.floor(row.hi/3200),'distant floors share a cold-load page');
   for(let i=0;i<values.length;i+=3){
    assert.equal([Math.floor(values[i]/32000),Math.floor(values[i+1]/32000)].join(','),cell);
    assert.ok(values[i+2]/10>=row.lo&&values[i+2]/10<=row.hi);
   }
   count+=row.n;
  }
  assert.equal(count,meta.points);assert.equal(count,audit.points);total+=count;
  assert.ok(require(root+'/PBZRouteWalkHints').forWorld(world),'source world was not connected to planning: '+world);
 }
 assert.ok(total>1000000);assert.ok(maxBytes<66000);
 const coverage=manifest.modelCoverage;
 assert.equal(coverage.length,12);assert.ok(coverage.every(c=>c.available),'a chapter model encoding was silently omitted');
 assert.ok(coverage.filter(c=>c.chapter>=1&&c.chapter<=9).every(c=>c.assets===0&&c.baseModelChunks>0));
 assert.ok(Object.values(manifest.worlds).filter(w=>w.baseModelTriangles>0).length>=8);
 assert.equal(require(root+'/PBZRouteMapHints').forWorld('pbz_unknown_wp'),null);
});
