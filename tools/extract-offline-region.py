"""Index regional WP cells and extract saved wall collision without the game."""
from pathlib import Path
import argparse
from collections import Counter
import hashlib
import json
import re
from pbz_game_packages import Reader
from pbz_zen import Package,native_classes
from pbz_offline_components import Cursor,transform
from pbz_dynamic_mesh import geometry,oodle_decoder
from pbz_offline_mesh import write_mesh,combine

ROOT=Path(__file__).resolve().parents[1]


def intersects(a,b):
    return all(a[k]<=b[k+3] and a[k+3]>=b[k] for k in range(3))


def asset_index():
    entries={}
    for line in (ROOT/'build/game-files.txt').read_text().splitlines():
        _,chunk,kind,path=line.split(None,3)
        if kind!='ExportBundleData':continue
        marker='../../../ProjectPBZ/Content'
        if path.startswith(marker):
            entries['/Game'+path[len(marker):].rsplit('.',1)[0]]=dict(chunk=chunk,path=path)
    return entries


def inventory(root,settings,index,reader,classes,folder):
    selected=[];unknown=[];stats=Counter();packages=[];unbounded=[];persistent=[]
    for i,e in enumerate(root.exports):
        if e['className']!='WorldPartitionRuntimeCellDataHashSet':continue
        try:
            c=Cursor(root.payload(i));fields,zeros=c.header()
            cell=root.exports[e['outer']]['name']
            if not re.fullmatch('[A-Z0-9]{25}',cell):raise ValueError('unexpected cell name')
            path=settings['worldPackage']+'/_Generated_/'+cell
            entry=index.get(path)
            bounds=None
            if 0 in fields and 0 not in zeros:
                valid,*value=c.read('B6d')
                if valid:bounds=value
            if bounds is not None and not intersects(bounds,settings['boundsUE']):continue
            if entry is None:
                # Cook moves always-loaded actors into PersistentLevel and
                # leaves an empty runtime cell without a generated package.
                ci=e['outer'];cc=Cursor(root.payload(ci));cf,cz=cc.header()
                if cf!=[1,9,10,12] or cz or cc.read('B')!=1:raise ValueError('Unaccounted cell package')
                cc.read('4f');cc.read('16s');data_ref=cc.read('i')
                if data_ref!=i+1 or cc.read('I')!=0 or cc.at!=len(cc.data):raise ValueError('Invalid always-loaded cell payload')
                if root.exports[ci]['className']!='WorldPartitionRuntimeLevelStreamingCell':raise ValueError('Unexpected always-loaded cell type')
                persistent.append(dict(cell=cell,export=ci,dataExport=i,reason='always-loaded actors cooked into PersistentLevel'))
                continue
            if bounds is None:unbounded.append(cell)
            selected.append(dict(cell=cell,package=path,boundsUE=bounds,unbounded=bounds is None,**entry))
        except (ValueError,KeyError) as ex:
            unknown.append(dict(export=i,why=str(ex)))
    for n,row in enumerate(selected):
        cache_key=hashlib.sha256(reader.toc).hexdigest()[:16]
        file=folder/'cells'/cache_key/(row['chunk']+'.bin')
        file.parent.mkdir(parents=True,exist_ok=True)
        if not file.exists():file.write_bytes(reader.read(row['chunk']))
        try:
            data=file.read_bytes();p=Package(data,classes)
            counts=Counter(e['className'] or 'blueprint' for e in p.exports)
            stats.update(counts)
            packages.append(dict(**row,file=file.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(data).hexdigest(),exports=len(p.exports),classes=dict(counts)))
        except (ValueError,IndexError) as ex:
            packages.append(dict(**row,file=file.relative_to(ROOT).as_posix(),error=str(ex)))
        if n%100==0:print('Indexed',n,'/',len(selected),'regional cells',flush=True)
    return dict(cells=packages,unknownCellBounds=unknown,unboundedCellsIncluded=unbounded,persistentLevelCells=persistent,
                classes=dict(stats),containerSHA256=hashlib.sha256(reader.toc).hexdigest())


