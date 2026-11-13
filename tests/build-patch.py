"""Build one complete navigation mod; never include a collector-owned path."""
from pathlib import Path
import json
import re
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
nav = root / 'Quest_Navigation_0.8.5'
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
output = root / release['archive']
if output != root/'dist'/f'Quest_and_Exploration_Navigation_Fork_{version}.zip':
    raise SystemExit('Archive must be the current version in dist/')
output.parent.mkdir(exist_ok=True)
assert (nav/'platform/steam/ue4ss/Mods/PBZQuestRouteCompat/dlls/main.dll').is_file(), 'Build native adapter first'
subprocess.run(['node','--expose-gc',str(root/'tests/stream-atlas.cjs')],check=True)
streamed=root/'build/streamed-atlas'
stream_state=json.loads((streamed/'manifest.json').read_text(encoding='utf-8'))
scripts='ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/'
print('Packaging complete navigation data and navigation-owned adapter...', flush=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(nav.rglob('*')):
        if file.is_file():
            relative=file.relative_to(nav).as_posix()
            assert '/Mods/PbzMapTracker/' not in relative
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
print(f'{output} ({output.stat().st_size:,} bytes)', flush=True)
