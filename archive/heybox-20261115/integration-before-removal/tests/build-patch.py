"""Build one complete navigation mod; never include a collector-owned path."""
from pathlib import Path
import argparse
import json
import re
import subprocess
import zipfile
from release_profiles import archive_name, included, build_bytes, lua_build_bytes, BUILD, LUA_BUILD

parser=argparse.ArgumentParser()
parser.add_argument('--flavor', choices=['release','development','all'], default='all')
args=parser.parse_args()

root = Path(__file__).resolve().parents[1]
nav = root / 'Quest_Navigation'
release = json.loads((root/'release/NEXUS-FIELDS.json').read_text(encoding='utf-8'))
lock = json.loads((root/'release/VERSION-LOCK.json').read_text(encoding='utf-8'))
version = str(release['version'])
def version_key(value):
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(?:-fork\.\d+)?', value)
    if not match:
        raise SystemExit(f'Invalid release version: {value}')
    return tuple(map(int, match.groups()))
if version != str(lock['currentVersion']):
    raise SystemExit(f"Release {version} differs from VERSION-LOCK currentVersion {lock['currentVersion']}")
if version_key(version) < version_key(str(lock['minimumVersion'])):
    raise SystemExit(f'Release {version} is below VERSION-LOCK minimumVersion')
if version_key(version) < max(map(version_key, lock.get('history', [])), default=(0, 0, 0)):
    raise SystemExit(f'Release {version} is below a recorded release in VERSION-LOCK history')
if release['archive'] != archive_name(version,'release'):
    raise SystemExit('Archive must be the current version in dist/')
(root/'dist').mkdir(exist_ok=True)
assert (nav/'platform/steam/ue4ss/Mods/PBZQuestRouteCompat/dlls/main.dll').is_file(), 'Build native adapter first'
subprocess.run(['node','--expose-gc',str(root/'tests/stream-atlas.cjs')],check=True)
streamed=root/'build/streamed-atlas'
stream_state=json.loads((streamed/'manifest.json').read_text(encoding='utf-8'))
scripts='ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/'
print('Packaging complete navigation data and navigation-owned adapter...', flush=True)
for flavor in ['release','development'] if args.flavor=='all' else [args.flavor]:
 output=root/archive_name(version,flavor)
 with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(nav.rglob('*')):
        if file.is_file():
            relative=file.relative_to(nav).as_posix()
            if not included(relative,flavor):continue
            assert '/Mods/PbzMapTracker/' not in relative
            if relative==BUILD:
                archive.writestr(relative,build_bytes(nav,version,flavor));continue
            if relative==LUA_BUILD:
                archive.writestr(relative,lua_build_bytes(version,flavor));continue
            source=root/'build/legacy-atlas'/file.name if relative.startswith(scripts+'PBZRouteChunks/') else file
            archive.write(source, relative)
    for name in stream_state['files']:
        archive.write(streamed/name,scripts+'PBZRouteStreaming/'+name)
    archive.write(root/'docs/USER-GUIDE.md', 'INSTALL-README.md')
    archive.write(root/'release/CHANGELOG.md', 'CHANGELOG.md')
    archive.write(root/'docs/BELL-ROUTE-AUDIT.md', 'BELL-ROUTE-AUDIT.md')
    archive.write(root/'docs/GAME-TRAVERSAL-AUDIT.md', 'GAME-TRAVERSAL-AUDIT.md')
    archive.write(root/'docs/MOVEMENT-COVERAGE.md', 'MOVEMENT-COVERAGE.md')
    archive.write(root/'docs/MANUAL-ROUTES.md', 'MANUAL-ROUTES.md')
    archive.write(root/'docs/BELL-NETWORK-COVERAGE.md', 'BELL-NETWORK-COVERAGE.md')
    archive.write(root/'docs/ITEM-DESCRIPTION-AUDIT.md', 'ITEM-DESCRIPTION-AUDIT.md')
    archive.write(root/'docs/HEYBOX-MAP-IMPORT.md', 'HEYBOX-MAP-IMPORT.md')
    archive.write(root/'docs/FIELD-FIXES-1.8.1.md', 'FIELD-FIXES-1.8.1.md')
    if flavor=='development':
        archive.write(root/'docs/DEVELOPMENT-SURVEYS.md','DEVELOPMENT-SURVEYS.md')
 print(f'{output} ({output.stat().st_size:,} bytes; {flavor})', flush=True)
