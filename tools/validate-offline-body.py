"""Independent triangle checks, separate from Recast and Detour.

Checks ground support and the standing capsule above its allowed step height.
This does not simulate CharacterMovement, moving actors, water or gameplay.
"""
from pathlib import Path
import argparse
import json
import struct
import sys
import hashlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np


def inside(p,t):
    a=t[:,1]-t[:,0];b=t[:,2]-t[:,0];v=p-t[:,0]
    aa=np.sum(a*a,axis=1);ab=np.sum(a*b,axis=1);bb=np.sum(b*b,axis=1)
    va=np.sum(v*a,axis=1);vb=np.sum(v*b,axis=1);den=aa*bb-ab*ab;valid=np.abs(den)>1e-10
    u=(bb*va-ab*vb)/np.where(valid,den,1);w=(aa*vb-ab*va)/np.where(valid,den,1)
    return valid&(u>=-1e-8)&(w>=-1e-8)&(u+w<=1+1e-8)


def point_distance(p,t):
    normal=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);nn=np.sum(normal*normal,axis=1)
    dot=np.sum((p-t[:,0])*normal,axis=1);projected=p-normal*(dot/np.maximum(nn,1e-20))[:,None]
    best=np.where(inside(projected,t),dot*dot/np.maximum(nn,1e-20),np.inf)
    for i in range(3):
        a=t[:,i];edge=t[:,(i+1)%3]-a;length=np.sum(edge*edge,axis=1)
        f=np.clip(np.sum((p-a)*edge,axis=1)/np.maximum(length,1e-20),0,1)
        best=np.minimum(best,np.sum((p-a-edge*f[:,None])**2,axis=1))
    return best


def segment_distance(a,b,t):
    best=np.minimum(point_distance(a,t),point_distance(b,t));d=b-a;aa=float(d@d)
    normal=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);den=normal@d
    f=np.sum((t[:,0]-a)*normal,axis=1)/np.where(np.abs(den)>1e-12,den,1)
    cross=(np.abs(den)>1e-12)&(f>=0)&(f<=1)&inside(a+f[:,None]*d,t);best[cross]=0
    for i in range(3):
        e=t[:,(i+1)%3]-t[:,i];r=a-t[:,i];ee=np.sum(e*e,axis=1);de=e@d;dr=r@d;er=np.sum(e*r,axis=1)
        denom=aa*ee-de*de;s=np.clip((de*er-dr*ee)/np.where(np.abs(denom)>1e-12,denom,1),0,1)
        u=(de*s+er)/np.maximum(ee,1e-20)
        s=np.where(u<0,np.clip(-dr/aa,0,1),np.where(u>1,np.clip((de-dr)/aa,0,1),s));u=np.clip(u,0,1)
        best=np.minimum(best,np.sum((r+s[:,None]*d-u[:,None]*e)**2,axis=1))
    return np.sqrt(np.maximum(best,0))


def capsule_support(p,t,radius=45):
    # A character stands on the capsule's lower hemisphere. A centre ray can
    # fall into a tread seam while that hemisphere still rests on its rim.
    # Sweep the sphere vertically using exact point/triangle distances.
    previous=p[2]+75+radius
    if np.min(point_distance(np.array([p[0],p[1],previous]),t))<radius*radius:return None
    for z in np.arange(previous-10,p[2]-75+radius-10,-10):
        if np.min(point_distance(np.array([p[0],p[1],z]),t))<=radius*radius:
            low=z;high=previous
            for _ in range(16):
                mid=(low+high)/2
                if np.min(point_distance(np.array([p[0],p[1],mid]),t))<=radius*radius:low=mid
                else:high=mid
            return high-radius
        previous=z
    return None


