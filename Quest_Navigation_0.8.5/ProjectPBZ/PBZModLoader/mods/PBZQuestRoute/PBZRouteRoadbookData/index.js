'use strict';
const worlds=new Set(['pbz_xigu_wp','pbz_fujizhilin_wp','pbz_zhengdaodaying_wp','pbz_pangzhen_wp','pbz_houjie_wp','pbz_ximeng_wp','pbz_dengdingshandao_wp','pbz_duanhun_wp']);
const cache=new Map();
exports.forWorld=function(world){
 if(!worlds.has(world))return [];
 if(!cache.has(world))cache.set(world,require('./'+world).courses.map(c=>({...c,
  points:c.points.map(p=>({x:p[0],y:p[1],z:p[2]})),target:{x:c.target[0],y:c.target[1],z:c.target[2]}})));
 return cache.get(world);
};
