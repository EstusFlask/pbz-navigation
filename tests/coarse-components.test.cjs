'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const drain=job=>{let row;do{row=job.next();}while(!row.done);return row.value;};
function tile(neighbors){
 const bytes=new Uint8Array(100+neighbors.length*32),view=new DataView(bytes.buffer);
 view.setUint32(0,0x444e4156,true);view.setInt32(4,7,true);view.setInt32(24,neighbors.length,true);
 for(let polygon=0;polygon<neighbors.length;polygon++){view.setUint8(100+polygon*32+30,neighbors[polygon].length);neighbors[polygon].forEach((next,edge)=>view.setUint16(100+polygon*32+16+edge*2,next,true));}
 return bytes;
}
test('coarse IDs follow first-polygon component order and ignore external portals',async()=>{
 const {tileComponentsJob}=await import('../offline-navigation/coarse-components.mjs');
 const result=drain(tileComponentsJob(tile([[3],[0x8000],[1],[]])));
 assert.equal(result.components,3);assert.deepEqual([...result.labels],[0,1,0,2]);
});
test('coarse component decoding rejects invalid stock layouts and neighbor indices',async()=>{
 const {tileComponentsJob}=await import('../offline-navigation/coarse-components.mjs');
 assert.throws(()=>drain(tileComponentsJob(tile([[2]]))),/neighbor/);
 assert.throws(()=>drain(tileComponentsJob(new Uint8Array(20))),/layout/);
 const bytes=tile([[]]);new DataView(bytes.buffer).setInt32(24,65537,true);
 assert.throws(()=>drain(tileComponentsJob(bytes)),/layout/);
});

test('movement component hints keep source identity and never reverse pure falls',async()=>{
 const {movementComponentEdges}=await import('../offline-navigation/coarse-components.mjs');
 const uphill=movementComponentEdges(4,9,[10,20,100],[30,40,250]);
 assert.equal(uphill.length,2);assert.deepEqual(uphill.map(row=>[row.from,row.to,row.kind,row.reverse]),[[4,9,'surface',false],[9,4,'surface',true]]);
 assert.equal(uphill[0].guid,uphill[1].guid);assert.deepEqual(uphill[1].entry,uphill[0].exit);
 const fall=movementComponentEdges(4,9,[10,20,500],[30,40,100]);assert.equal(fall.length,1);assert.equal(fall[0].kind,'fall');assert.equal(fall[0].reverse,false);
 assert.deepEqual(movementComponentEdges(4,4,[10,20,100],[30,40,100]),[]);
});
