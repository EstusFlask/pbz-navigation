'use strict';
// The UE4SS and Puerts VMs cannot share require() singletons. Only a small,
// versioned target snapshot and revision-checked cancel command cross the VMs.
class LuaTracker{
 constructor({read,write,clock=Date.now}){Object.assign(this,{readFile:read,writeFile:write,clock});this.listeners=new Set();this.revision=0;this.target=null;this.next=0;this.command=0;this.client=clock()+'-'+Math.random().toString(36).slice(2);}
 refresh(force=false){
  const now=this.clock();if(!force&&now<this.next)return this.connected;this.next=now+200;
  let value;try{value=JSON.parse(this.readFile()||'null');}catch(_){value=null;}
  const valid=value&&value.protocol==='PBZQuestRouteTracker'&&value.version===1&&typeof value.session==='string'&&
   Number.isSafeInteger(value.revision)&&Number.isFinite(value.writtenAt)&&now-value.writtenAt<5000&&value.writtenAt-now<2000;
  if(!valid){if(this.connected&&now-this.lastSeen>=5000){this.connected=false;this.hover=null;this.publish(null,'tracker stopped');}return !!this.connected;}
  const raw=value.target;
  if(raw&&(!raw.key||!raw.mapID||!Array.isArray(raw.location)||raw.location.length<3||!raw.location.slice(0,3).every(Number.isFinite)))return !!this.connected;
  this.lastSeen=Math.min(now,value.writtenAt);
  const changed=!this.connected||this.session!==value.session||this.remoteRevision!==value.revision;
  this.connected=true;
  const hover=value.hover;
  this.hover=hover&&hover.key&&hover.mapID&&Array.isArray(hover.location)&&hover.location.length>=3&&hover.location.slice(0,3).every(Number.isFinite)?hover:null;
  this.selectionRevision=value.selectionRevision;
  this.session=value.session;this.remoteRevision=value.revision;
  if(changed)this.publish(raw||null,value.reason||'selected');
  return true;
 }
 publish(target,reason){this.target=target;this.revision++;const event={target,reason,revision:this.revision};for(const fn of this.listeners)fn(event);}
 read(){this.refresh();return {target:this.target,revision:this.revision};}
 subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 hovered(){this.refresh(true);return this.connected?this.hover:null;}
 choose(point){
  const hover=this.hovered();if(!hover||hover.key!==point.key||!Number.isSafeInteger(this.selectionRevision))return false;
  return this.writeFile(JSON.stringify({protocol:'PBZQuestRouteTracker',version:1,session:this.session,client:this.client,
   command:++this.command,action:'select',key:hover.key,selectionRevision:this.selectionRevision}))!==false;
 }
 clear(reason='route cleared'){
  this.refresh();if(!this.connected||!this.target)return;
  const command={protocol:'PBZQuestRouteTracker',version:1,session:this.session,client:this.client,
   command:++this.command,revision:this.remoteRevision,key:this.target.key,action:'clear',reason};
  // Only acknowledge locally when the command was actually written.
  if(this.writeFile(JSON.stringify(command))!==false)this.publish(null,reason);
 }
}
exports.LuaTracker=LuaTracker;
