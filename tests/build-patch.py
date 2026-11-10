"""Build one complete navigation mod; never include a collector-owned path."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
nav = root / 'Quest_Navigation_0.8.5'
output = root / 'dist/Quest_Navigation_0.8.5-local-fix5-navigation-only-full.zip'
output.parent.mkdir(exist_ok=True)
assert (nav/'platform/steam/ue4ss/Mods/PBZQuestRouteCompat/dlls/main.dll').is_file(), 'Build native adapter first'
print('Packaging complete navigation data and navigation-owned adapter...', flush=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(nav.rglob('*')):
        if file.is_file():
            relative=file.relative_to(nav).as_posix()
            assert '/Mods/PbzMapTracker/' not in relative
            archive.write(file, relative)
    archive.write(root/'README.md', 'INSTALL-README.md')
print(f'{output} ({output.stat().st_size:,} bytes)', flush=True)
