"""Independent cooked-collision checks for explicit custom route candidates.

Requires an audit folder produced by audit-custom-routes.mjs. This checks
standing/walking and computed air capsules; native traversal state/warps and
gameplay acceptance remain separate. No trajectory becomes a route input.
"""
from pathlib import Path
import argparse,hashlib,importlib.util,json,sqlite3,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
body=module('body','tools/validate-offline-body.py');world=module('tiles','tools/build-offline-world-tiles.py')
def check(folder):
 summary=json.loads((folder/'summary.json').read_text(encoding='utf-8'));results=[]
 for case in summary['results']:
  if not case.get('complete'):continue
  file=folder/f"{case['number']:02d}-{case['id']}.json";raw=json.loads(file.read_text(encoding='utf-8'));leg=raw['result']['legs'][0];name=raw['world'];worldfolder=ROOT/'build/offline-navigation/worlds'/name
  if name=='pbz_ximeng_wp':worldfolder=worldfolder/'grids/normal'
  meta=json.loads((worldfolder/'spatial-index.json').read_text());db=sqlite3.connect(worldfolder/'spatial.sqlite');samples=[];skipped=set()
  for i,(a,b) in enumerate(zip(leg['points'],leg['points'][1:])):
   move=next((m for m in leg.get('moves',[])if m['from']<=i<m['to']),None);walking=any(w['from']<=i<w['to']for w in leg.get('walks',[]));air=bool(move)and not walking
   if air and move['kind']not in ['fall','jump']:
    skipped.add(move['guid']);continue
   a=np.array([a[k]for k in'xyz']);b=np.array([b[k]for k in'xyz']);count=max(1,int(np.ceil(np.linalg.norm(b-a)/25)))
   for t in range(count):samples.append((len(samples),a+(b-a)*t/count,air,move['guid']if move else None))
  grouped={}
  for row in samples:
   p=row[1];grouped.setdefault((int(p[0]//meta['extentCm']),int(-p[1]//meta['extentCm'])),[]).append(row)
  failures=[];partitionExtents=set()
  def inspect(rows,out,x,y,localMeta):
   out.mkdir(parents=True,exist_ok=True)
   if not(out/'input.pbzmesh').exists():world.materialize(db,worldfolder,x,y,localMeta,out)
   local=json.loads((out/'input.json').read_text());v,t=world.mesh_arrays(out/'input.pbzmesh');keep=np.ones(len(t),dtype=bool)
   for condition in local['conditionalRanges']:keep[condition['firstTriangle']:condition['firstTriangle']+condition['triangles']]=False
   triangles=np.asarray(v[t[keep]]);lo=triangles.min(axis=1);hi=triangles.max(axis=1)
   for number,p,air,guid in rows:
    near=triangles[np.all((lo<=p+[47,47,194])&(hi>=p+[-47,-47,-100]),axis=1)]
    if not len(near):
     if not air:failures.append(dict(sample=number,p=p.tolist(),guid=guid,why='no nearby collision'))
     continue
    q=p.copy()
    if not air:
     n=np.cross(near[:,1]-near[:,0],near[:,2]-near[:,0]);up=n[:,2]/np.maximum(np.linalg.norm(n,axis=1),1e-20)>=np.cos(np.deg2rad(55));floor=near[up&(near.min(axis=1)[:,2]<=p[2]+25)];contact=body.capsule_support(p,floor)if len(floor)else None
     if contact is None:failures.append(dict(sample=number,p=p.tolist(),guid=guid,why='no unpenetrated capsule support'));continue
     q[2]=contact
    clearance=float(body.segment_distance(q+[0,0,45 if air else 96],q+[0,0,147],near).min())
    if clearance<(44.1 if air else 44.9):failures.append(dict(sample=number,p=p.tolist(),guid=guid,why='air capsule collision'if air else'walking body collision',clearance=clearance))
   del v,t,triangles
  for (x,y),rows in grouped.items():
   out=folder/'collision'/name/f'{x}_{y}'
   try:
    inspect(rows,out,x,y,meta);partitionExtents.add(meta['extentCm'])
   except ValueError as error:
    if 'Tile collision memory budget exceeded' not in str(error):raise
    # Dense source tiles can exceed the offline materializer cap. Repartition
    # only this validation area; each subregion still reads the exact source
    # triangles and obeys the same per-materialization geometry ceiling.
    extent=640;subMeta={**meta,'tileCells':extent//meta['cellCm'],'extentCm':extent};subgroups={}
    for row in rows:
     p=row[1];subgroups.setdefault((int(p[0]//extent),int(-p[1]//extent)),[]).append(row)
    for (sx,sy),subset in subgroups.items():
     inspect(subset,out/'subgrid-640'/f'{sx}_{sy}',sx,sy,subMeta);partitionExtents.add(extent)
   print('Independent collision tile',x,y,'samples',len(rows),'failures',len(failures),flush=True)
  db.close();row=dict(number=raw['number'],id=raw['id'],world=name,routeSHA256=hashlib.sha256(file.read_bytes()).hexdigest(),samples=len(samples),collisionPartitionExtentsCm=sorted(partitionExtents),nativeActionsNotCertified=sorted(skipped),failures=failures,independentGeometryPassed=not failures,physicalVerified=False);results.append(row)
  (folder/'collision-results.json').write_text(json.dumps(dict(scope='Independent exact cooked triangles; dense validation regions subdivide without changing geometry or the per-region memory cap; explicitly passable modeled barriers; walking/air only, no native actions or gameplay acceptance',results=results),ensure_ascii=False,indent=2),encoding='utf-8');print(raw['number'],raw['id'],'samples',len(samples),'failures',len(failures),'nativeActionsExcluded',len(skipped),flush=True)
 return results
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('folder',type=Path);args=parser.parse_args();folder=args.folder.resolve()
 if not folder.is_relative_to(ROOT/'build'):raise ValueError('Private evidence must stay under build/')
 check(folder)
