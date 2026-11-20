"""Exhaustive convex support/obstacle control for a conservative giant grid."""
from pathlib import Path
import argparse,hashlib,json,math,struct
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--world',type=Path,required=True);args=parser.parse_args();folder=args.world.resolve()
if not folder.is_relative_to(ROOT/'build'):raise ValueError('Private evidence only')
raw=(folder/'navigation-index.json').read_bytes();index=json.loads(raw);mask=index['gridPolicy']['conservativeMask'];supports=mask['supports'];blockers=mask['blockers'];failures=[];polygons=0;maximum=0;vertices=0
def supported(points,support):
    for i,a in enumerate(support['xy']):
        b=support['xy'][(i+1)%len(support['xy'])];dx=b[0]-a[0];dy=b[1]-a[1];limit=45*math.hypot(dx,dy)
        if any(dx*(p[1]-a[1])-dy*(p[0]-a[0])<limit for p in points):return False
    return True
def hull(points):
    points=sorted(set(p[:2]for p in points))
    def cross(a,b,c):return(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def half(rows):
        out=[]
        for p in rows:
            while len(out)>1 and cross(out[-2],out[-1],p)<=0:out.pop()
            out.append(p)
        return out
    return half(points)[:-1]+half(reversed(points))[:-1]
def clip(poly,a,b,inside=True):
    dx=b[0]-a[0];dy=b[1]-a[1];limit=45*math.hypot(dx,dy)
    def side(p):return(dx*(p[1]-a[1])-dy*(p[0]-a[0])-limit)*(1 if inside else-1)
    out=[]
    for p,q in zip(poly,poly[1:]+poly[:1]):
        u,v=side(p),side(q)
        if u>=0:out.append(p)
        if(u<0)!=(v<0):
            t=u/(u-v);out.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
    return out
def area(poly):return abs(sum(a[0]*b[1]-a[1]*b[0]for a,b in zip(poly,poly[1:]+poly[:1])))/2
def union_supported(poly):
    remaining=[poly]
    for support in supports:
        pieces=[]
        for piece in remaining:
            current=piece
            for a,b in zip(support['xy'],support['xy'][1:]+support['xy'][:1]):
                outside=clip(current,a,b,False)
                if len(outside)>2 and area(outside)>.01:pieces.append(outside)
                current=clip(current,a,b)
                if len(current)<3:break
        remaining=pieces
        if not remaining:return True
    return False
def overlaps_box(poly,b):
    lo=(b[0]-45,b[1]-45);hi=(b[3]+45,b[4]+45);cx=(lo[0]+hi[0])/2;cy=(lo[1]+hi[1])/2;hx=(hi[0]-lo[0])/2;hy=(hi[1]-lo[1])/2
    if max(p[0]for p in poly)<lo[0]or min(p[0]for p in poly)>hi[0]or max(p[1]for p in poly)<lo[1]or min(p[1]for p in poly)>hi[1]:return False
    for a,c in zip(poly,poly[1:]+poly[:1]):
        nx=c[1]-a[1];ny=a[0]-c[0];dots=[nx*(p[0]-cx)+ny*(p[1]-cy)for p in poly];radius=abs(nx)*hx+abs(ny)*hy
        if min(dots)>radius or max(dots)<-radius:return False
    return True
for number,(identity,row)in enumerate(index['blobs'].items()):
    data=(folder/row['file']).read_bytes()
    if hashlib.sha256(data).hexdigest()!=identity:raise ValueError('Changed coarse blob')
    np,nv,nlinks,ndm,ndv=struct.unpack_from('<5i',data,24);polyat=100+nv*12;detailat=polyat+np*32+nlinks*12;dv=detailat+ndm*12
    def point(at):
        x,z,y=struct.unpack_from('<3f',data,at);return(x*100,-y*100,z*100)
    for i in range(np):
        count=data[polyat+i*32+30];ids=struct.unpack_from('<'+str(count)+'H',data,polyat+i*32+4);points=[point(100+j*12)for j in ids]
        first,_,extra=struct.unpack_from('<IIB',data,detailat+i*12);points.extend(point(dv+(first+j)*12)for j in range(extra));vertices+=len(points);polygons+=1
        candidates=[s for s in supports if supported(points,s)]
        polygon=hull(points)
        if not candidates and not union_supported(polygon):failures.append(dict(blob=identity,poly=i,why='whole polygon/detail hull lacks true convex-union support with radius45cm'));continue
        offset=max(min(abs(p[2]-s['topZUE'][0])for s in(candidates or supports))for p in points);maximum=max(maximum,offset)
        if offset>8:failures.append(dict(blob=identity,poly=i,why='coarse height exceeds 8cm source tolerance',offsetCm=offset))
        if any(overlaps_box(polygon,b)for b in blockers):failures.append(dict(blob=identity,poly=i,why='polygon/detail hull approaches an excluded obstacle within radius45cm'))
    if(number+1)%1000==0:print('Validated giant-grid blobs',number+1,'/',len(index['blobs']),'failures',len(failures),flush=True)
report=dict(schema=1,scope='All polygon/detail convex hulls fit a real solid box top with radius45cm and avoid every non-plane source XY AABB; no live game acceptance',sourceIndexSHA256=hashlib.sha256(raw).hexdigest(),gridSourcePopulation=index['gridPopulation'],blobs=len(index['blobs']),polygons=polygons,vertices=vertices,maxHeightOffsetCm=maximum,failures=failures,independentGeometryPassed=not failures,physicalVerified=False)
file=folder/'independent-support-validation.json';file.write_text(json.dumps(report,separators=(',',':')));print('GIANT GRID INDEPENDENT',polygons,'polygons',vertices,'vertices;',len(failures),'failures;',maximum,'cm max height offset',flush=True)
raise SystemExit(bool(failures))
