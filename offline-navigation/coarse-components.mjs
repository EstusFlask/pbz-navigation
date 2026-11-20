export function* tileComponentsJob(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<100)throw Error('Unsupported coarse tile layout');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=view.getInt32(24,true),vertices=view.getInt32(28,true),at=100+vertices*12;
 if(view.getUint32(0,true)!==0x444e4156||view.getInt32(4,true)!==7||count<0||count>65536||vertices<0||at+count*32>bytes.byteLength)throw Error('Unsupported coarse tile layout');
 const parent=new Int32Array(count),labels=new Int32Array(count);
 for(let polygon=0;polygon<count;polygon++){parent[polygon]=polygon;if((polygon&511)===511)yield;}
 const find=polygon=>{while(parent[polygon]!==polygon){parent[polygon]=parent[parent[polygon]];polygon=parent[polygon];}return polygon;};
 for(let polygon=0;polygon<count;polygon++){
  const edges=view.getUint8(at+polygon*32+30);if(edges>6)throw Error('Unsupported coarse polygon layout');
  for(let edge=0;edge<edges;edge++){
   const next=view.getUint16(at+polygon*32+16+edge*2,true);if(!next||next&0x8000)continue;
   if(next>count)throw Error('Invalid coarse polygon neighbor');
   const first=find(polygon),second=find(next-1);if(first!==second)parent[first]=second;
  }
  if((polygon&63)===63)yield;
 }
 const ordinals=new Map();
 for(let polygon=0;polygon<count;polygon++){
  const component=find(polygon);if(!ordinals.has(component))ordinals.set(component,ordinals.size);labels[polygon]=ordinals.get(component);
  if((polygon&255)===255)yield;
 }
 return{labels,components:ordinals.size};
}

export function movementComponentEdges(from,to,entry,exit){
 if(from===to)return[];
 const kind=entry[2]-exit[2]<100?'surface':'fall',guid='recast-movement:'+entry.map(Math.round).join(',')+'>'+exit.map(Math.round).join(','),cost=Math.hypot(...entry.map((value,axis)=>value-exit[axis]));
 const forward={from,to,cost,entry,exit,kind,guid,reverse:false};
 return kind==='surface'?[forward,{...forward,from:to,to:from,entry:exit,exit:entry,reverse:true}]:[forward];
}
