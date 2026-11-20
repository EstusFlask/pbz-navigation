"""Pinned cooked skeletal reference data, never a live animation-pose claim."""
from pathlib import Path
import json
import math
from pbz_offline_components import Cursor,NATIVE

ROOT=Path(__file__).resolve().parents[1]
SCHEMA=json.loads((ROOT/'authoring/offline-skeletal-serialization-schema.json').read_text(encoding='utf-8'))
if SCHEMA['sourceBinarySHA256']!=NATIVE['sourceBinarySHA256']:raise ValueError('Skeletal schema binary identity differs')


class TypedCursor(Cursor):
    def name(self,p):
        i,n=self.read('2I')
        if i>=len(p.names):raise ValueError('Skeletal FName out of range')
        return p.names[i]+('_'+str(n-1) if n else '')

    def value(self,prop,p):
        kind=prop['kind']
        if kind==25:
            name=prop['structName']
            if name in ('Vector','Rotator'):return self.read('3d')
            if name=='Quat':return self.read('4d')
            if name=='Guid':return self.read('16s').hex()
            if name=='Transform':return dict(rotation=self.read('4d'),location=self.read('3d'),scale=self.read('3d'))
            if name=='SkeletalMeshSamplingLODBuiltData':return dict(prob=self.array('f'),alias=self.array('i'),totalWeight=self.read('f'))
            if name in ('PerPlatformFloat','PerPlatformInt','PerPlatformBool'):
                if self.read('I')!=1:raise ValueError('Uncooked per-platform skeletal field')
                return self.read({'PerPlatformFloat':'f','PerPlatformInt':'i','PerPlatformBool':'I'}[name])
            return self.properties(SCHEMA['structs'][name],p)
        if kind==22:
            if len(prop.get('inner',[]))!=1:raise ValueError('Skeletal array inner differs')
            return [self.value(prop['inner'][0],p) for _ in range(self.count(100000))]
        if kind==33:
            present=self.read('I')
            if present not in (0,1):raise ValueError('Invalid skeletal optional presence')
            return self.value(prop['inner'][0],p) if present else None
        if kind==20:return self.name(p)
        if kind==21:
            n=self.read('i')
            if abs(n)>100000:raise ValueError('Skeletal FString too long')
            return self.read(str(abs(n)*(2 if n<0 else 1))+'s').decode('utf-16le' if n<0 else 'utf-8').rstrip('\0')
        if kind==30:return self.read('B')
        if kind==32:return self.read('d')
        return self.primitive(prop)

    def properties(self,schema,p):
        fields,zeros=self.header();out={}
        for field in fields:
            if field>=len(schema):raise ValueError('Skeletal property schema exceeded')
            prop=schema[field];out[prop['name']]=0 if field in zeros else self.value(prop,p)
        return out


def reference_mesh(p,index,assets):
    if p.exports[index]['className']!='SkeletalMesh':raise ValueError('Attachment skinned asset is not a supported SkeletalMesh')
    c=TypedCursor(p.payload(index));props=c.properties(SCHEMA['skeletalMeshProperties'],p)
    skeleton=assets.resolve(p,props.get('Skeleton',0))
    if not skeleton or skeleton[0].exports[skeleton[1]]['className']!='Skeleton':raise ValueError('Typed Skeleton binding unresolved')
    if c.boolean():c.skip(16)
    strip=c.read('2B')
    c.read('7d')
    for _ in range(c.count(1000)):
        c.read('i');c.name(p)
        if c.boolean():raise ValueError('Editor skeletal material slot unsupported')
        c.boolean();c.boolean();c.read('4f');c.read('i')
    bones=[]
    for i in range(c.count(10000)):
        name=c.name(p);parent=c.read('i')
        if not -1<=parent<i or i==0 and parent!=-1:raise ValueError('Invalid native reference-bone parent')
        bones.append(dict(name=name,parent=parent))
    if c.count(10000)!=len(bones):raise ValueError('Reference bone pose count differs')
    for bone in bones:
        q=c.read('4d');t=c.read('3d');s=c.read('3d')
        if not all(math.isfinite(v) for v in (*q,*t,*s)) or abs(sum(v*v for v in q)-1)>1e-4:raise ValueError('Invalid reference bone transform')
        bone.update(rotation=q,location=t,scale=s)
    if c.count(10000)!=len(bones):raise ValueError('Reference bone name-map count differs')
    lookup={}
    for _ in bones:
        name=c.name(p);i=c.read('i')
        if not 0<=i<len(bones) or name!=bones[i]['name'] or name.casefold() in lookup:raise ValueError('Native reference name-map differs')
        lookup[name.casefold()]=i
    if not c.boolean() or not 0<c.count(32)<=32:raise ValueError('Reviewed cooked skeletal native tail differs')
    return dict(bones=bones,lookup=lookup,skeletonPackage=skeleton[0].asset_name,sourceSHA256=p.asset_sha256,strip=strip,
                posePolicy='authored-reference-only; live animation/occupancy unknown')


def reference_bone_chain(data,name):
    if name.casefold() not in data['lookup']:raise ValueError('Named bone/socket is not in the typed source mesh reference skeleton: '+name)
    i=data['lookup'][name.casefold()];chain=[]
    while i>=0:
        bone=data['bones'][i];chain.append(dict(rotationQuat=bone['rotation'],location=bone['location'],scale=bone['scale'],
            referencePoseOnly=True,navFloorAllowed=False,skeletalSourceSHA256=data['sourceSHA256']));i=bone['parent']
    return chain
