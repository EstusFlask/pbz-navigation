'use strict';
// A clear two-action route sits behind many optimistic descents through a
// blocked wall. Coordinates use the precision of projected Detour pads.
module.exports=function crowdedActionReplan(blockedCount=480){
 const origin=-60000.1234567,base=-14966.87654321,p=(x,z)=>({x:origin+x,y:222000.314159,z:base+z});
 const start=p(0,0),goal=p(10000,-1000),first={guid:'first-descent',kind:'fall',source:'recast-boundary',runtimePath:[p(10,0),p(10,-500)]},blocked=Array.from({length:blockedCount},(_,i)=>({guid:'blocked-'+i,kind:'fall',source:'recast-boundary',runtimePath:[p(100+i*.037,-500),p(2000+i*.071,-1000)]})),last={guid:'clear-descent',kind:'fall',source:'recast-boundary',runtimePath:[p(-1000,-500),p(-1000,-1000)]};
 const counts={rejected:0,validated:0,walks:0};
 const options={name:'crowded-replan',start,goal,features:[first,...blocked,last],clock:()=>0,lazyActions:true,
  component:p=>Math.round(p.z-base),componentConnectors:true,canTraverse:()=>true,
  landing:function*(feature,p){yield;return{...p};},
  validate:function*(action){yield;counts.validated++;if(action.feature.guid.startsWith('blocked-')){counts.rejected++;return false;}return true;},
  walk:function*(a,b){yield;counts.walks++;return{points:[a,b],meters:Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)/100};}};
 return{options,counts};
};
