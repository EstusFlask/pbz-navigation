"""Independent cooked-triangle checks for geometry-derived action candidates.

No trajectory, save or observed route is a construction input. Native actions
receive standing-pad checks only and remain explicitly uncertified. This is
an offline diagnostic oracle, never shipped to the game as a fixed route.
"""
from pathlib import Path
from collections import OrderedDict
import argparse,hashlib,importlib.util,json,sqlite3,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np
def module(name,file):
    s=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
body=module('independent_body','tools/validate-offline-body.py');tiles=module('independent_tiles','tools/build-offline-world-tiles.py');prepared=module('prepared_triangles','tools/prepared-triangle-distance.py')

def rejected(reason,why,p=None,unknown=False,obstructed=False,causes=None):
    failure=dict(ok=False,reason=reason,why=why,unknown=bool(unknown),obstructed=bool(obstructed))
    if p is not None:failure['p']=np.asarray(p).tolist()
    if causes:failure['causes']=causes
    return dict(validation=None,failure=failure)

def combined_outcome(outcomes,reason,why):
    for row in outcomes:
        if row['validation']is not None:return row
    failures=[row['failure']for row in outcomes]
    unknown=any(row['unknown']for row in failures)
    obstructed=not unknown and any(row['obstructed']for row in failures)
    contact=next((row['p']for row in failures if row['obstructed']and'p'in row),None)
    return rejected(reason,why,contact,unknown,obstructed,failures)

def inspect_direction(geometry,a,b,policy,kind):
    native=kind not in ['surface','fall']
    if a is None or b is None:
        return rejected('standing-support-unavailable','standing support unavailable',a if a is not None else b,unknown=True)
    for pad in [a,b]:
        if not geometry.clear(pad):
            if native:return rejected('native-action-uncertified','native standing capsule unavailable; action uncertified',pad,unknown=True)
            return rejected('standing-capsule-blocked','standing capsule obstructed',pad,obstructed=True)
    if native:return dict(validation=dict(nativePadOnly=True),failure=None)
    walking=geometry.walk_check(a,b)
    if walking['validation']is not None:return walking
    flight=geometry.air_check(a,b,policy,'jump'if kind=='surface'else'fall')
    # An unknown walking strategy cannot be certified closed merely because
    # the separate flight was obstructed in this cooked snapshot.
    return combined_outcome([walking,flight],'movement-strategies-rejected','walking and flight checks rejected')

