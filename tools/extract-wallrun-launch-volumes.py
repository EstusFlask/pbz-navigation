"""Extract launch volume hints from the reviewed SideRunning construction."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from pbz_game_packages import Reader
from pbz_offline_assets import Assets, place
from pbz_offline_components import Cursor
from pbz_zen import Package, native_classes


ROOT = Path(__file__).resolve().parents[1]
CLASS = '/game/renewalcontent/actors/specialmove/volume/bp_specialmove_siderunning'
CLASS_SHA = '1fb3f1b663e9a1ab324efafc64807cb15ea573d07cc92a8fd2e6574d5552947f'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def extract(package, actor, fact, assets):
    # The pinned constructor places BoxA at BoxAOffset and BoxB at
    # Distance + BoxBOffset along local X. BoxB is rotated 180° in yaw.
    cursor = Cursor(package.payload(actor))
    fields, zero = cursor.header()
    unsupported = set(fields) - {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 20, 82, 86}
    if unsupported:
        raise ValueError(f'Unreviewed placement overrides {sorted(unsupported)}')
    values = {}
    for field in fields:
        if field >= 82:
            break
        kind = 'f' if field in (1, 4, 5) else 'B' if field in (2, 3) else 'i' if field in (14, 15) else '3d'
        values[field] = ((0, 0, 0) if kind == '3d' else 0) if field in zero else cursor.read(kind)
    for field, name in [(14, 'LowSpline'), (15, 'HeightSpline')]:
        linked = assets.resolve(package, values.get(field, 0))
        if not linked or linked[0] is not package or package.exports[linked[1]]['name'] != name:
            raise ValueError(f'Unknown {name} reference')
    if 20 not in values:
        raise ValueError('No saved box extent')
    extent, distance = values[20], values.get(1, 600)
    if not (all(math.isfinite(v) and 0 < v < 2500 for v in extent) and 0 < distance < 5000):
        raise ValueError('Invalid extent or wallrun distance')
    [root] = [i for i, e in enumerate(package.exports) if e['outer'] == actor and e['name'] == 'SceneComponent']
    chain = assets.chain(package, root)
    if any(row.get('scale', (1, 1, 1)) != (1, 1, 1) for row in chain):
        raise ValueError('Unreviewed root scale')
    result = {}
    for name, field, extra, enabled in [('A', 9, 0, 2), ('B', 10, distance, 3)]:
        if values.get(enabled, 1) != 1:
            continue
        x, y, z = values.get(field, (0, 0, 0))
        offset = [x + extra, y, z]
        center = place(offset, chain)
        axes = []
        for axis, length in enumerate(extent):
            local = offset.copy()
            local[axis] += -length if name == 'B' and axis < 2 else length
            axes.append([a-b for a, b in zip(place(local, chain), center)])
        result[name] = dict(center=center, axes=axes)
    first = place((0, 0, 0), chain)
    last = place((distance, 0, 0), chain)
    if (math.dist(first, fact['path'][0]) + math.dist(last, fact['path'][-1])) > (math.dist(first, fact['path'][-1]) + math.dist(last, fact['path'][0])):
        result['firstIsA'] = False
    else:
        result['firstIsA'] = True
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    output = parser.parse_args().output.resolve()
    if not output.is_relative_to(ROOT / 'build') or output.exists():
        raise ValueError('Fresh private output required')
    classes = native_classes()
    assets = Assets(Reader(), classes, ROOT / 'build/offline-navigation/assets')
    blueprint = assets.load(CLASS)
    if blueprint.asset_sha256 != CLASS_SHA:
        raise ValueError('Wallrun construction changed')
    facts_file = ROOT / 'authoring/placed-passage-facts.json'
    facts = {r['guid']: r for r in json.loads(facts_file.read_bytes())['rows'] if r['kind'] == 'wallrun'}
    inventory = ROOT / 'build/roadbook-11/all-placed-index.json'
    rows, skipped = [], []
    for item in json.loads(inventory.read_bytes()):
        name = item['actor']
        if not name.startswith('BP_SpecialMove_SideRunning_C_') or name not in facts:
            continue
        fact = facts[name]
        raw = (ROOT / item['file']).read_bytes()
        if sha(raw) != item['sha256'] or fact['packageSHA256'] != item['sha256'] or fact['world'] != item['world']:
            raise ValueError('Wallrun inventory changed')
        package = Package(raw, classes)
        package.asset_name, package.asset_sha256 = item['package'], item['sha256']
        [actor] = [i for i, e in enumerate(package.exports) if e['name'] == name]
        target = assets.resolve_global(package, package.exports[actor]['cls'])
        if not target or target[0].asset_name != CLASS:
            raise ValueError('Unexpected class for wallrun placement')
        try:
            boxes = extract(package, actor, fact, assets)
        except (ValueError, KeyError, IndexError) as error:
            skipped.append(dict(guid=name, reason=str(error)))
            continue
        rows.append(dict(guid=name, world=item['world'], packageSHA256=item['sha256'], boxes=boxes))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dict(schema=1, factsSHA256=sha(facts_file.read_bytes()),
                                      classSHA256=CLASS_SHA, rows=rows, skipped=skipped), indent=2), encoding='utf-8')
    print(f'Wallrun launch volumes: {len(rows)} extracted, {len(skipped)} skipped')


if __name__ == '__main__':
    main()
