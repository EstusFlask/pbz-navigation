"""Compare public 2D markers with per-group game map projection anchors.

This only calibrates display UV. Its output cannot certify ground, path height,
collision, an interaction or a scene transition and is never a runtime course.
"""
from collections import defaultdict
from pathlib import Path
import json
import numpy as np
from scipy.spatial import Delaunay, QhullError

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'build/gamersky'
registry = json.loads((ROOT / 'authoring/bell-network-coverage.json').read_text(encoding='utf-8'))
maps = json.loads((CACHE / 'game-map-anchors.json').read_text(encoding='utf-8'))['maps']
groups = defaultdict(list)
for m in maps:
    raw = defaultdict(list)
    for a in m['anchors']:
        raw[(a['layer'], a['group'])].append(a)
    for (layer, group), anchors in raw.items():
        xyz = np.array([a['xyz'] for a in anchors])
        uv = np.array([a['uv'] for a in anchors])
        if len(xyz) < 3:
            continue
        try:
            triangle = Delaunay(xyz[:, :2])
        except QhullError:
            continue
        groups[m['world']].append((m['area'], layer, group, triangle, xyz, uv))


def project(bell):
    p = np.array(bell['at'])
    candidates = []
    for area, layer, group, tri, xyz, uv in groups[bell['world']]:
        s = int(tri.find_simplex(p[:2]))
        if s < 0:
            continue
        t = tri.transform[s]
        bary = t[:2] @ (p[:2] - t[2])
        bary = np.append(bary, 1 - bary.sum())
        ids = tri.simplices[s]
        dz = abs(float(bary @ xyz[ids, 2]) - p[2])
        candidates.append(dict(uv=(bary @ uv[ids]).tolist(), heightDifferenceCm=dz,
                               area=area, layer=layer, group=group))
    return min(candidates, key=lambda r: r['heightDifferenceCm']) if candidates else None


for m in registry['maps']:
    bells = {b['id']: b for b in m['bells']}
    rows = []
    for marker in m['markers']:
        bell = bells.get(marker['gameBell'])
        if not bell:
            continue
        projected = project(bell)
        if projected:
            rows.append(dict(id=bell['id'], markerId=marker['id'], name=bell['name'],
                             map=marker['map'], **projected))
    assert len(rows) >= 3, ('insufficient calibration pairs', m['id'])
    x = np.array([[*r['map'], 1] for r in rows])
    y = np.array([r['uv'] for r in rows])
    fit = np.linalg.lstsq(x, y, rcond=None)[0]
    errors = np.linalg.norm(x @ fit-y, axis=1)
    result = dict(mapId=m['id'], rows=rows, fit=fit.tolist(), errors=errors.tolist(),
                  rmsUV=float(np.sqrt(np.mean(errors**2))),
                  scope='Delaunay approximation of grouped map projection only. Not ground or route validation.')
    (CACHE / f'projection-calibration-{m["id"]}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(m['id'], len(rows), 'pairs; UV RMS', round(result['rmsUV'], 6),
          'max height discrepancy cm', round(max(r['heightDifferenceCm'] for r in rows)))
