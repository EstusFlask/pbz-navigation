"""Geometry interchange for offline navigation; all stored positions are UE cm."""
from pathlib import Path
import hashlib
import json
import math
import struct


def write_mesh(file, vertices, triangles, *, provenance):
    file = Path(file)
    if not vertices or not triangles:
        raise ValueError('Empty collision geometry')
    if any(len(p) != 3 or any(not math.isfinite(v) for v in p) for p in vertices):
        raise ValueError('Non-finite collision vertex')
    if any(len(t) != 3 or any(not isinstance(v, int) or not 0 <= v < len(vertices) for v in t) for t in triangles):
        raise ValueError('Invalid collision index')
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open('wb') as stream:
        stream.write(struct.pack('<8sIII', b'PBZCOL01', 1, len(vertices), len(triangles)))
        for point in vertices:
            stream.write(struct.pack('<3d', *point))
        for tri in triangles:
            stream.write(struct.pack('<3I', *tri))
    audit = {**provenance, 'schema':1, 'units':'UE centimeters', 'vertices':len(vertices), 'triangles':len(triangles),
             'meshSHA256':hashlib.sha256(file.read_bytes()).hexdigest()}
    file.with_suffix(file.suffix + '.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return audit


def box(lo, hi):
    """Outward triangles; coordinate convention is UE x/y horizontal, z up."""
    x,y,z = lo
    X,Y,Z = hi
    return ([(x,y,z),(X,y,z),(X,Y,z),(x,Y,z),(x,y,Z),(X,y,Z),(X,Y,Z),(x,Y,Z)],
            [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),
             (1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)])


def combine(meshes):
    vertices, triangles = [], []
    for points, faces in meshes:
        offset = len(vertices)
        vertices.extend(points)
        triangles.extend(tuple(i+offset for i in face) for face in faces)
    return vertices, triangles


def read_mesh(file):
    data=Path(file).read_bytes()
    magic,version,nv,nt=struct.unpack_from('<8sIII',data)
    if magic!=b'PBZCOL01' or version!=1 or len(data)!=20+nv*24+nt*12:
        raise ValueError('Invalid collision mesh')
    return (list(struct.iter_unpack('<3d',data[20:20+nv*24])),
            list(struct.iter_unpack('<3I',data[20+nv*24:])))