def mesh(file):
    raw=file.read_bytes();magic,version,nv,nt=struct.unpack_from('<8sIII',raw)
    if magic!=b'PBZCOL01' or version!=1 or len(raw)!=20+nv*24+nt*12:raise ValueError('Invalid collision partition')
    return np.frombuffer(raw,dtype='<f8',offset=20,count=nv*3).reshape(-1,3)[np.frombuffer(raw,dtype='<u4',offset=20+nv*24,count=nt*3).reshape(-1,3)]


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--region',type=Path,default=ROOT/'build/offline-navigation/route-001');args=parser.parse_args();folder=args.region
    route=json.loads((folder/'route-variants-exploration.json').read_text());manifest=json.loads((folder/'collision.tiles.json').read_text())
    if not route['complete']:raise ValueError('Only a complete offline candidate can be checked')
    points=[]
    for a,b in zip(route['points'],route['points'][1:]):
        a=np.array(a);b=np.array(b);n=max(1,int(np.ceil(np.linalg.norm(b-a)/25)))
        points.extend(a+(b-a)*i/n for i in range(n))
    points.append(np.array(route['points'][-1]));tiles={};bounds=manifest['boundsUE'];extent=manifest['cellCm']*manifest['tileCells']
    grounded=np.full((len(points),3),np.nan)
    for number,p in enumerate(points):
        key=(int((p[0]-bounds[0])//extent),int((bounds[4]-p[1])//extent));tiles.setdefault(key,[]).append((number,p))
    lookup={(t['x'],t['y']):t for t in manifest['tiles']};failures=[];min_clearance=float('inf');max_support_error=0
    for key,samples in tiles.items():
        t=mesh(folder/lookup[key]['file']);lo=t.min(axis=1);hi=t.max(axis=1)
        for number,p in samples:
            near=np.all((lo<=p+[47,47,194])&(hi>=p+[-47,-47,-75]),axis=1);local=t[near]
            if not len(local):failures.append(dict(p=p.tolist(),why='no nearby geometry'));continue
            normal=np.cross(local[:,1]-local[:,0],local[:,2]-local[:,0]);length=np.linalg.norm(normal,axis=1)
            up=normal[:,2]/np.maximum(length,1e-20)>=np.cos(np.deg2rad(55))
            z=local[:,0,2]-(normal[:,0]*(p[0]-local[:,0,0])+normal[:,1]*(p[1]-local[:,0,1]))/np.where(np.abs(normal[:,2])>1e-12,normal[:,2],1)
            candidates=np.column_stack([np.full(len(z),p[0]),np.full(len(z),p[1]),z])
            valid=up&inside(candidates,local)&(z>=p[2]-75)&(z<=p[2]+25)
            error=float(np.min(np.abs(z[valid]-p[2])))if np.any(valid)else None
            if error is None:
                failures.append(dict(p=p.tolist(),why='no upward supporting triangle'));continue
            max_support_error=max(max_support_error,error)
            floor=local[up&(local.min(axis=1)[:,2]<=p[2]+25)]
            support_z=capsule_support(p,floor)if len(floor)else None
            if support_z is None:failures.append(dict(p=p.tolist(),why='no unpenetrated capsule support within 75cm'));continue
            support=p.copy();support[2]=support_z;grounded[number]=support
            # Check at capsule contact, not at a detail triangle interpolation
            # or a ray that drops through a seam beside the capsule's rim.
            clearance=float(segment_distance(support+[0,0,96],support+[0,0,147],local).min());min_clearance=min(min_clearance,clearance)
            if clearance<44.9:failures.append(dict(p=p.tolist(),why='capsule body intersects collision above 50cm step allowance',clearanceCm=clearance))
        print('Independent checked tile',key,'samples',len(samples),'failures',len(failures),flush=True)
    discontinuities=[]
    for i,(a,b)in enumerate(zip(grounded,grounded[1:])):
        if np.all(np.isfinite([a,b])) and abs(a[2]-b[2])>55+np.linalg.norm(a[:2]-b[:2])*np.tan(np.deg2rad(55)):
            discontinuities.append(dict(sample=i,a=a.tolist(),b=b.tolist(),why='physical support discontinuity exceeds step and slope allowance'))
    failures.extend(discontinuities)
    report=dict(schema=1,method='Independent NumPy point/segment/triangle distances and vertical support; no Detour queries',
                scope='Standing capsule radius45 height192 above50cm step allowance; not full CharacterMovement or live gameplay acceptance',
                sourceCollisionSHA256=manifest['sourceMeshSHA256'],routeSHA256=hashlib.sha256((folder/'route-variants-exploration.json').read_bytes()).hexdigest(),
                samples=len(points),sampleSpacingCm=25,minBodyClearanceCm=min_clearance,maxNavSurfaceOffsetCm=max_support_error,
                supportDiscontinuities=len(discontinuities),failures=failures)
    (folder/'independent-body-validation.json').write_text(json.dumps(report,indent=2)+'\n');print('Independent result',len(points),'samples, failures',len(failures),'clearance',min_clearance)
    if failures:raise SystemExit(2)


if __name__=='__main__':main()
