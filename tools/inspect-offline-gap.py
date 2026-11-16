"""Read-only surface cross-section across a disconnected nav component gap."""
from pathlib import Path
import json
import struct
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np
from scipy.spatial import cKDTree


def main():
    folder=ROOT/'build/offline-navigation/route-001'
    graph=json.loads((folder/'components.json').read_text())
    source_comp,target_comp=graph['endpointComponents']
    if source_comp==target_comp:print('Endpoints already connected');return
    aa=np.array([p for n in graph['nodes'] if n['component']==source_comp for p in n['vertices']])
    bb=np.array([p for n in graph['nodes'] if n['component']==target_comp for p in n['vertices']])
    distance,index=cKDTree(aa).query(bb);j=int(np.argmin(distance));a=aa[index[j]];b=bb[j]
    file=folder/'collision.pbzmesh'
    with file.open('rb')as stream:_,_,nv,nt=struct.unpack('<8sIII',stream.read(20))
    vertices=np.memmap(file,dtype='<f8',mode='r',offset=20,shape=(nv,3));triangles=np.memmap(file,dtype='<u4',mode='r',offset=20+nv*24,shape=(nt,3))
    low=np.minimum(a,b)-[100,100,200];high=np.maximum(a,b)+[100,100,250]
    selected=[];ids=[]
    for start in range(0,nt,250000):
        stop=min(nt,start+250000);v=vertices[triangles[start:stop]]
        mask=np.all((np.min(v,axis=1)<=high)&(np.max(v,axis=1)>=low),axis=1)
        selected.append(v[mask]);ids.append(np.flatnonzero(mask)+start)
    tri=np.concatenate(selected);indices=np.concatenate(ids)
    normal=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);nz=normal[:,2]/np.maximum(np.linalg.norm(normal,axis=1),1e-12)
    v0=tri[:,1,:2]-tri[:,0,:2];v1=tri[:,2,:2]-tri[:,0,:2]
    determinant=v0[:,0]*v1[:,1]-v0[:,1]*v1[:,0]
    valid=np.abs(determinant)>1e-9
    rows=[]
    for t in np.linspace(0,1,81):
        p=a+(b-a)*t;delta=p[:2]-tri[:,0,:2]
        u=(delta[:,0]*v1[:,1]-delta[:,1]*v1[:,0])/np.where(valid,determinant,1)
        v=(v0[:,0]*delta[:,1]-v0[:,1]*delta[:,0])/np.where(valid,determinant,1)
        inside=valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)
        z=tri[:,0,2]+u*(tri[:,1,2]-tri[:,0,2])+v*(tri[:,2,2]-tri[:,0,2])
        keep=inside&(z>=low[2])&(z<=high[2])
        hits=[dict(z=float(z[k]),normalZ=float(nz[k]),triangle=int(indices[k])) for k in np.flatnonzero(keep)]
        rows.append(dict(t=float(t),xy=p[:2].tolist(),hits=sorted(hits,key=lambda row:row['z'])))
    report=dict(schema=1,scope='Read-only real-collision cross section; no generated links',a=a.tolist(),b=b.tolist(),distanceCm=float(distance[j]),trianglesExamined=len(tri),rows=rows)
    (folder/'gap-cross-section.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Gap',report['a'],report['b'],report['distanceCm'],'cm; triangles',len(tri))
    for row in rows[::8]:print(round(row['t'],2),[(round(h['z'],1),round(h['normalZ'],2)) for h in row['hits']])


if __name__=='__main__':main()
