'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../offline-navigation/grid-mask.mjs');
test('coarse support requires the entire cell inside one real convex surface',async()=>{
 const {containsConvexCell,allowedCell}=await load(),diamond={xy:[[0,-100],[100,0],[0,100],[-100,0]],boundsUE:[-100,-100,100,100]};
 assert.equal(containsConvexCell(diamond,[-10,-10,10,10]),true);
 assert.equal(containsConvexCell(diamond,[-80,-80,80,80]),false,'a supported center bridged unsupported corners');
 const strips=[{xy:[[0,0],[45,0],[45,100],[0,100]],boundsUE:[0,0,45,100]},{xy:[[55,0],[100,0],[100,100],[55,100]],boundsUE:[55,0,100,100]}];
 assert.equal(allowedCell(strips,[],[10,10,90,90],0),false,'separate support pieces bridged a hole');
});
test('a small obstacle outside the cell center still forbids the complete column',async()=>{
 const {allowedCell}=await load(),surface={xy:[[-100,-100],[200,-100],[200,200],[-100,200]],boundsUE:[-100,-100,200,200]};
 assert.equal(allowedCell([surface],[],[0,0,100,100]),true);
 assert.equal(allowedCell([surface],[[4,4,500,6,6,501]],[0,0,100,100]),false);
});
test('compact masking removes every vertical span and its fast path preserves proven full support',async()=>{
 const {maskCompactHeightfield}=await load(),surface={xy:[[-100,-300],[300,-300],[300,100],[-100,100]],boundsUE:[-100,-300,300,100]};
 function fixture(){const areas=Array(8).fill(1);return{areas,get_width:()=>2,get_height:()=>2,get_cs:()=>1,get_bmin:()=>0,get_cells:i=>({get_index:()=>i*2,get_count:()=>2}),get_areas:i=>areas[i],set_areas:(i,value)=>areas[i]=value};}
 const complete=fixture();assert.equal(maskCompactHeightfield(complete,[surface],[]).rejectedCells,0);assert.deepEqual(complete.areas,Array(8).fill(1));
 const blocked=fixture(),stats=maskCompactHeightfield(blocked,[surface],[[15,-25,10000,25,-15,10001]]);
 assert.equal(stats.rejectedCells,1);assert.deepEqual(blocked.areas,[0,0,1,1,1,1,1,1]);
});
