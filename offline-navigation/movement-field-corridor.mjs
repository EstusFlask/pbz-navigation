// Geometry-query roots for private offline movement-field diagnostics.
// The endpoint segment selects where to inspect existing nav polygons; it
// never becomes a walk edge, route proposal, or physical certificate.
export const MOVEMENT_FIELD_EXTENTS = Object.freeze([640, 1280, 2560, 5120, 10240]);

export function supportsMovementFieldExtent(extent) {
 return MOVEMENT_FIELD_EXTENTS.includes(extent);
}

export function movementFieldHeights(seeds,{componentRoots=false,inboundRoots=componentRoots,corridor=false}={}){
 if(!Array.isArray(seeds)||!seeds.length||!seeds.every(point=>Array.isArray(point)&&point.length===3&&point.every(Number.isFinite)))throw Error('Invalid movement field height roots');
 const heights=seeds.map(point=>point[2]);
 return[Math.min(...heights)-(componentRoots?1950:200),Math.max(...heights)+(inboundRoots?1950:corridor?475:200)];
}

export function movementFieldRoot(planner,sample,bounds,extent){
 const origin=planner.origin||[0,0,0],point={x:(sample[0]-origin[0])/100,y:(sample[2]-origin[2])/100,z:-(sample[1]-origin[1])/100};
 const found=planner.query.findNearestPoly(point,{halfExtents:{x:extent/100,y:19.5,z:extent/100}});
 if(!found.success||!found.nearestRef)return null;
 const root=[origin[0]+found.nearestPoint.x*100,origin[1]-found.nearestPoint.z*100,origin[2]+found.nearestPoint.y*100];
 return root.every(Number.isFinite)&&root[0]>=bounds[0]&&root[0]<=bounds[2]&&root[1]>=bounds[1]&&root[1]<=bounds[3]?root:null;
}

export function movementFieldCells(start,goal,extent,width){
 if(!Array.isArray(start)||start.length!==3||!Array.isArray(goal)||goal.length!==3||![...start,...goal,extent,width].every(Number.isFinite)||extent<=0||width<0)throw Error('Invalid movement field corridor');
 const dx=goal[0]-start[0],dy=goal[1]-start[1],length2=dx*dx+dy*dy,reach=width+extent*Math.SQRT2/2,minX=Math.floor((Math.min(start[0],goal[0])-reach)/extent),maxX=Math.floor((Math.max(start[0],goal[0])+reach)/extent),minY=Math.floor((Math.min(start[1],goal[1])-reach)/extent),maxY=Math.floor((Math.max(start[1],goal[1])+reach)/extent),rows=[];
 if((maxX-minX+1)*(maxY-minY+1)>1000000)throw Error('Movement field cell budget exceeded');
 for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
  const cx=(x+.5)*extent,cy=(y+.5)*extent,t=Math.max(0,Math.min(1,((cx-start[0])*dx+(cy-start[1])*dy)/(length2||1))),distance=Math.hypot(cx-start[0]-t*dx,cy-start[1]-t*dy);
  if(distance<=reach)rows.push({id:x+','+y,x,y,center:[cx,cy,start[2]+(goal[2]-start[2])*t],distance,t,coreBounds:[x*extent,y*extent,(x+1)*extent,(y+1)*extent]});
 }
 return rows;
}
