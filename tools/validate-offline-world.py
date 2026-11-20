"""Independent package-mesh/receipt conservation checks, not game acceptance."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import struct
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np


def digest(file):
    with Path(file).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world',type=Path,default=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp')
    args=parser.parse_args();folder=args.world.resolve()
    if not folder.is_relative_to(ROOT/'build'):raise ValueError('Evidence must remain in build/')
    inventory=json.loads((folder/'inventory.json').read_text(encoding='utf-8'))
    coverage=json.loads((folder/'coverage.json').read_text(encoding='utf-8'))
    failures=[];verified=0;vertices=0;triangles=0;conditional=0;inputs=[];started=time.time()
    rules={r['id'] for r in json.loads((ROOT/'authoring/offline-collision-state-rules.json').read_text())['rules']}
    for cell in inventory['cells']:
        part=folder/'packages'/cell['chunk'];receipt=part/'receipt.json';mesh=part/'collision.pbzmesh'
        try:
            r=json.loads(receipt.read_text(encoding='utf-8'))
            if r['buildID'] not in coverage.get('compatibleBuildIDs',[coverage['buildID']]):raise ValueError('Unreviewed extraction version')
            cache=folder/'world-root.bin' if cell['cell']=='persistent-level' else ROOT/'build/offline-navigation/cells'/inventory['containerSHA256'][:16]/(cell['chunk']+'.bin')
            if digest(cache)!=r['inputSHA256']:raise ValueError('Input package hash differs')
            mh=digest(mesh)
            if mh!=r['meshSHA256']:raise ValueError('Output collision hash differs')
            with mesh.open('rb') as stream:magic,version,nv,nt=struct.unpack('<8sIII',stream.read(20))
            if magic!=b'PBZCOL01' or version!=1 or mesh.stat().st_size!=20+24*nv+12*nt:raise ValueError('Mesh header/extent differs')
            if (nv,nt)!=(r['vertices'],r['triangles']):raise ValueError('Receipt counts differ')
            if nt:
                p=np.memmap(mesh,dtype='<f8',mode='r',offset=20,shape=(nv,3))
                t=np.memmap(mesh,dtype='<u4',mode='r',offset=20+nv*24,shape=(nt,3))
                vp=tp=0
                for source in r['sources']:
                    if (source['firstVertex'],source['firstTriangle'])!=(vp,tp):raise ValueError('Source ranges overlap or leave a gap')
                    stop_v=vp+source['vertices'];stop_t=tp+source['triangles'];pv=p[vp:stop_v];pt=t[tp:stop_t]
                    if not len(pv) or not len(pt) or not np.all(np.isfinite(pv)) or np.min(pt)<vp or np.max(pt)>=stop_v:raise ValueError('Invalid source geometry/index range')
                    bounds=np.concatenate((np.min(pv,axis=0),np.max(pv,axis=0)))
                    if not np.allclose(bounds,source['boundsUE'],rtol=0,atol=1e-7):raise ValueError('Source spatial bounds differ')
                    condition=source.get('condition')
                    if condition:
                        if condition['rule'] not in rules or not condition['actorID'].lower().startswith(inventory['world']+'-') or condition['omitInScenario'] is not True:raise ValueError('Invalid base-scene conditional geometry')
                        conditional+=1
                    vp=stop_v;tp=stop_t
                if (vp,tp)!=(nv,nt):raise ValueError('Unattributed output geometry')
                del p,t
            elif nv or r['sources']:raise ValueError('Empty mesh has attributed geometry')
            inputs.append((cell['chunk'],r['inputSHA256'],mh,digest(receipt)))
            vertices+=nv;triangles+=nt;verified+=1
        except (ValueError,KeyError,OSError,struct.error) as ex:failures.append(dict(package=cell['package'],why=str(ex)))
        if verified and verified%2000==0:print('Verified',verified,'packages;',round(time.time()-started,1),'seconds',flush=True)
    result=dict(schema=1,world=inventory['world'],scope='Input/output hashes, exact source range conservation, finite coordinates, topology and bounds',
                verifiedPackages=verified,totalPackages=len(inventory['cells']),vertices=vertices,triangles=triangles,conditionalMeshes=conditional,
                sourceLedgerSHA256=hashlib.sha256(json.dumps(inputs,separators=(',',':')).encode()).hexdigest(),
                failures=failures,completeCollisionClaim=False,physicalVerified=False)
    file=folder/'geometry-validation.json';tmp=file.with_suffix('.tmp');tmp.write_text(json.dumps(result,separators=(',',':')),encoding='utf-8');os.replace(tmp,file)
    print(json.dumps(result,indent=2));return bool(failures)


if __name__=='__main__':sys.exit(main())
