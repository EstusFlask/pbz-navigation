'use strict';

const world='pbz_zhengdaodaying_wp';
const steps=[
 'BP_SpecialMove_SlopeSlide_C_UAID_74563C6BC2BDA2D602_1193437427',
 'BP_SpecialMove_SlopeSlide_C_UAID_74563C6BC2BDA2D602_1296105429'
];
const gate='PBZ_Zhengdaodaying_WP-BP_FlowInteract_HuanShuPingZhang_C_UAID_74563C6BC2BDFD9E02_1663502731';
const guid='slide-relay:'+steps.join('/');

// The two native slopes run as one automatic action once the first starts.
// The final standing candidates are supplied by the offline geometry index.
exports.forWorld=name=>name===world?{guid,steps,gate}:null;
