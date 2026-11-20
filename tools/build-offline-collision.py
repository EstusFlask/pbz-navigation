"""Build an auditable regional collision scene from game package geometry."""
from pathlib import Path
import argparse
from collections import Counter
import hashlib
import json
import re
import math
from pbz_game_packages import Reader
from pbz_zen import Package,native_classes
from pbz_offline_assets import Assets,place,winding_negative,TransformChain
from pbz_body_setup import body_setup,collision_meshes,simple_mesh
from pbz_offline_mesh import read_mesh,write_mesh
from pbz_landscape import landscape
from pbz_fastgeo import fastgeo,quaternion_place,instance_place
from pbz_instances import instances
from pbz_collision_state import CollisionState
from pbz_dynamic_mesh import geometry as dynamic_geometry,oodle_decoder

ROOT=Path(__file__).resolve().parents[1]


def overlap(vertices,bounds):
    return all(min(p[k] for p in vertices)<=bounds[k+3] and max(p[k] for p in vertices)>=bounds[k] for k in range(3))


def profiles():
    out={}
    text=(ROOT/'build/game-extract/ProjectPBZ/Config/DefaultEngine.ini').read_text(encoding='utf-8')
    for line in text.splitlines():
        if not line.startswith('+Profiles='):continue
        name=re.search(r'Name="([^"]+)"',line)
        mode=re.search(r'CollisionEnabled=([^,)]+)',line)
        obj=re.search(r'ObjectTypeName="([^"]+)"',line)
        if not name or not mode:continue
        custom={}
        for channel,response in re.findall(r'\(Channel="([^"]+)"(?:,Response=([^,)]+))?\)',line):
            custom[channel]={'ECR_Ignore':0,'ECR_Overlap':1,'ECR_Block':2,'':2}[response]
        out[name[1]]=dict(enabled=mode[1],object=obj[1] if obj else None,responses=custom)
    return out


def blocks_player(body,table):
    if body.get('CollisionEnabled',3) not in (1,3,5):return False
    profile=body.get('CollisionProfileName')
    if profile in ('NoCollision','OverlapAll','OverlapAllDynamic'):return False
    defaults=table.get(profile)
    if defaults:
        if defaults['enabled'] in ('NoCollision','PhysicsOnly','ProbeOnly'):return False
        if defaults['responses'].get('Pawn',2)!=2:return False
        pawn=table.get('Profile_Capsule')
        if pawn and pawn['responses'].get(defaults['object'],2)!=2:return False
    elif profile not in (None,0,'None','Custom','BlockAll','BlockAllDynamic'):
        raise ValueError('Unknown collision profile '+str(profile))
    named=body.get('CollisionResponses',{}).get('named',[])
    channels=body.get('CollisionResponses',{}).get('channels')
    if channels and channels[2]!=2:return False
    for row in named:
        if row.get(0)=='Pawn' and row.get(1)!=2:return False
    return True


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--region',type=Path,default=ROOT/'build/offline-navigation/route-001')
    parser.add_argument('--scenario',choices=['intact','current-save','base'],default='intact')
    parser.add_argument('--actor-states',type=Path)
    args=parser.parse_args();folder=args.region
    inventory=json.loads((folder/'inventory.json').read_text(encoding='utf-8'))
    reader=Reader();classes=native_classes();assets=Assets(reader,classes,ROOT/'build/offline-navigation/assets')
    snapshot=None
    if args.scenario=='current-save':
        from pbz_save_state import Save
        snapshot=Save().navigation_snapshot(inventory['case']['worldPackage'].split('/')[-1])
    explicit=json.loads(args.actor_states.read_text(encoding='utf-8')) if args.actor_states else None
    if explicit and (explicit.get('schema')!=1 or explicit.get('world')!=inventory['case']['worldPackage'].split('/')[-1]):raise ValueError('Explicit actor conditions do not match region')
    state=CollisionState(assets,inventory['case']['worldPackage'].split('/')[-1],args.scenario,snapshot,explicit)
    return reconstruct(inventory,folder,assets,state,profiles(),classes,args.scenario,snapshot,explicit)


