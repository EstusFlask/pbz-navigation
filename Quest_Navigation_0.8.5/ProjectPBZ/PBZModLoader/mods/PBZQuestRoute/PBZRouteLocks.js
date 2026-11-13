'use strict';
const R=require('./PBZRouteCore');
function keys(map,fallback){
 if(typeof map?.GetKey==='function'&&typeof map.Num==='function'){
  const out=[];for(let i=0;i<Math.min(1024,map.Num());i++)out.push(map.GetKey(i));return out;
 }
 return fallback;
}
// Map lock objects carry authoritative unlock state. Their GUID is an identity,
// not necessarily a blueprint name; inspect reflected types before names.
function read(map,areas,options){
 const out=[],seen=new Set(),{alive,point,worldOf,UE}=options;
 const is=(o,type)=>{try{return !!UE[type]?.StaticClass&&!!o.IsA?.(UE[type].StaticClass());}catch(_){return false;}};
 for(const area of keys(map,Object.keys(areas))){
  const groups=map?.GetRef(area)?.MapLockGroups;if(!groups)continue;
  for(const layer of keys(groups,[0,1,2,3])){
   const list=groups.GetRef(layer)?.LockObjArray;
   for(let i=0;i<(list?.Num()||0);i++){
    const o=list.Get(i);if(!alive(o)||o.bUnLocked===true)continue;
    const id=String(o.GuidString||''),p=point(o.ActorLocation),world=worldOf(area),identity=world+'/'+id.toLowerCase();
    if(!id||!R.finite(p)||seen.has(identity))continue;
    const directional=is(o,'DoorDirLockObject'),count=o.NeedItems?.Num?.()||0;
    const weapon=is(o,'ShaChiWeaponLockObject'),keyed=count>0,typed=directional||weapon||is(o,'SwitchLockObject');
    const door=/door|gate|men_|shanzhai/i.test(id),mechanism=/blocker|chain|switch|barrier/i.test(id);
    if(!typed&&!keyed&&!door&&!mechanism)continue;
    const requiredItems=[],requirements=[],requiredWeapons=[],requiredTags=[],weaponRequirements=[];
    for(let j=0;j<Math.min(count,16);j++){
     const mapKey=o.NeedItems.GetKey?.(j),value=mapKey??o.NeedItems.Get?.(j);
     if(typeof value==='string'||typeof value==='number'){
      const id=String(value),amount=mapKey===undefined?1:Math.max(1,Number(o.NeedItems.Get(mapKey))||1);
      let detail;try{detail=options.item?.(id);}catch(_){}
      requiredItems.push(id);requirements.push({id,count:amount,...detail});
     }
    }
    for(let j=0;j<Math.min(16,o.NeedShaChiWeaponIds?.Num?.()||0);j++)requiredWeapons.push(String(o.NeedShaChiWeaponIds.Get(j)));
    const tags=[];for(let j=0;j<Math.min(16,o.RequiredTags?.GameplayTags?.Num?.()||0);j++){const value=o.RequiredTags.GameplayTags.Get(j);tags.push(value);requiredTags.push(String(value.TagName));}
    for(const value of tags)try{const detail=options.tag?.(value);if(detail&&!requiredWeapons.includes(detail.id))requiredWeapons.push(detail.id);}catch(_){}
    for(const id of requiredWeapons){let detail;try{detail=options.weapon?.(id);}catch(_){}weaponRequirements.push({id,...detail});}
    const itemText=requirements.map(r=>(r.name||r.id)+(Number.isFinite(r.owned)?' '+r.owned+'/'+r.count:r.count>1?' ×'+r.count:''));
    const icon=keyed?'keylock':directional?'locked':'mechanism';
    const label=keyed?'需钥匙/物品解锁'+(itemText.length?' · '+itemText.join('、'):''):
     weapon?'需影之武装破除'+(weaponRequirements.length?' · '+weaponRequirements.map(r=>r.name||r.id).join('、'):requiredTags.length?' · '+requiredTags.join('、'):''):
     directional?'单向门 · 需从另一侧开启':door?'门闩未开':'机关待解锁';
    out.push({id,p,world,icon,label,locked:true,unknown:false,requiredItems,requirements,requiredWeapons,requiredTags,weaponRequirements,requirementCount:count,source:'map-lock'});seen.add(identity);
   }
  }
 }
 return out;
}
function crossing(rows,world,a,b){
 for(const lock of rows){
  if(lock.world!==world||lock.open||!R.finite(lock.p))continue;
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  const t=den?R.clamp(((lock.p.x-a.x)*dx+(lock.p.y-a.y)*dy)/den):0,q=R.lerp(a,b,t);
  // A nearby locked icon on another floor or beside the route is not a wall.
  if(R.xy(q,lock.p)<=75&&Math.abs(q.z-lock.p.z)<=160)return lock;
 }
 return null;
}
function constrain(world,rows,level){
 rows=rows.filter(r=>r.world===level&&!r.open);if(!rows.length)return world;
 const view=Object.create(world);
 view.sourceWorld=world.sourceWorld||world;
 view.blockAt=(a,b)=>crossing(rows,level,a,b);
 view.step=(a,b,expected)=>{
  const block=crossing(rows,level,a,b);
  return block?{hit:block.p,why:'locked passage',locked:true,block}:world.step(a,b,expected);
 };
 return view;
}
function signature(rows){return rows.map(r=>[r.world,r.id,r.icon,r.label,r.p.x,r.p.y,r.p.z].join('/')).sort().join('|');}
exports.read=read;exports.crossing=crossing;exports.constrain=constrain;exports.signature=signature;
