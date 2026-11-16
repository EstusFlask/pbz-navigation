"""Offline import/template resolution with explicit failures, no running game."""
from collections import OrderedDict
from pathlib import Path
import hashlib
import json
import re
import math
from pbz_zen import Package
from pbz_offline_components import Cursor,transform,NATIVE

ROOT=Path(__file__).resolve().parents[1]


class Assets:
    def __init__(self,reader,classes,folder):
        self.reader=reader;self.classes=classes
        binary=Path('D:/software/Steam/steamapps/common/PBZ/platform/steam/PBZ.exe')
        with binary.open('rb')as stream:identity=hashlib.file_digest(stream,'sha256').hexdigest()
        if identity!=NATIVE.get('sourceBinarySHA256'):raise ValueError('Installed game build differs from the reviewed native serialization schema')
        self.container_sha256=hashlib.sha256(reader.toc).hexdigest()
        self.folder=Path(folder)/self.container_sha256[:16]
        self.index={};self.cache=OrderedDict();self.props={}
        for line in (ROOT/'build/game-files.txt').read_text().splitlines():
            _,chunk,kind,path=line.split(None,3)
            if kind!='ExportBundleData':continue
            stem=path.rsplit('.',1)[0]
            if stem.startswith('../../../ProjectPBZ/Content'):
                name='/Game'+stem[len('../../../ProjectPBZ/Content'):]
            elif stem.startswith('../../../Engine/Content'):
                name='/Engine'+stem[len('../../../Engine/Content'):]
            else:
                match=re.search(r'/Plugins/(?:.*/)?([^/]+)/Content/(.*)',stem)
                if not match:continue
                name='/'+match[1]+'/'+match[2]
            self.index[name.casefold()]=dict(chunk=chunk,path=path)

    def load(self,name):
        name=name.casefold()
        if name not in self.cache:
            entry=self.index.get(name)
            if entry is None:raise ValueError('Unindexed asset '+name)
            file=self.folder/(entry['chunk']+'.bin');file.parent.mkdir(parents=True,exist_ok=True)
            if not file.exists():file.write_bytes(self.reader.read(entry['chunk']))
            p=Package(file.read_bytes(),self.classes)
            p.asset_name=name;p.asset_sha256=hashlib.sha256(p.data).hexdigest()
            self.cache[name]=p
            if len(self.cache)>96:self.cache.popitem(last=False)
        p=self.cache.pop(name);self.cache[name]=p;return p

    def resolve_global(self,p,raw):
        if raw==0xffffffffffffffff:return None
        kind=raw>>62
        if kind==0:
            if raw>=len(p.exports):raise ValueError('Invalid local global reference')
            return p,int(raw)
        if kind==1:return None  # Native CDO handled by explicitly selected native defaults.
        if kind!=2:raise ValueError('Unsupported global reference')
        package_index=(raw>>32)&0x3fffffff;hash_index=raw&0xffffffff
        if package_index>=len(p.imported_names) or hash_index>=len(p.public_import_hashes):raise ValueError('Global reference out of range')
        target=self.load(p.imported_names[package_index]);wanted=p.public_import_hashes[hash_index]
        candidates=[i for i,e in enumerate(target.exports) if e['publicHash']==wanted]
        if len(candidates)!=1:raise ValueError('Public export hash did not resolve uniquely')
        return target,candidates[0]

    def resolve(self,p,value):
        if not value:return None
        if value>0:return p,value-1
        if -value>len(p.imports):raise ValueError('Invalid imported object reference')
        return self.resolve_global(p,p.imports[-value-1])

    def component(self,p,index,seen=()):
        key=(getattr(p,'asset_name',id(p)),index)
        if key in seen:raise ValueError('Component template cycle')
        if key in self.props:return self.props[key]
        e=p.exports[index];cls=e['className']
        try:own=Cursor(p.payload(index)).component(cls)
        except ValueError as ex:raise ValueError(f'{getattr(p,"asset_name","package")}:{index}:{cls}: {ex}') from ex
        body=own.get('BodyInstance')
        if isinstance(own.get('socket'),tuple):own['socket']=p.names[own['socket'][0]]
        if body:
            profile=body.get('CollisionProfileName')
            if isinstance(profile,tuple):body['CollisionProfileName']=p.names[profile[0]]
            rows=body.get('CollisionResponses',{}).get('named',[])
            for row in rows:
                if isinstance(row.get(0),tuple):row[0]=p.names[row[0][0]]
        inherited={}
        template=self.resolve_global(p,e['template'])
        if template:
            tp,ti=template
            if tp.exports[ti]['className'] not in (cls,None):raise ValueError('Incompatible component template')
            inherited={**self.component(tp,ti,(*seen,key))}
        result={**inherited,**own}
        if inherited.get('BodyInstance') or own.get('BodyInstance'):
            result['BodyInstance']={**inherited.get('BodyInstance',{}),**own.get('BodyInstance',{})}
        if 'parent'in own:result['_parent']=(p,own['parent'])
        if 'staticMesh'in own:result['_mesh']=(p,own['staticMesh'])
        self.props[key]=result;return result

    def chain(self,p,index,seen=()):
        key=(id(p),index)
        if key in seen:raise ValueError('Component attachment cycle')
        props=self.component(p,index);out=TransformChain([props])
        if props.get('socket') not in (None,0,'None',''):
            raise ValueError('Socket attachment needs the saved bone/socket transform: '+str(props['socket']))
        if props.get('_parent'):
            pp,ref=props['_parent']
            if ref:
                target=self.resolve(pp,ref)
                if not target:raise ValueError('Attachment parent unresolved')
                parent,pi=target
                if parent is not p:
                    # Instanced template references map to the matching sibling
                    # subobject of this placed actor, rather than its CDO origin.
                    name=parent.exports[pi]['name'];owner=p.exports[index]['outer']
                    siblings=[i for i,e in enumerate(p.exports) if e['outer']==owner and e['name']==name]
                    if len(siblings)!=1:raise ValueError('Inherited attachment counterpart unresolved')
                    parent,pi=p,siblings[0]
                out.extend(self.chain(parent,pi,(*seen,key)))
        return out


