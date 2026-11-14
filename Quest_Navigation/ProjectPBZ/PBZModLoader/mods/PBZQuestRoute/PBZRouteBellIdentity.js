'use strict';
const R=require('./PBZRouteCore');
// Native tracker bells share its item-selection service. Bind only an explicit
// bell key to a matching table position; never infer a bell from its title or
// the nearest landmark. Keep the tracker key/coordinates for cancellation.
function fromItem(item,bells){
 if(item?.provider!=='187'||!R.finite(item.p))return null;
 const match=/^pbz:bell:([a-z0-9_]+)$/i.exec(String(item.id||''));if(!match)return null;
 const bell=bells[String(match[1]).toLowerCase()];if(!bell?.at)return null;
 const p={x:bell.at[0],y:bell.at[1],z:bell.at[2]};
 return R.finite(p)&&R.xy(item.p,p)<=185&&Math.abs(item.p.z-p.z)<=230?bell:null;
}
exports.fromItem=fromItem;
