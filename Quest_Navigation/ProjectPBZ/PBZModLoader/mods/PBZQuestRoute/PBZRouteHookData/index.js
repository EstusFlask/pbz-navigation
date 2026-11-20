'use strict';
const worlds=new Set(["pbz_duanhun_wp", "pbz_fujizhilin_wp", "pbz_houjie_wp", "pbz_pangzhen_wp", "pbz_xigu_wp", "pbz_ximeng_wp", "pbz_zhengdaodaying_wp"]);
exports.forWorld=world=>worlds.has(world)?require('./'+world).rows:[];
