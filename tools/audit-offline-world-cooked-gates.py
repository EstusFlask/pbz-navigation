"""Attribute extracted collision to cooked HLOD/layers and PCG resources.

This proves cooked-input facts only; it does not infer live layer/PCG state.
"""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
from pbz_zen import Package,native_classes
from pbz_fastgeo import fastgeo

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world',type=Path,default=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp')
    args=parser.parse_args();folder=args.world.resolve()
    if not folder.is_relative_to(ROOT/'build'):raise ValueError('Audit evidence must stay in private build/')
    inventory=json.loads((folder/'inventory.json').read_text(encoding='utf-8'))
    semantics_raw=(folder/'cell-semantics.json').read_bytes();semantics=json.loads(semantics_raw)
    if semantics['rootSHA256']!=inventory['rootSHA256'] or semantics['failures'] or semantics['missingLayerNames']:
        raise ValueError('Cooked cell semantics are incomplete or stale')
    cells={r['cell']:r for r in semantics['cells']};layers={r['name']:r for r in semantics['layers']}
    counts=Counter();triangles=Counter();packages=Counter();pcg=[];missing=[];classes=native_classes()
    for cell in inventory['cells']:
        receipt=folder/'packages'/cell['chunk']/'receipt.json'
        if not receipt.exists():missing.append(cell['cell']);continue
        record=json.loads(receipt.read_text(encoding='utf-8'));semantic=cells.get(cell['cell'],{})
        kind='hlod' if semantic.get('hlod') else 'nonHlod'
        counts[kind+'Packages']+=1;counts[kind+'Triangles']+=record['triangles'];counts[kind+'Sources']+=len(record['sources'])
        for name in semantic.get('dataLayers',[]) or ['<none>']:
            triangles[name]+=record['triangles'];packages[name]+=bool(record['triangles'])
        if not record.get('classes',{}).get('PCGManagedISMComponent'):continue
        cache=ROOT/'build/offline-navigation/cells'/inventory['containerSHA256'][:16]/(cell['chunk']+'.bin')
        if cell['cell']=='persistent-level':cache=folder/'world-root.bin'
        raw=cache.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=record['inputSHA256']:raise ValueError('PCG package input differs')
        package=Package(raw,classes);resources=[];components=[]
        for i,e in enumerate(package.exports):
            if e['className']=='PCGManagedISMComponent':
                resources.append(dict(export=i,name=e['name'],payloadSHA256=hashlib.sha256(package.payload(i)).hexdigest()))
            elif e['className']=='FastGeoContainer':
                for row in fastgeo(package,i)['components']:
                    components.append(dict(type=row['type'],queryCollisionEnabled=bool(row['collisionEnabled']),
                                           instances=len(row.get('instances',[]))))
        pcg.append(dict(package=cell['package'],inputSHA256=record['inputSHA256'],resources=resources,
                        fastGeo=components,cookedQueryCollisionCandidates=sum(r['queryCollisionEnabled'] for r in components),
                        managedPayloadFullyDecoded=False))
    report=dict(schema=1,world=inventory['world'],rootSHA256=inventory['rootSHA256'],
                semanticsSHA256=hashlib.sha256(semantics_raw).hexdigest(),missingPackages=missing,counts=dict(counts),
                layerGeometry=[dict(name=n,asset=layers.get(n,{}).get('assetPackage'),initial=layers.get(n,{}).get('initialRuntimeState'),
                                    triangles=t,nonemptyPackages=packages[n]) for n,t in sorted(triangles.items())],
                pcgResources=pcg,pcgSource='https://raw.githubusercontent.com/katataki/UES5.6/6b2c694ab693a2711ff7c1e45e66ced95f8d7de5/Engine/Plugins/PCG/Source/PCG/Public/PCGManagedResource.h',
                scope='Cooked input attribution; managed resources are UObject wrappers, live generation/layer state not inferred',
                completeCollisionClaim=False,physicalVerified=False)
    (folder/'cooked-gates-audit.json').write_text(json.dumps(report,separators=(',',':')),encoding='utf-8')
    print(json.dumps(dict(world=inventory['world'],counts=counts,pcgResources=sum(len(r['resources']) for r in pcg),
                          pcgCookedQueryCollisionCandidates=sum(r['cookedQueryCollisionCandidates'] for r in pcg),missing=len(missing))))


if __name__=='__main__':main()
