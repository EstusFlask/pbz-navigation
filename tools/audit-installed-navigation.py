"""Compare a delivered navigation ZIP with an installation without writing it."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--archive', type=Path, required=True)
parser.add_argument('--game', type=Path, required=True)
parser.add_argument('--manager-state', type=Path)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
result = dict(archive=str(args.archive), matched=0, missing=[], changed=[], extraScripts=[])
scripts = 'ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/'
with zipfile.ZipFile(args.archive) as archive:
    expected = {n for n in archive.namelist() if n.startswith(('ProjectPBZ/', 'platform/')) and not n.endswith('/')}
    for name in sorted(expected):
        target = args.game / name
        if not target.is_file():
            result['missing'].append(name)
        elif hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(archive.read(name)).digest():
            result['changed'].append(name)
        else:
            result['matched'] += 1
    location = args.game / scripts
    if location.is_dir():
        result['extraScripts'] = sorted(str(p.relative_to(args.game)).replace('\\', '/')
                                        for p in location.rglob('*.js')
                                        if p.relative_to(args.game).as_posix() not in expected)
if args.manager_state:
    content = args.manager_state.read_bytes()
    result['managerSHA256'] = hashlib.sha256(content).hexdigest()
    result['manager'] = [dict(name=m.get('name'), enabled=m.get('enabled'))
                         for m in json.loads(content)['mods'] if 'Quest' in m.get('name', '')]
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
assert not any(result[k] for k in ('missing', 'changed', 'extraScripts')), 'installation differs from delivered archive'
