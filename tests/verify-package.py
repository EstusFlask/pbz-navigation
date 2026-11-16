"""Verify a complete navigation package and, optionally, UE MM ownership rules."""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import re
import subprocess
import zipfile
from collector_fixture import current_fixture
from release_profiles import archive_name, included, build_bytes, lua_build_bytes, BUILD, LUA_BUILD, DEVELOPMENT_FILES

root=Path(__file__).resolve().parents[1]
nav=root/'Quest_Navigation'
parser=argparse.ArgumentParser()
parser.add_argument('--manager-state',type=Path)
parser.add_argument('--flavor',choices=['release','development','all'],default='all')
args=parser.parse_args()
release=json.loads((root/'release/NEXUS-FIELDS.json').read_text(encoding='utf-8'))
lock=json.loads((root/'release/VERSION-LOCK.json').read_text(encoding='utf-8'))
version=str(release['version'])
def version_key(value):
    match=re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(?:-fork\.\d+)?', value)
    assert match, 'invalid release version: '+value
    return tuple(map(int,match.groups()))
assert version == str(lock['currentVersion']), 'release differs from VERSION-LOCK currentVersion'
assert version_key(version) >= version_key(str(lock['minimumVersion'])), 'release below VERSION-LOCK minimumVersion'
assert version_key(version) >= max(map(version_key,lock.get('history',[])),default=(0,0,0)), 'release below VERSION-LOCK history'
archive=root/release['archive']
assert archive == root/'dist'/f'Quest_and_Exploration_Navigation_Fork_{version}.zip', 'archive filename/version mismatch'
scripts='ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/'
streamed=root/'build/streamed-atlas'
stream_state=json.loads((streamed/'manifest.json').read_text(encoding='utf-8'))
documents={'INSTALL-README.md':root/'docs/USER-GUIDE.md','CHANGELOG.md':root/'release/CHANGELOG.md',
    'BELL-ROUTE-AUDIT.md':root/'docs/BELL-ROUTE-AUDIT.md',
    'GAME-TRAVERSAL-AUDIT.md':root/'docs/GAME-TRAVERSAL-AUDIT.md',
    'MOVEMENT-COVERAGE.md':root/'docs/MOVEMENT-COVERAGE.md',
    'MANUAL-ROUTES.md':root/'docs/MANUAL-ROUTES.md',
    'BELL-NETWORK-COVERAGE.md':root/'docs/BELL-NETWORK-COVERAGE.md',
    'ITEM-DESCRIPTION-AUDIT.md':root/'docs/ITEM-DESCRIPTION-AUDIT.md'}
def module_value(name,prefix):
    text=(streamed/name).read_text(encoding='utf-8')
    assert text.startswith(prefix)
    return json.loads(text[len(prefix):].strip().removesuffix(';'))
for name,sha in stream_state['sources'].items():
    assert hashlib.sha256((nav/scripts/name).read_bytes()).hexdigest()==sha,'stale generated atlas: '+name
for world in stream_state['worlds']:
    manifest=module_value(world+'/index.js',"'use strict';module.exports=")
    for ref in [manifest['faces'],*[v for v in manifest['data'].values() if isinstance(v,dict) and 'stream' in v]]:
        digest=hashlib.sha256()
        for i in range(ref['chunks']):
            value=module_value(ref['stream']+'/'+str(i)+'.js',"'use strict';exports.chunk=")
            digest.update(base64.b64decode(value,validate=True))
        assert digest.hexdigest()==ref['sha256'],'changed atlas column '+ref['stream']
