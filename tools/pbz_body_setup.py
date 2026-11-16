"""BodySetup properties and explicit simple shapes alongside cooked Chaos."""
from pbz_offline_components import Cursor,NATIVE
from pbz_chaos import decode_body
from pbz_offline_mesh import box
from pbz_offline_components import transform
import math


class BodyCursor(Cursor):
    def shape(self,kind):
        specs={
            'sphere':[('Center','3d'),('Radius','f')],
            'box':[('Center','3d'),('Rotation','3d'),('X','f'),('Y','f'),('Z','f')],
            'capsule':[('Center','3d'),('Rotation','3d'),('Radius','f'),('Length','f')],
            'convex':[('VertexData',None),('IndexData',None),('ElemBox','6dB'),('Transform','10d')],
        }
        if kind not in specs:raise ValueError('Unsupported simple collision type '+kind)
        own=specs[kind];fields,zeros=self.header();out={'kind':kind}
        base=[('RestOffset','f'),('Name','2I'),('bContributeToMass','B'),('CollisionEnabled','B')]
        for f in fields:
            if f>=len(own)+len(base):raise ValueError('Unsupported shape property index '+str(f))
            name,fmt=(own+base)[f]
            if f in zeros:out[name]=0;continue
            if name=='VertexData':value=self.array('3d')
            elif name=='IndexData':value=self.array('i')
            elif name=='Transform':value=self.small_struct(['4d','3d','3d'])
            else:value=self.read(fmt)
            out[name]=value
        return out

    def aggregate(self):
        fields,zeros=self.header();out=[]
        kinds=['sphere','box','capsule','convex','taperedCapsule','levelSet','skinnedLevelSet','mlLevelSet','skinnedTriangleMesh']
        for f in fields:
            if f in zeros:continue
            if f>=len(kinds):raise ValueError('Unsupported aggregate shape property')
            out.extend(self.shape(kinds[f]) for _ in range(self.count(100000)))
        return out

    def properties(self):
        fields,zeros=self.header();out={}
        schema=NATIVE['bodySetup']+NATIVE['bodySetupCore']
        for f in fields:
            if f>=len(schema):raise ValueError('Unsupported BodySetup property index '+str(f))
            prop=schema[f];name=prop['name']
            if f in zeros:out[name]=0;continue
            if name=='AggGeom':value=self.aggregate()
            elif name=='DefaultInstance':value=self.body()
            elif name=='BuildScale3D':value=self.read('3d')
            elif name=='WalkableSlopeOverride':value=self.small_struct(['B','f'])
            else:value=self.primitive(prop)
            out[name]=value
        if self.boolean():self.skip(16)  # UObject's optional serialized object GUID
        return out


def body_setup(package,index):
    payload=package.payload(index);c=BodyCursor(payload)
    props=c.properties()
    guid=c.read('16s')
    cooked,has_data=c.boolean(),c.boolean()
    formats=c.count(10)
    if not cooked:raise ValueError('Uncooked BodySetup is unsupported')
    if has_data and formats:
        blob,meta=package.body_blob(index)
        if c.at!=meta['nativeTailOffset']+28:
            raise ValueError('BodySetup property prefix differs from validated native tail')
        decoded=decode_body(blob)
    elif not has_data and formats==0:
        if c.at!=len(payload):raise ValueError('Unexpected empty BodySetup native tail')
        decoded={'simple':[],'complex':[],'consumedBytes':0}
    else:raise ValueError('Inconsistent cooked BodySetup flags')
    return dict(properties=props,chaos=decoded)


