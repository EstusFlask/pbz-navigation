"""Create a standalone local WebGL inspection of actual collision and nav data."""
from pathlib import Path
import base64
import json
import struct
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np


def main():
    folder=ROOT/'build/offline-navigation/route-001'
    audit=json.loads((folder/'collision-audit.json').read_text(encoding='utf-8'))
    components=json.loads((folder/'components.json').read_text())
    route=json.loads((folder/'route.json').read_text())
    center=np.array([-182520.,110965.,0.]);roi=np.array([-184200.,109200.,-4500.,-180800.,112700.,-1700.])
    source=folder/'collision.pbzmesh'
    with source.open('rb') as stream:_,_,nv,nt=struct.unpack('<8sIII',stream.read(20))
    vertices=np.memmap(source,dtype='<f8',mode='r',offset=20,shape=(nv,3))
    triangles=np.memmap(source,dtype='<u4',mode='r',offset=20+nv*24,shape=(nt,3))
    rows=audit['sources'];sizes=np.array([row['vertices'] for row in rows]);starts=np.r_[0,np.cumsum(sizes)[:-1]]
    if sum(sizes)!=nv:raise ValueError('Source geometry ranges differ')
    face_sizes=np.array([row['triangles'] for row in rows]);face_starts=np.r_[0,np.cumsum(face_sizes)[:-1]]
    if sum(face_sizes)!=nt:raise ValueError('Source triangle ranges differ')
    bounds=np.column_stack([np.minimum.reduceat(vertices[:,k],starts) for k in range(3)]+[np.maximum.reduceat(vertices[:,k],starts) for k in range(3)])
    selected=np.flatnonzero(np.all((bounds[:,:3]<=roi[3:])&(bounds[:,3:]>=roi[:3]),axis=1))
    data=[];ranges=[];offset=0
    def append(points,color):
        nonlocal offset
        p=(np.asarray(points).reshape((-1,3))-center)/100
        block=np.empty((len(p),6),dtype='<f4');block[:,:3]=p;block[:,3:]=color
        data.append(block);start=offset;offset+=len(p)
        return start,len(p)
    for index in selected:
        row=rows[int(index)];faces=triangles[face_starts[index]:face_starts[index]+face_sizes[index]]
        points=vertices[faces]
        # Crop whole triangles only; the source geometry itself is not changed.
        keep=np.all((np.min(points,axis=1)<=roi[3:])&(np.max(points,axis=1)>=roi[:3]),axis=1)
        points=points[keep]
        color=(.52,.59,.62) if 'wall'not in row['kind'] else (.92,.36,.24)
        first,count=append(points,color)
        label=row.get('meshPackage',row.get('actor',row.get('package','collision')))
        ranges.append(dict(start=first,count=count,label=label,kind=row['kind']))
    collision_count=offset
    nav_start=offset
    for row in components['nodes']:
        p=np.array(row['vertices'])
        if not np.all((np.min(p,axis=0)<=roi[3:])&(np.max(p,axis=0)>=roi[:3])):continue
        p[:,2]+=8
        faces=[(p[0],p[i],p[i+1]) for i in range(1,len(p)-1)]
        color=(.15,.72,.94) if row['component']==components['endpointComponents'][0] else (.97,.67,.19) if row['component']==components['endpointComponents'][1] else (.64,.3,.85)
        append(faces,color)
    nav_count=offset-nav_start
    gap_start,gap_count=append([[-182379.9998,111100,-2870],[-182660,110830,-2765]],(1,.12,.35))
    payload=base64.b64encode(np.concatenate(data).tobytes()).decode()
    meta=dict(ranges=ranges,collisionCount=collision_count,navStart=nav_start,navCount=nav_count,gapStart=gap_start,gapCount=gap_count,
              vertices=offset,centerUE=center.tolist(),sourceMeshSHA256=json.loads(source.with_suffix(source.suffix+'.json').read_text())['meshSHA256'],
              note='局部碰撞与导航诊断；完整路线尚未通过。蓝色为起点连通区，橙色为目标连通区，紫色为其他区域，红线为一个最近缺口候选。')
    template=(ROOT/'offline-navigation/viewer.html').read_text(encoding='utf-8')
    html=template.replace('__META__',json.dumps(meta,ensure_ascii=False).replace('<','\\u003c')).replace('__VERTICES__',payload)
    output=folder/'collision-viewer.html';output.write_text(html,encoding='utf-8')
    print('Viewer',output,'triangles',offset//3,'source objects',len(ranges))


if __name__=='__main__':main()
