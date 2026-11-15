"""Offline summaries of observed travel; deviations are review hints, not bug verdicts."""
from collections import Counter
import math


def point(value):
    return isinstance(value, dict) and all(isinstance(value.get(k), (int, float)) and math.isfinite(value[k]) for k in ('x', 'y', 'z'))


def distance(a, b):
    return math.sqrt(sum((a[k] - b[k]) ** 2 for k in ('x', 'y', 'z')))


def line_distance(p, points):
    best = math.inf
    for a, b in zip(points, points[1:]):
        delta = [b[k] - a[k] for k in ('x', 'y', 'z')]
        den = sum(v * v for v in delta)
        t = max(0, min(1, sum((p[k] - a[k]) * d for k, d in zip(('x', 'y', 'z'), delta)) / den)) if den else 0
        best = min(best, distance(p, {k: a[k] + t * d for k, d in zip(('x', 'y', 'z'), delta)}))
    return best


def summarize(manifest, chunks):
    samples = [s for c in chunks for s in c.get('samples', [])]
    snapshots = [s for c in chunks for s in c.get('snapshots', [])]
    events = [e for c in chunks for group in ('events', 'markers', 'probes', 'guideProbes', 'candidates') for e in c.get(group, [])]
    errors = []
    if len(chunks) != len(manifest.get('chunks', [])):
        errors.append('missing or unreadable chunks')
    if len(samples) != manifest.get('sampleCount'):
        errors.append('manifest/sample count mismatch')
    meters = 0
    gaps = []
    for a, b in zip(samples, samples[1:]):
        if a.get('context') != b.get('context') or b['at'] - a['at'] > 1000 or not point(a.get('feet')) or not point(b.get('feet')):
            gaps.append(dict(after=a.get('at'), before=b.get('at'), reason='context, time or position gap'))
            continue
        d = distance(a['feet'], b['feet'])
        if d > 1200:
            gaps.append(dict(after=a['at'], before=b['at'], reason='position discontinuity'))
        else:
            meters += d / 100
    if gaps:
        errors.append('sample discontinuities')
    providers = Counter()
    baseline = None
    for row in sorted(snapshots, key=lambda r: r['at']):
        state = row.get('snapshot', {})
        for leg in state.get('trip', {}).get('legs', []):
            providers[(leg.get('provider', 'unknown'), leg.get('searchDirection', 'unknown'))] += 1
            points = leg.get('points', [])
            expected_key = 'survey:' + manifest['task']['id']
            target = state.get('target') or {}
            matching_target = target.get('key') == expected_key or target.get('survey') == manifest['task']['id'] and target.get('surveyRole') == 'end'
            if baseline is None and matching_target and leg.get('world') == manifest['task']['world'] and not leg.get('partial') and not leg.get('diagnostic') and len(points) > 1 and all(point(p) for p in points):
                end = manifest['task']['end']['p']
                if distance(points[-1], end) <= 650:
                    baseline = (row['at'], points, leg)
    comparison = None
    if baseline:
        at, points, leg = baseline
        # Bound offline work on very dense routes; the actual points remain in the report.
        selected = [s for s in samples if s['at'] >= at and point(s.get('feet'))]
        stride = max(1, math.ceil(len(selected) * len(points) / 1500000))
        deviations = sorted(line_distance(s['feet'], points) / 100 for s in selected[::stride])
        comparison = dict(at=at, provider=leg.get('provider'), direction=leg.get('searchDirection'),
                          plannedMeters=sum(distance(a, b) for a, b in zip(points, points[1:])) / 100,
                          sampledDeviationCount=len(deviations), deviationStride=stride,
                          medianDeviationMeters=deviations[len(deviations) // 2] if deviations else None,
                          p95DeviationMeters=deviations[min(len(deviations) - 1, int(len(deviations) * .95))] if deviations else None,
                          scope='Distance of later observed feet from first captured complete plan. Actions, detours, endpoint radius and plan changes need review; not proof of an error or shortest path.')
    dropped = Counter()
    for c in chunks:
        dropped.update(c.get('dropped', {}))
    return dict(attempt=manifest['attemptId'], task=manifest['task'], build=manifest.get('build'), status=manifest.get('status'),
                reason=manifest.get('reason'), startedAt=manifest.get('startedAt'), endedAt=manifest.get('endedAt'),
                dataComplete=not errors, dataErrors=errors, samples=len(samples), chunks=len(chunks), observedMeters=meters,
                seconds=(samples[-1]['at'] - samples[0]['at']) / 1000 if samples else 0, gaps=gaps,
                modes=dict(Counter(str(s.get('physical', {}).get('mode')) for s in samples)),
                providers=[dict(provider=p, direction=d, snapshots=n) for (p, d), n in providers.items()],
                markerCases=[e['data'].get('caseId') for e in events if e.get('kind') == 'user marker' and e['data'].get('markerKind')!='player-mistake'],
                personalMistakeCases=[dict(case=e['data'].get('caseId'),at=e['at']) for e in events if e.get('kind') == 'user marker' and e['data'].get('markerKind')=='player-mistake'],
                rejectedWalkingReasons=dict(Counter(e.get('data', {}).get('why', 'unavailable') for e in events if e.get('kind') == 'walking probe rejected')),
                dropped=dict(dropped), comparison=comparison,
                reviewStatus='unreviewed observation; no navigation data automatically enabled')


def markdown(surveys):
    lines = ['# 开发版补采对照', '', '以下为观察摘要；采完不等于导航已修复或实测通过。', '']
    for s in surveys:
        task = s['task']
        title = f"{task['number']}号路线（{task['id']}）" if task.get('number') else task['id']
        lines.extend([f"## {title}：{task['start']['name']} → {task['end']['name']}", '',
                      f"- 状态：{s['status']}；脚点与分块完整：{s['dataComplete']}",
                      f"- 实际观察：{s['observedMeters']:.1f} 米，{s['seconds']:.1f} 秒，{s['samples']} 个样本。",
                      f"- 问题：{task['issue']}", f"- Y 标记：{', '.join(filter(None, s['markerCases'])) or '无'}",
                      f"- 防御个人误走标记：{', '.join(str(r['case']) for r in s['personalMistakeCases']) or '无'}（保留原轨迹，复核后排除误走段）",
                      f"- 有界缓冲裁剪：{s['dropped'] or '无'}", ''])
        if s['comparison']:
            c = s['comparison']
            lines.append(f"首次捕获的完整规划：{c['plannedMeters']:.1f} 米，{c['provider']} / {c['direction']}。")
            if c['sampledDeviationCount']:
                lines.append(f"后续脚点到该折线的距离中位数/P95：{c['medianDeviationMeters']:.2f}/{c['p95DeviationMeters']:.2f} 米。动作、改道和重算需结合原始记录复核。")
            else:
                lines.append('该规划快照之后没有可用脚点，无法计算偏离距离。')
        else:
            lines.append('未捕获对应终点的完整规划，不能进行完整路线长度对照。')
        lines.extend(['', f"原始报告：[{s['attempt']}]({s.get('file', '')})", ''])
    return '\n'.join(lines) + '\n'
