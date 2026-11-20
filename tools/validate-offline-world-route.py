"""Independent standing-capsule checks against streamed full-world collision."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import sqlite3
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np


def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


body=module('body_checks','tools/validate-offline-body.py')
world=module('world_tiles','tools/build-offline-world-tiles.py')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('route',type=Path)
    parser.add_argument('--world',type=Path,default=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp')
    parser.add_argument('--allow-partial',action='store_true',help='Check only the supplied partial prefix; never full-route acceptance')
    args=parser.parse_args();folder=args.world.resolve();route_file=args.route.resolve()
    if not folder.is_relative_to(ROOT/'build') or not route_file.is_relative_to(ROOT/'build'):raise ValueError('Evidence must stay in build/')
    route=json.loads(route_file.read_text());metadata=json.loads((folder/'spatial-index.json').read_text())
    if not route['complete'] and not args.allow_partial:raise ValueError('Independent acceptance requires a complete offline candidate')
    states={key.lower():value for key,value in route['assumedActorStates'].items()}
    points=[]
    for a,b in zip(route['points'],route['points'][1:]):
        a=np.array(a);b=np.array(b);n=max(1,int(np.ceil(np.linalg.norm(b-a)/25)))
        points.extend(a+(b-a)*i/n for i in range(n))
    points.append(np.array(route['points'][-1]));extent=metadata['extentCm'];grouped={}
    for number,p in enumerate(points):grouped.setdefault((int(p[0]//extent),int(-p[1]//extent)),[]).append((number,p))
    output=folder/'route-validation'/route_file.stem;output.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(folder/'spatial.sqlite');failures=[];max_error=0;min_clearance=float('inf');grounded=np.full((len(points),3),np.nan)
    for (x,y),samples in grouped.items():
        local=world.materialize(db,folder,x,y,metadata,output);p,t=world.mesh_arrays(output/'input.pbzmesh');keep=np.ones(len(t),dtype=bool)
        for r in local['conditionalRanges']:
            if states.get(r['condition']['actorID'].lower()) is True:keep[r['firstTriangle']:r['firstTriangle']+r['triangles']]=False
        triangles=np.asarray(p[t[keep]]);lo=triangles.min(axis=1);hi=triangles.max(axis=1)
        for number,point in samples:
            selected=np.all((lo<=point+[47,47,194])&(hi>=point+[-47,-47,-75]),axis=1);near=triangles[selected]
            if not len(near):failures.append(dict(p=point.tolist(),why='no nearby collision'));continue
            normal=np.cross(near[:,1]-near[:,0],near[:,2]-near[:,0]);length=np.linalg.norm(normal,axis=1)
            up=normal[:,2]/np.maximum(length,1e-20)>=np.cos(np.deg2rad(55))
            z=near[:,0,2]-(normal[:,0]*(point[0]-near[:,0,0])+normal[:,1]*(point[1]-near[:,0,1]))/np.where(np.abs(normal[:,2])>1e-12,normal[:,2],1)
            candidates=np.column_stack([np.full(len(z),point[0]),np.full(len(z),point[1]),z])
            valid=up&body.inside(candidates,near)&(z>=point[2]-75)&(z<=point[2]+25)
            if not np.any(valid):failures.append(dict(p=point.tolist(),why='no upward support within tolerance'));continue
            max_error=max(max_error,float(np.min(np.abs(z[valid]-point[2]))))
            floor=near[up&(near.min(axis=1)[:,2]<=point[2]+25)]
            contact=body.capsule_support(point,floor)if len(floor)else None
            if contact is None:failures.append(dict(p=point.tolist(),why='capsule support absent or already penetrating'));continue
            support=point.copy();support[2]=contact;grounded[number]=support
            clearance=float(body.segment_distance(support+[0,0,96],support+[0,0,147],near).min());min_clearance=min(min_clearance,clearance)
            if clearance<44.9:failures.append(dict(p=point.tolist(),why='body collision above step allowance',clearanceCm=clearance))
        print('Independent world tile',x,y,'samples',len(samples),'failures',len(failures),flush=True)
        del p,t,triangles
    db.close();discontinuities=0
    for i,(a,b)in enumerate(zip(grounded,grounded[1:])):
        if np.all(np.isfinite([a,b])) and abs(a[2]-b[2])>55+np.linalg.norm(a[:2]-b[:2])*np.tan(np.deg2rad(55)):
            discontinuities+=1;failures.append(dict(sample=i,a=a.tolist(),b=b.tolist(),why='support discontinuity exceeds step/slope allowance'))
    report=dict(schema=1,world=metadata['world'],scope='Independent exact collision, radius45 height192 capsule above50cm step allowance; no live CharacterMovement acceptance',
                routeComplete=route['complete'],prefixOnly=not route['complete'],
                sourceLedgerSHA256=metadata['sourceLedgerSHA256'],routeSHA256=hashlib.sha256(route_file.read_bytes()).hexdigest(),
                samples=len(points),sampleSpacingCm=25,minBodyClearanceCm=min_clearance,maxNavSurfaceOffsetCm=max_error,
                supportDiscontinuities=discontinuities,failures=failures,independentGeometryPassed=not failures,physicalVerified=False)
    world.atomic_json(output/'independent-body-validation.json',report)
    print('INDEPENDENT WORLD RESULT',len(points),'samples;',len(failures),'failures;',min_clearance,'cm minimum body clearance',flush=True)
    return bool(failures)


if __name__=='__main__':sys.exit(main())
