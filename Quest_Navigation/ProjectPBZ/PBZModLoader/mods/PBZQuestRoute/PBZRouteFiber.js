'use strict';
const UE=require('ue'),W=require('./PBZRouteWorld'),R=require('./PBZRouteCore');
const Color=require('./PBZRouteColor');
const matPath='/PBZVFXPack/VFX/A_DebugAssets/M_VertexColorLit.M_VertexColorLit',unit=(a)=>{const l=Math.hypot(a.x,a.y,a.z)||1;return {x:a.x/l,y:a.y/l,z:a.z/l};};
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const ring=Array.from({length:6},(_,j)=>{const a=(j+.23)*2*Math.PI/6;return [Math.cos(a),Math.sin(a)];});
let material;
function add(r,transform){if(!UE.ProceduralMeshComponent?.StaticClass)throw Error('ProceduralMeshComponent unavailable');
 if(material===undefined){material=null;for(const path of [matPath,'/Engine/EngineDebugMaterials/VertexColorMaterial.VertexColorMaterial','/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial']){
  try{material=UE.Object.Load(path);}catch(_){}if(material)break;}}
 if(!material)throw Error('ribbon material unavailable');
 const m=r.a.AddComponentByClass(UE.ProceduralMeshComponent.StaticClass(),false,transform,false);if(!W.alive(m))throw Error('ribbon mesh component could not be created');
 m.SetCollisionEnabled(UE.ECollisionEnabled.NoCollision);m.SetGenerateOverlapEvents(false);m.SetCastShadow(false);m.SetMaterial(0,material);
 // This owned mesh already has a bounded, collision-checked draw horizon.
 // Its bounds must follow its vertices, independently of the inactive FX root.
 try{m.SetCullDistance?.(0);}catch(_){}
 try{if(typeof m.bUseAttachParentBound==='boolean')m.bUseAttachParentBound=false;}catch(_){}
 try{if(typeof m.bNeverDistanceCull==='boolean')m.bNeverDistanceCull=true;}catch(_){}
 try{r.fiberMaterial=m.CreateDynamicMaterialInstance?.(0,material);}catch(_){}
 r.fiber=m;}
function mesh(ps,org,radius=.82,{colors=true,indices=true,color=Color.blue}={}){
 const v=[],normal=[],col=[],idx=[],rings=6;
 for(let i=0;i<ps.length;i++){const a=ps[Math.max(0,i-1)],b=ps[Math.min(ps.length-1,i+1)],t=unit({x:b.x-a.x,y:b.y-a.y,z:b.z-a.z});
  const u=unit(cross(Math.abs(t.z)>.96?{x:1,y:0,z:0}:{x:0,y:0,z:1},t)),w=cross(t,u);
  for(let j=0;j<rings;j++){const [ca,sa]=ring[j],n={x:ca*u.x+sa*w.x,y:ca*u.y+sa*w.y,z:ca*u.z+sa*w.z},p=ps[i];
   v.push({x:p.x-org.x+n.x*radius,y:p.y-org.y+n.y*radius,z:p.z-org.z+n.z*radius});normal.push(n);
   if(colors){const twist=.5+.5*Math.cos(j*2.09+i*.77),a=color.low,b=color.range;col.push([a[0]+b[0]*twist,a[1]+b[1]*twist,a[2]+b[2]*twist,1]);}
   if(indices&&i+1<ps.length){const x=i*rings+j,y=i*rings+(j+1)%rings;idx.push(x,y,x+rings,y,y+rings,x+rings);}}}
 return {v,normal,col,idx};
}
function draw(r,head,log,samples,color=Color.blue){
 if(!r.fiber||r.fiberOff)return;const now=Date.now();if(head&&r.fiberTime===now)return;r.fiberTime=now;
 try{
 // Keep topology and vertex identity stable while the clipped section moves.
 const ps=samples||[];if(ps.length<2)return;const n=ps.length-1;
 const changed=r.colorKey!==color.key;
 if(changed&&r.fiberMaterial)try{for(const key of ['Color','BaseColor','Tint'])r.fiberMaterial.SetVectorParameterValue(key,new UE.LinearColor(...color.tint));}catch(e){log('fiber tint',String(e));}
 const newColors=changed||!r.colors||r.colorN!==n,q=mesh(ps,W.plain(r.fiber.K2_GetComponentLocation()),.82,{colors:newColors,indices:r.meshN!==n,color});
 const v=UE.NewArray(UE.Vector),ns=UE.NewArray(UE.Vector),cs=newColors?UE.NewArray(UE.LinearColor):r.colors;
 for(let i=0;i<q.v.length;i++){v.Add(W.vec(q.v[i]));ns.Add(W.vec(q.normal[i]));if(newColors)cs.Add(new UE.LinearColor(...q.col[i]));}
 if(newColors){r.colors=cs;r.colorN=n;r.colorKey=color.key;}
 if(!r.uv)r.uv=UE.NewArray(UE.Vector2D);if(!r.tans)r.tans=UE.NewArray(UE.ProcMeshTangent);const uv=r.uv;
 if(r.meshN===n)r.fiber.UpdateMeshSection_LinearColor(0,v,ns,uv,uv,uv,uv,cs,r.tans,false);
 else{const tri=UE.NewArray(UE.BuiltinInt);for(const k of q.idx)tri.Add(k);r.fiber.CreateMeshSection_LinearColor(0,v,tri,ns,uv,uv,uv,uv,cs,r.tans,false,false);r.meshN=n;}
 }catch(e){r.fiberOff=true;log('fiber','mesh rendering unavailable: '+e);}
}
exports.add=add;exports.draw=draw;exports.mesh=mesh;
