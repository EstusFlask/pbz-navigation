"""Offline authoring input only. The mod never reads or records player trails.

The selected runs were reviewed against the user's route descriptions and the
public roadbook. Keep measured corners/heights; do not fit map XY into world XYZ.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('trace', type=Path)
args = parser.parse_args()
raw = args.trace.read_bytes()
world = json.loads(raw)['worlds'][0]
assert world['name'] == 'pbz_zhengdaodaying_wp'
definitions = [
    dict(id='ljc-bridge-cave-xiaozhang', name='大廊桥 → 山洞 → 小张藏身处',
         sourceBell='Bell_SXC_01_11', targetBell='Bell_LJC_XiaoZhang_002',
         target=[-58333, 121767, -1512], begin=882, end=1565),
    dict(id='zddy-cemetery-uphill-tomb', name='乱葬岗 → 河道 → 绕坡 → 墨玑子衣冠冢',
         sourceBell='Bell_YXZR_003', targetBell='Bell_YXZR_004',
         target=[14107, 69330, 6393], begin=0, end=881),
]
overrides = {
    1504: ('ascent', 'BP_SpecialMove_UpRunning_C_UAID_74563C6BC2BDC2A802_1365678961'),
    1527: ('ascent', 'BP_SpecialMove_UpRunning_C_UAID_74563C6BC2BD15A902_1894210710'),
    1531: ('hook', 'guide:ljc-cave-hook'),
}
courses = []
for definition in definitions:
    course = {k: v for k, v in definition.items() if k not in ('begin', 'end')}
    lo, hi = definition['begin'], definition['end']
    edges = {(a, b): (kind, points) for a, b, kind, points in world['edges']
             if lo <= a < hi and b == a + 1}
    points, actions = [world['nodes'][lo]], []
    gaps = []
    for a in range(lo, hi):
        if (a, a + 1) in edges:
            kind, path = edges[a, a + 1]
        else:
            path = world['nodes'][a:a + 2]
            # These five tiny omissions are between adjacent occupied feet.
            # They are not bridges over a missing action or a sampling gap.
            assert math.dist(*path) <= 45, ('unreviewed gap', a)
            gaps.append(a)
            kind = 'walk'
        start = len(points) - 1
        assert math.dist(points[-1], path[0]) < .2
        for p in path[1:]:
            previous = points[-1]
            distance = math.dist(previous, p)
            if distance <= .1:
                continue
            n = max(1, math.ceil(distance / 55))
            for j in range(1, n + 1):
                points.append([round(x + (y - x) * j / n, 1) for x, y in zip(previous, p)])
        if kind != 'walk':
            kind, guid = overrides.get(a, (kind, 'guide:' + course['id'] + ':' + str(a)))
            actions.append(dict(kind=kind, guid=guid, start=start, end=len(points) - 1))
    course.update(world=world['name'], points=points, actions=actions)
    courses.append(course)
    print(course['id'], len(points), 'points;', len(actions), 'directed actions;',
          'terminal distance', round(math.dist(points[-1], course['target'])), 'cm;', 'reviewed gaps', gaps)

data = dict(version=1, sourceTraceSHA256=hashlib.sha256(raw).hexdigest(), courses=courses)
output = root / 'Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteGuideData.js'
output.write_text("'use strict';\n// Fixed author data. Provenance/limits: MANUAL-ROUTES.md. No runtime learning.\nexports.data=" +
                  json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
