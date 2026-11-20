// Budgeted loading. Upstream Detour 599fd0f addTile/connectExtLinks replay.
// Ordinary JS scheduling of stock link construction; stock Detour does queries.
// Explicitly unsupported: any off-mesh polygon/connection, live graph mutation.
// Altered translation of DetourNavMesh.cpp; upstream license follows.
// Copyright (c) 2009-2010 Mikko Mononen memon@inside.org
// This software is provided 'as-is', without any express or implied warranty.
// In no event will the authors be held liable for any damages arising from the
// use of this software. Permission is granted to anyone to use this software
// for any purpose, including commercial applications, and to alter it and
// redistribute it freely, subject to the following restrictions:
// 1. The origin of this software must not be misrepresented; you must not claim
// that you wrote the original software. If you use this software in a product,
// an acknowledgment in the product documentation would be appreciated but is
// not required. 2. Altered source versions must be plainly marked as such, and
// must not be misrepresented as being the original software. 3. This notice
// may not be removed or altered from any source distribution.
const F=Math.fround,EXT=0x8000,NULL=0xffffffff,OPP=s=>(s+4)&7;
export function* prepare(bytes,slot){
 if(!ArrayBuffer.isView(bytes)||bytes.BYTES_PER_ELEMENT!==1||bytes.length<100)throw Error('Invalid Detour tile byte extent');
 const sourceHeader=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(sourceHeader.getUint32(0,true)!==0x444e4156||sourceHeader.getUint32(4,true)!==7)throw Error('Unsupported Detour tile format');
 if(sourceHeader.getInt32(52,true)!==0)throw Error('Budgeted admission rejects offMeshConCount > 0');
 const copy=new Uint8Array(bytes.length);
 for(let at=0;at<bytes.length;at+=16384){copy.set(bytes.subarray(at,at+16384),at);yield 'copy';}
 const v=new DataView(copy.buffer),polyCount=v.getInt32(24,true),vertCount=v.getInt32(28,true),polyAt=100+vertCount*12;
 if(polyCount<1||vertCount<1||polyAt+polyCount*32>bytes.length)throw Error('Invalid Detour polygon extent');
 const portals=[],sides=Array.from({length:8},()=>[]);
 for(let i=0;i<polyCount;i++){
  const p=polyAt+i*32,n=v.getUint8(p+30),type=v.getUint8(p+31)>>6;
  if(type!==0)throw Error('Budgeted admission rejects offmesh/non-ground polygon type');
  for(let j=0;j<n;j++){
   const at=p+16+j*2,nei=v.getUint16(at,true);if(!(nei&EXT))continue;
   const side=nei&255;if(![0,2,4,6].includes(side))throw Error('Unexpected external side');
   const ai=100+v.getUint16(p+4+j*2,true)*12,bi=100+v.getUint16(p+4+((j+1)%n)*2,true)*12;
   const a=[v.getFloat32(ai,true),v.getFloat32(ai+4,true),v.getFloat32(ai+8,true)],b=[v.getFloat32(bi,true),v.getFloat32(bi+4,true),v.getFloat32(bi+8,true)];
   const axis=side===0||side===4?2:0,apos=a[axis],bpos=b[axis];
   const edge={i,j,nei,side,a,b,axis,coord:a[axis===2?0:2],min:apos<bpos?[apos,a[1]]:[bpos,b[1]],max:apos<bpos?[bpos,b[1]]:[apos,a[1]]};
   portals.push(edge);sides[side].push(edge);v.setUint16(at,0,true);
  }
  if((i&31)===31)yield 'strip-index';
 }
 return{copy,slot,polyCount,portals,sides,x:v.getInt32(8,true),y:v.getInt32(12,true),layer:v.getInt32(16,true),climb:v.getFloat32(68,true)};
}
export function* restore(row){
 for(let i=0;i<row.portals.length;i++){
  const e=row.portals[i];row.raw.get_polys(e.i).set_neis(e.j,e.nei);
  if((i&31)===31)yield 'restore';
 }
}
// Every arithmetic operation follows the source f32 expression boundaries.
function overlap(a,b,climb){
 const px=F(.01),minx=Math.max(F(a.min[0]+px),F(b.min[0]+px)),maxx=Math.min(F(a.max[0]-px),F(b.max[0]-px));
 if(minx>maxx)return false;
 const ad=F(F(a.max[1]-a.min[1])/F(a.max[0]-a.min[0])),ak=F(a.min[1]-F(ad*a.min[0]));
 const bd=F(F(b.max[1]-b.min[1])/F(b.max[0]-b.min[0])),bk=F(b.min[1]-F(bd*b.min[0]));
 const aminy=F(F(ad*minx)+ak),amaxy=F(F(ad*maxx)+ak),bminy=F(F(bd*minx)+bk),bmaxy=F(F(bd*maxx)+bk);
 const dmin=F(bminy-aminy),dmax=F(bmaxy-amaxy);
 if(F(dmin*dmax)<0)return true;
 const py2=F(climb*F(2)),thr=F(py2*py2);
 return F(dmin*dmin)<=thr||F(dmax*dmax)<=thr;
}
function addLink(source,e,target,c){
 const idx=source.raw.get_linksFreeList()>>>0;if(idx===NULL)return;
 const link=source.raw.get_links(idx),poly=source.raw.get_polys(e.i);
 source.raw.set_linksFreeList(link.get_next());
 link.set_ref((target.base|c.edge.i)>>>0);link.set_edge(e.j);link.set_side(e.side);
 link.set_next(poly.get_firstLink());poly.set_firstLink(idx);
 let lo=F(F(c.min-e.a[e.axis])/F(e.b[e.axis]-e.a[e.axis])),hi=F(F(c.max-e.a[e.axis])/F(e.b[e.axis]-e.a[e.axis]));
 if(lo>hi)[lo,hi]=[hi,lo];
 link.set_bmin(Math.round(F(Math.max(0,Math.min(1,lo))*F(255))));
 link.set_bmax(Math.round(F(Math.max(0,Math.min(1,hi))*F(255))));
}
export function* connect(source,target,side){
 const edges=side===-1?source.portals:source.sides[side];let work=0;
 for(const e of edges){
  const found=[];let previous=-1;
  // Index retains increasing poly, then edge order from findConnectingPolys.
  for(const c of target.sides[OPP(e.side)]){
   if(++work>=64){work=0;yield 'external-scan';}
   if(c.i===previous)continue;
   if(Math.abs(F(e.coord-c.coord))>F(.01))continue;
   if(!overlap(e,c,target.climb))continue;
   found.push({edge:c,min:Math.max(e.min[0],c.min[0]),max:Math.min(e.max[0],c.max[0])});previous=c.i;
   if(found.length===4)break;
  }
  for(const c of found)addLink(source,e,target,c);
  if(++work>=64){work=0;yield 'external-links';}
 }
}
const offsets=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
export function events(rows){
 const result=[],prior=[];
 for(const row of rows){
  const same=prior.filter(t=>t.x===row.x&&t.y===row.y).reverse();
  if(same.length>31)throw Error('Budgeted sameXY exceeds native MAX_NEIS');
  for(const old of same)result.push([row,old,-1],[old,row,-1]);
  for(let side=0;side<8;side++){
   const [dx,dy]=offsets[side],neis=prior.filter(t=>t.x===row.x+dx&&t.y===row.y+dy).reverse();
   if(neis.length>32)throw Error('Budgeted neighbors exceed native MAX_NEIS');
   for(const old of neis)result.push([row,old,side],[old,row,OPP(side)]);
  }
  prior.push(row);
 }
 return result;
}