def walls(root,settings,folder,template):
    decompress=oodle_decoder();meshes=[];sources=[];failures=[]
    for i,e in enumerate(root.exports):
        if e['className']!='DynamicMesh':continue
        component=root.exports[e['outer']];actor=root.exports[component['outer']]
        if not actor['name'].startswith('BP_SplineWall_C_'):continue
        try:
            g=geometry(root.payload(i),decompress)
            props=Cursor(root.payload(e['outer'])).component('DynamicMeshComponent')
            if props.get('parent',0):raise ValueError('Wall has unresolved parent transform')
            if props.get('meshObject')!=i+1:raise ValueError('Wall mesh reference differs')
            # The template's CTF_UseComplexAsSimple and complex-enable flags are
            # read from the package, not inferred from the object's name.
            if props.get('dynamicField3',template['dynamicField3'])!=3 or props.get('dynamicField5',template['dynamicField5'])!=1:
                raise ValueError('Unsupported wall collision complexity')
            vertices=[transform(p,props.get('location',(0,0,0)),props.get('rotation',(0,0,0)),props.get('scale',(1,1,1))) for p in g['vertices']]
            if not vertices:continue
            bounds=[min(p[k] for p in vertices) for k in range(3)]+[max(p[k] for p in vertices) for k in range(3)]
            if not intersects(bounds,settings['boundsUE']):continue
            # DynamicMesh has modeling winding, unlike cooked Chaos. Reflect
            # negative instance scale to retain the same geometric normals.
            negative=props.get('scale',(1,1,1))[0]*props.get('scale',(1,1,1))[1]*props.get('scale',(1,1,1))[2]<0
            # Engine DynamicMesh collision cooking flips its modeling winding.
            # Cooked Chaos indices already have this operation applied.
            triangles=[(t[0],t[2],t[1]) if not negative else t for t in g['triangles']]
            meshes.append((vertices,triangles))
            sources.append(dict(actor=actor['name'],meshExport=i,componentExport=e['outer'],boundsUE=bounds,
                                vertices=len(vertices),triangles=len(triangles),transform=props,
                                geometryPrefixBytes=g['geometryPrefixBytes'],attributeBytesNotRequiredForCollision=g['undecodedAttributeBytes']))
        except (ValueError,IndexError,KeyError) as ex:
            failures.append(dict(export=i,actor=actor['name'],why=str(ex)))
    if meshes:
        vertices,triangles=combine(meshes)
        write_mesh(folder/'walls.pbzmesh',vertices,triangles,
                   provenance=dict(kind='game-collision-subset',world=settings['world'],completeCollisionClaim=False,
                                   missingGeometry=['ordinary scene colliders and terrain not included in this wall-only asset'],sources=sources))
    return dict(sources=sources,failures=failures)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--case',type=Path,default=ROOT/'authoring/offline-route-001.json')
    parser.add_argument('--output',type=Path,default=ROOT/'build/offline-navigation/route-001')
    parser.add_argument('--walls-only',action='store_true')
    args=parser.parse_args();settings=json.loads(args.case.read_text());folder=args.output
    if not folder.resolve().is_relative_to(ROOT):raise ValueError('Output must be inside workspace')
    folder.mkdir(parents=True,exist_ok=True);classes=native_classes();reader=Reader();index=asset_index()
    root_entry=next((value for name,value in index.items() if name.casefold()==settings['worldPackage'].casefold()),None)
    if not root_entry:raise ValueError('World root absent from reviewed asset index')
    current_root=reader.read(root_entry['chunk']);cached=ROOT/settings['rootCache']
    if not cached.exists() or cached.read_bytes()!=current_root:
        cached=folder/'world-root.bin';cached.write_bytes(current_root);settings['rootCache']=cached.relative_to(ROOT).as_posix()
    root=Package(current_root,classes)
    template_entry=index['/Game/PBZContent/Blueprint/PCG/InvisibleWall/BP_SplineWall']
    t=Package(reader.read(template_entry['chunk']),classes)
    ti=next(i for i,e in enumerate(t.exports) if e['className']=='DynamicMeshComponent')
    template=Cursor(t.payload(ti)).component('DynamicMeshComponent')
    profile=template['BodyInstance']['CollisionProfileName']
    profile_name=t.names[profile[0]]
    if profile_name!='Profile_LA_InvisibleWall':raise ValueError('Unexpected wall collision profile')
    report=dict(schema=1,world=settings['world'],case=settings,rootSHA256=hashlib.sha256(root.data).hexdigest(),
                backend='JS/WASM Recast/Detour; no custom executable',wallProfile=profile_name,
                completeCollisionClaim=False,walls=walls(root,settings,folder,template))
    if not args.walls_only:report['inventory']=inventory(root,settings,index,reader,classes,folder)
    elif (folder/'inventory.json').exists():
        previous=json.loads((folder/'inventory.json').read_text(encoding='utf-8'))
        if previous.get('rootSHA256')==report['rootSHA256'] and previous.get('case')==report['case'] and 'inventory'in previous:
            report['inventory']=previous['inventory']
    (folder/'inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Wall meshes',len(report['walls']['sources']),'unresolved walls',len(report['walls']['failures']),flush=True)
    if 'inventory'in report:print('Regional cells',len(report['inventory']['cells']),'classes',report['inventory']['classes'],flush=True)


if __name__=='__main__':main()
