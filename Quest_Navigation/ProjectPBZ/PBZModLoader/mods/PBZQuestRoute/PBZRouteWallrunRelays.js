'use strict';

// Confirmed player exchanges between placed walls. Directions are relative
// to the authored splines, independent of the live BoxA/BoxB ordering.
const pairs = {
 pbz_fujizhilin_wp: [
  ['BP_SpecialMove_SideRunning_C_UAID_BCFCE7058A98847902_1365880378',
   'BP_SpecialMove_SideRunning_C_UAID_BCFCE7058A98847902_1411859379']
 ],
 pbz_pangzhen_wp: [
  ['BP_SpecialMove_SideRunning_C_UAID_60CF848A6689D9CC02_1910680412',
   'BP_SpecialMove_SideRunning_C_UAID_60CF848A6689D9CC02_2074909462']
 ]
};

exports.forWorld = world => (pairs[world] || []).map(([first, second]) => ({
 guid: 'wallrun-relay:' + first + '/' + second,
 steps: [{guid:first,reverse:false},{guid:second,reverse:true}]
}));

exports.hints = (world, rows) => exports.forWorld(world).flatMap(relay => {
 const [first, second] = relay.steps;
 const starts = rows.filter(row => row.guid === first.guid && !row.reverse);
 const exits = new Map();
 for (const row of rows) {
  if (row.guid !== second.guid) continue;
  if (row.both) exits.set(row.from, {point:row.entry, cost:row.cost});
  else if (row.reverse && !exits.has(row.to)) exits.set(row.to, {point:row.exit, cost:row.cost});
 }
 return starts.flatMap(start => Array.from(exits, ([to, exit]) => ({
  guid:relay.guid, kind:'wallrun', both:false, from:start.from, to, entry:start.entry, exit:exit.point,
  cost:Math.max(start.cost + exit.cost, Math.hypot(...start.entry.map((value, i) => value - exit.point[i]))) + 500
 })).filter(row => row.from !== row.to));
});