subprocess.run(['node',str(root/'tests/verify-stream-atlas.cjs')],check=True)
print('PASS: every streamed column matches original data byte hashes; original source files unchanged')
assert archive.relative_to(root).as_posix()==release['archive']
for flavor in ['release','development'] if args.flavor=='all' else [args.flavor]:
 archive=root/archive_name(version,flavor)
 with zipfile.ZipFile(archive) as z:
    package_documents={**documents}
    if flavor=='development':package_documents['DEVELOPMENT-SURVEYS.md']=root/'docs/DEVELOPMENT-SURVEYS.md'
    names=set(z.namelist())
    assert len(names)==len(z.namelist()), 'duplicate archive paths'
    assert not any(Path(n).suffix.lower() in {'.exe','.com','.scr','.msi'} for n in names), 'executable included in Mod package'
    expected={p.relative_to(nav).as_posix() for p in nav.rglob('*') if p.is_file() and included(p.relative_to(nav).as_posix(),flavor)}
    expected.update(scripts+'PBZRouteStreaming/'+name for name in stream_state['files'])
    assert names==expected|set(package_documents), 'incomplete navigation package'
    assert not any('/mods/pbzmaptracker/' in n.lower() for n in names), 'collector file included'
    assert not any('/mods/pbzmodconfig/' in n.lower() for n in names), 'shared settings framework file included'
    assert not any('PBZRouteMapData/' in n or n.endswith('PBZRouteMapHints.js') or 'HEYBOX' in n.upper() for n in names), 'archived model material included'
    assert 'surfaceDataSHA256' not in json.loads(z.read(BUILD).decode().split('module.exports=',1)[1].strip().removesuffix(';')), 'retired model profile included'
    for development_file in DEVELOPMENT_FILES:
        assert (development_file in names)==(flavor=='development'), 'development flavor boundary broken: '+development_file
    assert z.read(BUILD)==build_bytes(nav,version,flavor), 'build profile mismatch'
    assert z.read(LUA_BUILD)==lua_build_bytes(version,flavor), 'tracker VM build profile mismatch'
    assert not any(n.endswith('PBZRouteSurveyMap.js') for n in names),'superseded survey overlay included'
    assert z.testzip() is None
    version=release['version']
    for name in ['PBZRouteEntry.js','PBZQuestRoute.js']:
        assert ("'"+version+"'") in z.read(scripts+name).decode('utf-8'), 'runtime version mismatch'
    adapter='platform/steam/ue4ss/Mods/PBZQuestRouteCompat/dlls/main.dll'
    assert version.encode('utf-16le') in z.read(adapter), 'native adapter version mismatch'
    assert ("modVersion='"+version+"'") in z.read('platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts/PBZRouteConfig.lua').decode('utf-8'), 'settings provider version mismatch'
    assert not any(n.endswith('PBZQuestRoute-settings.json') for n in names), 'player color settings included in update'
    for name in ['README-en.txt','README-zh.txt','INSTALL-README.md','CHANGELOG.md']:
        assert version in z.read(name).decode('utf-8'), 'documentation version mismatch'
    for name in names:
        if name in (BUILD,LUA_BUILD):continue
        source=package_documents[name] if name in package_documents else streamed/name[len(scripts+'PBZRouteStreaming/'):] if name.startswith(scripts+'PBZRouteStreaming/') else root/'build/legacy-atlas'/Path(name).name if name.startswith(scripts+'PBZRouteChunks/') else nav/name
        assert hashlib.sha256(z.read(name)).digest()==hashlib.sha256(source.read_bytes()).digest(),name
    print(f'PASS: {flavor} complete archive, {len(names)} exact file matches, no collector-owned paths')
    print(f'PASS: archive, runtime, native adapter and documentation versions agree: {version}')
    if args.manager_state:
        mods=json.loads(args.manager_state.read_text(encoding='utf-8'))['mods']
        def key(target,path): return target.casefold(),path.replace('\\','/').casefold()
        entries=set()
        prefix='platform/steam/ue4ss/Mods/'
        for name in names:
            if name.startswith(prefix): entries.add(key('Ue4ssMods',name[len(prefix):]))
            elif name.startswith('ProjectPBZ/'): entries.add(key('InstallRoot',name))
        owners=[]
        for mod in mods:
            overlap=sum(key(f['target'],f['fileName']) in entries for f in mod['files'])
            if overlap:
                owners.append(mod)
                # Exact IsSameMod formula from UE MM v1.6.4 ModManager.cs.
                same=overlap*2>=len(mod['files'])
                print(f"UE MM: {mod['name']}: {overlap}/{len(mod['files'])} existing paths; recognized update={same}")
                assert same
        assert len(owners)==1 and 'Quest' in owners[0]['name'], 'download takes ownership of another mod'
        tracker=next(m for m in mods if m['name']=='Map Collectible Tracker')
        assert not any(key(f['target'],f['fileName']) in entries for f in tracker['files'])
        print(f"PASS: zero package overlap with all {len(tracker['files'])} installed collector paths")
        # Only certify versions exercised by the real Lua integration suite.
        tracker_version=str(tracker.get('version',''))
        if tracker_version=='1.0.14':
            fixture=current_fixture(root)
            original=fixture/'platform/steam/ue4ss/Mods'
            for file in tracker['files']:
                source=original/file['fileName']
                assert hashlib.sha256(source.read_bytes()).hexdigest().casefold()==file['sha256'].casefold(),source
            print(f"PASS: all {len(tracker['files'])} collector source files match the tested original {tracker_version} hashes")
        else:
            print(f"NOTE: collector {tracker_version} is outside the tested fixtures; runtime API checks apply but this version has no certified integration result")
