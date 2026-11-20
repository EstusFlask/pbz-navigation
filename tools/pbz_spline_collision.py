"""Exact typed reuse of saved local spline collision; no undeformed fallback."""
import hashlib
import json
from pbz_offline_components import Cursor
from pbz_body_setup import body_setup

REVIEWED_MESH_SHA256="10ef6d594e6288aa0419c206b1ff260b41e45410fee42bb177b790e2c9911357"

def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(",",":"),allow_nan=False)

def source_mesh_bounds(package,index):
    """Typed reader for the exact audited cooked StaticMesh layout; rejects drift."""
    c=Cursor(package.payload(index));fields,zeros=c.header()
    if fields!=[3,4,5,6,42] or zeros:raise ValueError('Unreviewed StaticMesh property layout')
    for _ in range(c.count(100)):
        mf,mz=c.header()
        for slot in mf:
            if slot in mz:continue
            if slot==0:c.read('i')
            elif slot in (1,2):c.read('2I')
            elif slot==3:
                uf,uz=c.header()
                for q in uf:
                    if q not in uz:c.read('B'if q<2 else 'f')
            else:raise ValueError('Unknown FStaticMaterial field')
    c.read('fii');extended=c.small_struct(['3d','3d','d']);property_end=c.at
    if c.boolean():raise ValueError('Unreviewed StaticMesh GUID')
    if c.read('2B')!=(5,0) or not c.boolean():raise ValueError('Unreviewed cooked StaticMesh strip flags')
    body=c.read('i');nav=c.read('i');c.read('16s');sockets=c.array('i')
    if sockets or c.count(8)!=1 or c.read('2B')!=(5,4):raise ValueError('Unreviewed cooked LOD layout')
    sections=[c.read('10i')for _ in range(c.count(100))]
    at=c.at;bounds=c.read('7d');dev=c.read('f');flags=[c.boolean()for _ in range(3)]
    if flags!=[False,True,False]:raise ValueError('Unreviewed LOD buffer layout')
    return bounds,dict(propertyEnd=property_end,sourceBoundsOffset=at,bodyRef=body,navRef=nav,sections=sections,maxDeviation=dev,lodFlags=flags,readTo=c.at,extended=extended)

def deformation(props):
    defaults={0:(0.,0.,0.),1:(100.,0.,0.),2:(1.,1.),3:0.,4:0.,5:(0.,0.),6:(100.,0.,0.),7:(1.,1.),8:(100.,0.,0.),9:(0.,0.),10:1.}
    defaults.update(props.get('splineParams',{}))
    return dict(params=defaults,axis=props.get('splineAxis',0),up=props.get('splineUp',(0.,0.,1.)),minimum=props.get('splineMin',0.),maximum=props.get('splineMax',0.),smooth=bool(props.get('splineSmooth',False)),neverCook=bool(props.get('splineNeverCook',False)),dirty=bool(props.get('splineDirty',False)))

def normalize_body_props(package,props):
    p=json.loads(json.dumps(props));p.pop('AggGeom',None)
    body=p.get('DefaultInstance',{})
    if isinstance(body.get('CollisionProfileName'),list):body['CollisionProfileName']=package.names[body['CollisionProfileName'][0]]
    for row in body.get('CollisionResponses',{}).get('named',[]):
        if isinstance(row.get('0'),list):row['0']=package.names[row['0'][0]]
    p['CollisionTraceFlag']=p.get('CollisionTraceFlag',0);p['BuildScale3D']=p.get('BuildScale3D',[1.,1.,1.]);p['bNeverNeedsCookedCollisionData']=p.get('bNeverNeedsCookedCollisionData',False)
    return p

