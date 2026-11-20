"""Explicit capability matrix for every native component class in a world ledger."""
from pathlib import Path
import argparse
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world',type=Path,default=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp')
    args=parser.parse_args();folder=args.world.resolve()
    if not folder.is_relative_to(ROOT/'build'):raise ValueError('Output must remain in build/')
    raw=(folder/'coverage.json').read_bytes();coverage=json.loads(raw)
    geometry={'StaticMeshComponent','SplineMeshComponent','InstancedStaticMeshComponent','DynamicMeshComponent','LandscapeHeightfieldCollisionComponent',
              'BoxComponent','SphereComponent','CapsuleComponent','BrushComponent'}
    transform={'SceneComponent','HoudiniAssetComponent','CineCameraComponent','BillboardComponent','LandscapeSplinesComponent','SkeletalMeshComponentBudgeted'}
    rows=[]
    for name,count in sorted(coverage['classes'].items()):
        if not (name.endswith('Component') or name.endswith('ComponentBudgeted')):continue
        capability='collision-geometry-decoded' if name in geometry else 'attachment-transform-only' if name in transform else 'not-collision-audited'
        rows.append(dict(type=name,instances=count,capability=capability))
    report=dict(schema=1,world=coverage['world'],coverageSHA256=hashlib.sha256(raw).hexdigest(),components=rows,
                fastGeo='Decoded separately as FastGeoContainer native records, gated by scene query collision',
                blueprintExports=coverage['classes'].get('<blueprint>',0),blueprintClassAncestryExhaustivelyAudited=False,
                constructionScriptsExecuted=False,completeCollisionClaim=False,physicalVerified=False,
                priorityGaps=['PCGManagedISMComponent and other generated component ancestry','skeletal/GeometryCollection physical bodies and motion',
                              'data-layer activation and HLOD collision policy','NavModifier areas and water movement',
                              'CanCharacterStepUpOn and destructible/moving lifecycles'])
    file=folder/'component-coverage.json';file.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('Component classes:',len(rows),'not collision-audited:',sum(r['capability']=='not-collision-audited' for r in rows),
          'blueprint exports:',report['blueprintExports'])
    print('Potential generated ISM:',coverage['classes'].get('PCGManagedISMComponent',0))


if __name__=='__main__':main()
