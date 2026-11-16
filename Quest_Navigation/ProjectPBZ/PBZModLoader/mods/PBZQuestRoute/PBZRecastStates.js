'use strict';
// Read-only gameplay state. Component collision overrides saved flags while
// an actor is loaded; unloaded fog doors remain closed until proven otherwise.
function componentPassable(component,UE){
 if(!component||typeof component.GetCollisionEnabled!=='function')return undefined;
 const mode=Number(component.GetCollisionEnabled());
 if(!Number.isInteger(mode)||mode<0||mode>5)return undefined;
 if(![1,3,5].includes(mode))return true;
 if(typeof component.GetCollisionResponseToChannel!=='function')return undefined;
 const response=Number(component.GetCollisionResponseToChannel(UE.ECollisionChannel?.ECC_Pawn??2));
 return [0,1,2].includes(response)?response!==2:undefined;
}
function read(pawn,index,api,classCache=new Map()){
 const {UE,P,T,alive}=api,states={},wanted=new Map(index.actors.map(a=>[a.name.toLowerCase(),a]));
 let manager;
 if(UE.PBZLevelActorManager?.StaticClass&&UE.JsonObjectWrapper&&UE.JSONUtility?.TryGetBoolField)
  manager=T.getWorldSubsystem(pawn,UE.PBZLevelActorManager.StaticClass());
 if(alive(manager))for(const item of index.actors){
  if(!item.savedField)continue;
  try{
   const out=P.$ref(new UE.JsonObjectWrapper()),value=P.$ref(false),success=P.$ref(false);
   manager.GetSaveData(item.id,out);UE.JSONUtility.TryGetBoolField(P.$unref(out),item.savedField,value,success);
   if(P.$unref(success)===true&&typeof P.$unref(value)==='boolean')states[item.id]=P.$unref(value);
  }catch(_){/* missing save fields retain closed collision */}
 }
 for(const asset of new Set(index.actors.map(a=>a.classAsset))){
  try{
   if(!classCache.has(asset)){const name=asset.slice(asset.lastIndexOf('/')+1);classCache.set(asset,UE.Class.Load(asset+'.'+name+'_C'));}
   const cls=classCache.get(asset);if(!cls)throw Error('Collision class unavailable');
   const out=P.$ref(undefined);UE.GameplayStatics.GetAllActorsOfClass(pawn,cls,out);const actors=P.$unref(out);
   if(!actors||typeof actors.Num!=='function'||actors.Num()>4096)throw Error('Incomplete actor enumeration');
   for(let i=0;i<Math.min(4096,actors?.Num()||0);i++){
    const actor=actors.Get(i);if(!alive(actor))continue;const item=wanted.get(String(actor.GetName()).toLowerCase());
    if(!item||item.classAsset!==asset)continue;
    // A partially loaded actor must not inherit a far-side saved-open guess.
    delete states[item.id];
    try{
     if(typeof actor.GetActorEnableCollision==='function'&&actor.GetActorEnableCollision()===false){states[item.id]=true;continue;}
     const read=actor.K2_GetComponentsByClass||actor.GetComponentsByClass;
     const componentClass=item.componentClass?UE[item.componentClass]?.StaticClass():UE.PrimitiveComponent?.StaticClass();
     if(!read||!componentClass)continue;const list=read.call(actor,componentClass),selected=[];
     if(!list||typeof list.Num!=='function'||list.Num()>1024)continue;
     for(let j=0;j<Math.min(1024,list?.Num()||0);j++){
      const c=list.Get(j);if(!alive(c))continue;const name=String(c.GetName()).replace(/_GEN_VARIABLE(?:_\d+)?$/,'');
      if(item.components&&!item.components.includes(name))continue;selected.push(c);
     }
     if(!selected.length||item.components&&item.components.some(name=>!selected.some(c=>String(c.GetName()).replace(/_GEN_VARIABLE(?:_\d+)?$/,'')===name)))continue;
     const values=selected.map(c=>componentPassable(c,UE));
     if(values.some(v=>v===false))states[item.id]=false;
     else if(values.every(v=>v===true))states[item.id]=true;
    }catch(_){/* state unknown -> closed */}
   }
  }catch(_){for(const item of index.actors)if(item.classAsset===asset)delete states[item.id];}
 }
 return states;
}
exports.read=read;exports.componentPassable=componentPassable;