class TriangleTile:
    """Cache conservative XY buckets; keep the original exact XYZ filter."""
    CELL_CM=256

    def __init__(self,triangles,cell_limit=24):
        self.tri=triangles
        self.low,self.high=triangles.min(axis=1),triangles.max(axis=1)
        self.cell_limit=cell_limit
        self.cells=OrderedDict()

    def near(self,p,margin):
        x,y=(int(v//self.CELL_CM) for v in p[:2])
        key=(x,y,margin)
        found=self.cells.get(key)
        if found is None:
            left,bottom=x*self.CELL_CM-margin,y*self.CELL_CM-margin
            right,top=(x+1)*self.CELL_CM+margin,(y+1)*self.CELL_CM+margin
            rows=(self.low[:,0]<=right)&(self.high[:,0]>=left)&(self.low[:,1]<=top)&(self.high[:,1]>=bottom)
            found=self.tri[rows],self.low[rows],self.high[rows]
            self.cells[key]=found
            if len(self.cells)>self.cell_limit:self.cells.popitem(last=False)
        else:self.cells.move_to_end(key)
        tri,lo,hi=found
        return tri[np.all((lo<=p+[margin,margin,200])&(hi>=p+[-margin,-margin,-160]),axis=1)]

class Geometry:
    def __init__(self,world,output):
        self.folder=ROOT/'build/offline-navigation/worlds'/world
        if world=='pbz_ximeng_wp':self.folder=self.folder/'grids/normal'
        self.meta=json.loads((self.folder/'spatial-index.json').read_bytes());self.db=sqlite3.connect(self.folder/'spatial.sqlite');self.output=output/world;self.cache=OrderedDict();self.dense=set();self.floor_cache=OrderedDict();self.clear_cache=OrderedDict();self.memo_limit=4096
    def close(self):self.db.close();self.cache.clear();self.floor_cache.clear();self.clear_cache.clear()
    def near(self,p,margin=55):
        region=(int(p[0]//self.meta['extentCm']),int(-p[1]//self.meta['extentCm']))
        extent=640 if region in self.dense else self.meta['extentCm'];key=(extent,int(p[0]//extent),int(-p[1]//extent))
        if key not in self.cache:
            folder=self.output/f'{region[0]}_{region[1]}'
            if extent!=self.meta['extentCm']:folder=folder/'subgrid-640'/f'{key[1]}_{key[2]}'
            folder.mkdir(parents=True,exist_ok=True)
            if not(folder/'input.pbzmesh').exists():
                try:tiles.materialize(self.db,self.folder,*key[1:],{**self.meta,'tileCells':extent//self.meta['cellCm'],'extentCm':extent},folder)
                except ValueError as error:
                    if extent==640 or 'Tile collision memory budget exceeded'not in str(error):raise
                    self.dense.add(region);return self.near(p,margin)
            local=json.loads((folder/'input.json').read_bytes());v,t=tiles.mesh_arrays(folder/'input.pbzmesh');keep=np.ones(len(t),dtype=bool)
            for c in local['conditionalRanges']:keep[c['firstTriangle']:c['firstTriangle']+c['triangles']]=False
            self.cache[key]=TriangleTile(np.asarray(v[t[keep]]));del v,t
            while len(self.cache)>6:self.cache.popitem(last=False)
        self.cache.move_to_end(key)
        return self.cache[key].near(p,margin)
    def floor(self,p):
        key=tuple(p)
        if key not in self.floor_cache:
            self.floor_cache[key]=self._floor(p)
            if len(self.floor_cache)>self.memo_limit:self.floor_cache.popitem(last=False)
        else:self.floor_cache.move_to_end(key)
        value=self.floor_cache[key]
        return value.copy()if value is not None else None
    def _floor(self,p):
        t=self.near(p)
        if not len(t):return None
        n=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);up=n[:,2]/np.maximum(np.linalg.norm(n,axis=1),1e-20)>=np.cos(np.deg2rad(55));t=t[up];n=n[up]
        if not len(t):return None
        z=t[:,0,2]-(n[:,0]*(p[0]-t[:,0,0])+n[:,1]*(p[1]-t[:,0,1]))/n[:,2];projected=np.column_stack([np.full(len(z),p[0]),np.full(len(z),p[1]),z]);ok=body.inside(projected,t)&(z<=p[2]+65)&(z>=p[2]-100)
        if not np.any(ok):return None
        q=p.copy();q[2]=z[ok][np.argmin(abs(z[ok]-p[2]))];contact=prepared.capsule_support(q,t[t.min(axis=1)[:,2]<=q[2]+25])
        if contact is None:return None
        q[2]=contact;return q
    def clear(self,p,air=False):
        key=(*p,bool(air))
        if key not in self.clear_cache:
            self.clear_cache[key]=self._clear(p,air)
            if len(self.clear_cache)>self.memo_limit:self.clear_cache.popitem(last=False)
        else:self.clear_cache.move_to_end(key)
        return self.clear_cache[key]
    def _clear(self,p,air=False):
        t=self.near(p)
        return not len(t)or float(body.segment_distance(p+[0,0,45 if air else 96],p+[0,0,147],t).min())>=(44.1 if air else 44.9)
    def walk(self,a,b):
        return self.walk_check(a,b)['validation']
    def walk_check(self,a,b):
        count=max(1,int(np.ceil(np.linalg.norm(b-a)/25)));points=[a];previous=a
        for i in range(1,count+1):
            q=self.floor(a+(b-a)*i/count)
            if q is None:return rejected('walk-support-unavailable','walking support unavailable',a+(b-a)*i/count,unknown=True)
            if abs(q[2]-previous[2])>50+np.linalg.norm(q[:2]-previous[:2])*np.tan(np.deg2rad(55))+6:return rejected('walk-step-envelope','walking step exceeds current envelope',q)
            if not self.clear(q):return rejected('walk-capsule-blocked','walking capsule obstructed',q,obstructed=True)
            points.append(q);previous=q
        if np.linalg.norm(previous-b)>55:return rejected('walk-endpoint-unresolved','walking endpoint not resolved',previous,unknown=True)
        return dict(validation=dict(points=[p.tolist()for p in points],walking=True),failure=None)
    def air(self,a,b,policy,mode):
        return self.air_check(a,b,policy,mode)['validation']
    def air_check(self,a,b,policy,mode):
        original=a.copy();approach=[a];span=np.linalg.norm(b[:2]-a[:2])
        for distance in np.arange(25,min(175,span-75)+1,25):
            expected=original.copy();expected[:2]+=(b[:2]-original[:2])*distance/span;expected[2]=a[2];q=self.floor(expected)
            if q is None or abs(q[2]-original[2])>55 or not self.clear(q):break
            a=q;approach.append(a)
        g=policy['gravityCm'];v=policy['jumpVelocityCm'];rise=max(0,v*v/(2*g)-20)
        if mode=='jump' and not policy.get('canJump'):return rejected('air-jump-disabled','current jump capability unavailable',a)
        failures=[]
        for takeoff in range(len(approach)-1,-1,-1):
            a=approach[takeoff];drop=a[2]-b[2]
            if drop<(-rise if mode=='jump'else 100)or drop>policy['maxHeightCm']or v*v+2*g*drop<0:
                failures.append(rejected('air-height-envelope','flight height exceeds current envelope',a));continue
            seconds=(v+np.sqrt(v*v+2*g*drop))/g;run=np.linalg.norm(b[:2]-a[:2])
            if seconds<=0 or run/seconds>policy['speedCm']:
                failures.append(rejected('air-velocity-envelope','flight exceeds current movement velocity',a));continue
            steps=max(2,int(np.ceil((run+abs(drop)+v*v/g)/20)));points=approach[:takeoff+1]
            for i in range(1,steps+1):
                t=seconds*i/steps;p=a+(b-a)*i/steps;p[2]=a[2]+v*t-.5*g*t*t
                if not self.clear(p,True):
                    failures.append(rejected('air-capsule-blocked','flight capsule obstructed',p,obstructed=True));break
                points.append(p)
            else:return dict(validation=dict(points=[p.tolist()for p in points],kind=mode,launch='jump' if v>0 else 'runoff',walkIn=takeoff),failure=None)
        return combined_outcome(failures,'air-options-rejected','all checked takeoffs rejected')
def select_features(source,source_sha,selection):
    if selection.get('schema')!=1 or selection.get('sourceCaseSHA256')!=source_sha or any(source.get(key)!=selection.get(key) for key in ('number','world','sourceIndexSHA256')):
        raise ValueError('Candidate selection belongs to another source case')
    guids=selection.get('guids');features={feature['guid']:feature for feature in source['movementFeatures']}
    if len(features)!=len(source['movementFeatures']) or not isinstance(guids,list) or not guids or any(not isinstance(guid,str)for guid in guids) or len(set(guids))!=len(guids) or any(guid not in features for guid in guids):
        raise ValueError('Unknown or ambiguous candidate selection')
    return [features[guid]for guid in guids]

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('audit',type=Path);p.add_argument('--routes',default='5,47');p.add_argument('--prioritized',action='store_true');p.add_argument('--offset',type=int,default=0);p.add_argument('--limit',type=int);p.add_argument('--append',action='store_true');p.add_argument('--selection',type=Path);args=p.parse_args();folder=args.audit.resolve()
    if not folder.is_relative_to(ROOT/'build'):raise ValueError('Private oracle only')
    if args.offset<0 or args.limit is not None and args.limit<1:raise ValueError('Invalid candidate range')
    if args.prioritized and args.offset:raise ValueError('A ranked audit shortlist has no later candidates; use the source field order explicitly')
    if args.selection and (args.prioritized or args.offset):raise ValueError('Explicit selection cannot use ranked or offset modes')
    selected={int(x)for x in args.routes.split(',')};summary=json.loads((folder/'summary.json').read_bytes());oracle_sha=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    dependencies={file:hashlib.sha256((ROOT/file).read_bytes()).hexdigest()for file in ['tools/validate-offline-body.py','tools/prepared-triangle-distance.py','tools/build-offline-world-tiles.py']};dependencies['numpyVersion']=np.__version__
    for row in summary['results']:
        if row['number']not in selected:continue
        file=folder/f"{row['number']:02d}-{row['id']}.json";case_bytes=file.read_bytes();case_sha=hashlib.sha256(case_bytes).hexdigest();raw=json.loads(case_bytes);geometry=Geometry(raw['world'],folder/'action-collision');results=[];target=folder/f"{row['number']:02d}-action-oracle.json"
        if args.append and target.exists():
            previous=json.loads(target.read_bytes())
            if previous['sourceCaseSHA256']!=case_sha or previous['policy']!=raw['policy'] or previous.get('oracleToolSHA256')!=oracle_sha or previous.get('checkerDependenciesSHA256')!=dependencies:raise ValueError('Cannot append changed collision source, capabilities or checker')
            results=previous['rows']
        try:
            features=(raw.get('rankedMovementFeatures')or raw.get('prioritizedMovementFeatures'))if args.prioritized else raw['movementFeatures']
            if args.selection:features=select_features(raw,case_sha,json.loads(args.selection.read_bytes()))
            if not isinstance(features,list):raise ValueError('Missing ranked candidate evidence')
            features=features[args.offset:None if args.limit is None else args.offset+args.limit];known={r['guid']for r in results}
            for i,f in enumerate(features):
                if f['guid']in known:continue
                def position(side,index):
                    value=f.get(side)or f['path'][index]
                    return np.array([value[k]for k in 'xyz']if isinstance(value,dict)else value,dtype=float)
                a=geometry.floor(position('standingEntry',0));b=geometry.floor(position('standingExit',-1));native=f['kind']not in ['surface','fall']
                forward=inspect_direction(geometry,a,b,raw['policy'],f['kind'])
                evidence=dict(guid=f['guid'],kind=f['kind'],entry=a.tolist()if a is not None else None,exit=b.tolist()if b is not None else None,**forward,nativeActionUncertified=native)
                if f.get('both') and f['kind']!='fall':
                    reverse=inspect_direction(geometry,b,a,raw['policy'],f['kind']);evidence['reverseValidation']=reverse['validation'];evidence['reverseFailure']=reverse['failure']
                results.append(evidence)
                known.add(f['guid'])
                if i%32==0:print('ACTION ORACLE',row['number'],i,'/',len(features),'accepted',sum(bool(r['validation'])for r in results),flush=True)
        finally:geometry.close()
        report=dict(schema=1,failureSchema=1,number=row['number'],sourceCaseSHA256=case_sha,oracleToolSHA256=oracle_sha,checkerDependenciesSHA256=dependencies,geometryIndexSHA256=hashlib.sha256((geometry.folder/'spatial-index.json').read_bytes()).hexdigest(),selectionSHA256=hashlib.sha256(args.selection.read_bytes()).hexdigest()if args.selection else None,scope='Independent cooked collision, optimistic barriers, explicit player capabilities; native actions only standing pads, not certified; never fixed route input',policy=raw['policy'],rows=results,physicalVerified=False)
        target.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('ACTION ORACLE DONE',row['number'],len(results),sum(bool(r['validation'])for r in results),flush=True)
if __name__=='__main__':main()
