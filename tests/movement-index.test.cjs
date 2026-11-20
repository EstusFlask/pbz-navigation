'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),root=path.resolve(__dirname,'../Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute');
const run=job=>{let r;do{r=job.next();}while(!r.done);return r.value;};
test('empty offline proposals skip repeated discovery only when the entire query volume is covered',()=>{
 const manifest={schema:1,world:'test',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:0,coverage:[{boundsUE:[0,0,500,1000],heightBoundsUE:[0,100]},{boundsUE:[500,0,1000,1000],heightBoundsUE:[0,100]}]},module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')(id=>id==='./PBZRouteCore'?require(root+'/PBZRouteCore'):{data:manifest},module,module.exports);
 const args=['test',{sourceIndexSHA256:'same'},{x:10,y:10,z:0},{x:900,y:900,z:0},{maxRunCm:900,maxHeightCm:1100},[0,0,1000,1000],null,[0,100]];
 const empty=run(module.exports.candidates(...args));assert.equal(empty.length,0);assert.equal(empty.coverageComplete,true);
 manifest.coverage[1].boundsUE[0]=600;assert.equal(run(module.exports.candidates(...args)).coverageComplete,false,'a horizontal hole was counted as covered');manifest.coverage[1].boundsUE[0]=500;
 manifest.coverage[1].heightBoundsUE[0]=30;assert.equal(run(module.exports.candidates(...args)).coverageComplete,false,'an unbaked lower layer was counted as covered');
});

test('movement candidates outside the requested height are deferred without being discarded',()=>{
 const manifest={schema:1,world:'test',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:1,coverage:[]},data=[[10,10,100,100,10,50],[10,10,-500,100,10,-550]],module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')(id=>id==='./PBZRouteCore'?require(root+'/PBZRouteCore'):id.endsWith('/index')?{data:manifest}:{rows:data},module,module.exports);
 const rows=run(module.exports.candidates('test',{sourceIndexSHA256:'same'},{x:0,y:0,z:100},{x:200,y:0,z:50},{maxRunCm:800,maxHeightCm:1100},[0,0,1000,1000],null,[0,150]));
 assert.equal(rows.length,1);assert.equal(rows.deferred.length,1);assert.equal(rows.deferred[0].path[0][2],-500);assert.equal(new Set([...rows,...rows.deferred].map(r=>r.guid)).size,2);
});

test('surface candidates above the current jump apex remain available for checked ordinary slope walking',()=>{
 const manifest={schema:1,world:'test',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:1,coverage:[]},
  data=[[10,10,100,100,10,50],[10,10,-500,100,10,-550],[200,10,0,300,10,100]],module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')(id=>id==='./PBZRouteCore'?require(root+'/PBZRouteCore'):id.endsWith('/index')?{data:manifest}:{rows:data},module,module.exports);
 const query=maxRiseCm=>run(module.exports.candidates('test',{sourceIndexSHA256:'same'},{x:0,y:0,z:100},{x:400,y:0,z:50},{maxRunCm:800,maxHeightCm:1100,maxRiseCm},[0,0,1000,1000],null,[0,150]));
 const allowed=query(100),limited=query(50);assert.equal(allowed.length,2);assert.equal(allowed.deferred.length,1);assert.equal(limited.length,2,'a surface can be a physically checked walk rather than a jump');assert.equal(limited.deferred.length,1);
});

test('unavailable airborne movement retains indexed and newly discovered walking seams only',()=>{
 const manifest={schema:1,world:'test',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:1,coverage:[]};
 const data=[[0,0,0,140,0,150],[200,0,150,300,0,50],[100,0,170,220,0,20],[0,0,0,500,0,0]];
 const module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')
 (id=>id==='./PBZRouteCore'?require(root+'/PBZRouteCore'):id.endsWith('/index')?{data:manifest}:{rows:data},module,module.exports);
 const api=module.exports,positions=data.map(row=>({a:row.slice(0,3),b:row.slice(3)}));
 const rows=run(api.candidates('test',{sourceIndexSHA256:'same'},{x:0,y:0,z:0},{x:250,y:0,z:100},null));
 assert.deepEqual(Array.from(rows,f=>f.kind),['surface']);
 assert.equal(rows[0].both,true);
 const probed=run(api.boundaryFeatures(positions.slice(0,3),[],true));
 assert.deepEqual(Array.from(probed,f=>f.kind),['surface']);
});

