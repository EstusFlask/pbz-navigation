'use strict';
// Bounds for finding a standing candidate near an authored motion anchor.
// Support and clearance are still checked independently in the scene.
const elevated=new Set(['hook','swing','rappel','zipline','wallrun','pole','walljump','boarding']);
const above=180;
const below=kind=>elevated.has(kind)?475:kind==='lift'?100:240;
const contains=(kind,anchorZ,floorZ)=>floorZ-anchorZ<=above&&anchorZ-floorZ<=below(kind);
exports.above=above;exports.below=below;exports.contains=contains;