def reconstruct(inventory,folder,assets,state,table,classes,scenario='base',snapshot=None,explicit=None,sink=None,cells=None):
    """Decode the same collision rules into an aggregate or a bounded streaming sink."""
    vertices,triangles=read_mesh(folder/'walls.pbzmesh') if sink is None else ([],[])
    sources=[dict(kind='saved-dynamic-wall',**row) for row in inventory['walls']['sources']] if sink is None else []
    failures=[];counts=Counter();body_cache={};spline_cache={};dynamic=[];decode_oodle=oodle_decoder()
    def append(points,faces,source,negative=False):
        if not points or not faces or not overlap(points,inventory['case']['boundsUE']):return
        condition=source.get('condition')
        if sink is not None:
            sink.emit(points,faces,source,negative)
            if condition and condition['omitInScenario']:counts['savedStateCollisionOmitted']+=1
            return
        if condition:
            dynamic.append(dict(source={k:v for k,v in source.items() if k!='condition'},condition=condition,
                                vertices=points,triangles=[(a,c,b) for a,b,c in faces] if negative else faces))
            if condition['omitInScenario']:counts['savedStateCollisionOmitted']+=1;return
        offset=len(vertices);vertices.extend(points)
        triangles.extend((a+offset,c+offset,b+offset) if negative else (a+offset,b+offset,c+offset) for a,b,c in faces)
        sources.append(dict(**source,vertices=len(points),triangles=len(faces),firstVertex=offset,firstTriangle=len(triangles)-len(faces)))
    if cells is None:
        cells=[dict(file=inventory['case']['rootCache'],package=inventory['case']['worldPackage'],
                    sha256=inventory['rootSHA256'],cell='persistent-level'),*inventory['inventory']['cells']]
    for n,cell in enumerate(cells):
        p=Package((ROOT/cell['file']).read_bytes(),classes);p.asset_name=cell['package'].casefold();p.asset_sha256=cell['sha256']
        if sink is not None:sink.inspect_package(p,cell)
        for i,e in enumerate(p.exports):
            cls=e['className']
            if cls=='DynamicMeshComponent':
                # Root spline walls were already included by the dedicated
                # wall export. Other saved dynamic meshes belong to the scene.
                actor=p.exports[e['outer']] if e['outer']<len(p.exports) else {}
                if sink is None and cell['cell']=='persistent-level' and actor.get('name','').startswith('BP_SplineWall_C_'):continue
                try:
                    props=assets.component(p,i);body={**props.get('BodyInstance',{})}
                    body.setdefault('CollisionProfileName','NoCollision')
                    if not blocks_player(body,table):counts['dynamicNonBlocking']+=1;continue
                    complexity=props.get('dynamicField3',2);enabled=props.get('dynamicField5',0)
                    meshes=[]
                    if complexity==3 and enabled:
                        ref=props.get('meshObject');target=assets.resolve(p,ref) if ref else None
                        if not target:raise ValueError('Saved dynamic mesh unresolved')
                        dp,di=target;g=dynamic_geometry(dp.payload(di),decode_oodle)
                        meshes=[(g['vertices'],[(a,c,b)for a,b,c in g['triangles']])]
                    else:
                        for shape in props.get('dynamicAggGeom') or []:
                            mesh=simple_mesh(shape)
                            if mesh:meshes.append(mesh)
                    chain=assets.chain(p,i)
                    for points,faces in meshes:
                        append([place(v,chain)for v in points],faces,dict(kind='saved-dynamic-collision',package=cell['package'],export=i,
                               actor=actor.get('name'),sourceSHA256=cell['sha256'],**(dict(navFloorAllowed=False,posePolicy='saved dynamic-parent baseline; live occupancy unresolved') if any(row.get('navFloorAllowed') is False for row in chain) else {})),winding_negative(chain))
                    counts['dynamicDecoded']+=1
                except (ValueError,KeyError,IndexError)as ex:failures.append(dict(package=cell['package'],export=i,type=cls,why=str(ex)))
                continue
            if cls in ('BoxComponent','SphereComponent','CapsuleComponent','BrushComponent'):
                try:
                    props=assets.component(p,i);settings={**props.get('BodyInstance',{})}
                    actor=p.exports[e['outer']] if e['outer']<len(p.exports) else {}
                    if not settings.get('CollisionProfileName'):
                        # Native shape components default to overlap. Blocking
                        # volumes override this in their native actor constructor.
                        settings['CollisionProfileName']='BlockAll' if actor.get('className')=='BlockingVolume' else 'OverlapAllDynamic'
                    if not blocks_player(settings,table):counts['shapeNonBlocking']+=1;continue
                    condition=state.component(p,i)
                    if cls=='BrushComponent':
                        ref=props.get('brushBodySetup')
                        target=assets.resolve(p,ref) if ref else None
                        if not target:raise ValueError('Blocking brush collision body unresolved')
                        bp,bi=target;meshes=collision_meshes(body_setup(bp,bi))
                    else:
                        if cls=='BoxComponent':
                            extent=props.get('boxExtent') or (32,32,32)
                            shape=dict(kind='box',**dict(zip(('X','Y','Z'),(v*2 for v in extent))))
                        elif cls=='SphereComponent':shape=dict(kind='sphere',Radius=props.get('sphereRadius',32))
                        else:
                            radius=props.get('capsuleRadius',22)
                            shape=dict(kind='capsule',Radius=radius,Length=max(0,2*(props.get('capsuleHalfHeight',44)-radius)))
                        mesh=simple_mesh(shape);meshes=[mesh] if mesh else []
                    chain=assets.chain(p,i)
                    if cls in ('SphereComponent','CapsuleComponent'):
                        for link in chain:
                            scale=link.get('scale') or (1,1,1)
                            if max(abs(v) for v in scale)-min(abs(v) for v in scale)>1e-5:
                                raise ValueError('Non-uniform round shape needs native scaling adaptation')
                    for local,faces in meshes:
                        source=dict(kind='primitive-shape',shape=cls,package=cell['package'],export=i,sourceSHA256=cell['sha256'])
                        if any(row.get('navFloorAllowed') is False for row in chain):
                            source.update(navFloorAllowed=False,posePolicy='authored reference baseline; live occupancy unresolved')
                        if condition:source['condition']=condition
                        append([place(v,chain) for v in local],faces,source,winding_negative(chain))
                    counts['shapeDecoded']+=1
                except (ValueError,KeyError,IndexError) as ex:failures.append(dict(package=cell['package'],export=i,type=cls,why=str(ex)))
                continue
            if cls=='FastGeoContainer':
                try:
                    decoded=fastgeo(p,i);counts['fastGeoContainersDecoded']+=1
                    for fi,row in enumerate(decoded['components']):
                        if not row['collisionEnabled']:counts['fastGeoNonBlocking']+=1;continue
                        if not row['useDefaultCollision'] and not blocks_player(row['body'],table):counts['fastGeoNonBlocking']+=1;continue
                        bound=row['bounds'];box_bound=[bound[k]-bound[k+3] for k in range(3)]+[bound[k]+bound[k+3] for k in range(3)]
                        wanted=inventory['case']['boundsUE']
                        if not all(box_bound[k]<=wanted[k+3] and box_bound[k+3]>=wanted[k] for k in range(3)):counts['fastGeoOutside']+=1;continue
                        try:
                            target=assets.resolve(p,row['meshReference'])
                            if target is None:raise ValueError('FastGeo mesh object unresolved')
                            mp,mi=target;bodies=[j for j,b in enumerate(mp.exports) if b['className']=='BodySetup' and b['outer']==mi]
                            if len(bodies)!=1:raise ValueError('FastGeo mesh body not unique')
                            key=(getattr(mp,'asset_name',id(mp)),bodies[0])
                            if key not in body_cache:body_cache[key]=body_setup(mp,bodies[0])
                            body=body_cache[key];defaults={**(body['properties'].get('DefaultInstance') or {})}
                            if isinstance(defaults.get('CollisionProfileName'),tuple):defaults['CollisionProfileName']=mp.names[defaults['CollisionProfileName'][0]]
                            if not blocks_player(defaults if row['useDefaultCollision'] else {**defaults,**row['body']},table):counts['fastGeoNonBlocking']+=1;continue
                            meshes=collision_meshes(body)
                            if not meshes:counts['fastGeoEmptyCollision']+=1;continue
                            world=row['worldTransform'];negative=world[7]*world[8]*world[9]<0
                            for local,faces in meshes:
                                if row['type']=='static':
                                    points=[quaternion_place(v,world) for v in local]
                                    append(points,faces,dict(kind='fastgeo-static',package=cell['package'],export=i,component=fi,
                                           meshPackage=mp.asset_name,sourceSHA256=mp.asset_sha256),negative)
                                else:
                                    lo=[min(v[k] for v in local) for k in range(3)];hi=[max(v[k] for v in local) for k in range(3)]
                                    center=tuple((lo[k]+hi[k])/2 for k in range(3));radius=math.sqrt(sum(((hi[k]-lo[k])/2)**2 for k in range(3)))
                                    for instance,matrix in enumerate(row['instances']):
                                        wc=quaternion_place(instance_place(center,matrix),world)
                                        r=radius*math.sqrt(sum(matrix[j*4+k]**2 for j in range(3) for k in range(3)))*max(abs(v) for v in world[7:])
                                        if not all(wc[k]-r<=wanted[k+3] and wc[k]+r>=wanted[k] for k in range(3)):continue
                                        points=[quaternion_place(instance_place(v,matrix),world) for v in local]
                                        determinant=(matrix[0]*(matrix[5]*matrix[10]-matrix[6]*matrix[9])-matrix[1]*(matrix[4]*matrix[10]-matrix[6]*matrix[8])+matrix[2]*(matrix[4]*matrix[9]-matrix[5]*matrix[8]))
                                        append(points,faces,dict(kind='fastgeo-instance',package=cell['package'],export=i,component=fi,instance=instance,
                                               meshPackage=mp.asset_name,sourceSHA256=mp.asset_sha256),negative!=(determinant<0))
                            counts['fastGeoMeshDecoded']+=1
                        except (ValueError,KeyError,IndexError) as ex:
                            failures.append(dict(package=cell['package'],export=i,component=fi,type='FastGeoMesh',why=str(ex)))
                except (ValueError,KeyError,IndexError) as ex:
                    failures.append(dict(package=cell['package'],export=i,type=cls,why=str(ex)))
                continue
            if cls=='LandscapeHeightfieldCollisionComponent':
                try:
                    data=landscape(p,i);parent=data['properties'].get('parent',0)
                    if parent<=0:raise ValueError('Landscape root parent unresolved')
                    chain=assets.chain(p,parent-1)
                    if any(key in data['properties'] for key in ('location','rotation','scale')):
                        chain=TransformChain([data['properties'],*chain])
                    points=[place(v,chain) for v in data['vertices']]
                    append(points,data['triangles'],dict(kind='cooked-landscape',package=cell['package'],export=i,
                           selectedField=data['selected'],dimensions=data['dimensions'],sourceSHA256=cell['sha256']),winding_negative(chain))
                    counts['landscapeDecoded']+=1
                except (ValueError,KeyError,IndexError) as ex:failures.append(dict(package=cell['package'],export=i,type=cls,why=str(ex)))
                continue
            if cls not in ('StaticMeshComponent','SplineMeshComponent','InstancedStaticMeshComponent'):continue
            try:
                props=assets.component(p,i)
                condition=state.component(p,i)
                if cls=='InstancedStaticMeshComponent' and props.get('instanceField13'):counts['nonBlocking']+=1;continue
                if props.get('BodyInstance') and not blocks_player(props['BodyInstance'],table):counts['nonBlocking']+=1;continue
                if not props.get('_mesh') and not (cls=='SplineMeshComponent' and props.get('splineBodySetup')):counts['emptyMesh']+=1;continue
                target=assets.resolve(p,props['splineBodySetup']) if cls=='SplineMeshComponent' and props.get('splineBodySetup') else assets.resolve(*props['_mesh'])
                if target is None:raise ValueError('Static mesh object unresolved')
                mp,mi=target
                bodies=[mi] if cls=='SplineMeshComponent' and mp.exports[mi]['className']=='BodySetup' else [j for j,row in enumerate(mp.exports) if row['className']=='BodySetup' and row['outer']==mi]
                spline_proof=None
                if cls=='SplineMeshComponent' and mp.exports[mi]['className']!='BodySetup':
                    from pbz_spline_collision import exact_sibling_index,resolve_exact_sibling_body,REVIEWED_MESH_SHA256
                    if mp.asset_sha256!=REVIEWED_MESH_SHA256:raise ValueError('Deformed spline collision body missing for an unreviewed source mesh')
                    spline_key=(p.asset_sha256,mp.asset_sha256)
                    if spline_key not in spline_cache:spline_cache[spline_key]=exact_sibling_index(assets,p,mp.asset_sha256)
                    recovered,spline_proof,_,_=resolve_exact_sibling_body(assets,p,i,spline_cache[spline_key])
                    mp,mi=p,spline_proof['savedBodyExport'];bodies=[mi]
                    body_cache[(mp.asset_name,mi)]=recovered
                if len(bodies)!=1:raise ValueError('Static mesh body setup not unique')
                key=(getattr(mp,'asset_name',id(mp)),bodies[0])
                if key not in body_cache:body_cache[key]=body_setup(mp,bodies[0])
                body=body_cache[key];defaults={**(body['properties'].get('DefaultInstance') or {})}
                if isinstance(defaults.get('CollisionProfileName'),tuple):defaults['CollisionProfileName']=mp.names[defaults['CollisionProfileName'][0]]
                if not blocks_player(defaults if props.get('bUseDefaultCollision') else {**defaults,**props.get('BodyInstance',{})},table):counts['nonBlocking']+=1;continue
                meshes=collision_meshes(body)
                if not meshes:counts['emptyCollision']+=1;continue
                chain=assets.chain(p,i)
                matrices=instances(p,i,props) if cls=='InstancedStaticMeshComponent' else None
                for local,faces in meshes:
                    source=dict(kind='spline-body-collision' if cls=='SplineMeshComponent' else 'instance-body-collision' if matrices is not None else 'static-body-collision',package=cell['package'],export=i,
                                meshPackage=getattr(mp,'asset_name',cell['package']),meshExport=mi,bodyExport=bodies[0],
                                collisionTraceFlag=body['properties'].get('CollisionTraceFlag',0),sourceSHA256=getattr(mp,'asset_sha256',cell['sha256']))
                    if spline_proof:source['exactSplineCollisionReuse']={k:v for k,v in spline_proof.items() if k not in ('equivalenceKey','effectiveBody')}
                    if any(row.get('navFloorAllowed') is False for row in chain):
                        source.update(navFloorAllowed=False,posePolicy='authored/saved dynamic-parent baseline only; live occupancy unresolved')
                    if condition:source['condition']=condition
                    if matrices is None:append([place(v,chain) for v in local],faces,source,winding_negative(chain))
                    else:
                        for instance,matrix in enumerate(matrices):
                            determinant=(matrix[0]*(matrix[5]*matrix[10]-matrix[6]*matrix[9])-matrix[1]*(matrix[4]*matrix[10]-matrix[6]*matrix[8])+matrix[2]*(matrix[4]*matrix[9]-matrix[5]*matrix[8]))
                            append([place(instance_place(v,matrix),chain) for v in local],faces,{**source,'instance':instance},winding_negative(chain)!=(determinant<0))
                counts['staticDecoded']+=1
            except (ValueError,KeyError,IndexError) as ex:
                failures.append(dict(package=cell['package'],export=i,type=cls,why=str(ex)))
        if sink is None and n%100==0:print(n,'cells',len(vertices),'vertices',len(triangles),'triangles',len(failures),'gaps',flush=True)
    pending={key:inventory['inventory']['classes'].get(key,0) for key in ['LakeCollisionComponent','NavModifierComponent']}
    report=dict(schema=1,kind='game-collision-reconstruction',world=inventory['world'],boundsUE=inventory['case']['boundsUE'],
                completeCollisionClaim=False,counts=dict(counts),unresolved=failures,pendingCollisionTypes=pending,sources=sources,
                scenario=scenario,stateSnapshot={k:v for k,v in snapshot.items() if k!='actors'} if snapshot else None,
                conditionalActors=list(state.observations.values()),validatedStateRules=sorted(state.validated),
                explicitConditions=explicit,
                inputs='Installed game collision; no Heybox, atlas faces or player-route positions')
    if sink is not None:return report
    (folder/'conditional-collision.json').write_text(json.dumps(dict(schema=1,scope='Gameplay collision state kept separate from fixed geometry',
          scenario=scenario,meshes=dynamic),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    write_mesh(folder/'collision.pbzmesh',vertices,triangles,provenance=report)
    (folder/'collision-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('RESULT',dict(counts),'vertices',len(vertices),'triangles',len(triangles),'unresolved',len(failures),flush=True)
    print('FAILURE CLASSES',Counter(row['why'] for row in failures).most_common(10),flush=True)


if __name__=='__main__':main()
