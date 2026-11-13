import sys,json,re,math
from pathlib import Path
import numpy as np
from pbz_component_transforms import Package,Cursor
sys.stdout.reconfigure(encoding='utf-8');root=Path('build/roadbook-11');index=json.loads((root/'all-placed-index.json').read_text(encoding='utf-8'))
patterns=[('SkewUpRunning','ascent'),('UpRunning','ascent'),('SideRunning','wallrun'),('ClimLadder','ladder'),('Mantle','mantle'),('DownSliding','drop'),('SlopeSlide','slide'),('RopeSwing','swing'),('Rappelling','rappel'),('RopeSliding','zipline'),('ThroughHoleFree','crawl'),('CrossObstacle','vault'),('Lift','lift')]
prototype={};errors=[]
def mid(points):
 a=np.array(points);lengths=np.r_[0,np.cumsum(np.linalg.norm(np.diff(a,axis=0),axis=1))];at=lengths[-1]/2;i=min(len(a)-2,int(np.searchsorted(lengths,at,side='right')-1));t=(at-lengths[i])/(lengths[i+1]-lengths[i] or 1);return (a[i]+(a[i+1]-a[i])*t).tolist()
def defaults(cls):
 if cls in prototype:return prototype[cls]
 file=Path('build/game-raw')/(cls.removesuffix('_C')+'.bin');result={}
 if file.exists():
  p=Package(file)
  for i,r in enumerate(p.exports):
   if r['cls'] not in ['SceneComponent','BoxComponent','SphereComponent','StaticMeshComponent','SplineComponent']:continue
   try:result[r['name'].removesuffix('_GEN_VARIABLE')]=Cursor(p.payload(i)).transform(r['cls'])
   except (ValueError,AssertionError,IndexError):pass
 prototype[cls]=result;return result
out=[];failed=[]
for row in index:
 cls=row['actor'].split('_UAID_')[0];kind=next((v for k,v in patterns if k in cls),None)
 if not kind:continue
 try:
  p=Package(row['file']);points,parts=p.transforms(row['actor'],defaults(cls));curve=lambda k:points.get(k+'Curve',[])
  loc=lambda *ks:next((points[k] for k in ks if k in points),None)
  if kind=='ascent':path=[loc('BoxA','Box','SceneComponent','DefaultSceneRoot'),mid(curve('EdgeSpline'))] if curve('EdgeSpline') else [loc('Box','DefaultSceneRoot'),loc('EndPositionStatic')]
  elif kind=='mantle':path=[loc('FrontCollision','SceneComponent','DefaultSceneRoot'),*([mid(curve('FrontEdgeSpline'))] if curve('FrontEdgeSpline') else []),*([mid(curve('BackEdgeSpline'))] if curve('BackEdgeSpline') else [])]
  elif kind=='ladder':path=[loc('BottomCollision'),loc('TopCollision')]
  elif kind=='drop':path=[loc('TopCollision'),*([mid(curve('EdgeSpline'))] if curve('EdgeSpline') else []),*([mid(curve('EndEdgeSpline'))] if curve('EndEdgeSpline') else [])];path=[v for v in path if v]
  elif kind=='wallrun':path=curve('LowSpline')
  elif kind=='swing':path=[loc('ASide','BoxA'),loc('BSide','BoxB')]
  elif kind in ['rappel','zipline']:path=curve('RopeSpline') or curve('RopeSplineComponent')
  elif kind in ['slide','lift']:path=curve('Spline')
  else:path=[]
  if len(path)<2 or any(p is None for p in path):raise ValueError(('no endpoints',kind,sorted(points)))
  if kind in ['drop','rappel','zipline','slide'] and path[0][2]<path[-1][2]:path.reverse()
  out.append({**row,'kind':kind,'path':path,'components':points})
 except Exception as e:failed.append({**row,'kind':kind,'error':str(e)})
(root/'placed-actions.json').write_text(json.dumps(dict(placed=out,failed=failed),ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('ACTIONS',len(out),'FAILED',len(failed));from collections import Counter;print('success',dict(Counter(x['kind'] for x in out)));print('failure groups',dict(Counter(x['kind'] for x in failed)));print('worlds',dict(Counter(x['world'] for x in out)))
