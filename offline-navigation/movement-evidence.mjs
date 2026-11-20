export function* collectDeferredEvidence(searched,more){
 const features=searched.slice(),identities=new Set();let work=0;
 for(const feature of features){if(identities.has(feature.guid))throw Error('Duplicate searched evidence identity');identities.add(feature.guid);if((++work&63)===0)yield;}
 const deferred=yield* more();
 for(const feature of deferred||[]){if(identities.has(feature.guid))throw Error('Duplicate deferred evidence identity');identities.add(feature.guid);features.push(feature);if((++work&63)===0)yield;}
 return{features,collection:{searchedCandidates:searched.length,deferredCandidates:features.length-searched.length,totalCandidates:features.length,scope:'Currently deferred candidates collected after search; no query budget or global coverage claim'}};
}
