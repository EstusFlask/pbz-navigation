"""Recover actual cooked hook components without trajectories or a running game."""
from pathlib import Path
import argparse
import hashlib
import json
from pbz_zen import Package, native_classes
from pbz_offline_assets import Assets
from pbz_game_packages import Reader
from pbz_hook_candidates import extract

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    output = parser.parse_args().output.resolve()
    if not output.is_relative_to(ROOT / 'build') or output.exists():
        raise ValueError('Fresh private output only')
    output.mkdir(parents=True)
    classes = native_classes()
    assets = Assets(Reader(), classes, ROOT / 'build/offline-navigation/assets')
    source = ROOT / 'build/roadbook-11/all-placed-index.json'
    index = json.loads(source.read_bytes())
    rows, errors = [], []
    for item in [r for r in index if r['actor'].startswith('BP_GapBlocker_C_')]:
        raw = (ROOT / item['file']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Cooked hook package changed')
        package = Package(raw, classes)
        package.asset_name, package.asset_sha256 = item['package'], item['sha256']
        try:
            row = extract(package, item['actor'], assets)
            row.update(world=item['world'], package=item['package'], packageSHA256=item['sha256'])
            rows.append(row)
        except (ValueError, KeyError, IndexError) as error:
            errors.append(dict(world=item['world'], guid=item['actor'], error=str(error)))
    worlds = sorted({r['world'] for r in rows})
    for world in worlds:
        values = [{k: v for k, v in r.items() if k not in ('world', 'componentEvidence')}
                  for r in rows if r['world'] == world]
        (output / (world + '.js')).write_text(
            "'use strict';\nexports.rows=" + json.dumps(values, separators=(',', ':')) + ';\n', encoding='utf-8')
    report = dict(schema=1, sourceIndexSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),
                  extractorSHA256=hashlib.sha256(Path(__file__).with_name('pbz_hook_candidates.py').read_bytes()).hexdigest(),
                  scriptSHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  nativeSchemaSHA256=hashlib.sha256((ROOT / 'authoring/offline-native-serialization-schema.json').read_bytes()).hexdigest(),
                  scope='Actual cooked TriggerBox/GrabPoint/LandArea; current loaded endpoints, requirements and physics mandatory; no trajectory inputs',
                  worlds=worlds, rows=rows, errors=errors, nativeTriggersCertified=False, physicalVerified=False)
    (output / 'receipt.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / 'index.js').write_text(
        "'use strict';\nconst worlds=new Set(" + json.dumps(worlds) + ");\nexports.forWorld=world=>worlds.has(world)?require('./'+world).rows:[];\n", encoding='utf-8')
    print('HOOK CANDIDATES', len(rows), 'errors', len(errors), 'worlds', len(worlds), flush=True)
    if errors:
        raise ValueError('Hook extraction incomplete; inspect receipt')


if __name__ == '__main__':
    main()
