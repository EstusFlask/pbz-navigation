'use strict';
const R=require('./PBZRouteCore'),States=require('./PBZRecastStates'),{RecastCache:RegionalCache}=require('./PBZRouteRecast');
const MovementIndex=require('./PBZRouteMovementIndex');
const topologyGoals=goals=>goals.length?{additionalGoals:goals.map(p=>[p.x,p.y,p.z])}:{};
function* projectActionPad(planner,p){
 if(!planner?.query||planner.destroyed||!R.finite(p))return[];
 const [ox,oy,oz]=planner.origin||[0,0,0];
 const query=(x,y,halfExtents)=>planner.query.findNearestPoly({x:(x-ox)/100,y:(p.z-oz)/100,z:-(y-oy)/100},{halfExtents});
 // Match the action topology projection before looking for an off-mesh join.
 const direct=query(p.x,p.y,{x:1,y:.9,z:1});yield;
 if(direct.success&&direct.nearestRef)return[];
 const nearest=new Map(),halfExtents={x:1.5,y:1.2,z:1.5};
 for(const radius of [0,90,180,300,450,600])for(let i=0;i<(radius?16:1);i++){
  if(planner.destroyed)return[];
  const angle=i*Math.PI/8,found=query(p.x+Math.cos(angle)*radius,p.y+Math.sin(angle)*radius,halfExtents);yield;
  if(!found.success||!found.nearestRef)continue;
  const q={x:ox+found.nearestPoint.x*100,y:oy-found.nearestPoint.z*100,z:oz+found.nearestPoint.y*100};
  if(!R.finite(q)||R.xy(p,q)>750||Math.abs(p.z-q.z)>120)continue;
  const distance=R.dist(p,q),previous=nearest.get(found.nearestRef);
  if(!previous||distance<previous.distance)nearest.set(found.nearestRef,{q,distance});
 }
 return [...nearest.values()].sort((a,b)=>a.distance-b.distance).slice(0,8).map(row=>row.q);
}
function* stageMovements(owner,world,start,goal,primary,remaining,excluded){
 if(excluded?.size){
  function* allowed(rows){
   const result=[];
   for(const [i,feature] of rows.entries()){
    if(!excluded.has(feature.guid))result.push(feature);
    if((i&63)===63)yield;
   }
   return result;
  }
  primary=yield* allowed(primary);
  remaining=yield* allowed(remaining);
 }
 if(!primary.length){primary=remaining;remaining=[];}
 primary.deferredCount=remaining.length;
 owner.deferredMovements=remaining.length?{world,start:{...start},goal:{...goal},revision:owner.revision,rows:remaining}:null;
 return primary;
}
function* takeDeferred(owner,world,start,goal){
 const saved=owner.deferredMovements;owner.deferredMovements=null;
 if(!saved||saved.world!==world||saved.revision!==owner.revision||R.dist(saved.start,start)>=1||R.dist(saved.goal,goal)>=1)return[];
 yield;return saved.rows;
}
class WorldCache{
 constructor(load,api,report,invalidate,clock){Object.assign(this,{load,api,report,invalidate,clock});this.revision=0;this.queryJobs=new Set();this.statePoll=new States.Poll();this.next=0;this.ready=false;}
 catalog(){
  if(this.catalogue!==undefined)return this.catalogue;
  this.catalogue=null;
  if(!this.api.readText||!this.api.dataRoot)return null;
  try{const text=this.api.readText(this.api.dataRoot+'/catalog.json');if(text){const value=JSON.parse(text);if(value.schema!==1||!value.worlds)throw Error('Unsupported world catalog');this.catalogue=value;}}
  catch(error){this.report('recast world catalog',String(error));}
  return this.catalogue;
 }
 covers(world,start,goal=start){return !!this.catalog()?.worlds[world]&&R.finite(start)&&R.finite(goal);}
 actionHints(world){
  if(!/^pbz_[a-z0-9_]+$/.test(world))return[];
  let data;try{data=require('./PBZRouteActionCorridors/'+world).data;}catch(_){return[];}
  if(data.navigationGrid&&data.navigationGrid!==this.pages?.currentID)return[];
  return data.schema===1&&data.world===world&&data.sourceIndexSHA256===this.index.sourceIndexSHA256&&Array.isArray(data.rows)&&data.rows.length<=1024?data.rows:[];
 }
 clearMovementCorridors(){this.movementCorridorStorage?.reader?.clear();this.movementCorridorStorage=null;}
 movementExclusions(existing){
  let result=existing;
  for(const actor of this.index?.actors||[]){
   if(this.states?.[actor.id]===true||!actor.movementRequiresPassable?.length)continue;
   if(result===existing)result=new Map(existing);
   for(const guid of actor.movementRequiresPassable)result.set(guid,3);
  }
  return result;
 }
 movementCorridors(world){
  if(!this.api.readText||!this.api.dataRoot||!/^pbz_[a-z0-9_]+$/.test(world))return null;
  const signature=world+'/'+this.index.sourceIndexSHA256+'/'+(this.pages?.currentID||'');
  if(this.movementCorridorStorage?.signature===signature)return this.movementCorridorStorage.reader;
  this.clearMovementCorridors();const saved=this.movementCorridorStorage={signature,reader:null};
  try{
   const root=this.api.movementCorridorsRoot||this.api.dataRoot+'/../PBZRouteMovementCorridors',readText=file=>this.api.readText(root+'/'+world+'/'+file),text=readText('index.json');
   if(!text)return null;
   if(text.length>131072)throw Error('Oversized movement corridor manifest');
   const manifest=JSON.parse(text);
   if(manifest.world!==world||manifest.sourceIndexSHA256!==this.index.sourceIndexSHA256||manifest.navigationGrid&&manifest.navigationGrid!==this.pages?.currentID)return null;
   if(manifest.edges===0)return null;
   const {Reader}=require('./PBZRouteMovementCorridors');saved.reader=new Reader(manifest,readText,this.core||this.load('./PBZRecastRuntime'));
  }catch(error){this.report('recast movement corridor unavailable',String(error));}
  return saved.reader;
 }
 ensure(world){
  if(this.world!==world){this.cancel();this.clearMovementCorridors();this.movementStorage?.reader?.clear();this.movementStorage=null;this.job?.return?.();this.pages?.destroy();this.pages=null;this.ready=false;this.error=null;this.world=world;this.revision++;this.statePoll.reset();this.states={};this.signature='';this.job=this.prepare(world);}
 }
 phase(phase){this.loading={phase,completed:0,total:1,started:this.clock()};this.report('recast world load',this.world+' '+phase);}
 *prepare(world){
  this.phase('index');const entry=this.catalog().worlds[world];
  if(entry.index!==world+'/index.json')throw Error('World catalog path differs');
  this.index=JSON.parse(this.api.readText(this.api.dataRoot+'/'+entry.index));yield;
  if(this.index.world!==world||this.index.sourceIndexSHA256!==entry.sourceIndexSHA256)throw Error('World catalog/index mismatch');
  this.phase('core');this.core=this.load('./PBZRecastRuntime');yield;
  this.phase('initialize');let ready=false,failure;const started=this.clock();
  this.core.initialize().then(()=>{ready=true;},e=>{failure=e;});
  while(!ready){if(failure)throw failure;if(this.clock()-started>=10000)throw Error('World Recast initialization timed out after 10s');yield;}
  const create=this.core.createWorld??((manifest,read,options)=>new this.core.PagedWorld(manifest,read,options));
  this.pages=create(this.index,file=>this.api.readText(this.api.dataRoot+'/'+world+'/'+file),{maxTiles:256,maxBytes:32*1024*1024,maxPages:8,maxNodes:65535});
  this.ready=true;this.loading=null;this.revision++;this.report('recast world ready',world+'; '+this.index.tiles+' layers; paged');
 }
 pump(world,pawn,foot){
  const now=this.clock();
  try{
   if(this.world&&world!==this.world){this.invalidate();this.cancel();this.clearMovementCorridors();this.movementStorage?.reader?.clear();this.movementStorage=null;this.job?.return?.();this.job=null;this.statePoll.reset();this.pages?.destroy();this.pages=null;this.world=null;this.ready=false;this.loading=null;this.error=null;this.revision++;}
   if(now<this.next)return;this.next=now+16;
   if(!this.covers(world,foot))return;
   this.ensure(world);
   if(pawn!==this.pawn){if(this.pawn){this.invalidate();this.cancel();this.states={};this.signature='';this.revision++;}this.pawn=pawn;this.statePoll.reset();}
   if(this.job){let row,steps=0;do{row=this.job.next();steps++;}while(!row.done&&steps<4&&this.clock()-now<2);if(row.done)this.job=null;return;}
   if(!this.ready)return;
   const states=this.statePoll.step(pawn,this.index,this.api,now,this.clock);
   if(!states)return;
   const signature=JSON.stringify(this.index.actors.map(a=>states[a.id]??null));
   if(signature!==this.signature){this.invalidate();this.cancel();this.states=states;this.signature=signature;this.revision++;}
  }catch(error){this.error=(this.loading?.phase||'state')+': '+String(error);this.job=null;this.statePoll.reset();this.ready=false;this.invalidate();this.cancel();this.pages?.destroy();this.pages=null;this.loading=null;this.revision++;this.report('recast world unavailable',this.error);}
 }
 route(world,start,goal,options={}){
  this.cancel();if(this.covers(world,start,goal))this.ensure(world);const owner=this;let job;
  job=(function*(){try{return yield* owner.routeCandidate(world,start,goal,options);}finally{owner.queryJobs.delete(job);}})();this.queryJobs.add(job);return job;
 }
 *actionWindowRoute(from,to,seeds,heightPadding,focused=false){
  const points=[from,to,...seeds],pad=600;
  const min=(axis)=>Math.min(...points.map(p=>p[axis])),max=(axis)=>Math.max(...points.map(p=>p[axis]));
  const boundsUE=[min(0)-pad,min(1)-pad,max(0)+pad,max(1)+pad];
  const heightBoundsUE=[min(2)-heightPadding,max(2)+heightPadding];
  let xyKeys;
  if(focused){
   const paged=this.pages.current??this.pages,size=this.index.extentCm||paged.manifest?.extentCm;
   if(!Number.isFinite(size)||size<=0)return null;
   const minX=Math.floor(boundsUE[0]/size),maxX=Math.floor(boundsUE[2]/size);
   const minY=Math.floor(-boundsUE[3]/size),maxY=Math.floor(-boundsUE[1]/size);
   if((maxX-minX+1)*(maxY-minY+1)>65536)return null;
   const segments=[[from,to],...seeds.flatMap(p=>[[from,p],[p,to]])];
   const distance=(x,y,a,b)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
   };
   const maxKeys=paged.window?.maxTiles??256,reach=size*Math.SQRT1_2+300;
   xyKeys=[];
   let checked=0;
   for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
    if(segments.some(([a,b])=>distance((x+.5)*size,-(y+.5)*size,a,b)<=reach)){
     xyKeys.push(x+','+y);
     if(xyKeys.length>maxKeys)return null;
    }
    if((++checked&15)===0)yield;
   }
  }
  return yield* this.pages.routeJob(from,to,this.states,{directOnly:true,boundsUE,xyKeys,heightBoundsUE});
 }
 *corridorWindowRoute(world,start,goal,corridor){
  const paged=this.pages.current??this.pages,size=paged.manifest?.extentCm||this.index.extentCm,rows=corridor.map(item=>item.row),epsilon=.001;
  const boundsUE=[Math.min(start.x,goal.x,...rows.map(row=>row[0]*size+epsilon)),Math.min(start.y,goal.y,...rows.map(row=>-(row[1]+1)*size+epsilon)),Math.max(start.x,goal.x,...rows.map(row=>(row[0]+1)*size-epsilon)),Math.max(start.y,goal.y,...rows.map(row=>-row[1]*size-epsilon))];
  const result=yield* paged.directJob([start.x,start.y,start.z],[goal.x,goal.y,goal.z],this.states,{boundsUE,tileKeys:rows.map(row=>row.slice(0,3).join(',')),heightBoundsUE:[Math.min(start.z,goal.z,...rows.map(row=>row[5]))-1500,Math.max(start.z,goal.z,...rows.map(row=>row[5]))+1500]});
  this.recordCorridorActions(world,corridor);
  return result;
 }
 recordCorridorActions(world,corridor){
  this.corridorActions=corridor.filter(item=>item.viaAction).map(item=>item.viaAction);
  this.corridorPads=null;this.corridorDirections=null;
  if(this.corridorActions.length){
   this.corridorPads=new Map();
   this.corridorDirections=new Map();
   for(const item of corridor){
    if(!item.viaAction)continue;
    const key=String(item.viaAction).toLowerCase();
    this.corridorDirections.set(key,(this.corridorDirections.get(key)??0)|(item.viaReverse?2:1));
    if(!item.viaEntry||!item.viaExit)continue;
    const [entry,exit]=item.viaReverse?[item.viaExit,item.viaEntry]:[item.viaEntry,item.viaExit];
    this.corridorPads.set(key,{entry:entry.slice(),exit:exit.slice()});
   }
   this.report('recast mixed corridor window',JSON.stringify({world,tiles:corridor.length,actions:this.corridorActions}));
  }
 }
 *movementWindowRoute(world,start,goal,excludedActions){
  const paged=this.pages.current??this.pages;
  if(!paged.corridors)return null;
  const actionSource=this.movementCorridors(world);
  const actionHints=this.actionHints(world);
  if(!actionSource&&!actionHints.length)return null;
  const window=paged.window,previous=window?.holdWindow?.(),tiles=paged.index?.tiles,blobs=paged.index?.blobs,from=[start.x,start.y,start.z],to=[goal.x,goal.y,goal.z];let corridor;
  try{
   const residentTiles=[...(window?.loaded?.values()||[])],options={maxCoarseNodes:2048,actionHints,actionSource,excludedActions:this.movementExclusions(excludedActions)};
   if(!excludedActions?.size&&residentTiles.length){
    const componentIDs=new Set();let collected=0;
    for(const tile of residentTiles)for(const [id]of tile.coarseSeeds||[]){componentIDs.add(id);if((++collected&127)===0)yield;}
    const footprint=residentTiles.every(tile=>Array.isArray(tile.coarseSeeds))?{componentIDs}:{tileKeys:new Set(residentTiles.map(tile=>[tile.x,tile.y,tile.layer].join(',')))};
    const resident=yield* paged.corridors.path(from,to,this.states,{...options,...footprint});
    if(resident?.length){
     // The resident check avoids loading tiles again. Live planning still
     // needs the directions and standing pads chosen by coarse search.
     if(resident.some(item=>item.viaAction))this.recordCorridorActions(world,resident);
     this.report('recast resident movement corridor',JSON.stringify({world,tiles:residentTiles.length}));return null;
    }
   }
   corridor=yield* paged.corridors.path(from,to,this.states,options);
  }catch(error){actionSource?.clear?.();if(this.movementCorridorStorage)this.movementCorridorStorage.reader=null;this.report('recast movement corridor query unavailable',String(error));}
  finally{if(previous)window.restoreWindow(previous);if(paged.index){paged.index.tiles=tiles;paged.index.blobs=blobs;}}
  if(!corridor?.length)return null;
  try{return yield* this.corridorWindowRoute(world,start,goal,corridor);}
  catch(error){if(!String(error).match(/budget|capacity/))throw error;return null;}
 }
 *routeAlternateMovement(world,start,goal,excludedActions){
  if(this.world!==world||!this.ready||!excludedActions?.size)return null;
  const session=this.localSession,active=this.pages?.current??this.pages;
  if(!session||session.planner!==active?.window?.planner)return null;
  const result=yield* this.movementWindowRoute(world,start,goal,excludedActions);
  if(!result)return null;
  this.localSession={planner:active.window.planner,bounds:result.windowBoundsUE,vertical:result.verticalWindowUE,world};
  this.report('recast alternate movement window',JSON.stringify({world,rejectedDirections:excludedActions.size,residentTiles:result.residentTiles}));
  return{leg:this.leg(world,result)};
 }
 *routeCandidate(world,start,goal,options={}){
  if(!this.covers(world,start,goal))return null;this.ensure(world);
  while(!this.ready){if(this.error)return null;yield;}
  const from=[start.x,start.y,start.z],to=[goal.x,goal.y,goal.z];let result,conditionalCandidate=false,pending=[];
  if(this.pages.manifest?.kind==='multi-grid-world'){const a=this.pages.select(from),b=this.pages.select(to);if(a.id===b.id)this.pages.ensure(a);}
  try{
   if(options.walkingAlternative){
    for(const paddingTiles of [2,1]){
     try{result=yield* this.pages.routeJob(from,to,this.states,{paddingTiles,directOnly:true,heightPaddingCm:1500});if(result.complete)break;}
     catch(error){if(!String(error).match(/budget|capacity/))throw error;}
    }
    if(!result?.complete)result=yield* this.pages.routeJob(from,to,this.states,{paddingTiles:0});
    if(!result)return null;
   }else if(options.localActions){
    let actionWindow=false,corridor;
    // Consult the exact coarse walking components before loading a broad
    // action rectangle. A real detour should be imported once, rather than
    // after two separately decoded, disconnected endpoint windows.
    const paged=this.pages.current??this.pages;
    if(paged.corridors&&R.xy(start,goal)>6000){
     corridor=yield* paged.corridors.path(from,to,this.states,{maxCoarseNodes:2048});
     if(!corridor){const hints=this.actionHints(world);if(hints.length)corridor=yield* paged.corridors.path(from,to,this.states,{maxCoarseNodes:2048,actionHints:hints});}
     if(corridor?.length){
      try{result=yield* this.corridorWindowRoute(world,start,goal,corridor);actionWindow=corridor.some(item=>item.viaAction);}
      catch(error){if(!String(error).match(/budget|capacity/))throw error;}
     }
    }
    if(!result?.complete&&!actionWindow){
     const seeds=(options.motionSeeds||[]).map(p=>[p.x,p.y,p.z]);
     const heightPadding=Math.max(150,Math.min(1500,Number(options.heightPaddingCm)||150));
     try{
      result=yield* this.actionWindowRoute(from,to,seeds,heightPadding,options.focusedWindow);
     }catch(error){if(!String(error).match(/budget|capacity/))throw error;}
     if(!result){
      try{result=yield* this.pages.routeJob(from,to,this.states,{directOnly:true,paddingTiles:0,heightPaddingCm:1500});}
      catch(error){if(!String(error).match(/budget|capacity/))throw error;}
     }
     if(!result&&!corridor?.length){
      // A failed coarse walk may leave only its last endpoint probe resident.
      // Retain a bounded action window around the trip and its nearby seeds.
      const padding=[600,600,1500];
      const localSeeds=seeds.filter(p=>p.every((v,axis)=>v>=Math.min(from[axis],to[axis])-padding[axis]&&v<=Math.max(from[axis],to[axis])+padding[axis]));
      try{result=yield* this.actionWindowRoute(from,to,localSeeds,1500,true);}
      catch(error){if(!String(error).match(/budget|capacity/))throw error;}
     }
     if(!result)result=yield* this.pages.routeJob(from,to,this.states,{paddingTiles:0,heightPaddingCm:1500});
     if(result&&!result.complete){const alternate=yield* this.movementWindowRoute(world,start,goal);if(alternate)result=alternate;}
    }
   }else result=yield* this.pages.routeJob(from,to,this.states);
   const relevant=new Set(result.unknownActors??[]);
   pending=this.index.actors.filter(a=>a.rule==='fogdoor-passability'&&relevant.has(a.id)&&this.states[a.id]!==true&&this.states[a.id]!==false).map(a=>a.id);
   if(!result.complete&&pending.length){const candidate=Object.fromEntries(pending.map(id=>[id,true]));const possible=yield* this.pages.candidateJob(from,to,this.states,candidate);if(possible.complete){result=possible;conditionalCandidate=true;}}
  }catch(error){this.report('recast world query unavailable',String(error));return null;}
  this.report('recast world query',JSON.stringify({world,complete:result.complete,conditionalCandidate,reason:result.reason,points:result.points.length,residentTiles:result.residentTiles,residentBytes:result.residentBytes}));
  const active=this.pages.current??this.pages;
  this.localSession=active?.window?{planner:active.window.planner,bounds:result.windowBoundsUE,vertical:result.verticalWindowUE,world}:null;
  return this.leg(world,result,conditionalCandidate,pending);
 }
 leg(world,result,conditionalCandidate=false,pending=[]){
  if(!result||result.points.length<2)return null;
  const points=result.points.map(p=>({x:p[0],y:p[1],z:p[2]}));
  const leg={world,provider:'recast',points,checks:[],gates:[],moves:[],walks:points.slice(1).map((b,i)=>({a:points[i],b,edge:-1,from:i,to:i+1})),meters:result.meters,
   partial:!result.complete||conditionalCandidate,conditionalCandidate,topologyComplete:result.complete,pendingConditions:conditionalCandidate?pending:[],
   physicalVerified:false,recastGeneration:this.revision,experimentalWorld:true};
  if(!result.complete)leg.obstacles=[{id:'recast-frontier',world,p:points.at(-1),unknown:true,icon:'mechanism',label:'前方通路待确认'}];
  return leg;
 }
 *routeLocal(world,a,b){
  const session=this.localSession,active=this.pages?.current??this.pages;
  if(!session||session.world!==world||session.planner!==active?.window?.planner||session.planner.destroyed)return null;
  // The prior request rectangle can clip a resident tile whose geometry extends
  // beyond it. Let this same immutable Detour window decide endpoint coverage.
  return this.leg(world,yield* session.planner.routeJob([a.x,a.y,a.z],[b.x,b.y,b.z]));
 }
 // Bell ranking may use a directed terrain chain outside the resident window.
 // Return only an estimate; no far-side route points may be drawn before travel.
 *bellArrival(world,a,b,policy){
  const session=this.localSession,active=this.pages?.current??this.pages;
  if(!session||session.world!==world||session.planner!==active?.window?.planner||!active?.corridors)return null;
  if(this.pages?.manifest?.kind==='multi-grid-world'){
   const from=this.pages.select([a.x,a.y,a.z]),to=this.pages.select([b.x,b.y,b.z]);
   if(from.id!==to.id||this.pages.currentID!==from.id)return null;
  }
  const source=this.movementCorridors(world),envelope=policy||MovementIndex.walkingEnvelope;
  const actionSource=source?{*fromJob(id){
   const rows=yield* source.fromJob(id);
   return rows.filter(row=>row.kind==='surface'||policy&&row.entry[2]-row.exit[2]<=envelope.maxHeightCm&&
    Math.hypot(row.entry[0]-row.exit[0],row.entry[1]-row.exit[1])<=envelope.maxRunCm);
  }}:undefined;
  const corridor=yield* active.corridors.path([a.x,a.y,a.z],[b.x,b.y,b.z],this.states,
   {maxCoarseNodes:2048,actionSource,excludedActions:this.movementExclusions()});
  if(!corridor?.length)return null;
  let previous=a,length=0;
  for(const row of corridor)if(row.viaEntry&&row.viaExit){
   const entry=row.viaReverse?row.viaExit:row.viaEntry,exit=row.viaReverse?row.viaEntry:row.viaExit;
   const p={x:entry[0],y:entry[1],z:entry[2]},q={x:exit[0],y:exit[1],z:exit[2]};
   length+=R.dist(previous,p)+R.dist(p,q);previous=q;
  }
  return {meters:Math.max(R.dist(a,b),length+R.dist(previous,b))/100,evidence:'recast-topology'};
 }
 *routeEndpointLocal(world,a,b){
  const session=this.localSession,active=this.pages?.current??this.pages;
  if(!session||session.world!==world||session.planner!==active?.window?.planner||session.planner.destroyed||!active?.routeJob||!active.window?.holdWindow||!active.window?.restoreWindow)return null;
  if(this.pages?.manifest?.kind==='multi-grid-world'){
   const fromGrid=this.pages.select([a.x,a.y,a.z]),toGrid=this.pages.select([b.x,b.y,b.z]);
   if(fromGrid.id!==toGrid.id||this.pages.currentID!==fromGrid.id)return null;
  }
  const window=active.window,previous=window.holdWindow(),tiles=active.index?.tiles,blobs=active.index?.blobs;
  try{
   if(!active.corridors)return null;
   const from=[a.x,a.y,a.z],to=[b.x,b.y,b.z],corridor=yield* active.corridors.path(from,to,this.states,{maxCoarseNodes:2048});
   if(!corridor?.length)return null;
   const size=active.manifest?.extentCm||this.index.extentCm,rows=corridor.map(item=>item.row),epsilon=.001;
   const boundsUE=[Math.min(a.x,b.x,...rows.map(row=>row[0]*size+epsilon)),Math.min(a.y,b.y,...rows.map(row=>-(row[1]+1)*size+epsilon)),Math.max(a.x,b.x,...rows.map(row=>(row[0]+1)*size-epsilon)),Math.max(a.y,b.y,...rows.map(row=>-row[1]*size-epsilon))];
   const heights=rows.map(row=>row[5]),result=yield* active.directJob(from,to,this.states,{boundsUE,tileKeys:rows.map(row=>row.slice(0,3).join(',')),heightBoundsUE:[Math.min(a.z,b.z,...heights)-1500,Math.max(a.z,b.z,...heights)+1500]});
   if(!result?.complete)return null;
   return this.leg(world,result);
  }catch(error){this.report('recast endpoint bridge unavailable',String(error));return null;}
  finally{
   window.restoreWindow(previous);
   if(active.index){active.index.tiles=tiles;active.index.blobs=blobs;}
   this.localSession=session;
  }
 }
 *endpointCandidates(world,p){
  const session=this.localSession,active=this.pages?.current??this.pages;
  if(!session||session.world!==world||session.planner!==active?.window?.planner||session.planner.destroyed||!active?.directJob||!active.window?.holdWindow||!active.window?.restoreWindow)return[];
  const point=[p.x,p.y,p.z],bounds=[p.x-800,p.y-800,p.x+800,p.y+800],vertical=[p.z-120,p.z+120],window=active.window,previous=window.holdWindow(),tiles=active.index?.tiles,blobs=active.index?.blobs;
  try{
   // The route window may not cover this endpoint. Load only its bounded local
   // projection area, then restore the route planner before returning anchors.
   yield* active.directJob(point,point,this.states,{boundsUE:bounds,heightBoundsUE:vertical,directOnly:true});
   const planner=window.planner;if(!planner||planner.destroyed)return[];
   const origin=planner.origin||[0,0,0],out=[],seen=new Set();
   for(const radius of [0,300,600])for(let i=0;i<(radius?8:1);i++){
    const angle=i*Math.PI/4,x=p.x+Math.cos(angle)*radius,y=p.y+Math.sin(angle)*radius;
    const found=planner.query.findNearestPoly({x:(x-origin[0])/100,y:(p.z-origin[2])/100,z:-(y-origin[1])/100},{halfExtents:{x:1.5,y:1.2,z:1.5}});yield;
    if(!found.success||!found.nearestRef)continue;
    const q={x:origin[0]+found.nearestPoint.x*100,y:origin[1]-found.nearestPoint.z*100,z:origin[2]+found.nearestPoint.y*100},key=[q.x,q.y,q.z].map(Math.round).join('/');
    if(!R.finite(q)||R.xy(p,q)>750||Math.abs(p.z-q.z)>120||seen.has(key))continue;
    seen.add(key);out.push(q);
   }
   return out.sort((a,b)=>R.dist(a,p)-R.dist(b,p)).slice(0,6);
  }catch(error){this.report('recast endpoint projection',String(error));return[];}
  finally{
   window.restoreWindow(previous);
   if(active.index){active.index.tiles=tiles;active.index.blobs=blobs;}
   this.localSession=session;
  }
 }
 *walkingAlternative(world,start,goal){
  const cached=this.expandedWalkingCandidate;
  if(cached&&cached.world===world&&cached.revision===this.revision&&R.dist(cached.start,start)<1&&R.dist(cached.goal,goal)<1){this.expandedWalkingCandidate=null;return cached.leg;}
  this.localSession=null;
  return yield* this.routeCandidate(world,start,goal,{walkingAlternative:true});
 }
 *actionPadCandidates(world,p){
  const session=this.localSession,active=this.pages?.current??this.pages;
  if(!session||session.world!==world||session.planner!==active?.window?.planner)return[];
  return yield* projectActionPad(session.planner,p);
 }
 *actionTopology(world,start,goal,features,additionalGoals=[],diverseRecovery=false){
  const session=this.localSession,active=this.pages?.current??this.pages;
  if(!session||session.world!==world||session.planner!==active?.window?.planner||!session.planner.actionTopologyJob)return null;
  const result=yield* session.planner.actionTopologyJob([start.x,start.y,start.z],[goal.x,goal.y,goal.z],features,{relevantOnly:true,maxRankedFeatures:1024,pendingMechanisms:true,...topologyGoals(additionalGoals),...(diverseRecovery?{diverseRecovery:true}:{})});
  this.report('recast action topology',JSON.stringify(result.stats));return result;
 }
 *indexedMovements(world,start,goal,policy,bounds,vertical,priority,nearFall){
  const io={priority,nearFall,manifest:this.api.movementManifest};
  if(this.api.readText)Object.assign(io,{state:this.movementStorage||={},core:()=>this.core||this.load('./PBZRecastRuntime'),readText:file=>this.api.readText((this.api.movementDataRoot||this.api.dataRoot+'/../PBZRouteMovementData')+'/'+world+'/'+file)});
  return yield* MovementIndex.candidates(world,this.index,start,goal,policy,bounds,this.pages?.currentID,vertical,io);
 }
 *preferredFalls(world,start,goal,policy){
  const session=this.localSession,active=this.pages?.current??this.pages;
  if(!policy||!session||session.world!==world||session.planner!==active?.window?.planner||!this.corridorActions?.length)return [];
  const result=new Map(),excluded=this.movementExclusions();
  for(const guid of this.corridorActions.slice(0,12)){
  if(!guid.startsWith('recast-movement:')||this.corridorDirections?.get(guid)!==1)continue;
  const pads=this.corridorPads?.get(guid);
  if(!pads)continue;
  const {entry,exit}=pads;
  if(entry[2]-exit[2]<100)continue;
  const bounds=[Math.min(entry[0],exit[0])-900,Math.min(entry[1],exit[1])-900,
   Math.max(entry[0],exit[0])+900,Math.max(entry[1],exit[1])+900];
  const vertical=[exit[2]-120,entry[2]+120];
  const saved=yield* this.indexedMovements(world,start,goal,policy,bounds,vertical,new Set([guid]),pads);
  if(!saved||session!==this.localSession)return [];
  const nearest=[];
  for(const [i,feature] of saved.entries()){
   if(!excluded?.has(feature.guid)){
    const score=MovementIndex.distance(feature.path[0],entry)+MovementIndex.distance(feature.path[1],exit);
    const at=nearest.findIndex(row=>row.score>score);
    if(at>=0)nearest.splice(at,0,{feature,score});
    else if(nearest.length<24)nearest.push({feature,score});
    if(nearest.length>24)nearest.pop();
   }
   if((i&31)===31)yield;
  }
  for(const row of nearest)result.set(row.feature.guid,row.feature);
  }
  return [...result.values()];
 }
 *dropCandidates(world,start,goal,seeds,policy){
  const session=this.localSession,active=this.pages?.current??this.pages;if(!session||session.world!==world||session.planner!==active?.window?.planner||!session.planner.dropCandidatesJob)return[];
  const priority=new Set((this.corridorActions||[]).filter(guid=>guid.startsWith('recast-movement:')));
  const saved=yield* this.indexedMovements(world,start,goal,policy,session.bounds,session.vertical,priority);
  if(saved?.length||saved?.deferred?.length||saved?.coverageComplete){
   const primary=yield* stageMovements(this,world,start,goal,saved,saved.deferred||[],this.movementExclusions());
   this.report('recast movement proposals',JSON.stringify({world,count:primary.length,deferred:primary.deferredCount,coverageComplete:!!saved.coverageComplete,source:'offline geometry; current scene verification required'}));return primary;
  }
  // An uncovered empty page says nothing about this resident action graph.
  // Discover its bounded geometry first. Wide walking remains the caller's
  // later fallback, after action search has had a chance to connect the gap.
  const envelope=policy||MovementIndex.walkingEnvelope;
  const points=[[start.x,start.y,start.z],...seeds.map(p=>[p.x,p.y,p.z])],rows=yield* session.planner.dropCandidatesJob(points,{...envelope,maxRiseCm:200,goal:[goal.x,goal.y,goal.z]});
  this.report('recast fall candidates',JSON.stringify({world,count:rows.length,maxHeightCm:envelope.maxHeightCm,walkingOnly:!policy}));
  const recovered=[],primary=yield* MovementIndex.boundaryFeatures(rows,recovered,!policy);
  return yield* stageMovements(this,world,start,goal,primary,recovered,this.movementExclusions());
 }
 moreMovementCandidates(world,start,goal){return takeDeferred(this,world,start,goal);}
 actionCorridorActions(){return this.corridorActions||[];}
 actionCorridorPads(){return this.corridorPads||new Map();}
 actionCorridorDirections(){return this.corridorDirections;}
 *pendingSlideGate(world,start,goal){
  if(world!==this.world||!this.ready)return null;
  const relay=require('./PBZRouteSlideRelay').forWorld(world);
  if(!relay||this.states[relay.gate]===true)return null;
  const actionHints=this.actionHints(world);
  const action=actionHints.find(row=>row.guid===relay.guid&&row.requiresPassable===relay.gate);
  const approach=action?.gateApproach,paged=this.pages.current??this.pages;
  if(!Array.isArray(approach)||approach.length!==3||!approach.every(Number.isFinite)||!paged.corridors)return null;
  const actionSource=this.movementCorridors(world),options={actionHints,actionSource,maxCoarseNodes:2048};
  const from=[start.x,start.y,start.z],to=[goal.x,goal.y,goal.z],states=this.states;
  try{
   const prefix=yield* paged.corridors.path(from,approach,states,{...options,excludedActions:this.movementExclusions()});
   if(!prefix)return null;
   // The open query checks whether this interaction is relevant to the goal.
   // Only a separately planned and checked closed-state approach may be shown.
   const tail=yield* paged.corridors.path(approach,to,{...states,[relay.gate]:true},options);
   if(this.states!==states||!tail?.some(row=>row.viaAction===relay.guid))return null;
   return {p:{x:approach[0],y:approach[1],z:approach[2]},gate:relay.gate,closed:states[relay.gate]===false};
  }catch(error){this.report('recast gate approach unavailable',String(error));return null;}
 }
 cancel(){for(const job of [...this.queryJobs])job.return();this.queryJobs.clear();this.pages?.cancelQueries?.();this.localSession=null;this.expandedWalkingCandidate=null;this.deferredMovements=null;this.corridorActions=null;this.corridorPads=null;this.corridorDirections=null;}
}
class RecastCache{
 constructor(load,api,report=()=>{},invalidate=()=>{},clock=Date.now){this.regional=new RegionalCache(load,api,report,invalidate,clock);this.worlds=new WorldCache(load,api,report,invalidate,clock);this.active=this.regional;}
 covers(world,start,goal=start){return this.regional.covers(world,start,goal)||this.worlds.covers(world,start,goal);}
 route(world,start,goal,options){this.cancel();this.active=this.regional.covers(world,start,goal)?this.regional:this.worlds;return this.active.route(world,start,goal,options);}
 routeLocal(world,a,b){return this.active===this.worlds?this.worlds.routeLocal(world,a,b):this.regional.route(world,a,b);}
 endpointCandidates(world,p){return this.active===this.worlds?this.worlds.endpointCandidates(world,p):(function*(){return[];})();}
 routeEndpointLocal(world,a,b){return this.active===this.worlds?this.worlds.routeEndpointLocal(world,a,b):(function*(){return null;})();}
 bellArrival(world,a,b,policy){return this.active===this.worlds?this.worlds.bellArrival(world,a,b,policy):(function*(){return null;})();}
 walkingAlternative(world,a,b){return this.active===this.worlds?this.worlds.walkingAlternative(world,a,b):(function*(){return null;})();}
 *routeAlternateMovement(world,a,b,excludedActions){
  if(this.active===this.worlds)return yield* this.worlds.routeAlternateMovement(world,a,b,excludedActions);
  return null;
 }
 *actionPadCandidates(world,p){
  if(this.active===this.worlds)return yield* this.worlds.actionPadCandidates(world,p);
  if(!this.regional.ready||!this.regional.covers(world,p))return[];
  return yield* projectActionPad(this.regional.planner,p);
 }
 *actionTopology(world,start,goal,features,additionalGoals=[],diverseRecovery=false){
  if(this.active===this.worlds)return yield* this.worlds.actionTopology(world,start,goal,features,additionalGoals,diverseRecovery);
  const planner=this.regional.planner;if(!planner?.actionTopologyJob)return null;
  return yield* planner.actionTopologyJob([start.x,start.y,start.z],[goal.x,goal.y,goal.z],features,{relevantOnly:true,pendingMechanisms:true,...topologyGoals(additionalGoals)});
 }
 *dropCandidates(world,start,goal,seeds,policy){
  if(this.active===this.worlds)return yield* this.worlds.dropCandidates(world,start,goal,seeds,policy);
  const planner=this.regional.planner;if(!planner?.dropCandidatesJob)return[];
  const rows=yield* planner.dropCandidatesJob([[start.x,start.y,start.z],...seeds.map(p=>[p.x,p.y,p.z])],{...(policy||MovementIndex.walkingEnvelope),maxRiseCm:200});
  const recovered=[],primary=yield* MovementIndex.boundaryFeatures(rows,recovered,!policy);
  return yield* stageMovements(this,world,start,goal,primary,recovered);
 }
 *preferredFalls(world,start,goal,policy){
  if(this.active!==this.worlds)return [];
  return yield* this.worlds.preferredFalls(world,start,goal,policy);
 }
 moreMovementCandidates(world,start,goal){return this.active===this.worlds?this.worlds.moreMovementCandidates(world,start,goal):takeDeferred(this,world,start,goal);}
 actionCorridorActions(){return this.active===this.worlds?this.worlds.actionCorridorActions():[];}
 actionCorridorPads(){return this.active===this.worlds?this.worlds.actionCorridorPads():new Map();}
 actionCorridorDirections(){return this.active===this.worlds?this.worlds.actionCorridorDirections():null;}
 *pendingSlideGate(world,start,goal){
  if(this.active===this.worlds)return yield* this.worlds.pendingSlideGate(world,start,goal);
  return null;
 }
 pump(world,pawn,foot){
  this.regional.pump(world,pawn,foot);
  if(this.active===this.worlds||!this.regional.covers(world,foot)||this.worlds.world&&this.worlds.world!==world||this.worlds.pawn&&this.worlds.pawn!==pawn)this.worlds.pump(world,pawn,foot);
 }
 cancel(){this.deferredMovements=null;this.regional.cancel();this.worlds.cancel();}
 get revision(){return this.regional.revision+this.worlds.revision;}
 get ready(){return this.active.ready;}
 get loading(){return this.active.loading;}
 get error(){return this.active.error;}
}
exports.RecastCache=RecastCache;exports.WorldCache=WorldCache;
