'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
function failureFixture(){
 const feature={guid:'surface-failure',kind:'surface',both:true,path:[[0,0,0],[100,0,100]]},source={number:4,world:'test',sourceIndexSHA256:'build',standingStart:{x:0,y:0,z:0},standingGoal:{x:100,y:0,z:100},policy:{},movementFeatures:[feature]},bytes=Buffer.from(JSON.stringify(source));
 const failure={ok:false,reason:'standing-capsule-blocked',why:'standing capsule obstructed',unknown:false,obstructed:true,p:feature.path[0]},row={guid:feature.guid,kind:feature.kind,entry:feature.path[0],exit:feature.path[1],validation:null,failure,nativeActionUncertified:false};
 const request={...source,start:source.standingStart,goal:source.standingGoal},oracle={schema:1,failureSchema:1,number:4,sourceCaseSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),policy:{},rows:[row]};
 return{feature,bytes,row,request,oracle,failure};
}
test('offline action replay rejects stale collision evidence and keeps native pads uncertified',async()=>{
 const {bindActionCollisionEvidence}=await import('../offline-navigation/action-collision-evidence.mjs'),feature={guid:'actual-boundary',kind:'fall',source:'recast-boundary',path:[[0,0,500],[200,0,0]]},source={number:20,world:'test',sourceIndexSHA256:'same',standingStart:{x:0,y:0,z:500},standingGoal:{x:1000,y:0,z:0},policy:{speedCm:600,gravityCm:2156},movementFeatures:[feature,{guid:'native',kind:'ladder',path:[[300,0,0],[300,0,1000]]}]},bytes=Buffer.from(JSON.stringify(source)),request={number:20,world:'test',sourceIndexSHA256:'same',start:source.standingStart,goal:source.standingGoal,policy:source.policy},oracle={schema:1,number:20,sourceCaseSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),policy:source.policy,rows:[{guid:feature.guid,kind:'fall',entry:feature.path[0],exit:feature.path[1],validation:{points:feature.path,kind:'fall'},nativeActionUncertified:false},{guid:'native',kind:'ladder',entry:[300,0,0],exit:[300,0,1000],validation:{nativePadOnly:true},nativeActionUncertified:true}]};
 const evidence=bindActionCollisionEvidence(bytes,oracle,request);assert.deepEqual(evidence.lookup(feature).validation.points,feature.path);assert.equal(evidence.lookup(source.movementFeatures[1]).nativeActionUncertified,true);assert.equal(evidence.lookup({guid:'missing'}),null);
 assert.throws(()=>bindActionCollisionEvidence(Buffer.from(JSON.stringify({...source,world:'changed'})),oracle,request),/source case/);
 assert.throws(()=>bindActionCollisionEvidence(bytes,oracle,{...request,sourceIndexSHA256:'changed'}),/world build/);
 assert.throws(()=>bindActionCollisionEvidence(bytes,oracle,{...request,goal:{x:1001,y:0,z:0}}),/endpoints/);
 assert.throws(()=>bindActionCollisionEvidence(bytes,oracle,{...request,policy:{...request.policy,speedCm:750}}),/capabilities/);
 assert.throws(()=>evidence.lookup({...feature,path:[[0,0,500],[201,0,0]]}),/coordinates/);
 assert.throws(()=>bindActionCollisionEvidence(bytes,{...oracle,rows:[...oracle.rows,oracle.rows[0]]},request),/duplicate/);
});