class TransformChain(list):
    pass


def qmul(a,b):
    x,y,z,w=a;X,Y,Z,W=b
    return (w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z)


def rotate(point,q):
    x,y,z,w=q;px,py,pz=point
    tx=2*(y*pz-z*py);ty=2*(z*px-x*pz);tz=2*(x*py-y*px)
    return (px+w*tx+y*tz-z*ty,py+w*ty+z*tx-x*tz,pz+w*tz+x*ty-y*tx)


def world_transform(chain):
    if hasattr(chain,'_world'):return chain._world
    q=(0,0,0,1);t=(0,0,0);scale=(1,1,1)
    for row in reversed(chain):
        pitch,yaw,roll=(math.radians(v)/2 for v in row.get('rotation') or (0,0,0))
        local_q=qmul(qmul((0,0,math.sin(yaw),math.cos(yaw)),(0,-math.sin(pitch),0,math.cos(pitch))),(-math.sin(roll),0,0,math.cos(roll)))
        local_t=row.get('location') or (0,0,0);local_scale=row.get('scale') or (1,1,1)
        if any(v<0 for v in (*scale,*local_scale)) and max(scale)-min(scale)>1e-8 and abs(local_q[3])<1-1e-8:
            raise ValueError('Mirrored nonuniform attachment needs matrix decomposition')
        translation=rotate(tuple(local_t[k]*scale[k] for k in range(3)),q)
        t=local_t if row.get('bAbsoluteLocation') else tuple(t[k]+translation[k] for k in range(3))
        q=local_q if row.get('bAbsoluteRotation') else qmul(q,local_q)
        scale=local_scale if row.get('bAbsoluteScale') else tuple(scale[k]*local_scale[k] for k in range(3))
    result=(q,t,scale)
    if isinstance(chain,TransformChain):chain._world=result
    return result


def place(point,chain):
    q,t,scale=world_transform(chain)
    rotated=rotate(tuple(point[k]*scale[k] for k in range(3)),q)
    return tuple(rotated[k]+t[k] for k in range(3))


def winding_negative(chain):
    scale=world_transform(chain)[2]
    return scale[0]*scale[1]*scale[2]<0
