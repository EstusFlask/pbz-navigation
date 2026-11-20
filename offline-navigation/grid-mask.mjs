// Offline coarse-plane mask. Exact extracted double-precision geometry is input.
// A cell is accepted only when its entire XY rectangle fits ONE true convex top.
// All non-plane source XY AABBs forbid the complete column in this coarse grid.
export function containsConvexCell(poly,cell,marginCm=2){
 const [minX,minY,maxX,maxY]=cell;
 if(!Number.isFinite(marginCm)||marginCm<0||minX>maxX||minY>maxY)throw Error('Invalid coarse mask cell');
 const b=poly.boundsUE;if(minX<b[0]+marginCm||minY<b[1]+marginCm||maxX>b[2]-marginCm||maxY>b[3]-marginCm)return false;
 for(let i=0;i<poly.xy.length;i++){
  const a=poly.xy[i],b=poly.xy[(i+1)%poly.xy.length],dx=b[0]-a[0],dy=b[1]-a[1];
  // Minimum signed cross product over an axis-aligned rectangle is attained
  // at this corner. For a convex CCW polygon these halfplanes are sufficient.
  const x=dy>=0?maxX:minX,y=dx>=0?minY:maxY;
  if(dx*(y-a[1])-dy*(x-a[0])<marginCm*Math.hypot(dx,dy))return false;
 }
 return true;
}
export function allowedCell(supports,blockers,cell,marginCm=2){
 if(!supports.some(p=>containsConvexCell(p,cell,marginCm)))return false;
 for(const b of blockers)if(cell[0]<=b[3]+marginCm&&cell[2]>=b[0]-marginCm&&cell[1]<=b[4]+marginCm&&cell[3]>=b[1]-marginCm)return false;
 return true;
}
export function maskCompactHeightfield(chf,supports,blockers,marginCm=2){
 const width=chf.get_width(),height=chf.get_height(),cs=chf.get_cs()*100,bx=chf.get_bmin(0)*100,by=-chf.get_bmin(2)*100;
 const whole=[bx,by-height*cs,bx+width*cs,by];
 supports=supports.filter(p=>p.boundsUE[0]<=whole[2]&&p.boundsUE[2]>=whole[0]&&p.boundsUE[1]<=whole[3]&&p.boundsUE[3]>=whole[1]);
 blockers=blockers.filter(b=>b[0]<=whole[2]+marginCm&&b[3]>=whole[0]-marginCm&&b[1]<=whole[3]+marginCm&&b[4]>=whole[1]-marginCm);
 if(allowedCell(supports,blockers,whole,marginCm))return{width,height,csCm:cs,allowedCells:width*height,rejectedCells:0,rejectedSpans:0};
 let allowed=0,rejected=0,rejectedSpans=0;
 for(let z=0;z<height;z++)for(let x=0;x<width;x++){
  const left=bx+x*cs,top=by-z*cs,cell=[left,top-cs,left+cs,top];
  if(allowedCell(supports,blockers,cell,marginCm)){allowed++;continue;}
  rejected++;const compact=chf.get_cells(x+z*width),first=compact.get_index(),end=first+compact.get_count();
  for(let i=first;i<end;i++){if(chf.get_areas(i)!==0)rejectedSpans++;chf.set_areas(i,0);}
 }
 return{width,height,csCm:cs,allowedCells:allowed,rejectedCells:rejected,rejectedSpans};
}
