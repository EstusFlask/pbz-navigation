"""Strict, read-only decoder for the placed interaction component transforms.
Unversioned native property order was read from this game's compiled metadata.
Unsupported prefixes are errors, not guessed FVector scans.
"""
from pathlib import Path
import sys,struct,json,re,math
import numpy as np
from scipy.spatial.transform import Rotation
sys.path.insert(0,str(Path(__file__).parent));from pbz_game_packages import names
ROOT=Path(__file__).resolve().parents[1]
TEXT=(ROOT/'build/game-script-objects.txt').read_text(encoding='utf-8')
CLASSES={int(v):n for n,v in re.findall(r'^([^\n]+):\n  global_index:\s+Some\((\d+)\)',TEXT,re.M)}
RAW=json.loads((ROOT/'authoring/native-component-schema.json').read_text())
PRIMITIVE=RAW['primitive'];BODY=RAW['body'];assert len(PRIMITIVE)==114 and len(BODY)==47
class Cursor:
 def __init__(self,data):self.data=data;self.at=0
 def read(self,fmt):
  r=struct.unpack_from('<'+fmt,self.data,self.at);self.at+=struct.calcsize('<'+fmt);return r[0] if len(r)==1 else list(r)
 def header(self):
  index=0;fields=[];zeros=[]
  while True:
   h=self.read('H');index+=h&127;n=h>>9;current=list(range(index,index+n));fields+=current
   if h&128:zeros+=current
   index+=n
   if h&256:break
  size=(1 if len(zeros)<=8 else 2 if len(zeros)<=16 else ((len(zeros)+31)//32)*4) if zeros else 0
  bits=int.from_bytes(self.data[self.at:self.at+size],'little');self.at+=size
  return fields,{v for i,v in enumerate(zeros) if bits>>i&1}
 def zero_struct(self,types):
  fields,zero=self.header()
  for f in fields:
   if f not in zero:self.read(types[f])
 def response(self):
  fields,zeros=self.header()
  for f in fields:
   if f in zeros:continue
   if f==0:self.read('2I')
   elif f==1:self.read('B')
   else:raise ValueError(('response field',f))
 def collision(self):
  fields,zeros=self.header()
  for f in fields:
   if f in zeros:continue
   if f==0:self.read('32B')
   elif f==1:
    for _ in range(self.read('I')):self.response()
   else:raise ValueError(('collision field',f))
 def body(self):
  fields,zeros=self.header()
  for f in fields:
   if f in zeros:continue
   prop=BODY[f]
   if prop['name']=='CollisionResponses':self.collision()
   elif prop['name']=='WalkableSlopeOverride':self.zero_struct(['B','f'])
   elif prop['kind']==25:
    assert prop['name'] in ['CustomDOFPlaneNormal','COMNudge','InertiaTensorScale'];self.read('3d')
   else:self.primitive(prop)
 def primitive(self,prop):
  k=prop['kind']
  if k in [0,1,12,30]:self.read('B')
  elif k in [2,5]:self.read('H')
  elif k in [3,6,82,14]:self.read('I')
  elif k in [4,7,11,20]:self.read('Q')
  elif k==10:self.read('f')
  elif k==28:
   for _ in range(self.read('I')):self.read('I2I')
  elif k==22:
   count=self.read('I');assert count<10000
   for _ in range(count):self.read('I')
  elif k==25 and prop['name']=='BodyInstance':self.body()
  elif k==25 and prop['name'] in ['bVisibleInRayTracing','LightingChannels']:self.zero_struct(['B','B','B'])
  else:raise ValueError(('unsupported prefix',prop['name'],k))
 def curve(self,width=3):
  fields,zero=self.header();points=[]
  for f in fields:
   if f in zero:continue
   if f==0:
    count=self.read('I');assert count<10000
    for _ in range(count):
     pf,pz=self.header();r={'key':0.,'value':[0.]*width,'arrive':[0.]*width,'leave':[0.]*width,'mode':0}
     for k in pf:
      if k in pz:continue
      if k==0:r['key']=self.read('f')
      elif k in [1,2,3]:r[{1:'value',2:'arrive',3:'leave'}[k]]=self.read(str(width)+('f' if width==1 else 'd'))
      elif k==4:r['mode']=self.read('B')
      else:raise ValueError(('curve point',k))
     points.append(r)
   elif f==1:self.read('B')
   elif f==2:self.read('f')
   else:raise ValueError(('curve',f))
  return points
 def spline_curves(self):
  fields,zero=self.header();points=[]
  for f in fields:
   if f in zero:continue
   if f in [0,1,2,3]:
    rows=self.curve({0:3,1:4,2:3,3:1}[f])
    if f==0:points=rows
   elif f==4:self.read('I')
   else:raise ValueError(('spline curves',f))
  return points
 def transform(self,cls):
  offset={'SceneComponent':0,'BoxComponent':123,'SphereComponent':123,'StaticMeshComponent':173,'SplineComponent':132}.get(cls)
  if offset is None:raise ValueError(('unsupported component',cls))
  fields,zero=self.header();out={}
  # Unknown inherited/default fields are unchanged; no need to parse their tail.
  for field in fields:
   if field>offset+7:break
   f=field-offset
   if field in zero:
    if f in [5,6,7]:out[{5:'location',6:'rotation',7:'scale'}[f]]=[0.,0.,0.]
    elif f==1:out['parent']=0
    continue
   if field<offset:
    primitive_offset=offset-114
    if field>=primitive_offset:self.primitive(PRIMITIVE[field-primitive_offset])
    elif cls=='SplineComponent' and field==0:
     assert self.read('B')==0,'non-empty native spline implementation'
    elif cls=='SplineComponent' and field==1:out['curve']=self.spline_curves()
    elif cls=='SplineComponent' and field in [2,3,11]:self.read('I')
    elif cls=='SplineComponent' and field in [4,5,6,7,8,9,10,17]:self.read('B')
    elif cls=='BoxComponent' and field==0:self.read('3d')
    elif cls in ['BoxComponent','SphereComponent'] and field==8:self.read('f')
    elif cls=='SphereComponent' and field==0:self.read('f')
    elif cls=='StaticMeshComponent' and field==4:self.read('I')
    elif cls=='StaticMeshComponent' and field==54:
     for _ in range(self.read('I')):self.read('I')
    else:raise ValueError(('unsupported derived prefix',cls,field))
   elif f in [0,1]:
    v=self.read('i')
    if f==1:out['parent']=v
   elif f==2:self.read('2I')
   elif f in [3,4]:
    for _ in range(self.read('I')):self.read('I')
   elif f in [5,6,7]:out[{5:'location',6:'rotation',7:'scale'}[f]]=self.read('3d')
   else:raise ValueError(('scene prefix',f))
  return out
class Package:
 def __init__(self,file):
  self.file=Path(file);self.b=self.file.read_bytes();self.names=names(self.b);self.base=struct.unpack_from('<I',self.b,4)[0];start,end=struct.unpack_from('<II',self.b,32);self.exports=[]
  for p in range(start,end,72):
   off,size,ni,num,outer,cls=struct.unpack_from('<QQIIQQ',self.b,p);name=self.names[ni&0x3fffffff]+('_'+str(num-1) if num else '')
   self.exports.append(dict(name=name,off=off,size=size,outer=outer,cls=CLASSES.get(cls,str(cls))))
 def payload(self,i):
  r=self.exports[i];at=self.base+r['off'];return self.b[at:at+r['size']]
 def transforms(self,actor,defaults={}):
  index=next(i for i,r in enumerate(self.exports) if r['name']==actor);parts={}
  for i,r in enumerate(self.exports):
   if r['outer']!=index:continue
   try:parts[i]={**defaults.get(r['name'],{}),**Cursor(self.payload(i)).transform(r['cls'])}
   except ValueError as e:
    if r['name'] in ['DefaultSceneRoot','TriggerBox','TriggerSphere','GrabPoint','LandArea']:raise
  def at(i,seen=()):
   if i in seen:raise ValueError('attachment cycle')
   tr=parts[i];matrix=np.eye(4);loc=tr.get('location',[0,0,0]);pitch,yaw,roll=tr.get('rotation',[0,0,0]);scale=tr.get('scale',[1,1,1]);matrix[:3,:3]=Rotation.from_euler('ZYX',[yaw,-pitch,-roll],degrees=True).as_matrix()@np.diag(scale);matrix[:3,3]=loc
   parent=tr.get('parent',0)-1
   if parent>=0 and parent not in parts and parent<len(self.exports) and self.exports[parent]['outer']==index:
    raise ValueError(('unparsed attachment parent',self.exports[parent]['name']))
   return at(parent,(*seen,i))@matrix if parent in parts else matrix
  points={};matrices={}
  for i in parts:
   try:matrices[i]=at(i)
   except ValueError:continue
   points[self.exports[i]['name']]=matrices[i][:3,3].tolist()
  for i,tr in parts.items():
   if not tr.get('curve') or i not in matrices:continue
   matrix=matrices[i];curve=[];rows=tr['curve']
   for a,b in zip(rows,rows[1:]):
    n=max(2,int(np.linalg.norm(np.array(a['value'])-b['value'])/30))
    for j in range(n):
     t=j/n;delta=b['key']-a['key']
     if a['mode']==2:v=np.array(a['value'])
     elif a['mode'] in [1,3,4,5]:
      v=(2*t**3-3*t*t+1)*np.array(a['value'])+(t**3-2*t*t+t)*delta*np.array(a['leave'])+(-2*t**3+3*t*t)*np.array(b['value'])+(t**3-t*t)*delta*np.array(b['arrive'])
     elif a['mode']==0:v=np.array(a['value'])*(1-t)+np.array(b['value'])*t
     else:raise ValueError(('unsupported spline interpolation',a['mode']))
     curve.append((matrix@np.array([*v,1]))[:3].tolist())
   curve.append((matrix@np.array([*rows[-1]['value'],1]))[:3].tolist());points[self.exports[i]['name']+'Curve']=curve
  return points,parts
