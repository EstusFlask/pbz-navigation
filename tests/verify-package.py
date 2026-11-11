"""Verify a complete navigation package and, optionally, UE MM ownership rules."""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import subprocess
import zipfile

root=Path(__file__).resolve().parents[1]
nav=root/'Quest_Navigation_0.8.5'
parser=argparse.ArgumentParser()
parser.add_argument('--manager-state',type=Path)
args=parser.parse_args()
release=json.loads((root/'release/NEXUS-FIELDS.json').read_text(encoding='utf-8'))
archive=root/release['archive']
scripts='ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/'
streamed=root/'build/streamed-atlas'
stream_state=json.loads((streamed/'manifest.json').read_text(encoding='utf-8'))
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
with zipfile.ZipFile(archive) as z:
    names=set(z.namelist())
    assert len(names)==len(z.namelist()), 'duplicate archive paths'
    expected={p.relative_to(nav).as_posix() for p in nav.rglob('*') if p.is_file()}
    expected.update(scripts+'PBZRouteStreaming/'+name for name in stream_state['files'])
    assert names==expected|{'INSTALL-README.md','CHANGELOG.md'}, 'incomplete navigation package'
    assert not any('/mods/pbzmaptracker/' in n.lower() for n in names), 'collector file included'
    assert z.testzip() is None
    version=release['version']
    for name in ['PBZRouteEntry.js','PBZQuestRoute.js']:
        assert ("'"+version+"'") in z.read(scripts+name).decode('utf-8'), 'runtime version mismatch'
    adapter='platform/steam/ue4ss/Mods/PBZQuestRouteCompat/dlls/main.dll'
    assert version.encode('utf-16le') in z.read(adapter), 'native adapter version mismatch'
    for name in ['README-en.txt','README-zh.txt','INSTALL-README.md','CHANGELOG.md']:
        assert version in z.read(name).decode('utf-8'), 'documentation version mismatch'
    for name in names:
        source=root/'docs/USER-GUIDE.md' if name=='INSTALL-README.md' else root/'release/CHANGELOG.md' if name=='CHANGELOG.md' else streamed/name[len(scripts+'PBZRouteStreaming/'):] if name.startswith(scripts+'PBZRouteStreaming/') else root/'build/legacy-atlas'/Path(name).name if name.startswith(scripts+'PBZRouteChunks/') else nav/name
        assert hashlib.sha256(z.read(name)).digest()==hashlib.sha256(source.read_bytes()).digest(),name
    print(f'PASS: complete archive, {len(names)} exact file matches, no collector-owned paths')
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
        original=root/'Map_Collectible_Tracker_1.0.9/platform/steam/ue4ss/Mods'
        for file in tracker['files']:
            source=original/file['fileName']
            assert hashlib.sha256(source.read_bytes()).hexdigest().casefold()==file['sha256'].casefold(),source
        print(f"PASS: all {len(tracker['files'])} collector source files match the manager's original hashes; zero overlap")
