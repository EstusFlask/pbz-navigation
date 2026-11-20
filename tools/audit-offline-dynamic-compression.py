"""Replay the legacy equal-size compression shortcut against emitted meshes.

Read-only package/geometry audit. Results never change receipt compatibility.
"""
from pathlib import Path
import argparse
import hashlib
import json
from pbz_zen import Package,native_classes
from pbz_offline_components import Cursor
from pbz_dynamic_mesh import geometry,oodle_decoder

ROOT=Path(__file__).resolve().parents[1]


def audit(folder):
    inventory=json.loads((folder/'inventory.json').read_text(encoding='utf-8'))
    decoder=oodle_decoder();classes=native_classes();rows=[];tested=0;targets_count=0;unresolved=[]
    for cell in inventory['cells']:
        file=folder/'packages'/cell['chunk']/'receipt.json'
        if not file.exists():continue
        receipt=json.loads(file.read_text(encoding='utf-8'))
        targets={r['export'] for r in receipt['sources'] if r['kind']=='saved-dynamic-collision'}
        targets.update(r['export'] for r in receipt['unresolved'] if r.get('type')=='DynamicMeshComponent')
        targets_count+=len(targets)
        if not targets:continue
        cache=folder/'world-root.bin' if cell['cell']=='persistent-level' else ROOT/'build/offline-navigation/cells'/inventory['containerSHA256'][:16]/(cell['chunk']+'.bin')
        raw=cache.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=receipt['inputSHA256']:raise ValueError('Dynamic package input changed')
        package=Package(raw,classes)
        for index in sorted(targets):
            props=Cursor(package.payload(index)).component('DynamicMeshComponent');ref=props.get('meshObject')
            if not ref or ref<0 or package.exports[ref-1]['className']!='DynamicMesh':
                unresolved.append(dict(chunk=cell['chunk'],component=index,why='Own serialized DynamicMesh binding requires review'));continue
            equal=[]
            def legacy(data,size):
                if len(data)==size:equal.append(dict(stored=len(data),raw=size));return data
                return decoder(data,size)
            error=None
            try:geometry(package.payload(ref-1),legacy)
            except (ValueError,OverflowError) as ex:error=str(ex)
            tested+=1
            if equal:
                corrected=geometry(package.payload(ref-1),decoder)
                rows.append(dict(chunk=cell['chunk'],component=index,meshExport=ref-1,inputSHA256=receipt['inputSHA256'],
                                 receiptBuildID=receipt['buildID'],currentReceiptHasErrors=bool(receipt['unresolved']),
                                 equalChunks=equal,legacyError=error,correctedVertices=len(corrected['vertices']),correctedTriangles=len(corrected['triangles'])))
            elif error:unresolved.append(dict(chunk=cell['chunk'],component=index,why=error))
    result=dict(schema=1,world=inventory['world'],containerSHA256=inventory['containerSHA256'],targetComponents=targets_count,
                testedComponents=tested,equalSizeCases=rows,unresolved=unresolved,
                decoderSHA256=hashlib.sha256((ROOT/'tools/pbz_dynamic_mesh.py').read_bytes()).hexdigest(),
                policy='Diagnostic comparison only; review historical receipts and geometry hashes before reusing another decoder build',physicalVerified=False)
    (folder/'dynamic-compression-review.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')
    print(inventory['world'],tested,'/',targets_count,'components;',len(rows),'equal-size cases;',len(unresolved),'unresolved',flush=True)
    return bool(unresolved)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world',type=Path,help='Absent means all inventoried worlds')
    args=parser.parse_args()
    folders=[args.world.resolve()] if args.world else sorted(p for p in (ROOT/'build/offline-navigation/worlds').iterdir() if p.is_dir() and (p/'inventory.json').exists())
    failed=False
    for folder in folders:
        if not folder.is_relative_to(ROOT/'build'):raise ValueError('Private audit must remain in build/')
        failed=audit(folder) or failed
    if failed:raise SystemExit(1)


if __name__=='__main__':main()
