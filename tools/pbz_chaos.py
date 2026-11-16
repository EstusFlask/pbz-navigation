"""Strict modern UE5 Chaos cooked-collision decoder.

Field order follows engine serializers cited in OFFLINE-COLLISION-FORMAT-NOTES.
Dialect is explicit; every blob must be consumed fully. Unsupported types fail.
"""
import math
import struct


class Cursor:
    def __init__(self,data):
        self.data=memoryview(data)
        self.at=0

    def read(self,fmt):
        size=struct.calcsize('<'+fmt)
        if self.at+size>len(self.data):
            raise ValueError(f'Truncated Chaos data at {self.at}')
        values=struct.unpack_from('<'+fmt,self.data,self.at)
        self.at+=size
        return values[0] if len(values)==1 else values

    def skip(self,size):
        if size<0 or self.at+size>len(self.data):
            raise ValueError(f'Invalid Chaos extent at {self.at}')
        self.at+=size

    def count(self,limit=20000000):
        value=self.read('i')
        if not 0<=value<=limit:
            raise ValueError(f'Invalid Chaos count {value} at {self.at-4}')
        return value

    def boolean(self):
        value=self.read('i')
        if value not in (0,1):
            raise ValueError(f'Invalid Chaos boolean at {self.at-4}')
        return bool(value)

    def array(self,fmt):
        count=self.count()
        size=struct.calcsize('<'+fmt)
        if count*size>len(self.data)-self.at:
            raise ValueError(f'Truncated Chaos array at {self.at}')
        return [self.read(fmt) for _ in range(count)]

    def skip_array(self,size):
        self.skip(self.count()*size)


class Archive(Cursor):
    def __init__(self,data):
        super().__init__(data)
        self.tags={}

    def pointer(self):
        if not self.boolean():
            return None
        tag=self.count(1000000)
        if tag in self.tags:
            return self.tags[tag]
        kind=self.read('B')
        convex,collide,collision_type=self.boolean(),self.boolean(),self.read('B')
        if kind==8:
            result=self.convex()
        elif kind==11:
            result=self.triangle_mesh()
        elif kind==12:
            result=self.heightfield()
        else:
            raise ValueError(f'Unsupported Chaos implicit type {kind} at {self.at-10}')
        result.update(type=kind,implicitConvex=convex,implicitCollide=collide,collisionType=collision_type)
        self.tags[tag]=result
        return result

    def convex(self):
        planes=self.array('6f')
        vertices=self.array('3f')
        bounds=self.read('6f')
        volume=self.read('f')
        center=self.read('3f')
        margin=self.read('f')
        index_type=self.read('B')
        if index_type not in (0,1,2,3):
            raise ValueError(f'Invalid convex index type {index_type} at {self.at-1}')
        faces=[]
        if index_type:
            code={1:'B',2:'h',3:'i'}[index_type]
            face_rows=self.array('2'+code)
            edges=self.array('3'+code)
            self.skip_array(struct.calcsize('<'+code))
            self.skip_array(struct.calcsize('<'+code))
            if len(face_rows)!=len(planes):
                raise ValueError('Convex plane/topology count mismatch')
            for p,(first,count) in enumerate(face_rows):
                if count<3 or first<0 or first+count>len(edges):
                    raise ValueError('Convex halfedge range invalid')
                indices=[edges[first+i][1] for i in range(count)]
                if any(not 0<=v<len(vertices) for v in indices):
                    raise ValueError('Convex vertex index outside geometry')
                for i in range(1,count-1):
                    tri=(indices[0],indices[i],indices[i+1])
                    a,b,c=[vertices[v] for v in tri]
                    cross=((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),
                           (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),
                           (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
                    if sum(cross[k]*planes[p][k+3] for k in range(3))<0:
                        tri=(tri[0],tri[2],tri[1])
                    faces.append(tri)
        if vertices and not faces:
            raise ValueError('Convex has vertices without serialized topology')
        self.read('3f')  # unit-mass inertia tensor (FVec3f in the cooked format)
        self.read('4d')  # rotation of mass
        return dict(vertices=vertices,triangles=faces,planes=planes,bounds=bounds,volume=volume,center=center,margin=margin)

    def triangle_mesh(self):
        if not self.boolean():
            raise ValueError('Unserialized triangle particles')
        vertices=self.array('3f')
        large=self.boolean()
        triangles=self.array('3i' if large else '3H')
        bounds=self.read('6f')  # Chaos TVector archive serializer uses float components.
        self.skip_array(64)  # two float-AABB children per fast BVH node
        self.skip_array(24)  # face bounds, not geometry
        materials=self.array('H')
        self.skip_array(4)   # external face map
        self.skip_array(4)   # external vertex map
        return dict(vertices=vertices,triangles=triangles,bounds=bounds,materials=materials)

    def heightfield(self):
        real_size,storage_size=self.read('2i')
        if real_size not in (4,8) or storage_size!=2:raise ValueError('Unsupported heightfield precision')
        scalar='d' if real_size==8 else 'f'
        heights=self.array('H');scale=self.read('3f')
        lo,hi=self.read('2'+scalar);rows,cols=self.read('2H')
        span,unit=self.read('2'+scalar)
        materials=self.array('B')
        self.skip_array(4);low_cols=self.read('H')
        self.read('4f2i2f')  # FlatGrid 2D (Chaos vectors use float wire values)
        self.read('4f')
        bounds=self.read('6f')
        if rows<2 or cols<2 or rows*cols!=len(heights):raise ValueError('Heightfield dimensions differ from sample count')
        if len(materials) not in (0,1,(rows-1)*(cols-1)):raise ValueError('Unsupported heightfield material count')
        vertices=[(i%cols,i//cols,lo+height*unit) for i,height in enumerate(heights)]
        triangles=[]
        for y in range(rows-1):
            for x in range(cols-1):
                cell=y*(cols-1)+x
                if materials and materials[0 if len(materials)==1 else cell]==255:continue
                a=y*cols+x;b=a+1;c=a+cols;d=c+1
                triangles.extend([(a,b,d),(a,d,c)])
        return dict(vertices=vertices,triangles=triangles,bounds=bounds,materials=materials,
                    rows=rows,columns=cols,serializedScale=scale,minHeight=lo,maxHeight=hi,range=span,heightPerUnit=unit)


def decode_body(data):
    archive=Archive(data)
    if archive.read('i')!=4:
        raise ValueError('Unsupported cooked collision precision')
    simple=[archive.pointer() for _ in range(archive.count(100000))]
    complex_shapes=[archive.pointer() for _ in range(archive.count(100000))]
    archive.skip_array(4)
    archive.skip_array(24)
    for _ in range(archive.count(100)):
        archive.skip_array(16)
    archive.skip_array(4)
    if archive.at!=len(data):
        raise ValueError(f'Unconsumed cooked Chaos data: {len(data)-archive.at} bytes')
    for shape in simple+complex_shapes:
        if shape is None:
            continue
        if any(not math.isfinite(v) for p in shape['vertices'] for v in p):
            raise ValueError('Non-finite cooked collision vertex')
        if any(not 0<=i<len(shape['vertices']) for tri in shape['triangles'] for i in tri):
            raise ValueError('Cooked collision index outside vertex buffer')
    return dict(dialect='UE5-modern-Chaos',simple=simple,complex=complex_shapes,consumedBytes=archive.at)
