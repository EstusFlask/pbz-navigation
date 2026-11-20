"""Resumable full-world collision extraction. Installed game and saves are read-only.

Each package is a transaction, with streaming geometry and a content-hashed receipt.
No world-wide vertex/triangle list is constructed. Outputs are private build evidence.
"""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import importlib.util
import json
import math
import os
import shutil
import struct
import time

from pbz_game_packages import Reader
from pbz_zen import Package,native_classes
from pbz_offline_components import Cursor
from pbz_offline_assets import Assets
from pbz_collision_state import CollisionState

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('collision_builder',ROOT/'tools/build-offline-collision.py')
collision=importlib.util.module_from_spec(spec);spec.loader.exec_module(collision)


def digest(file):
    with Path(file).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def atomic_json(file,value):
    file=Path(file);file.parent.mkdir(parents=True,exist_ok=True)
    tmp=file.with_name(file.name+'.'+str(os.getpid())+'.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    for attempt in range(6):
        try:os.replace(tmp,file);return
        except PermissionError:
            if attempt==5:raise
            time.sleep(.02*(attempt+1))


def fingerprint():
    files=sorted([*ROOT.glob('tools/pbz_*.py'),ROOT/'tools/build-offline-collision.py',Path(__file__),
                  *ROOT.glob('authoring/offline-*.json')])
    return hashlib.sha256(json.dumps([(p.relative_to(ROOT).as_posix(),digest(p)) for p in files]).encode()).hexdigest()


class TrackingAssets(Assets):
    def load(self,name):
        p=super().load(name)
        self.dependencies[p.asset_name]=p.asset_sha256
        # Property values hold Package references; clear them at package boundaries.
        while len(self.cache)>16:self.cache.popitem(last=False)
        return p


class PackageSink:
    def __init__(self,folder):
        self.folder=folder;folder.mkdir(parents=True,exist_ok=True)
        self.vfile=(folder/'vertices.tmp').open('wb');self.tfile=(folder/'triangles.tmp').open('wb')
        self.nv=0;self.nt=0;self.sources=[];self.classes={};self.pending={}
        self.lo=[math.inf]*3;self.hi=[-math.inf]*3

    def inspect_package(self,p,cell):
        self.classes=dict(Counter(e['className'] or '<blueprint>' for e in p.exports))
        supported={'StaticMeshComponent','SplineMeshComponent','InstancedStaticMeshComponent','DynamicMeshComponent',
                   'FastGeoContainer','LandscapeHeightfieldCollisionComponent','BoxComponent','SphereComponent','CapsuleComponent','BrushComponent'}
        # Retain every class count; these are explicit semantic gaps, never evidence of absence.
        self.pending={key:n for key,n in self.classes.items() if key not in supported and
                      ('Collision' in key or 'Skeletal' in key or 'NavModifier' in key or 'ProceduralMesh' in key or
                       'GeometryCollection' in key or 'WaterBody' in key or key=='HierarchicalInstancedStaticMeshComponent')}

    def emit(self,points,faces,source,negative=False):
        for p in points:
            if len(p)!=3 or not all(math.isfinite(v) for v in p):raise ValueError('Non-finite geometry')
        for face in faces:
            if len(face)!=3 or any(not isinstance(i,int) or not 0<=i<len(points) for i in face):raise ValueError('Invalid source index')
        lo=[min(p[k] for p in points) for k in range(3)];hi=[max(p[k] for p in points) for k in range(3)]
        for k in range(3):self.lo[k]=min(self.lo[k],lo[k]);self.hi[k]=max(self.hi[k],hi[k])
        # Serialize one component at a time; geometry is never held for the whole package/world.
        self.vfile.write(b''.join(struct.pack('<3d',*p) for p in points))
        self.tfile.write(b''.join(struct.pack('<3I',*(self.nv+i for i in ((a,c,b) if negative else (a,b,c)))) for a,b,c in faces))
        self.sources.append(dict(**source,firstVertex=self.nv,vertices=len(points),firstTriangle=self.nt,triangles=len(faces),boundsUE=lo+hi))
        self.nv+=len(points);self.nt+=len(faces)

    def finish(self):
        self.vfile.close();self.tfile.close();file=self.folder/'collision.pbzmesh';tmp=file.with_suffix('.tmp')
        with tmp.open('wb') as out:
            out.write(struct.pack('<8sIII',b'PBZCOL01',1,self.nv,self.nt))
            for name in ('vertices.tmp','triangles.tmp'):
                with (self.folder/name).open('rb') as inp:shutil.copyfileobj(inp,out,1024*1024)
        os.replace(tmp,file)
        for name in ('vertices.tmp','triangles.tmp'):(self.folder/name).unlink()
        return dict(meshSHA256=digest(file),vertices=self.nv,triangles=self.nt,boundsUE=self.lo+self.hi if self.nv else None,
                    sources=self.sources,classes=self.classes,pendingCollisionTypes=self.pending)

    def close(self):
        self.vfile.close();self.tfile.close()


def world_inventory(reader,classes,assets,world_package,folder):
    entry=assets.index.get(world_package.casefold())
    if entry is None:raise ValueError('World package absent from installed index')
    raw=reader.read(entry['chunk']);rootfile=folder/'world-root.bin'
    # Concurrent per-world bake/extract orchestration may inventory the same
    # immutable root. Never truncate a file another decoder can be reading.
    if not rootfile.exists() or digest(rootfile)!=hashlib.sha256(raw).hexdigest():
        temporary=rootfile.with_name('world-root.'+str(os.getpid())+'.tmp')
        temporary.write_bytes(raw);os.replace(temporary,rootfile)
    root=Package(raw,classes);rows=[];always=[];failures=[];bounds=[]
    for i,e in enumerate(root.exports):
        if e['className']!='WorldPartitionRuntimeCellDataHashSet':continue
        try:
            c=Cursor(root.payload(i));fields,zeros=c.header();bound=None
            if 0 in fields and 0 not in zeros:
                valid,*value=c.read('B6d')
                if valid:bound=value;bounds.append(value)
            ci=e['outer'];cell=root.exports[ci]['name'];package=world_package+'/_Generated_/'+cell
            cc=Cursor(root.payload(ci));cf,cz=cc.header();target=assets.index.get(package.casefold())
            flags=dict(export=ci,dataExport=i,fields=cf,zeroFields=sorted(cz),
                       payloadSHA256=hashlib.sha256(root.payload(ci)).hexdigest(),
                       dataLayers='serialized-unresolved' if 3 in cf and 3 not in cz else 'no-serialized-override')
            if target is None:
                if cf!=[1,9,10,12] or cz or cc.read('B')!=1:raise ValueError('Unaccounted cell without generated package')
                cc.read('4f');cc.read('16s')
                if cc.read('i')!=i+1 or cc.read('I')!=0 or cc.at!=len(cc.data):raise ValueError('Always-loaded payload differs')
                always.append(dict(cell=cell,**flags,accountedBy='persistent-level'));continue
            rows.append(dict(cell=cell,package=package,boundsUE=bound,**target,**flags))
        except (ValueError,KeyError,IndexError) as ex:failures.append(dict(export=i,why=str(ex)))
    indexed={name for name in assets.index if name.startswith(world_package.casefold()+'/_generated_/')}
    accounted={r['package'].casefold() for r in rows}
    for name in sorted(indexed-accounted):failures.append(dict(package=name,why='Indexed generated package not accounted by runtime cell'))
    rootrow=dict(cell='persistent-level',package=world_package,chunk=entry['chunk'],file=rootfile.relative_to(ROOT).as_posix(),boundsUE=None)
    return dict(schema=1,world=world_package.rsplit('/',1)[-1].lower(),worldPackage=world_package,
                rootSHA256=hashlib.sha256(raw).hexdigest(),containerSHA256=hashlib.sha256(reader.toc).hexdigest(),
                declaredCellBoundsUE=[min(b[k] for b in bounds) for k in range(3)]+[max(b[k+3] for b in bounds) for k in range(3)],
                cells=[rootrow,*rows],persistentLevelCells=always,inventoryFailures=failures,
                completeCollisionClaim=False,physicalVerified=False)


def accepted_builds(folder,build_id):
    file=folder/'compatible-builds.json'
    previous=json.loads(file.read_text(encoding='utf-8')).get('targets',{}).get(build_id,{}) if file.exists() else {}
    return {build_id,*previous.get('sourceBuildIDs',[])}


def summarize(folder,inventory,build_id):
    counts=Counter();classes=Counter();pending=Counter();errors=[];done=0;triangles=0;vertices=0;outdated=0
    accepted=accepted_builds(folder,build_id)
    for cell in inventory['cells']:
        file=folder/'packages'/cell['chunk']/'receipt.json'
        if not file.exists():continue
        r=json.loads(file.read_text(encoding='utf-8'))
        if r.get('buildID') not in accepted or r.get('buildID')!=build_id and r.get('unresolved'):outdated+=1;continue
        done+=1;counts.update(r.get('counts',{}));classes.update(r.get('classes',{}));pending.update(r.get('pendingCollisionTypes',{}))
        triangles+=r.get('triangles',0);vertices+=r.get('vertices',0)
        for error in r.get('unresolved',[]):errors.append({**error,'package':cell['package']})
    result=dict(schema=1,world=inventory['world'],phase='collision-extraction',buildID=build_id,
                compatibleBuildIDs=sorted(accepted),
                totalPackages=len(inventory['cells']),completedPackages=done,remainingPackages=len(inventory['cells'])-done,
                outdatedReceipts=outdated,vertices=vertices,triangles=triangles,counts=dict(counts),classes=dict(classes),
                unresolved=errors,pendingCollisionTypes=dict(pending),inventoryFailures=inventory['inventoryFailures'],
                alwaysLoadedCellsAccounted=len(inventory['persistentLevelCells']),
                dataLayerCells=sum(r.get('dataLayers')=='serialized-unresolved' for r in inventory['cells']),
                completeCollisionClaim=False,physicalVerified=False,
                semanticGaps=['data-layer activation and HLOD policy','runtime-generated collision','skeletal and moving collision',
                              'CanCharacterStepUpOn','NavArea_Fire costs','water traversal','destructible lifecycle'],
                updatedUnix=time.time())
    atomic_json(folder/'coverage.json',result);return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world-package',default='/Game/Maps/B08_09_10/PBZ_Pangzhen_WP')
    parser.add_argument('--output',type=Path,default=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp')
    parser.add_argument('--limit',type=int,help='Maximum packages processed this invocation; absent means all')
    parser.add_argument('--summary-only',action='store_true')
    parser.add_argument('--reuse-successful-build',action='append',default=[],metavar='BUILD_ID',
                        help='Explicit reviewed decoder extension: reuse hash-verified successful receipts from this build')
    parser.add_argument('--compatibility-note',help='Required explanation of why the decoder change cannot affect successful old packages')
    args=parser.parse_args();folder=args.output.resolve()
    if not folder.is_relative_to(ROOT/'build'):raise ValueError('Private world output must remain in workspace build/')
    folder.mkdir(parents=True,exist_ok=True)
    build_id=fingerprint()
    if args.reuse_successful_build:
        if not args.compatibility_note:raise ValueError('Reviewed build reuse requires --compatibility-note')
        file=folder/'compatible-builds.json';ledger=json.loads(file.read_text(encoding='utf-8')) if file.exists() else dict(schema=1,targets={})
        prior=ledger['targets'].get(build_id,{}).get('sourceBuildIDs',[])
        ledger['targets'][build_id]=dict(sourceBuildIDs=sorted(set(prior+args.reuse_successful_build)),note=args.compatibility_note,
                                       builderSHA256=digest(Path(__file__)),decoderSHA256=digest(ROOT/'tools/build-offline-collision.py'),updatedUnix=time.time())
        atomic_json(file,ledger)
    accepted=accepted_builds(folder,build_id)
    if args.summary_only:
        inventory=json.loads((folder/'inventory.json').read_text(encoding='utf-8'))
        print(json.dumps(summarize(folder,inventory,fingerprint()),ensure_ascii=False));return
    reader=Reader();classes=native_classes();assets=TrackingAssets(reader,classes,ROOT/'build/offline-navigation/assets');assets.dependencies={}
    inventory=world_inventory(reader,classes,assets,args.world_package,folder)
    atomic_json(folder/'inventory.json',inventory)
    print('Full-world inventory:',len(inventory['cells']),'packages;',len(inventory['persistentLevelCells']),'always-loaded cells;',len(inventory['inventoryFailures']),'inventory failures',flush=True)
    table=collision.profiles();processed=0;resumed=0;start=time.time()
    try:
        for index,cell in enumerate(inventory['cells']):
            out=folder/'packages'/cell['chunk'];receipt=out/'receipt.json';mesh=out/'collision.pbzmesh'
            cache=ROOT/'build/offline-navigation/cells'/inventory['containerSHA256'][:16]/(cell['chunk']+'.bin')
            if cell['cell']=='persistent-level':cache=folder/'world-root.bin'
            if receipt.exists() and mesh.exists() and cache.exists():
                previous=json.loads(receipt.read_text(encoding='utf-8'))
                compatible=previous.get('buildID') in accepted and not previous.get('unresolved')
                if compatible and previous.get('containerSHA256')==inventory['containerSHA256'] and previous.get('inputSHA256')==digest(cache) and previous.get('meshSHA256')==digest(mesh):
                    resumed+=1;continue
            if args.limit is not None and processed>=args.limit:break
            cache.parent.mkdir(parents=True,exist_ok=True)
            if not cache.exists():cache.write_bytes(reader.read(cell['chunk']))
            cell=dict(cell,file=cache.relative_to(ROOT).as_posix(),sha256=digest(cache))
            assets.props.clear();assets.dependencies={}
            state=CollisionState(assets,args.world_package.rsplit('/',1)[-1],'base')
            sink=PackageSink(out)
            try:
                # No clipping to ContentBounds: unbounded cells and misplaced geometry remain covered.
                local=dict(world=inventory['world'],case=dict(boundsUE=[-1e12]*3+[1e12]*3),inventory=dict(classes={}))
                report=collision.reconstruct(local,out,assets,state,table,classes,sink=sink,cells=[cell])
                geometry=sink.finish()
                record=dict(**geometry,counts=report['counts'],unresolved=report['unresolved'],
                            conditionalActors=report['conditionalActors'],validatedStateRules=report['validatedStateRules'])
            except Exception as ex:
                sink.close()
                # Fatal package errors are recorded. They are retried on the next invocation.
                atomic_json(out/'failure.json',dict(package=cell['package'],inputSHA256=cell['sha256'],why=repr(ex)))
                print('PACKAGE FAILURE',cell['package'],repr(ex),flush=True)
                continue
            record.update(schema=1,buildID=build_id,containerSHA256=inventory['containerSHA256'],package=cell['package'],
                          chunk=cell['chunk'],inputSHA256=cell['sha256'],dependencies=assets.dependencies,
                          completeCollisionClaim=False,physicalVerified=False)
            atomic_json(receipt,record)
            if (out/'failure.json').exists():(out/'failure.json').unlink()
            processed+=1
            if processed%100==0 or index==len(inventory['cells'])-1:
                print('Extracted',index+1,'/',len(inventory['cells']),'packages;',processed,'new;',resumed,'resumed;',round(time.time()-start,1),'seconds',flush=True)
                # Frequent small progress snapshots; the full coverage aggregation is less frequent.
                atomic_json(folder/'progress.json',dict(buildID=build_id,visited=index+1,total=len(inventory['cells']),processed=processed,resumed=resumed,updatedUnix=time.time()))
            if processed%1000==0:summarize(folder,inventory,build_id)
    finally:
        result=summarize(folder,inventory,build_id)
        print('WORLD RESULT',result['completedPackages'],'/',result['totalPackages'],'packages;',result['triangles'],'triangles;',len(result['unresolved']),'recorded failures',flush=True)


if __name__=='__main__':main()