def simple_mesh(shape):
    kind=shape['kind']
    if shape.get('CollisionEnabled',3) not in (1,3,5):return None
    center=shape.get('Center') or (0,0,0);rotation=shape.get('Rotation') or (0,0,0)
    if kind=='convex':
        vertices=shape.get('VertexData') or []
        indices=shape.get('IndexData') or []
        if not vertices:return None
        if not indices:
            import sys
            sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parents[1]/'build/offline-deps'))
            from scipy.spatial import ConvexHull
            indices=ConvexHull(vertices).simplices.ravel().tolist()
        if len(indices)%3:raise ValueError('Invalid aggregate convex index count')
        center=tuple(sum(p[k] for p in vertices)/len(vertices) for k in range(3));triangles=[]
        for i in range(0,len(indices),3):
            tri=tuple(indices[i:i+3])
            if any(not 0<=v<len(vertices) for v in tri):raise ValueError('Aggregate convex index outside vertices')
            a,b,c=[vertices[v]for v in tri];u=tuple(b[k]-a[k]for k in range(3));v=tuple(c[k]-a[k]for k in range(3))
            n=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
            if sum(n[k]*(a[k]-center[k])for k in range(3))<0:tri=(tri[0],tri[2],tri[1])
            triangles.append(tri)
        transform_data=shape.get('Transform') or {}
        q=transform_data.get(0) or (0,0,0,1);translation=transform_data.get(1) or (0,0,0);scale=transform_data.get(2) or (1,1,1)
        from pbz_offline_assets import rotate
        result=[]
        for p in vertices:
            r=rotate(tuple(p[k]*scale[k]for k in range(3)),q);result.append(tuple(r[k]+translation[k]for k in range(3)))
        if scale[0]*scale[1]*scale[2]<0:triangles=[(a,c,b)for a,b,c in triangles]
        return result,triangles
    if kind=='box':
        raw=tuple(shape.get(k,0)/2 for k in ('X','Y','Z'))
        if min(raw)<0:raise ValueError('Invalid box collision dimensions')
        # Chaos CreateGeometry clamps degenerate box extents to KINDA_SMALL_NUMBER.
        half=tuple(max(v,.0001) for v in raw)
        vertices,triangles=box(tuple(-v for v in half),half)
    elif kind in ('sphere','capsule'):
        segments,rings=20,12
        radius=shape.get('Radius',0)
        if radius<=0:raise ValueError('Invalid round collision radius')
        # Circumscribe the sampled curved shape, so tessellation cannot shave
        # an obstacle inward. Recast reserves voxel/contour error separately.
        radius/=math.cos(math.pi/segments)*math.cos(math.pi/(2*rings))
        length=shape.get('Length',0) if kind=='capsule' else 0
        vertices=[];triangles=[]
        for j in range(rings+1):
            angle=math.pi*j/rings;z=radius*math.cos(angle)
            z+=length/2 if z>=0 else -length/2
            for i in range(segments):
                a=2*math.pi*i/segments;vertices.append((radius*math.sin(angle)*math.cos(a),radius*math.sin(angle)*math.sin(a),z))
        for j in range(rings):
            for i in range(segments):
                a=j*segments+i;b=j*segments+(i+1)%segments;c=(j+1)*segments+i;d=(j+1)*segments+(i+1)%segments
                triangles.extend([(a,c,b),(b,c,d)])
    else:raise ValueError('Unsupported primitive triangulation '+kind)
    return [transform(p,center,rotation) for p in vertices],triangles


def collision_meshes(decoded):
    props=decoded['properties'];cooked=decoded['chaos']
    flag=props.get('CollisionTraceFlag',0)
    if flag not in (0,1,2,3):raise ValueError('Invalid body collision complexity')
    if flag==3 and cooked['complex']:
        return [(s['vertices'],s['triangles']) for s in cooked['complex'] if s]
    shapes=props.get('AggGeom') or []
    result=[];convex_index=0
    for shape in shapes:
        if shape['kind']=='convex':
            if convex_index>=len(cooked['simple']):raise ValueError('Cooked convex is missing')
            source=cooked['simple'][convex_index];convex_index+=1
            if source and shape.get('CollisionEnabled',3) in (1,3,5):result.append((source['vertices'],source['triangles']))
        else:
            mesh=simple_mesh(shape)
            if mesh:result.append(mesh)
    if not result and flag==2:
        return [(s['vertices'],s['triangles']) for s in cooked['complex'] if s]
    return result
