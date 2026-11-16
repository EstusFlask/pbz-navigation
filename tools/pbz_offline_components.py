"""Strict unversioned component prefixes needed for offline collision placement."""
from pathlib import Path
import json
import math
from pbz_chaos import Cursor as BinaryCursor

ROOT=Path(__file__).resolve().parents[1]
SCHEMA=json.loads((ROOT/'authoring/native-component-schema.json').read_text())
NATIVE=json.loads((ROOT/'authoring/offline-native-serialization-schema.json').read_text())
BODY_CORE=['bSimulatePhysics','bOverrideMass','bEnableGravity','bUpdateKinematicFromSimulation',
           'bGyroscopicTorqueEnabled','bAutoWeld','bStartAwake','bGenerateWakeEvents','bUpdateMassWhenScaleChanges']


class Cursor(BinaryCursor):
    def header(self):
        index=0;fields=[];masked=[]
        for _ in range(1024):
            h=self.read('H');index+=h&127
            current=list(range(index,index+(h>>9)));fields.extend(current)
            if h&128:masked.extend(current)
            index+=h>>9
            if h&256:break
        else:raise ValueError('Unterminated unversioned header')
        size=(1 if len(masked)<=8 else 2 if len(masked)<=16 else ((len(masked)+31)//32)*4) if masked else 0
        bits=int.from_bytes(self.data[self.at:self.at+size],'little');self.skip(size)
        return fields,{v for i,v in enumerate(masked) if bits>>i&1}

    def small_struct(self,types):
        fields,zeros=self.header();out={}
        for f in fields:
            if f>=len(types):raise ValueError(f'Unsupported struct field {f} at {self.at}')
            out[f]=0 if f in zeros else self.read(types[f])
        return out

    def responses(self):
        fields,zeros=self.header();out={}
        for f in fields:
            if f in zeros:continue
            if f==0:out['channels']=self.read('32B')
            elif f==1:out['named']=[self.small_struct(['2I','B']) for _ in range(self.count(10000))]
            else:raise ValueError('Unsupported collision response field')
        return out

    def body(self):
        fields,zeros=self.header();out={}
        for f in fields:
            schema=SCHEMA['body']+[dict(name=n,kind=12) for n in BODY_CORE]
            if f>=len(schema):raise ValueError(f'Unsupported BodyInstance field {f} at {self.at}')
            prop=schema[f];name=prop['name']
            if f in zeros:out[name]=0;continue
            if name=='CollisionResponses':value=self.responses()
            elif name=='WalkableSlopeOverride':value=self.small_struct(['B','f'])
            elif name in ['CustomDOFPlaneNormal','COMNudge','InertiaTensorScale']:value=self.read('3d')
            else:value=self.primitive(prop)
            out[name]=value
        return out

    def primitive(self,prop):
        kind=prop['kind'];name=prop['name']
        fmt={0:'B',1:'B',12:'B',30:'B',76:'B',2:'H',5:'H',3:'i',6:'I',82:'i',14:'i',4:'q',7:'Q',11:'d',20:'2I',10:'f'}
        if kind in fmt:return self.read(fmt[kind])
        if kind==28:return [self.read('I2I') for _ in range(self.count(10000))]
        if kind==22:return [self.read('I') for _ in range(self.count(10000))]
        if kind==25 and name=='BodyInstance':return self.body()
        if kind==25 and name=='bVisibleInRayTracing':
            if not self.boolean():raise ValueError('Uncooked per-platform visibility')
            return self.boolean()
        if kind==25 and name=='LightingChannels':return self.small_struct(['B','B','B'])
        if kind==25 and name=='CustomPrimitiveData':
            fields,zeros=self.header();out={}
            for f in fields:
                if f in zeros:continue
                if f!=0:raise ValueError('Unsupported custom primitive data field')
                out['Data']=self.array('f')
            return out
        raise ValueError(f'Unsupported primitive field {name} type {kind}')

    def bounds_cache(self):
        fields,zeros=self.header();out={}
        for f in fields:
            if f in zeros:continue
            if f==0:out['valid']=self.read('B')
            elif f==1:out['hash']=self.read('I')
            elif f==2:out['bounds']=self.small_struct(['3d','3d','d'])
            else:raise ValueError('Unsupported instance bounds-cache field')
        return out

    def camera_struct(self,schema):
        fields,zeros=self.header();out={}
        for f in fields:
            if f>=len(schema):raise ValueError('Camera struct property exceeds reviewed schema')
            if f in zeros:continue
            prop=schema[f];out[prop['name']]=self.primitive(prop)
        return out

    def component(self,cls,full=False):
        offsets={'SceneComponent':0,'StaticMeshComponent':173,'SplineMeshComponent':185,'InstancedStaticMeshComponent':194,'DynamicMeshComponent':146,'BillboardComponent':122,
                 'BoxComponent':123,'SphereComponent':123,'CapsuleComponent':124,'BrushComponent':116,
                 'HoudiniAssetComponent':171,'SkeletalMeshComponentBudgeted':239,'CineCameraComponent':45}
        if cls not in offsets:raise ValueError('Unsupported component class '+cls)
        offset=offsets[cls];fields,zeros=self.header();out={}
        for f in fields:
            if f>=offset+29 and not full:break
            rel=f-offset
            if f in zeros:
                if rel in (5,6,7):out[{5:'location',6:'rotation',7:'scale'}[rel]]=(0.,0.,0.)
                elif rel==1:out['parent']=0
                continue
            if f<offset:
                primitive_offset=offset-114
                if cls=='CineCameraComponent':
                    if f in (2,3,44):
                        key={2:'cameraLens',3:'cameraFocus',44:'cameraPostProcess'}[f]
                        out[key]=self.camera_struct(NATIVE[key])
                    else:
                        prop=NATIVE['cineCamera'][f];out[prop['name']]=self.primitive(prop)
                elif f>=primitive_offset:
                    prop=SCHEMA['primitive'][f-primitive_offset]
                    try:out[prop['name']]=self.primitive(prop)
                    except ValueError as ex:raise ValueError(prop['name']+': '+str(ex)) from ex
                elif cls=='BillboardComponent' and f<8:out['billboardField'+str(f)]=self.read('i' if f==0 else 'B' if f==1 else 'f')
                elif cls=='BrushComponent' and f<2:out['brushBodySetup' if f==1 else 'brush']=self.read('i')
                elif cls=='SkeletalMeshComponentBudgeted' and f<len(NATIVE['budgetedSkeletal']):
                    prop=NATIVE['budgetedSkeletal'][f];out[prop['name']]=self.primitive(prop)
                elif cls=='SkeletalMeshComponentBudgeted' and f==120:out['overrideMaterials']=self.array('i')
                elif cls=='InstancedStaticMeshComponent' and f<21:
                    if f in (17,18,19):value=self.bounds_cache()
                    elif f in (3,4,8,9,10,15):value=self.read('i')
                    elif f in (11,12,13,20):value=self.read('B')
                    elif f==7:value=self.read('f')
                    elif f in (5,14):value=self.array('f' if f==5 else 'i')
                    elif f==6:value=[self.small_struct(['i','i']) for _ in range(self.count(100000))]
                    else:raise ValueError('Unsupported instance property '+str(f))
                    out['instanceField'+str(f)]=value
                elif cls=='InstancedStaticMeshComponent' and 21<=f<75:
                    prop=NATIVE['staticMesh'][f-21]
                    if prop['name']=='WireframeColorOverride':value=self.read('4B')
                    elif prop['name']=='MaterialCacheTileCount':value=self.read('2i')
                    else:value=self.primitive(prop)
                    out['staticMesh' if prop['name']=='StaticMesh' else prop['name']]=value
                elif cls=='InstancedStaticMeshComponent' and f==75:out['overrideMaterials']=[self.read('i') for _ in range(self.count(10000))]
                elif cls=='DynamicMeshComponent' and f in (0,8):out[{0:'meshObject',8:'bodySetup'}[f]]=self.read('i')
                elif cls=='DynamicMeshComponent' and f in (1,2,3,4,5,6,7):out['dynamicField'+str(f)]=self.read('B')
                elif cls=='DynamicMeshComponent' and f==9:
                    from pbz_body_setup import BodyCursor
                    cursor=BodyCursor(self.data);cursor.at=self.at;out['dynamicAggGeom']=cursor.aggregate();self.at=cursor.at
                elif cls=='DynamicMeshComponent' and f==26:out['overrideMaterials']=[self.read('i') for _ in range(self.count(10000))]
                elif cls=='SplineMeshComponent' and f<12:
                    names=['splineParams','splineUp','splineMin','splineGuid','virtualTextureDistance','splineBodySetup','splineMax','splineAxis',
                           'splineEdit','splineSmooth','splineDirty','splineNeverCook']
                    if f==0:value=self.small_struct(['3d','3d','2d','f','f','2d','3d','2d','3d','2d','f'])
                    elif f==1:value=self.read('3d')
                    elif f==3:value=self.read('16s').hex()
                    elif f==5:value=self.read('i')
                    else:value=self.read('f' if f in (2,4,6) else 'B')
                    out[names[f]]=value
                elif cls=='SplineMeshComponent' and 12<=f<66:
                    prop=NATIVE['staticMesh'][f-12]
                    if prop['name']=='WireframeColorOverride':value=self.read('4B')
                    elif prop['name']=='MaterialCacheTileCount':value=self.read('2i')
                    else:value=self.primitive(prop)
                    out['staticMesh' if prop['name']=='StaticMesh' else prop['name']]=value
                elif cls=='SplineMeshComponent' and f==66:out['overrideMaterials']=[self.read('i') for _ in range(self.count(10000))]
                elif cls=='StaticMeshComponent' and f<54:
                    prop=NATIVE['staticMesh'][f]
                    if prop['name']=='WireframeColorOverride':value=self.read('4B')
                    elif prop['name']=='MaterialCacheTileCount':value=self.read('2i')
                    else:value=self.primitive(prop)
                    out['staticMesh' if prop['name']=='StaticMesh' else prop['name']]=value
                elif cls=='StaticMeshComponent' and f==54:out['overrideMaterials']=[self.read('I') for _ in range(self.count(10000))]
                elif cls=='BoxComponent' and f==0:out['boxExtent']=self.read('3d')
                elif cls=='SphereComponent' and f==0:out['sphereRadius']=self.read('f')
                elif cls=='CapsuleComponent' and f<2:out['capsuleHalfHeight' if f==0 else 'capsuleRadius']=self.read('f')
                elif cls in ('BoxComponent','SphereComponent','CapsuleComponent'):
                    own=2 if cls=='CapsuleComponent' else 1;field=f-own
                    if field==0:out['shapeBodySetup']=self.read('i')
                    elif field==1:out['shapeColor']=self.read('4B')
                    elif 2<=field<=5:out['shapeField'+str(field)]=self.read('B')
                    elif field==6:out['shapeAreaClass']=self.read('i')
                    elif field==7:out['shapeLineThickness']=self.read('f')
                    else:raise ValueError('Unsupported shape component field')
                else:raise ValueError(f'Unsupported {cls} prefix field {f}')
            elif rel in (0,1):
                value=self.read('i')
                if rel==1:out['parent']=value
                else:out['physicsVolume']=value
            elif rel==2:out['socket']=self.read('2I')
            elif rel in (3,4):out['attachments'+str(rel)]=[self.read('I') for _ in range(self.count(10000))]
            elif rel in (5,6,7):out[{5:'location',6:'rotation',7:'scale'}[rel]]=self.read('3d')
            elif 8<=rel<29:
                prop=NATIVE['scene'][rel]
                out[prop['name']]=self.read('3d') if rel==8 else self.primitive(prop)
            elif 29<=rel<44:
                prop=NATIVE['actorComponent'][rel-29]
                if prop['name']=='ComponentTags':value=self.array('2I')
                elif prop['name']=='PrimaryComponentTick':raise ValueError('Unsupported serialized primary tick')
                else:value=self.primitive(prop)
                out[prop['name']]=value
            else:raise ValueError('Unsupported scene prefix')
        return out


def transform(point,location=(0,0,0),rotation=(0,0,0),scale=(1,1,1)):
    # UE FRotator: yaw Z, pitch -Y, roll -X, followed by parent composition.
    x,y,z=(point[k]*scale[k] for k in range(3))
    pitch,yaw,roll=(math.radians(v) for v in rotation)
    c,s=math.cos(-roll),math.sin(-roll);y,z=c*y-s*z,s*y+c*z
    c,s=math.cos(-pitch),math.sin(-pitch);x,z=c*x+s*z,-s*x+c*z
    c,s=math.cos(yaw),math.sin(yaw);x,y=c*x-s*y,s*x+c*y
    return (x+location[0],y+location[1],z+location[2])