def equivalent_key(assets,package,index):
    props=assets.component(package,index);mp,mi=assets.resolve(*props['_mesh']);bounds,boundproof=source_mesh_bounds(mp,mi)
    bodies=[j for j,e in enumerate(mp.exports)if e['outer']==mi and e['className']=='BodySetup']
    if len(bodies)!=1:raise ValueError('Source BodySetup not unique')
    bi=bodies[0];body=body_setup(mp,bi);_,meta=mp.body_blob(bi)
    d=deformation(props)
    if d['neverCook'] or d['dirty']:raise ValueError('This proof requires stable cooked convex/trimesh')
    settings=normalize_body_props(mp,body['properties'])
    if settings['BuildScale3D']!=[1.,1.,1.]:raise ValueError('Unreviewed source BuildScale3D')
    key=dict(meshPackageSHA256=mp.asset_sha256,meshExport=mi,sourceBodyPayloadSHA256=sha(mp.payload(bi)),sourceBodyGuid=meta['bodyGuid'],sourceBounds=bounds,deformation=d,bodyProperties=settings)
    return key,(props,mp,mi,body,bounds,boundproof)

def exact_sibling_index(assets,package,source_mesh_sha):
    """Build once per package. All candidates must use the exact reviewed mesh.

    Return local BodySetups, not transformed meshes. Caller must still apply
    target BodyInstance collision policy and the target's own transform chain.
    """
    candidates={}
    for i,e in enumerate(package.exports):
        if e['className']!='SplineMeshComponent':continue
        props=assets.component(package,i)
        if not props.get('splineBodySetup') or not props.get('_mesh'):continue
        mp,mi=assets.resolve(*props['_mesh'])
        if mp.asset_sha256!=source_mesh_sha:continue
        key,info=equivalent_key(assets,package,i)
        bp,bi=assets.resolve(package,props['splineBodySetup'])
        if bp is not package or bp.exports[bi]['className']!='BodySetup':raise ValueError('Candidate BodySetup is not a typed same-package sibling')
        if bp.exports[bi]['outer']!=i:raise ValueError('Candidate BodySetup outer is not its spline component')
        saved=body_setup(bp,bi);_,meta=bp.body_blob(bi)
        if meta['bodyGuid']!=key['sourceBodyGuid'] or props.get('splineGuid')!=key['sourceBodyGuid']:raise ValueError('Cached deformed/source GUID mismatch')
        if normalize_body_props(bp,saved['properties'])!=key['bodyProperties']:raise ValueError('Saved deformed BodySetup settings differ')
        candidates.setdefault(canonical(key),[]).append((i,bp,bi,saved,info,key))
    return candidates

def resolve_exact_sibling_body(assets,package,target,candidates):
    if package.exports[target]['className']!='SplineMeshComponent':raise ValueError('Target must be a typed spline')
    key,info=equivalent_key(assets,package,target);props,mp,mi,source,bounds,proof=info
    if props.get('splineBodySetup'):raise ValueError('Target already owns a BodySetup')
    matches=candidates.get(canonical(key),[])
    if len(matches)!=1:raise ValueError('Missing or ambiguous exact sibling')
    i,bp,bi,saved,sinfo,_=matches[0];control=sinfo[0]
    if bool(props.get('bUseDefaultCollision',False))!=bool(control.get('bUseDefaultCollision',False)):raise ValueError('Default-collision mode differs')
    defaults=normalize_body_props(mp,source['properties']).get('DefaultInstance',{})
    effective={**defaults,**props.get('BodyInstance',{})};control_effective={**defaults,**control.get('BodyInstance',{})}
    if effective!=control_effective:raise ValueError('Target/control instance collision settings differ')
    return saved,dict(siblingExport=i,savedBodyExport=bi,equivalenceKey=key,keySHA256=sha(canonical(key).encode()),sourcePackageSHA256=package.asset_sha256,savedBodyPayloadSHA256=sha(bp.payload(bi)),siblingPayloadSHA256=sha(package.payload(i)),targetPayloadSHA256=sha(package.payload(target)),effectiveBody=effective),info,sinfo
