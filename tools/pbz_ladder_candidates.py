"""Candidate ladder axes from actual cooked mesh component transforms.

These coordinates identify an interaction for loading, never substitute for
the native BottomCollision/TopCollision triggers at runtime. Missing ends,
attachment failures and degenerate axes remain explicit errors.
"""
import math
from pbz_offline_assets import place
from pbz_offline_components import Cursor
def amount_prefix(package,actor):
    # Pinned Blueprint fields UberGraphFrame/PBZActorSave precede the native
    # ladder fields bFold/bTriggered/LadderAmount. Unknown later properties
    # are not scanned. Native constructor defaults LadderAmount to 10.
    c=Cursor(package.payload(actor));fields,zeros=c.header();out=dict(LadderAmount=10,bFold=False,bTriggered=False,bBroken=False,BrokenFrom=0)
    for field in fields:
        if field>6:break
        if field in zeros:value=0
        elif field==0:value=c.small_struct([])
        elif field==1:value=c.read('i')
        elif field in (2,3,5):value=c.read('B')
        elif field in (4,6):value=c.read('i')
        else:raise ValueError('Unreviewed ladder prefix field')
        if field in (2,3,5):
            if value not in (0,1):raise ValueError('Invalid ladder flag')
            out[{2:'bFold',3:'bTriggered',5:'bBroken'}[field]]=bool(value)
        elif field==4:out['LadderAmount']=value
        elif field==6:out['BrokenFrom']=value
    if not 3<=out['LadderAmount']<=10000:raise ValueError('Invalid ladder section amount')
    return out
def extract(package,name,assets):
    actors=[i for i,e in enumerate(package.exports)if e['name']==name]
    if len(actors)!=1:raise ValueError('Ladder actor identity is not unique')
    actor=actors[0];points=[];proof=[];prefix=amount_prefix(package,actor)
    roots=[i for i,e in enumerate(package.exports)if e['outer']==actor and e['name']=='SceneComponent'and e['className']=='SceneComponent']
    if len(roots)!=1:raise ValueError('Missing unique ladder placement root')
    root_chain=assets.chain(package,roots[0]);origin=list(place((0,0,0),root_chain))
    has_bottom=any(e['outer']==actor and e['name']=='BottomLadder'for e in package.exports);has_top=any(e['outer']==actor and e['name']=='TopLadder'for e in package.exports)
    if has_bottom!=has_top:raise ValueError('Missing or ambiguous TopLadder/BottomLadder pair')
    if not has_bottom:
        # Native 0x145fde530 constructs TopLadder at local
        # (LadderAmount - 2) * 50 + 25. The 50/25 constants and typed amount
        # read are independently captured in the construction proof. This is
        # the model axis only, never the native interaction/standing endpoint.
        broken=max(0,min(prefix['BrokenFrom'],prefix['LadderAmount']-2));bottom=broken*50-25 if prefix['bBroken']else 0
        points=[list(place((0,0,bottom),root_chain)),list(place((0,0,(prefix['LadderAmount']-2)*50+25),root_chain))]
        proof.append(dict(nativeConstruction='0x145fde530',sectionCm=50,endCm=25,amount=prefix['LadderAmount'],rootExport=roots[0]))
    for component in ['BottomLadder','TopLadder']:
        if not has_bottom:break
        found=[i for i,e in enumerate(package.exports)if e['outer']==actor and e['name']==component and e['className']=='StaticMeshComponent']
        if len(found)!=1:raise ValueError('Missing or ambiguous '+component)
        i=found[0];chain=assets.chain(package,i);point=place((0,0,0),chain)
        if any(not math.isfinite(v)for v in point)or any(r.get('referencePoseOnly')for r in chain):raise ValueError('Ladder endpoint has unsupported transform state')
        points.append(list(point));proof.append(dict(name=component,export=i,world=list(point)))
    if points[1][2]-points[0][2]<100 or math.dist(points[0][:2],points[1][:2])>100:raise ValueError('Cooked ladder mesh axis is not a valid vertical candidate')
    return dict(guid=name,kind='ladder',both=True,fold=True,classPath='/Game/RenewalContent/Actors/SpecialMove/Volume/BP_SpecialMove_ClimLadder.BP_SpecialMove_ClimLadder_C',path=points,origin=origin,requiresLoaded=True,requiresLiveEndpoints=True,endpointSource='cooked-ladder-mesh-axis',source='game-placement',componentEvidence=proof,constructionParameters=prefix,nativeTriggersCertified=False)
