// Read-only geometry inside the authored launch volume. These are coarse
// window hints, never certified standing pads or usable movement actions.
export function hookVolumePoints(planner,box,volume,halfHeight=96,capsuleRadius=0){
 if(!volume.valid(box))return[];
 const origin=planner.origin||[0,0,0],extent=[0,1,2].map(i=>box.axes.reduce((n,a)=>n+Math.abs(a[i]),0)),center=box.center.map((v,i)=>v-(i===2?halfHeight:0)),nav=p=>({x:(p[0]-origin[0])/100,y:(p[2]-origin[2])/100,z:-(p[1]-origin[1])/100}),ue=p=>[origin[0]+p.x*100,origin[1]-p.z*100,origin[2]+p.y*100],q=planner.query;
 const found=q.queryPolygons(nav(center),{x:(extent[0]+capsuleRadius)/100,y:(extent[2]+(capsuleRadius?halfHeight:0))/100,z:(extent[1]+capsuleRadius)/100},{maxPolys:8192});
 if(!found.success||found.polyRefs.length>=8192)throw Error('Hook volume polygon budget exceeded');
 const points=new Map();
 for(const ref of found.polyRefs){
  const row=planner.navMesh.getTileAndPolyByRef(ref);if(!row.success)continue;
  const count=row.poly.vertCount();if(count<3)continue;
  const average={x:0,y:0,z:0};for(let i=0;i<count;i++){const j=row.poly.verts(i)*3;average.x+=row.tile.verts(j)/count;average.y+=row.tile.verts(j+1)/count;average.z+=row.tile.verts(j+2)/count;}
  for(const target of [nav(center),average]){
   const projected=q.closestPointOnPoly(ref,target);if(!projected.success)continue;const p=ue(projected.closestPoint);
   const inside=capsuleRadius?volume.overlapsCapsule(box,p,halfHeight,capsuleRadius):volume.contains(box,p,halfHeight);
   if(inside)points.set(p.map(v=>Math.round(v*10)).join(','),p);
  }
 }
 return [...points.values()];
}
