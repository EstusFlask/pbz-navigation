"""Stage an unreleased complete Mod tree with explicitly selected paged worlds.

No installation or release ZIP mutation. Only manifest-referenced public data
is copied; private validation routes and frozen actor states cannot enter it.
"""
from pathlib import Path
from collections import OrderedDict
import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile
from offline_packed import PackedReader,packed_paths

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from release_profiles import included,build_bytes,lua_build_bytes,BUILD,LUA_BUILD,SCRIPTS


OVERLAY_GROUPS=('PBZRouteActionCorridors','PBZRouteMovementData','PBZRouteMovementCorridors')


def select_overlays(data,overlays,catalog):
    """Select only compatible, manifest-owned runtime files from a private build."""
    if not overlays.is_relative_to(ROOT/'build/offline-navigation'):
        raise ValueError('Navigation overlays must come from a private offline-navigation build')
    selected={}
    for world,descriptor in catalog['worlds'].items():
        if descriptor['index']!=world+'/index.json' or not world.replace('_','').isalnum():
            raise ValueError('Invalid staged world path')
        raw=(data/world/'index.json').read_bytes()
        navigation=json.loads(raw)
        if navigation['world']!=world or navigation['sourceIndexSHA256']!=descriptor['sourceIndexSHA256']:
            raise ValueError('Overlay navigation catalog differs for '+world)
        grids={row['id']:row['sourceIndexSHA256'] for row in navigation.get('grids',[])}
        action,movement,corridor=(overlays/name for name in OVERLAY_GROUPS)
        action_file=action/(world+'.js')
        movement_file=movement/world/'index.js'
        corridor_file=corridor/world/'index.json'
        movement_raw=movement_file.read_bytes()
        manifests=[]
        for file,payload in ((action_file,action_file.read_bytes()),(movement_file,movement_raw),(corridor_file,corridor_file.read_bytes())):
            if file.suffix=='.js':
                prefix="'use strict';\nexports.data="
                text=payload.decode('utf-8').replace('\r\n','\n').strip()
                if not text.startswith(prefix) or not text.endswith(';'):
                    raise ValueError('Invalid staged overlay module: '+file.name)
                payload=text[len(prefix):-1]
            manifest=json.loads(payload)
            if manifest['world']!=world or manifest['sourceIndexSHA256']!=navigation['sourceIndexSHA256']:
                raise ValueError('Overlay world build differs for '+world)
            manifests.append(manifest)
        placed,field,corridors=manifests
        if placed['schema']!=1 or field['kind']!='spatial-geometry-movement-proposals' or corridors['kind']!='paged-geometry-movement-corridors':
            raise ValueError('Invalid staged overlay kinds for '+world)
        grid=field.get('navigationGrid')
        if any(value.get('navigationGrid')!=grid for value in manifests):
            raise ValueError('Overlay grid identity differs for '+world)
        grid_source=grids.get(grid) if grids else navigation['sourceIndexSHA256'] if grid is None else None
        if not grid_source or any(value.get('sourceGridIndexSHA256') not in (None,grid_source) for value in manifests):
            raise ValueError('Overlay grid build differs for '+world)
        if (corridors['movementManifestSHA256']!=hashlib.sha256(movement_raw).hexdigest()
            or corridors['navigationManifestSHA256']!=hashlib.sha256(raw).hexdigest()):
            raise ValueError('Overlay movement and navigation manifests do not match for '+world)
        for file in (action_file,movement_file,corridor_file):
            selected[SCRIPTS+file.relative_to(overlays).as_posix()]=file
        for file,manifest in ((movement_file,field),(corridor_file,corridors)):
            reader=PackedReader(file.parent,manifest)
            for i in range(manifest['storage']['records']):
                reader.record(i)
            for name in packed_paths(manifest)[1:]:
                part=file.parent/name
                selected[SCRIPTS+part.relative_to(overlays).as_posix()]=part
    return selected


