"""Build one complete navigation mod; never include a collector-owned path."""
from pathlib import Path
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
nav = root / 'Quest_Navigation_0.8.5'
release = json.loads((root/'release/NEXUS-FIELDS.json').read_text(encoding='utf-8'))
output = root / release['archive']
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
print(f'{output} ({output.stat().st_size:,} bytes)', flush=True)
