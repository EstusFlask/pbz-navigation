// Vertically isolated grids share actor truth, but never fabricate a connection.
// Only one bounded PagedWorld is resident, including during grid changes.
import {PagedWorld} from './world-pages.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export class WorldSet{
 constructor(manifest,readText,options={}){
  need(manifest.schema===1&&manifest.kind==='multi-grid-world'&&manifest.unknownState==='closed'&&manifest.grids.length>=2&&manifest.grids.length<=16,'Unsupported world grid set');
  Object.assign(this,{manifest,readText,options});this.current=null;this.currentID=null;
  for(const grid of manifest.grids)need(/^[a-z0-9_]+$/.test(grid.id)&&grid.index==='grids/'+grid.id+'/index.json'&&['include','exclude'].includes(grid.selector.mode)&&grid.selector.zBandUE.length===2,'Invalid world grid selector');
 }
 select(point){
  const found=this.manifest.grids.filter(g=>{const [a,b]=g.selector.zBandUE,inside=point[2]>=a&&point[2]<=b;return g.selector.mode==='include'?inside:!inside;});
  need(found.length===1,'World grid selectors overlap or omit a coordinate');return found[0];
 }
 ensure(grid){
  if(this.currentID===grid.id)return this.current;
  this.current?.destroy();this.current=null;this.currentID=null;
  const manifest=JSON.parse(this.readText(grid.index));
  need(manifest.world===this.manifest.world&&manifest.sourceIndexSHA256===grid.sourceIndexSHA256&&manifest.kind==='paged-sparse-world','World subgrid index differs');
  const prefix=grid.index.slice(0,-'index.json'.length);
  this.current=new PagedWorld(manifest,file=>this.readText(prefix+file),this.options);this.currentID=grid.id;return this.current;
 }
 *query(start,goal,states,options,candidate){
  const a=this.select(start),b=this.select(goal);
  if(a.id!==b.id)return{complete:false,partial:true,reason:'isolated navigation grids require a verified action connection',points:[],corners:[],meters:0,unknownActors:[],physicalVerified:false};
  const grid=this.ensure(a),result=candidate?yield* grid.candidateJob(start,goal,states,candidate,options):yield* grid.routeJob(start,goal,states,options);
  return{...result,navigationGrid:a.id,cellCm:grid.manifest.cellCm};
 }
 routeJob(start,goal,states={},options={}){return this.query(start,goal,states,options);}
 candidateJob(start,goal,states,candidate,options={}){return this.query(start,goal,states,options,candidate);}
 cancelQueries(){this.current?.cancelQueries();}
 destroy(){this.current?.destroy();this.current=null;this.currentID=null;}
}
export function createWorld(manifest,readText,options){return manifest.kind==='multi-grid-world'?new WorldSet(manifest,readText,options):new PagedWorld(manifest,readText,options);}