def stage(data,output,overlays=None):
    if not output.resolve().is_relative_to(ROOT/'build/offline-navigation'):
        raise ValueError('Unreleased integration staging must stay in private build/offline-navigation/')
    if output.exists():
        raise ValueError('Choose a fresh staging directory; do not mix old worlds with a new catalog')
    catalog_bytes=(data/'catalog.json').read_bytes();catalog=json.loads(catalog_bytes)
    if catalog.get('schema')!=1:raise ValueError('Unsupported paged catalog')
    selected=select_overlays(data,overlays,catalog) if overlays else {}
    runtime=ROOT/'build/offline-navigation/runtime'
    manifest_file=runtime/'manifest.json'
    compiled=json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    if not compiled.get('sources') or any(hashlib.sha256((ROOT/'offline-navigation'/name).read_bytes()).hexdigest()!=identity for name,identity in compiled['sources'].items()):
        subprocess.run(['node',str(ROOT/'offline-navigation/build-runtime.mjs')],cwd=ROOT,check=True)
        compiled=json.loads(manifest_file.read_text())
    if hashlib.sha256((runtime/'PBZRecastRuntime.js').read_bytes()).hexdigest()!=compiled['sha256']:
        raise ValueError('Generated plain-JS runtime differs from its build manifest')
    source=ROOT/'Quest_Navigation'
    version=json.loads((ROOT/'release/VERSION-LOCK.json').read_text())['currentVersion']
    files={}
    def copy(file,relative,link=False):
        target=(output/relative).resolve()
        if not target.is_relative_to(output.resolve()) or file.suffix.lower() in ('.exe','.com','.scr','.msi'):
            raise ValueError('Invalid staged file')
        if any(part in '/'+relative.lower() for part in ('/mods/pbzmaptracker/','/mods/pbzmodconfig/')):raise ValueError('Other-Mod-owned path')
        target.parent.mkdir(parents=True,exist_ok=True)
        if link:
            try:os.link(file,target)
            except OSError:shutil.copyfile(file,target)
        else:shutil.copyfile(file,target)
        files[relative]=hashlib.sha256(target.read_bytes()).hexdigest()
    for file in source.rglob('*'):
        if file.is_file() and included(file.relative_to(source).as_posix(),'development'):
            relative=file.relative_to(source).as_posix()
            if relative in (BUILD,LUA_BUILD) or relative.startswith(SCRIPTS+'PBZRecastWorlds/'):continue
            if overlays and relative.startswith(tuple(SCRIPTS+name+'/' for name in OVERLAY_GROUPS)):continue
            if relative==SCRIPTS+'PBZRecastRuntime.js':file=ROOT/'build/offline-navigation/runtime/PBZRecastRuntime.js'
            if relative.startswith(SCRIPTS+'PBZRouteChunks/'):file=ROOT/'build/legacy-atlas'/file.name
            copy(file,relative)
    for relative,file in selected.items():copy(file,relative,True)
    for relative,contents in [(BUILD,build_bytes(output,version,'development')),(LUA_BUILD,lua_build_bytes(version,'development'))]:
        target=output/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(contents);files[relative]=hashlib.sha256(contents).hexdigest()
    stream=ROOT/'build/streamed-atlas'
    if not (stream/'manifest.json').exists():raise ValueError('Build the existing streamed atlas first')
    for name in json.loads((stream/'manifest.json').read_text())['files']:copy(stream/name,SCRIPTS+'PBZRouteStreaming/'+name,True)
    def copy_world(folder,prefix,manifest,world):
        copy(folder/'index.json',prefix+'index.json',True)
        if manifest.get('kind')=='multi-grid-world':
            if manifest.get('unknownState')!='closed' or not 2<=len(manifest['grids'])<=16:raise ValueError('Invalid staged grid set')
            for grid in manifest['grids']:
                name=grid['id']
                if not name.replace('_','').isalnum() or grid['index']!='grids/'+name+'/index.json':raise ValueError('Invalid staged subgrid path')
                child=folder/'grids'/name;value=json.loads((child/'index.json').read_text())
                if value['world']!=world or value['sourceIndexSHA256']!=grid['sourceIndexSHA256'] or value.get('kind')!='paged-sparse-world':raise ValueError('Staged subgrid differs')
                copy_world(child,prefix+'grids/'+name+'/',value,world)
            return
        packed=PackedReader(folder,manifest)if manifest.get('storage')else None
        blobs={}
        for page in manifest['pages']:
            name='pages/'+str(page['id'])+'.json';record=json.loads(packed.text('page',page['id'])if packed else(folder/name).read_text(encoding='utf-8'));blobs.update(record['blobs'])
            if not packed:copy(folder/name,prefix+name,True)
        packet_cache=OrderedDict()
        packet_count=manifest.get('packetCount',len(manifest.get('packets',[])))
        packet_hashes=manifest.get('packets')
        hashes_file=folder/'packet-hashes.json'
        if manifest.get('blobLayout')=='packets-v1' and hashes_file.exists():
            checksums=json.loads(hashes_file.read_text())
            if checksums['world']!=world or checksums['sourceIndexSHA256']!=manifest['sourceIndexSHA256'] or len(checksums['packets'])!=packet_count:
                raise ValueError('Private packet checksum evidence differs')
            packet_hashes=checksums['packets']
        def packet_bytes(packet):
            if not isinstance(packet,int) or not 0<=packet<packet_count:raise ValueError('Invalid staged packet identity')
            if packet not in packet_cache:
                if packed:raw=packed.packet(packet)
                else:
                    encoded=(folder/'packets'/(str(packet)+'.txt')).read_bytes()
                    if packet_hashes and hashlib.sha256(encoded).hexdigest()!=packet_hashes[packet]['sha256']:raise ValueError('Staged packet hash differs')
                    raw=base64.b64decode(encoded,validate=True)
                expected=packet_hashes[packet]['bytes'] if packet_hashes else manifest['lastPacketBytes'] if packet==packet_count-1 else manifest['chunkBytes']
                if len(raw)!=expected or len(raw)>manifest['chunkBytes']:raise ValueError('Staged packet size differs')
                packet_cache[packet]=raw
            raw=packet_cache.pop(packet);packet_cache[packet]=raw
            while len(packet_cache)>64:packet_cache.popitem(last=False)
            return raw
        for identity,blob in blobs.items():
            if len(identity)!=64 or any(c not in '0123456789abcdef' for c in identity):raise ValueError('Invalid staged blob identity')
            digest=hashlib.sha256();size=0
            if manifest.get('blobLayout')=='packets-v1':
                for packet,offset,length in blob['parts']:
                    raw=packet_bytes(packet)
                    if offset<0 or length<=0 or offset+length>len(raw):raise ValueError('Invalid staged packet span')
                    digest.update(raw[offset:offset+length]);size+=length
                if digest.hexdigest()!=identity or size!=blob['bytes']:raise ValueError('Staged packet blob differs')
                continue
            for part in range(blob['chunks']):
                name='blobs/'+identity[:2]+'/'+identity+'/'+str(part)+'.txt';encoded=(folder/name).read_bytes();chunk=base64.b64decode(encoded,validate=True)
                if len(chunk)>manifest['chunkBytes']:raise ValueError('Oversized staged chunk')
                digest.update(chunk);size+=len(chunk);copy(folder/name,prefix+name,True)
            if digest.hexdigest()!=identity or size!=blob['bytes']:raise ValueError('Staged world blob differs')
        if manifest.get('blobLayout')=='packets-v1':
            for packet in range(packet_count):
                packet_bytes(packet)
                if not packed:name='packets/'+str(packet)+'.txt';copy(folder/name,prefix+name,True)
        graph=manifest.get('corridors')
        if graph:
            for page in range((graph['nodes']+graph['pageNodes']-1)//graph['pageNodes']):
                if packed:
                    value=json.loads(packed.text('corridor',page))
                    if value['world']!=world or value['first']!=page*graph['pageNodes']:raise ValueError('Packed corridor identity differs')
                else:name='corridors/'+str(page)+'.json';copy(folder/name,prefix+name,True)
        if packed:
            proof=json.loads((folder/'compression-proof.json').read_bytes())
            for name in packed_paths(manifest):
                if name=='index.json':continue
                copy(folder/name,prefix+name,True)
                if files[prefix+name]!=proof['files'][name]['sha256']:raise ValueError('Compressed source changed after roundtrip verification')

    for world,descriptor in catalog['worlds'].items():
        if descriptor['index']!=world+'/index.json' or not world.replace('_','').isalnum():raise ValueError('Invalid staged world path')
        folder=data/world;manifest=json.loads((folder/'index.json').read_text(encoding='utf-8'))
        if manifest['world']!=world or manifest['sourceIndexSHA256']!=descriptor['sourceIndexSHA256']:raise ValueError('World catalog differs')
        copy_world(folder,SCRIPTS+'PBZRecastWorlds/'+world+'/',manifest,world)
    catalog_path=SCRIPTS+'PBZRecastWorlds/catalog.json'
    (output/catalog_path).write_bytes(catalog_bytes);files[catalog_path]=hashlib.sha256(catalog_bytes).hexdigest()
    notice=('离线世界导航开发快照；尚未完成全图规则及本轮实机验收，不是新的版本发布。\n'
            'Offline-world integration development snapshot; full-world rules and live acceptance remain incomplete. This is not a versioned release.\n'
            'World data: '+', '.join(catalog['worlds'])+'\n').encode('utf-8')
    notice_name='UNRELEASED-WORLD-INTEGRATION.txt';(output/notice_name).write_bytes(notice);files[notice_name]=hashlib.sha256(notice).hexdigest()
    # This evidence stays outside the install tree and is never a release claim.
    report=dict(schema=1,version=version,kind='unreleased-world-integration',worlds=list(catalog['worlds']),files=files,overlaysVerified=bool(overlays),
                installed=False,physicalVerified=False,completeCollisionClaim=False,
                note='Development snapshot, not a versioned release. Original dist archives retained. Private route/state evidence excluded.')
    output.with_name(output.name+'.receipt.json').write_text(json.dumps(report,separators=(',',':')),encoding='utf-8')
    print('STAGED',len(files),'files;',len(catalog['worlds']),'paged worlds;',output,flush=True)
    return report


def archive_stage(output,file,report):
    if not file.is_relative_to(ROOT/'build/offline-navigation') or file.is_relative_to(output) or file.suffix.lower()!='.zip' or file.exists():
        raise ValueError('Choose a fresh private ZIP outside the staged install tree')
    file.parent.mkdir(parents=True,exist_ok=True);temporary=file.with_suffix('.tmp.zip')
    with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
        for name,expected in sorted(report['files'].items()):
            digest=hashlib.sha256()
            with (output/name).open('rb') as source,archive.open(name,'w',force_zip64=True) as target:
                while chunk:=source.read(256*1024):digest.update(chunk);target.write(chunk)
            if digest.hexdigest()!=expected:raise ValueError('Staged source changed while archiving: '+name)
    with zipfile.ZipFile(temporary) as archive:
        if set(archive.namelist())!=set(report['files']) or len(archive.namelist())!=len(report['files']) or archive.testzip() is not None:
            raise ValueError('Unreleased integration ZIP failed exact-file/CRC checks')
    os.replace(temporary,file)
    with file.open('rb') as stream:identity=hashlib.file_digest(stream,'sha256').hexdigest()
    report['archive']=dict(file=file.relative_to(ROOT).as_posix(),bytes=file.stat().st_size,sha256=identity)
    output.with_name(output.name+'.receipt.json').write_text(json.dumps(report,separators=(',',':')),encoding='utf-8')
    print('ARCHIVED unreleased development snapshot',file,identity,flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',type=Path,default=ROOT/'build/offline-navigation/mod-worlds')
    parser.add_argument('--output',type=Path,default=ROOT/'build/offline-navigation/integration-mod')
    parser.add_argument('--archive',type=Path,help='Optional fresh private development ZIP; never dist/')
    parser.add_argument('--overlays',type=Path,help='Private build containing matching action and movement directories')
    args=parser.parse_args();report=stage(args.data.resolve(),args.output.resolve(),args.overlays.resolve() if args.overlays else None)
    if args.archive:archive_stage(args.output.resolve(),args.archive.resolve(),report)


if __name__=='__main__':main()
