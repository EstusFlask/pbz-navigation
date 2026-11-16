'use strict';
const R=require('./PBZRouteCore'),States=require('./PBZRecastStates');
// Catalog bounds select the provider without loading any old atlas or trail.
const REGION={world:'pbz_pangzhen_wp',bounds:[-196000,105000,-12000,-166000,130000,10000]};
const inside=p=>R.finite(p)&&['x','y','z'].every((key,k)=>p[key]>=REGION.bounds[k]+(k<2?100:0)&&p[key]<=REGION.bounds[k+3]-(k<2?100:0));
class RecastCache{
 constructor(load,api,report=()=>{},invalidate=()=>{},clock=Date.now){Object.assign(this,{load,api,report,invalidate,clock});this.revision=0;this.next=0;this.nextState=0;this.classCache=new Map();this.blobs=new Map();this.active=new Map();this.ready=false;this.error=null;this.job=null;this.core=null;this.planner=null;}
 covers(world,start,goal= start){return world===REGION.world&&inside(start)&&inside(goal);}
 ensure(){if(this.job||this.planner||this.error)return;this.job=this.prepare();}
 phase(name,completed=0,total=1){
  this.loading={phase:name,completed,total,started:this.clock()};this.report('recast load',name+' '+completed+'/'+total);
 }
 *prepare(){
  this.phase('index');
  this.index=this.load('./PBZRecastData/route-001/index');yield;
  if(this.index.world!==REGION.world||JSON.stringify(this.index.boundsUE)!==JSON.stringify(REGION.bounds))throw Error('Recast region/catalog mismatch');
  this.phase('core');this.core=this.load('./PBZRecastRuntime');this.report('recast backend',this.core.backend||'legacy-wasm');yield;
  let initialized=false,failure;
  this.phase('initialize');const started=this.clock();
  this.core.initialize().then(()=>{initialized=true;},e=>{failure=e;});
  while(!initialized){if(failure)throw failure;if(this.clock()-started>=10000)throw Error('Recast initialization timed out after 10s');yield;}
  this.planner=new this.core.Planner(this.core.decodeBase64(this.index.navHeaderBase64),this.index);yield;
  this.phase('data',0,this.index.packets);
  for(let i=0;i<this.index.packets;i++){
   const packet=this.load('./PBZRecastData/route-001/'+i);
   for(const [id,text]of Object.entries(packet.tiles)){
    const bytes=this.core.decodeBase64(text);if(bytes.length!==this.index.blobs[id]?.bytes)throw Error('Recast tile length differs');this.blobs.set(id,bytes);
   }
   this.loading.completed=i+1;
   if((i+1)%20===0)this.report('recast progress','data '+(i+1)+'/'+this.index.packets);
   yield;
  }
  yield* this.apply({});return true;
 }
 *apply(states){
  const selected=this.core.selectVariants(this.index,states);this.signature=selected.signature;this.unknownActors=selected.unknownActors;
  this.ready=false;this.phase('tiles',0,selected.tiles.length);
  for(const row of selected.tiles){
   this.loading.completed++;
   if(this.active.get(row.slot)===row.blob)continue;
   const bytes=row.blob===null?null:this.blobs.get(row.blob);if(row.blob!==null&&!bytes)throw Error('Missing conditional tile');
   this.planner.replaceTile(row.slot,bytes);this.active.set(row.slot,row.blob);yield;
  }
  this.ready=true;this.loading=null;this.revision++;this.report('recast ready',this.active.size+' tiles; unknown conditions='+this.unknownActors.length);
 }
 pump(world,pawn,foot){
  const now=this.clock();if(now<this.next)return;this.next=now+16;
  try{
   if(world!==this.contextWorld||pawn!==this.contextPawn){
    this.contextWorld=world;this.contextPawn=pawn;this.nextState=0;
    if(this.signature!==undefined&&this.planner){
     this.invalidate();this.planner.cancelQueries();this.job?.return?.();this.ready=false;this.revision++;this.job=this.apply({});
    }
   }
   if(this.covers(world,foot))this.ensure();
   if(this.job){let row,steps=0;do{row=this.job.next();steps++;}while(!row.done&&steps<8&&this.clock()-now<2);if(row.done)this.job=null;return;}
   if(!this.ready||world!==REGION.world||now<this.nextState)return;this.nextState=now+450;
   const states=States.read(pawn,this.index,this.api,this.classCache),selected=this.core.selectVariants(this.index,states);
   if(selected.signature!==this.signature){
    this.invalidate();this.planner.cancelQueries();this.ready=false;this.revision++;this.job=this.apply(states);
   }
  }catch(error){this.error=(this.loading?.phase||'state')+': '+String(error);this.job=null;this.ready=false;this.invalidate();this.planner?.destroy();this.planner=null;this.revision++;this.report('recast unavailable',this.error);}
 }
 *route(world,start,goal){
  if(!this.covers(world,start,goal))return null;this.ensure();
  while(!this.ready){if(this.error)return null;yield;}
  const result=yield* this.planner.routeJob([start.x,start.y,start.z],[goal.x,goal.y,goal.z]);
  this.report('recast query',JSON.stringify({complete:result.complete,reason:result.reason,polygons:result.corridorPolygons,corners:result.corners.length,unknown:this.unknownActors.length}));
  if(result.points.length<2)return null;
  const points=result.points.map(p=>({x:p[0],y:p[1],z:p[2]}));
  const leg={world,provider:'recast',points,checks:[],gates:[],moves:[],walks:points.slice(1).map((b,i)=>({a:points[i],b,edge:-1,from:i,to:i+1})),
   meters:result.meters,partial:!result.complete,physicalVerified:false,recastGeneration:this.revision};
  if(!result.complete)leg.obstacles=[{id:'recast-frontier',world,p:points.at(-1),unknown:true,icon:'mechanism',label:'前方通路待确认'}];
  return leg;
 }
 cancel(){this.planner?.cancelQueries();}
}
exports.RecastCache=RecastCache;
