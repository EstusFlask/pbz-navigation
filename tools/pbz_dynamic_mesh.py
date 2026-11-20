"""Decode saved UDynamicMesh geometry buffers without construction execution."""
import ctypes
import math
import struct
from pathlib import Path
from pbz_offline_components import Cursor

ROOT=Path(__file__).resolve().parents[1]


class DynamicCursor(Cursor):
    def __init__(self,data,decompress):
        super().__init__(data);self.decompress=decompress

    def compressed(self,expected):
        tag,chunk_size=self.read('2Q')
        if tag!=0x222222229e2a83c1 or not 0<chunk_size<=64*1024*1024 or self.read('B')!=2:
            raise ValueError('Unsupported DynamicMesh compression wrapper')
        total,raw_total=self.read('2q')
        if raw_total!=expected or not 0<=total<=len(self.data)-self.at:
            raise ValueError('DynamicMesh compressed size mismatch')
        chunks=[self.read('2q') for _ in range((raw_total+chunk_size-1)//chunk_size)]
        if sum(row[0] for row in chunks)!=total or sum(row[1] for row in chunks)!=raw_total:
            raise ValueError('DynamicMesh chunk totals differ')
        output=[]
        for compressed,raw in chunks:
            if compressed<0 or raw<0 or self.at+compressed>len(self.data):raise ValueError('Invalid compressed block')
            value=bytes(self.data[self.at:self.at+compressed]);self.skip(compressed)
            # SerializeCompressedNew always invokes the recorded decompressor.
            # An Oodle frame can coincidentally have the same stored/raw size.
            output.append(self.decompress(value,raw))
        return b''.join(output)

    def vector(self,fmt):
        count=self.count(20000000)
        if not count:return []
        size=struct.calcsize('<'+fmt)
        compressed=self.boolean()
        if compressed:raw=self.compressed(count*size)
        else:
            raw=bytes(self.data[self.at:self.at+count*size]);self.skip(count*size)
        if len(raw)!=count*size:raise ValueError('Incomplete DynamicMesh vector')
        return list(struct.iter_unpack('<'+fmt,raw))


def oodle_decoder():
    dll=ctypes.CDLL(str(ROOT/'build/tools/retoc/oo2core_9_win64.dll'))
    function=dll.OodleLZ_Decompress
    function.restype=ctypes.c_longlong
    function.argtypes=[ctypes.c_void_p,ctypes.c_longlong,ctypes.c_void_p,ctypes.c_longlong,
                      ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_void_p,ctypes.c_longlong,
                      ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_longlong,ctypes.c_int]
    def decode(data,size):
        out=ctypes.create_string_buffer(size)
        got=function(data,len(data),out,size,1,0,0,None,0,None,None,None,0,3)
        if got!=size:raise ValueError('Oodle DynamicMesh decompression failed')
        return out.raw
    return decode


def geometry(payload,decompress):
    c=DynamicCursor(payload,decompress)
    fields,zeros=c.header()
    if fields:raise ValueError('Unsupported UDynamicMesh property prefix')
    if c.boolean():c.skip(16)
    if (c.boolean(),c.boolean(),c.boolean())!=(False,True,True):
        raise ValueError('Unsupported DynamicMesh serialization options')
    vertices=c.vector('3d')
    for fmt in ('3f','3f','2f'):
        if c.boolean():c.vector(fmt)
    triangles=c.vector('3i')
    if c.boolean():c.vector('i')
    group_counter=c.read('i')
    has_attributes=c.boolean()
    if any(not math.isfinite(v) for p in vertices for v in p):raise ValueError('Non-finite DynamicMesh position')
    if any(not 0<=v<len(vertices) for tri in triangles for v in tri):raise ValueError('DynamicMesh triangle index out of bounds')
    return dict(vertices=vertices,triangles=triangles,geometryPrefixBytes=c.at,hasAttributes=has_attributes,
                undecodedAttributeBytes=len(payload)-c.at,groupCounter=group_counter)
