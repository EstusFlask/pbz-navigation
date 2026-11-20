"""Read-only cooked cell/data-layer audit, separate from geometry extraction.

Wire order is pinned to the PBZ UHT metadata and full payload boundaries, with
the source comparison recorded in OFFLINE-COLLISION-FORMAT-NOTES.md.
"""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import os
from pbz_zen import Package,native_classes
from pbz_offline_components import Cursor
from pbz_offline_assets import Assets
from pbz_game_packages import Reader

ROOT=Path(__file__).resolve().parents[1]


def name(p,value):
    index,number=value
    if index>=len(p.names):raise ValueError('Data-layer name outside package table')
    return p.names[index]+('_'+str(number-1) if number else '')


def finish(c):
    if c.boolean():c.skip(16)
    if c.at!=len(c.data):raise ValueError('Unconsumed cooked object bytes: '+str(len(c.data)-c.at))


def cell_properties(p,index):
    c=Cursor(p.payload(index));fields,zeros=c.header();out={}
    labels=['levelStreaming','alwaysLoaded','spatiallyLoaded','dataLayers','clientOnlyVisible','hlod','customHlodPlaceholder',
            'blockOnSlowLoading','contentBundleID','debugColor','cellGuid','sourceCellGuid','runtimeCellData']
    for field in fields:
        if field>=len(labels):raise ValueError('Unsupported runtime cell slot '+str(field))
        key=labels[field]
        if field in zeros:out[key]=[] if field==3 else 0;continue
        if field in (0,12):value=c.read('i')
        elif field in (1,2,4,5,6,7):value=c.read('B')
        elif field in (8,10,11):value=c.read('16s').hex()
        elif field==9:value=c.read('4f')
        else:
            sf,sz=c.header();value=[];external=False
            for slot in sf:
                if slot in sz:continue
                if slot==0:external=bool(c.read('B'))
                elif slot==1:value=[name(p,c.read('2I')) for _ in range(c.count(10000))]
                else:raise ValueError('Unsupported data-layer name struct slot')
            out['firstDataLayerExternal']=external
        out[key]=value
    finish(c)
    # These are zero-initialized flags, not inferred runtime visibility.
    out.setdefault('hlod',False);out.setdefault('dataLayers',[])
    return out


def layer_properties(p,index,assets):
    c=Cursor(p.payload(index));fields,zeros=c.header();out=dict(initialRuntimeState=0,parent=0,children=[])
    for field in fields:
        if field in zeros:continue
        if field==0:
            target=assets.resolve(p,c.read('i'))
            if not target:raise ValueError('Data-layer asset unresolved')
            ap,ai=target;out['assetPackage']=ap.asset_name;out['assetExport']=ai;out['assetSHA256']=ap.asset_sha256
        elif field==1:out['initialRuntimeState']=c.read('B')
        elif field==2:out['parent']=c.read('i')
        elif field==3:out['children']=c.array('i')
        else:raise ValueError('Unsupported data-layer instance slot '+str(field))
    finish(c)
    if out['initialRuntimeState'] not in (0,1,2):raise ValueError('Unknown data-layer initial state')
    out['initialStateWasSerialized']=1 in fields
    return out


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world',type=Path,default=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp')
    args=parser.parse_args();folder=args.world.resolve()
    if not folder.is_relative_to(ROOT/'build'):raise ValueError('Output must stay in private build/')
    inventory=json.loads((folder/'inventory.json').read_text(encoding='utf-8'))
    p=Package((folder/'world-root.bin').read_bytes(),native_classes());p.asset_name=inventory['worldPackage'].lower()
    if hashlib.sha256(p.data).hexdigest()!=inventory['rootSHA256']:raise ValueError('World root hash differs')
    assets=Assets(Reader(),native_classes(),ROOT/'build/offline-navigation/assets')
    cells=[];layers=[];failures=[]
    for i,e in enumerate(p.exports):
        try:
            if e['className']=='WorldPartitionRuntimeLevelStreamingCell':
                cells.append(dict(cell=e['name'],export=i,payloadSHA256=hashlib.sha256(p.payload(i)).hexdigest(),**cell_properties(p,i)))
            elif e['className']=='DataLayerInstanceWithAsset':
                layers.append(dict(name=e['name'],export=i,payloadSHA256=hashlib.sha256(p.payload(i)).hexdigest(),**layer_properties(p,i,assets)))
        except (ValueError,KeyError,IndexError) as ex:failures.append(dict(export=i,type=e['className'],why=str(ex)))
    names={r['name'] for r in layers};missing=sorted({n for c in cells for n in c['dataLayers']} - names)
    counts=Counter(n for c in cells for n in c['dataLayers'])
    layer_exports={r['export']+1:r['name'] for r in layers}
    for layer in layers:
        layer['referencedByCells']=counts[layer['name']]
        if layer['parent'] and layer['parent'] not in layer_exports:failures.append(dict(export=layer['export'],why='Layer parent not a decoded instance'))
        layer['parentName']=layer_exports.get(layer['parent'])
    report=dict(schema=1,world=inventory['world'],rootSHA256=inventory['rootSHA256'],cells=cells,layers=layers,failures=failures,
                missingLayerNames=missing,cellCount=len(cells),layerCount=len(layers),hlodCells=sum(bool(c['hlod']) for c in cells),
                dataLayerCells=sum(bool(c['dataLayers']) for c in cells),
                policy='Geometry extraction retains all cooked layers; activation is not yet applied to experimental tiles',
                liveStateRead=False,completeCollisionClaim=False,physicalVerified=False)
    file=folder/'cell-semantics.json';tmp=file.with_suffix('.tmp');tmp.write_text(json.dumps(report,separators=(',',':')),encoding='utf-8');os.replace(tmp,file)
    print(json.dumps({k:v for k,v in report.items() if k not in ('cells','layers')},indent=2))
    for layer in layers:print(layer['name'],layer.get('assetPackage'),layer['initialRuntimeState'],layer['referencedByCells'])


if __name__=='__main__':main()
