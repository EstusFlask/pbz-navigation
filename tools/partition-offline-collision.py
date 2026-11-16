"""Spatially partition exact collision triangles for bounded-memory WASM baking.

Includes each tile's full Recast erosion border. Triangles are culled, never
simplified or snapped; original positions and topology remain byte-identical.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import struct
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--mesh',type=Path,default=ROOT/'build/offline-navigation/route-001/collision.pbzmesh')
    parser.add_argument('--cell-cm',type=float,default=10)
    parser.add_argument('--tile-cells',type=int,default=128)
    parser.add_argument('--radius-cm',type=float,default=45)
    args=parser.parse_args();source=args.mesh
    audit=json.loads(source.with_suffix(source.suffix+'.json').read_text(encoding='utf-8'))
    with source.open('rb') as stream:
        magic,version,nv,nt=struct.unpack('<8sIII',stream.read(20))
    if magic!=b'PBZCOL01' or version!=1 or source.stat().st_size!=20+nv*24+nt*12:raise ValueError('Invalid collision mesh')
    with source.open('rb') as stream:source_hash=hashlib.file_digest(stream,'sha256').hexdigest()
    if source_hash!=audit['meshSHA256']:raise ValueError('Collision audit hash mismatch')
    bounds=audit['boundsUE'];cell=args.cell_cm;tile=args.tile_cells;extent=cell*tile
    if cell<=0 or tile<32:raise ValueError('Invalid partition dimensions')
    nx=math.ceil((bounds[3]-bounds[0])/extent);ny=math.ceil((bounds[4]-bounds[1])/extent)
    if nx*ny>16384:raise ValueError('Partition tile budget exceeded')
    # Same conservative erosion and contour reserve as the WASM baker.
    settings=json.loads((ROOT/'offline-navigation/build-settings.json').read_text())
    radius_cells=math.ceil((args.radius_cm+(settings['maxSimplificationErrorVoxels']+settings['voxelBoundaryReserveVoxels'])*cell)/cell)
    border=(radius_cells+3)*cell+1
    folder=source.parent/'collision-tiles';folder.mkdir(exist_ok=True)
    positions=np.memmap(source,dtype='<f8',mode='r',offset=20,shape=(nv,3))
    triangles=np.memmap(source,dtype='<u4',mode='r',offset=20+nv*24,shape=(nt,3))
    boxes=np.memmap(folder/'triangle-bounds.cache',dtype='<f4',mode='w+',shape=(nt,4))
    for start in range(0,nt,250000):
        stop=min(nt,start+250000);v=positions[triangles[start:stop]]
        boxes[start:stop,:2]=np.min(v[:,:,:2],axis=1);boxes[start:stop,2:]=np.max(v[:,:,:2],axis=1)
    boxes.flush();tiles=[]
    for y in range(ny):
        # Recast +Z is -UE Y; enumerate rows from the northern bound downward.
        top=bounds[4]-y*extent;bottom=top-extent
        band=np.flatnonzero((boxes[:,1]<=top+border)&(boxes[:,3]>=bottom-border))
        for x in range(nx):
            left=bounds[0]+x*extent;right=left+extent
            ids=band[(boxes[band,0]<=right+border)&(boxes[band,2]>=left-border)]
            if not len(ids):continue
            selected=np.asarray(triangles[ids],dtype=np.uint32)
            used,inverse=np.unique(selected,return_inverse=True)
            verts=np.asarray(positions[used],dtype='<f8');faces=np.asarray(inverse,dtype='<u4').reshape((-1,3))
            file=folder/f'{x}_{y}.pbzmesh'
            with file.open('wb') as stream:
                stream.write(struct.pack('<8sIII',b'PBZCOL01',1,len(verts),len(faces)))
                stream.write(verts.tobytes());stream.write(faces.tobytes())
            with file.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
            tiles.append(dict(x=x,y=y,file=file.relative_to(source.parent).as_posix(),sha256=digest,
                              vertices=len(verts),triangles=len(faces)))
        print('Partitioned row',y+1,'/',ny,'tiles',len(tiles),flush=True)
    manifest=dict(schema=1,kind='exact-collision-tile-partition',source=source.name,sourceMeshSHA256=source_hash,
                  originUE=[(bounds[0]+bounds[3])/2,(bounds[1]+bounds[4])/2,math.floor(bounds[2]/100)*100],
                  boundsUE=bounds,cellCm=cell,tileCells=tile,radiusCm=args.radius_cm,borderCm=border,
                  gridWidth=nx,gridHeight=ny,tiles=tiles,completeCollisionClaim=audit['completeCollisionClaim'])
    dynamic=source.parent/'conditional-collision.json'
    manifest.update(world=audit['world'],scenario=audit.get('scenario'),unresolvedCount=len(audit.get('unresolved',[])))
    if dynamic.exists():
        manifest.update(conditionalFile=dynamic.name,conditionalSHA256=hashlib.sha256(dynamic.read_bytes()).hexdigest())
    output=source.with_suffix('.tiles.json');output.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(output,flush=True)


if __name__=='__main__':main()