test('offline collision evidence only certifies the action direction it checked',async()=>{
 const {bindActionCollisionEvidence,checkedFeature}=await import('../offline-navigation/action-collision-evidence.mjs');
 const entry=[0,0,0],exit=[200,0,100];
 const f={guid:'surface',kind:'surface',both:true,path:[entry,exit]},fall={guid:'fall',kind:'fall',both:false,path:[exit,entry]};
 const source={number:1,world:'test',sourceIndexSHA256:'build',standingStart:{x:0,y:0,z:0},standingGoal:{x:200,y:0,z:100},policy:{},movementFeatures:[f,fall]};
 const bytes=Buffer.from(JSON.stringify(source)),request={...source,start:source.standingStart,goal:source.standingGoal};
 const checked={guid:'surface',kind:'surface',entry,exit,validation:{points:[entry,exit],walking:true},nativeActionUncertified:false};
 const oracle={schema:1,number:1,sourceCaseSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),policy:{},rows:[checked]};
 const bind=(rows=oracle.rows)=>bindActionCollisionEvidence(bytes,{...oracle,rows},request);
 assert.equal(bind().lookup(f,true),null,'old forward evidence was treated as a downhill validation');
 const reverse={points:[exit,[80,0,24],entry],kind:'jump'};
 const evidence=bind([{...checked,reverseValidation:reverse}]);
 assert.deepEqual(evidence.lookup(f).validation,checked.validation);
 assert.deepEqual(evidence.lookup(f,true).validation,reverse);
 assert.deepEqual(evidence.lookup(f,true).entry,exit);
 assert.deepEqual(evidence.lookup(f,true).exit,entry);
 const reversed=checkedFeature(f,bind([{...checked,validation:null,reverseValidation:reverse}]));
 assert.equal(reversed.guid,f.guid);
 assert.equal(reversed.both,false);
 assert.deepEqual(reversed.path,[exit,entry]);
 assert.deepEqual(reversed.standingEntry,{x:200,y:0,z:100});
 assert.equal(reversed.checkedForward,reverse);
 assert.equal(reversed.checkedReverse,null);
 assert.deepEqual(f.path,[entry,exit]);
 assert.equal(checkedFeature(f,bind([{...checked,validation:null,reverseValidation:null}])),null);
 assert.equal(checkedFeature(f,evidence).both,true);
 assert.equal(evidence.lookup({...f,both:false},true),null);
 assert.equal(bind([{...checked,reverseValidation:null}]).lookup(f,true).validation,null);
 assert.throws(()=>bind([{...checked,guid:'fall',kind:'fall',reverseValidation:reverse}]),/direction/);
 assert.throws(()=>bind([{...checked,reverseValidation:{points:[],kind:'jump'}}]),/samples/);
});

test('known collision failures stay directional and legacy nulls remain uncertified',async()=>{
 const {bindActionCollisionEvidence,checkedFeature}=await import('../offline-navigation/action-collision-evidence.mjs'),f=failureFixture(),bind=oracle=>bindActionCollisionEvidence(f.bytes,oracle||f.oracle,f.request);
 const reverse={points:f.feature.path.slice().reverse(),kind:'jump'},evidence=bind({...f.oracle,rows:[{...f.row,reverseValidation:reverse,reverseFailure:null}]});
 assert.deepEqual(evidence.lookup(f.feature).failure,f.failure);assert.equal(evidence.lookup(f.feature,true).failure,null,'the forward obstruction leaked into the reverse evidence');
 assert.deepEqual(evidence.lookup(f.feature,true).validation,reverse);
 const {failure,...legacy}=f.row,old=bind({...f.oracle,failureSchema:undefined,rows:[legacy]});
 assert.equal(old.lookup(f.feature).failure,undefined);assert.equal(checkedFeature(f.feature,old),null);
});

test('offline failure evidence rejects contradictory certainty, mismatched directions and successful-failed pairs',async()=>{
 const {bindActionCollisionEvidence}=await import('../offline-navigation/action-collision-evidence.mjs'),f=failureFixture(),bind=(row=f.row,extra={})=>bindActionCollisionEvidence(f.bytes,{...f.oracle,...extra,rows:[row]},f.request);
 for(const patch of [{ok:true},{unknown:true},{obstructed:false},{p:[NaN,0,0]},{reason:'unsupported-claim'}])
  assert.throws(()=>bind({...f.row,failure:{...f.failure,...patch}}),/failure|certainty|contact/);
 assert.throws(()=>bind(f.row,{failureSchema:undefined}),/failure schema/);
 assert.throws(()=>bind({...f.row,validation:{points:f.feature.path}}),/failure/);
 const native={...f.feature,kind:'ladder'},source={...f.request,movementFeatures:[native]},bytes=Buffer.from(JSON.stringify(source));
 assert.throws(()=>bindActionCollisionEvidence(bytes,{...f.oracle,sourceCaseSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),rows:[{...f.row,kind:'ladder',nativeActionUncertified:true}]},{...source,start:source.standingStart,goal:source.standingGoal}),/Native.*failure|native.*failure/);
});

test('a blocked flight cannot turn unknown walking support into a known compound failure',async()=>{
 const {bindActionCollisionEvidence}=await import('../offline-navigation/action-collision-evidence.mjs'),f=failureFixture();
 const walking={ok:false,reason:'walk-support-unavailable',why:'support unavailable',unknown:true,obstructed:false,p:[40,0,40]},flight={...f.failure,reason:'air-capsule-blocked'},failure={ok:false,reason:'movement-strategies-rejected',why:'both strategies failed',unknown:true,obstructed:false,p:flight.p,causes:[walking,flight]};
 const bind=v=>bindActionCollisionEvidence(f.bytes,{...f.oracle,rows:[{...f.row,failure:v}]},f.request);
 assert.equal(bind(failure).lookup(f.feature).failure.unknown,true);
 assert.throws(()=>bind({...failure,unknown:false,obstructed:true}),/certainty/);
 assert.throws(()=>bind({...failure,causes:[]}),/failure causes/);
});
