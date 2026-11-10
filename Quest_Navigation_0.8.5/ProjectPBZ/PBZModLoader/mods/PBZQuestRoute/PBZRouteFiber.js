'use strict';
const UE=require('ue'),W=require('./PBZRouteWorld'),R=require('./PBZRouteCore');
const matPath='/PBZVFXPack/VFX/A_DebugAssets/M_VertexColorLit.M_VertexColorLit',unit=(a)=>{const l=Math.hypot(a.x,a.y,a.z)||1;return {x:a.x/l,y:a.y/l,z:a.z/l};};
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
let material;
function add(r,transform){if(!UE.ProceduralMeshComponent?.StaticClass)throw Error('ProceduralMeshComponent unavailable');
 if(material===undefined){material=null;for(const path of [matPath,'/Engine/EngineDebugMaterials/VertexColorMaterial.VertexColorMaterial','/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial']){
  try{material=UE.Object.Load(path);}catch(_){}if(material)break;}}
 if(!material)throw Error('ribbon material unavailable');
 const m=r.a.AddComponentByClass(UE.ProceduralMeshComponent.StaticClass(),false,transform,false);if(!W.alive(m))throw Error('ribbon mesh component could not be created');
 m.SetCollisionEnabled(UE.ECollisionEnabled.NoCollision);m.SetGenerateOverlapEvents(false);m.SetCastShadow(false);m.SetMaterial(0,material);
 try{const dynamic=m.CreateDynamicMaterialInstance?.(0,material);if(dynamic)for(const key of ['Color','BaseColor','Tint'])dynamic.SetVectorParameterValue(key,new UE.LinearColor(.7,.012,.015,1));}catch(_){}
 r.fiber=m;}
function mesh(ps,org,radius=.82){
 const v=[],normal=[],col=[],idx=[],rings=6;
 for(let i=0;i<ps.length;i++){const a=ps[Math.max(0,i-1)],b=ps[Math.min(ps.length-1,i+1)],t=unit({x:b.x-a.x,y:b.y-a.y,z:b.z-a.z});
  const u=unit(cross(Math.abs(t.z)>.96?{x:1,y:0,z:0}:{x:0,y:0,z:1},t)),w=cross(t,u);
  for(let j=0;j<rings;j++){const angle=(j+.23)*2*Math.PI/rings,ca=Math.cos(angle),sa=Math.sin(angle),n={x:ca*u.x+sa*w.x,y:ca*u.y+sa*w.y,z:ca*u.z+sa*w.z},p=ps[i];
   v.push({x:p.x-org.x+n.x*radius,y:p.y-org.y+n.y*radius,z:p.z-org.z+n.z*radius});normal.push(n);const twist=.5+.5*Math.cos(j*2.09+i*.77);col.push([.24+.19*twist,.012+.017*twist,.012+.012*twist,1]);
   if(i+1<ps.length){const x=i*rings+j,y=i*rings+(j+1)%rings;idx.push(x,y,x+rings,y,y+rings,x+rings);}}}
 return {v,normal,col,idx};
}
function draw(r,head,log,samples){
 if(!r.fiber||r.fiberOff)return;const now=Date.now();if(head&&r.fiberTime===now)return;r.fiberTime=now;
 try{
 // Keep topology and vertex identity stable while the clipped section moves.
 const ps=samples||[];if(ps.length<2)return;const n=ps.length-1;
 const q=mesh(ps,W.plain(r.fiber.K2_GetComponentLocation())),v=UE.NewArray(UE.Vector),ns=UE.NewArray(UE.Vector),cs=UE.NewArray(UE.LinearColor);
 for(let i=0;i<q.v.length;i++){v.Add(W.vec(q.v[i]));ns.Add(W.vec(q.normal[i]));cs.Add(new UE.LinearColor(...q.col[i]));}
 if(!r.uv)r.uv=UE.NewArray(UE.Vector2D);if(!r.tans)r.tans=UE.NewArray(UE.ProcMeshTangent);const uv=r.uv;
 if(r.meshN===n)r.fiber.UpdateMeshSection_LinearColor(0,v,ns,uv,uv,uv,uv,cs,r.tans,false);
 else{const tri=UE.NewArray(UE.BuiltinInt);for(const k of q.idx)tri.Add(k);r.fiber.CreateMeshSection_LinearColor(0,v,tri,ns,uv,uv,uv,uv,cs,r.tans,false,false);r.meshN=n;}
 }catch(e){r.fiberOff=true;log('fiber','mesh rendering unavailable: '+e);}
}
exports.add=add;exports.draw=draw;exports.mesh=mesh;
