'use strict';
const worlds=new Set(['pbz_xigu_wp','pbz_fujizhilin_wp','pbz_zhengdaodaying_wp','pbz_pangzhen_wp','pbz_houjie_wp','pbz_ximeng_wp','pbz_dengdingshandao_wp','pbz_duanhun_wp']);
const cache=new Map();
exports.forWorld=function(world){
 if(!worlds.has(world))return [];
 if(!cache.has(world)){
  const hooks=new Map(require('../PBZRouteHookData').forWorld(world).map(row=>[row.guid,row]));
  cache.set(world,[...require('./'+world).data.rows.map(row=>hooks.get(row.guid)||row),...require('../PBZRouteLadderData').forWorld(world)]);
 }
 return cache.get(world);
};
