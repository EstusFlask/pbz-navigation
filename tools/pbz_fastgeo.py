"""Strict build-specific FastGeo collision-prefix reader.

Renderer extensions are retained as opaque bytes, not interpreted as geometry.
Every container must consume exactly; unsupported component arrays are errors.
The observed PBZ layout and source/version differences are recorded in the audit.
"""
import math
from pbz_offline_components import Cursor


class FastGeoCursor(Cursor):
    def string(self):
        count=self.read('i')
        if not -100000<=count<=100000:raise ValueError('Invalid FastGeo name length')
        size=abs(count)*(2 if count<0 else 1)
        raw=bytes(self.data[self.at:self.at+size]);self.skip(size)
        return raw.decode('utf-16le' if count<0 else 'utf-8').rstrip('\0')

    def primitive_record(self):
        index=self.read('i')
        if index<0:raise ValueError('Negative FastGeo component index')
        local=self.read('10d');world=self.read('10d')
        local_bounds=self.read('7d');bounds=self.read('7d')
        if any(not math.isfinite(v) for v in world+bounds) or any(v<0 for v in bounds[3:]):raise ValueError('Invalid FastGeo transform/bounds')
        flags=[self.boolean() for _ in range(5)]
        self.skip_array(4)
        detail,nav_geometry=self.read('2B')
        self.skip_array(4)
        # Cursor.primitive handles a property; call body explicitly since this
        # subclass uses primitive() to mean a FastGeo primitive record.
        body=self.body()
        renderer=[self.boolean() for _ in range(47)]
        self.read('BifBBiB3iBBBBbibifffiBf')
        self.skip(13)
        return dict(index=index,localTransform=local,worldTransform=world,localBounds=local_bounds,bounds=bounds,
                    flags=flags,body=body,detail=detail,customNavigableGeometry=nav_geometry,
                    collisionEnabled=renderer[39],rendererInstanced=renderer[42])

    def static(self,instanced=False):
        start=self.at;result=self.primitive_record()
        if result['rendererInstanced']!=instanced:raise ValueError('FastGeo renderer type anchor differs from component array')
        result['materialIndices']=self.array('i')
        result['meshAsset']=self.read('i');self.read('i');self.skip_array(4)
        self.read('f3i3fi')
        for _ in range(10):self.boolean()
        result['useDefaultCollision']=self.boolean()
        self.skip(36)
        if instanced:
            width,count=self.read('2i')
            if width not in (64,128) or not 0<=count<=1000000:raise ValueError('Invalid FastGeo instance matrix buffer')
            result['instances']=[self.read('16d' if width==128 else '16f') for _ in range(count)]
            self.read('i')
            width,count=self.read('2i')
            if width!=4:raise ValueError('Unexpected FastGeo custom data width')
            self.skip(count*4)
            self.skip_array(8)
            width,count=self.read('2i')
            if width!=4:raise ValueError('Unexpected FastGeo instance ID width')
            self.skip(count*4)
            result['navigationBounds']=self.read('6dB')
            self.read('f3i');self.boolean();self.skip(4)
        result['serializedBytes']=self.at-start
        return result


def fastgeo(package,index):
    c=FastGeoCursor(package.payload(index));fields,zeros=c.header();assets=[]
    for field in fields:
        if field in zeros:continue
        if field!=0:raise ValueError('Unsupported FastGeo container property')
        assets=c.array('i')
    if c.boolean():c.skip(16)
    components=[];decals=0;clusters=0;hlods=0
    def cluster(hlod=False):
        nonlocal decals,clusters,hlods
        name=c.string();cluster_index=c.read('i');clusters+=1
        for kind in range(6):
            count=c.count(1000000)
            if kind in (0,1):
                for _ in range(count):
                    row=c.static(kind==1);row.update(cluster=name,clusterIndex=cluster_index,hlod=hlod,type='instanced' if kind else 'static')
                    asset=row['meshAsset']
                    if not 0<=asset<len(assets):raise ValueError('FastGeo mesh asset index outside table')
                    row['meshReference']=assets[asset]
                    profile=row['body'].get('CollisionProfileName')
                    if isinstance(profile,tuple):row['body']['CollisionProfileName']=package.names[profile[0]]
                    for response in row['body'].get('CollisionResponses',{}).get('named',[]):
                        if isinstance(response.get(0),tuple):response[0]=package.names[response[0][0]]
                    components.append(row)
            elif kind==5:
                for _ in range(count):
                    component_index=c.read('i')
                    if component_index<0:raise ValueError('Invalid FastGeo decal index')
                    c.skip(384)
                decals+=count
            elif count:raise ValueError('Unsupported FastGeo component array '+str(kind))
        if hlod:
            c.boolean();c.skip(48)
    for _ in range(c.count(100000)):cluster()
    for _ in range(c.count(100000)):
        cluster(True);hlods+=1
    if c.at!=len(c.data):raise ValueError(f'Unconsumed FastGeo container bytes {len(c.data)-c.at}')
    return dict(components=components,decals=decals,clusters=clusters,hlods=hlods,
                opaqueRendererExtensionBytesPerComponent=49,consumedBytes=c.at,
                layout='PBZ-fastgeo-observed; opaque renderer suffixes retained')


def quaternion_place(point,transform):
    x,y,z,w=transform[:4];tx,ty,tz=transform[4:7];sx,sy,sz=transform[7:]
    px,py,pz=(point[0]*sx,point[1]*sy,point[2]*sz)
    qx=2*(y*pz-z*py);qy=2*(z*px-x*pz);qz=2*(x*py-y*px)
    return (px+w*qx+y*qz-z*qy+tx,py+w*qy+z*qx-x*qz+ty,pz+w*qz+x*qy-y*qx+tz)


def instance_place(point,matrix):
    return tuple(sum(point[j]*matrix[j*4+k] for j in range(3))+matrix[12+k] for k in range(3))