test('the detour bound considers the allowed reverse of an uphill proposal but never reverses a pure fall',()=>{
 const manifest={schema:1,world:'test',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:1,coverage:[]};
 const uphill=[5400,11500,0,4600,11500,100],fall=[5400,11500,300,4600,11500,100],module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')(id=>id==='./PBZRouteCore'?require(root+'/PBZRouteCore'):id.endsWith('/index')?{data:manifest}:{rows:[uphill,fall]},module,module.exports);
 const start={x:0,y:0,z:100},goal={x:10000,y:0,z:0},policy={maxRunCm:850,maxHeightCm:1036};
 const query=(a,b)=>run(module.exports.candidates('test',{sourceIndexSHA256:'same'},a,b,policy));
 assert.deepEqual(Array.from(query(start,goal),f=>f.kind),['surface']);
 assert.deepEqual(Array.from(query(goal,start),f=>f.kind),['surface','fall']);
});

test('a private movement manifest still requires the exact world-build identity',()=>{
 const manifest={schema:1,world:'test',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:1,coverage:[]},rows=[[0,0,0,100,0,0]],module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')(id=>id==='./PBZRouteCore'?require(root+'/PBZRouteCore'):id.endsWith('/index')?{data:{...manifest,sourceIndexSHA256:'installed'}}:{rows},module,module.exports);
 const query=override=>run(module.exports.candidates('test',{sourceIndexSHA256:'same'},{x:0,y:0,z:0},{x:100,y:0,z:0},{maxRunCm:800,maxHeightCm:1100},[-100,-100,1000,1000],null,[-100,100],{manifest:override}));
 assert.equal(query(manifest).length,1);assert.equal(query({...manifest,sourceIndexSHA256:'other'}),null);assert.equal(query({...manifest,world:'other'}),null);
});

test('a selected global detour keeps its source geometry candidate beyond the straight-distance band',()=>{
 const manifest={schema:1,world:'test',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:1,coverage:[]},module={exports:{}};
 const rows=[[100,18000,100,200,18000,0],[100,18500,100,200,18500,0],[100,19000,1300,200,19000,0]];
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')(id=>id==='./PBZRouteCore'?require(root+'/PBZRouteCore'):id.endsWith('/index')?{data:manifest}:{rows},module,module.exports);
 const priority=new Set(['recast-movement:100,18000,100>200,18000,0','recast-movement:100,19000,1300>200,19000,0']);
 const args=['test',{sourceIndexSHA256:'same'},{x:0,y:0,z:100},{x:10000,y:0,z:0},{maxRunCm:800,maxHeightCm:1000},[-100,-100,20000,20000],null,[-200,1400]];
 assert.equal(run(module.exports.candidates(...args)).length,0);
 const candidates=run(module.exports.candidates(...args,{priority}));
 assert.deepEqual(Array.from(candidates,feature=>feature.guid),['recast-movement:100,18000,100>200,18000,0']);
 assert.equal(candidates[0].both,false);
});

test('boundary conversion is incremental and matches the packed direction contract',()=>{
 const M=require(root+'/PBZRouteMovementIndex');
 let reads=0;
 const rows=Array.from({length:120},(_,i)=>({get a(){reads++;return [i,0,i%2?200:0];},b:[i+100,0,50]}));
 const job=M.boundaryFeatures(rows);let part,max=0;
 do{const before=reads;part=job.next();max=Math.max(max,reads-before);}while(!part.done);
 assert.ok(max<=32);
 assert.equal(reads,rows.length);
 assert.deepEqual(part.value.slice(0,2).map(f=>[f.kind,f.both,f.guid]),[
  ['surface',true,'recast-movement:0,0,0>100,0,50'],['fall',false,'recast-movement:1,0,200>101,0,50']]);
});


test('rejected rows still yield while scanning a packed-size movement page',()=>{
 const manifest={schema:1,world:'test',sourceIndexSHA256:'same',kind:'geometry-movement-proposals',pages:1,coverage:[]},module={exports:{}};
 let reads=0;
 const rows=Array.from({length:512},()=>[3000,0,0,4000,0,0]);
 for(let i=0;i<rows.length;i++){
  const row=rows[i];
  Object.defineProperty(rows,i,{get(){reads++;return row;}});
 }
 rows[17][0]=100;rows[17][3]=150;reads=0;
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(root+'/PBZRouteMovementIndex.js','utf8')+'\n})')(id=>id==='./PBZRouteCore'?require(root+'/PBZRouteCore'):id.endsWith('/index')?{data:manifest}:{rows},module,module.exports);
 const task=module.exports.candidates('test',{sourceIndexSHA256:'same'},{x:0,y:0,z:0},{x:160,y:0,z:0},{maxRunCm:850,maxHeightCm:1100},[0,-50,200,50]);
 let step,max=0;
 do{const before=reads;step=task.next();max=Math.max(max,reads-before);}while(!step.done);
 assert.equal(reads,512);
 assert.equal(step.value.length,1);
 assert.ok(max<=64,'one step scanned '+max+' rows, bypassing yields for rejected rows');
});
