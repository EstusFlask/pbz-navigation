// Private offline mocked-physics replay. This evidence never enters the Mod.
import crypto from'node:crypto';
const need=(value,message)=>{if(!value)throw Error(message);},point=p=>p&&[p.x,p.y,p.z].every(Number.isFinite),vector=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const failureFlags={
 'standing-support-unavailable':[true,false],'native-action-uncertified':[true,false],
 'standing-capsule-blocked':[false,true],'walk-capsule-blocked':[false,true],'air-capsule-blocked':[false,true],
 'walk-support-unavailable':[true,false],'walk-endpoint-unresolved':[true,false],
 'walk-step-envelope':[false,false],'air-jump-disabled':[false,false],'air-height-envelope':[false,false],'air-velocity-envelope':[false,false]
};
function checkFailure(failure,native,depth=0){
 need(depth<=3&&failure?.ok===false&&typeof failure.unknown==='boolean'&&typeof failure.obstructed==='boolean'&&typeof failure.why==='string'&&failure.why.length>0,'Invalid action failure evidence');
 if(native)need(failure.unknown&&!failure.obstructed,'Native failure cannot certify an action obstruction');
 if(Object.hasOwn(failure,'p'))need(vector(failure.p),'Invalid failure contact');
 if(failure.obstructed)need(vector(failure.p),'Missing failure contact');
 const compound=failure.reason==='movement-strategies-rejected'||failure.reason==='air-options-rejected';
 if(compound){
  need(Array.isArray(failure.causes)&&failure.causes.length>0&&failure.causes.length<=8&&(failure.reason!=='movement-strategies-rejected'||failure.causes.length===2),'Invalid failure causes');
  for(const cause of failure.causes)checkFailure(cause,native,depth+1);
  const unknown=failure.causes.some(cause=>cause.unknown),obstructed=!unknown&&failure.causes.some(cause=>cause.obstructed);
  need(failure.unknown===unknown&&failure.obstructed===obstructed,'Compound failure certainty differs');
 }else{
  const flags=Object.hasOwn(failureFlags,failure.reason)?failureFlags[failure.reason]:null;
  need(flags&&!Object.hasOwn(failure,'causes')&&failure.unknown===flags[0]&&failure.obstructed===flags[1],'Invalid leaf failure certainty');
 }
}
export function bindActionCollisionEvidence(sourceBytes,oracle,request){
 need(crypto.createHash('sha256').update(sourceBytes).digest('hex')===oracle.sourceCaseSHA256,'Collision evidence source case changed');
 const source=JSON.parse(sourceBytes);
 need(oracle.schema===1&&oracle.number===request.number&&source.number===request.number,'Collision evidence route identity differs');
 need(source.world===request.world&&source.sourceIndexSHA256===request.sourceIndexSHA256,'Collision evidence world build differs');
 need(point(source.standingStart)&&point(source.standingGoal)&&same(canonical(source.standingStart),canonical(request.start))&&same(canonical(source.standingGoal),canonical(request.goal)),'Collision evidence endpoints differ');
 need(same(canonical(source.policy),canonical(request.policy))&&same(canonical(oracle.policy),canonical(request.policy)),'Collision evidence capabilities differ');
 need(Array.isArray(source.movementFeatures)&&Array.isArray(oracle.rows),'Missing action collision evidence');
 const inputs=new Map(source.movementFeatures.map(f=>[f.guid,f])),rows=new Map();
 for(const row of oracle.rows){
  need(typeof row.guid==='string'&&inputs.has(row.guid)&&!rows.has(row.guid),'Unknown or duplicate action collision evidence');
  const feature=inputs.get(row.guid),native=!['fall','surface'].includes(feature.kind);need(row.kind===feature.kind&&row.nativeActionUncertified===native,'Collision evidence action kind differs');
  if(Object.hasOwn(row,'reverseValidation')||Object.hasOwn(row,'reverseFailure'))need(feature.both===true&&feature.kind!=='fall','Collision evidence action direction differs');
  for(const [validation,failure]of [[row.validation,row.failure],[row.reverseValidation,row.reverseFailure]]){
   if(failure!==undefined&&failure!==null){
    need(oracle.failureSchema===1,'Unknown collision failure schema');need(!validation,'Successful validation conflicts with failure');checkFailure(failure,native);
    if(!failure.unknown)need(vector(row.entry)&&vector(row.exit),'Known failure standing pad invalid');
   }
   if(!validation)continue;
   need(validation.ok!==false,'Failed audit stored as successful validation');
   need(vector(row.entry)&&vector(row.exit),'Collision evidence standing pad invalid');
   if(native)need(validation.nativePadOnly===true,'Native action evidence cannot certify a movement');
   else need(Array.isArray(validation.points)&&validation.points.length>=2&&validation.points.length<=2048&&validation.points.every(vector)&&!validation.nativePadOnly,'Collision evidence action samples invalid');
  }
  rows.set(row.guid,row);
 }
 return{sourceCaseSHA256:oracle.sourceCaseSHA256,physicalVerified:false,nativeActionsCertified:false,lookup(feature,reverse=false){
  const row=rows.get(feature.guid);if(!row)return null;const original=inputs.get(feature.guid),actual=feature.runtimePath?.map(p=>point(p)?[p.x,p.y,p.z]:p)||feature.path;
  need(feature.kind===original.kind&&same(actual,original.path),'Collision evidence action coordinates changed');
  if(!reverse)return row;
  if(feature.both!==true||original.both!==true||feature.kind==='fall'||!Object.hasOwn(row,'reverseValidation'))return null;
  return {...row,entry:row.exit,exit:row.entry,validation:row.reverseValidation,failure:row.reverseFailure};
 }};
}

// Keep only the directions covered by valid, bound collision evidence.
// Used by the offline diagnostic to distinguish a graph gap from a shortlist gap.
export function checkedFeature(feature,evidence){
 const forward=evidence.lookup(feature)?.validation||null;
 const reverse=feature.both?evidence.lookup(feature,true)?.validation||null:null;
 if(!forward&&!reverse)return null;
 const flip=!forward;
 const row=evidence.lookup(feature,flip);
 const xyz=([x,y,z])=>({x,y,z});
 return {
  ...feature,
  path:flip?feature.path.slice().reverse():feature.path,
  runtimePath:undefined,
  standingEntry:xyz(row.entry),
  standingExit:xyz(row.exit),
  both:!!(forward&&reverse),
  checkedForward:flip?reverse:forward,
  checkedReverse:flip?null:reverse,
 };
}
