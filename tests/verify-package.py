"""Verify a complete navigation package and, optionally, UE MM ownership rules."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

root=Path(__file__).resolve().parents[1]
nav=root/'Quest_Navigation_0.8.5'
parser=argparse.ArgumentParser()
parser.add_argument('--manager-state',type=Path)
args=parser.parse_args()
archive=root/'dist/Quest_Navigation_0.8.5-local-fix2-navigation-only-full.zip'
with zipfile.ZipFile(archive) as z:
    names=set(z.namelist())
    assert len(names)==len(z.namelist()), 'duplicate archive paths'
    expected={p.relative_to(nav).as_posix() for p in nav.rglob('*') if p.is_file()}
    assert names==expected|{'INSTALL-README.md'}, 'incomplete navigation package'
    assert not any('/mods/pbzmaptracker/' in n.lower() for n in names), 'collector file included'
    assert z.testzip() is None
    for name in names:
        source=root/'README.md' if name=='INSTALL-README.md' else nav/name
        assert hashlib.sha256(z.read(name)).digest()==hashlib.sha256(source.read_bytes()).digest(),name
    print(f'PASS: complete archive, {len(names)} exact file matches, no collector-owned paths')
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
