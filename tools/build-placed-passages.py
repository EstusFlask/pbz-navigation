"""Bake reviewed component-coordinate facts, never whole game packages."""
from pathlib import Path
from collections import defaultdict
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'authoring/placed-passage-facts.json'
OUTPUT = ROOT / 'Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRoutePlacedPassages'
data = json.loads(SOURCE.read_text(encoding='utf-8'))
worlds = defaultdict(list)
identities = set()
for raw in data['rows']:
    key = raw['world'], raw['guid'].lower()
    assert key not in identities, ('duplicate placed movement', key)
    identities.add(key)
    assert len(raw['packageSHA256']) == 64
    assert len(raw['path']) >= 2 and all(len(p) == 3 and all(math.isfinite(v) for v in p) for p in raw['path'])
    assert raw['requiresLoaded'] is True and raw['source'] == 'game-placement'
    if raw['kind'] in ['ascent', 'mantle', 'hook', 'drop', 'slide', 'rappel', 'zipline']:
        assert raw['both'] is False, ('unproven reverse traversal', key)
    worlds[raw['world']].append({k: v for k, v in raw.items() if k not in ['world', 'package', 'packageSHA256']})
OUTPUT.mkdir(exist_ok=True)
for world, rows in worlds.items():
    value = dict(schema=1, world=world, factsSHA256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                 source='Cooked component transforms; current loaded instance, requirements and clearance required.', rows=rows)
    (OUTPUT / (world + '.js')).write_text("'use strict';\nexports.data=" + json.dumps(value, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(f'PASS: {len(identities)} unique movement instances across {len(worlds)} worlds; current loaded instance required')
