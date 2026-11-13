"""Audit every ordered bell pair against explicit authored courses.

The worksheet and public map coordinates are authoring material, never runtime
XYZ routes. No reverse edge, scene transfer or walkable height is inferred.
Run fetch-gamersky-roadbook.py first. Downloaded prose/images stay in build/.
"""
from collections import Counter, deque
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'build/gamersky'
JS = ROOT / 'Quest_Navigation_0.8.5/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute'
MAPS = {
    251: ('悲泣溪谷', ['xigu']), 252: ('血色森林', ['fujizhilin']),
    253: ('陆家村', ['lujiacun']), 254: ('庞镇／后街／戏梦山庄', ['pangzhen', 'houjie', 'ximeng']),
    255: ('正道大营', ['zhengdaodaying']), 256: ('梅谷湖', ['meiguhu']),
    257: ('枷笼山', ['dengdingshandao']), 258: ('断魂山', ['duanhunya']),
}
ALIASES = {'圣母像裂隙': '圣母像裂缝', '机关巨怪的残骸': '机关巨怪残骸',
           '幽兰萤火之庙': '幽蓝萤火之庙', '栈道瞭望台': '栈道眺望台'}


def module(name):
    code = 'process.stdout.write(JSON.stringify(require(' + json.dumps(str(JS / name)) + ').data))'
    return json.loads(subprocess.check_output(['node', '-e', code], encoding='utf-8'))


def norm(name):
    value = re.sub(r'^\[鹤型\]\s*', '', name)
    return ALIASES.get(value, value)


def path_to(edges, start, end):
    queue = deque([(start, [])])
    seen = {start}
    while queue:
        at, path = queue.popleft()
        for link in edges.get(at, []):
            target = link['to']
            if target == end:
                return path + [link['id']]
            if target not in seen:
                seen.add(target)
                queue.append((target, path + [link['id']]))
    return None


def generate():
    bells = list(module('PBZRouteTables.js')['bells'].values())
    courses = module('PBZRouteGuideData.js')['courses']
    book_raw = (CACHE / 'roadbook-53.api.json').read_bytes()
    book = json.loads(book_raw)['data']
    nodes = {n['id']: (f, n) for f in book['flows'] for n in f['nodes']}
    registry, by_name = [], {}
    for mid, (name, areas) in MAPS.items():
        game = [{**b, 'specialEntry': bool(re.match(r'(?i)(broken|jjybp_)', b['id']))}
                for b in bells if b['area'] in areas]
        for b in game:
            # A broken/special entry may share a normal bell's display name.
            # Never let the later row silently replace that ordinary identity.
            if not b['specialEntry']:
                identity = (mid, b['name'])
                assert identity not in by_name, ('ambiguous ordinary bell name', identity)
                by_name[identity] = b
        raw = (CACHE / f'map-{mid}-getLandmarkList.json').read_bytes()
        markers = []
        for lm in json.loads(raw)['landmarks']:
            if lm['landmarkCatalogName'] != '铃铛':
                continue
            found = [b for b in game if b['name'] == norm(lm['name']) and not b['specialEntry']]
            markers.append(dict(id=lm['id'], name=lm['name'], map=[lm['x'], lm['y']],
                                gameBell=found[0]['id'] if len(found) == 1 else None,
                                status='matched' if len(found) == 1 else 'identity-unresolved'))
        registry.append(dict(id=mid, name=name, bells=game, markers=markers,
                             landmarkSHA256=hashlib.sha256(raw).hexdigest()))

    links = []
    for line in (ROOT / 'authoring/roadbook-bell-links.tsv').read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        mid, node, start, end, hints = line.split('\t')
        mid, node = int(mid), int(node)
        assert node in nodes, ('missing source node', node)
        a, b = by_name.get((mid, start)), by_name.get((mid, end))
        links.append(dict(id=f'worksheet-{len(links)+1:03}', mapId=mid,
                          sourceNode=node, sourceFlow=nodes[node][0]['id'],
                          fromName=start, toName=end, **{'from': a['id'] if a else None},
                          to=b['id'] if b else None, hints=hints.split(';'),
                          status='needs-3d-authoring', runtimeEnabled=False))
    generated_path = ROOT / 'authoring/roadbook-course-audit.json'
    generated = json.loads(generated_path.read_text(encoding='utf-8'))['links'] if generated_path.exists() else []
    compiled = {r['id']: r for r in generated}
    for link in links:
        row = compiled.get(link['id'])
        if row:
            link.update(status=row['status'], runtimeEnabled=row['runtimeEnabled'])
            if row.get('course'):
                link['course'] = row['course']
    enabled = {}
    for c in courses:
        a, b = next(x for x in bells if x['id'] == c['sourceBell']), next(x for x in bells if x['id'] == c['targetBell'])
        assert a['world'] == b['world'] == c['world']
        enabled.setdefault(a['id'], []).append(dict(id=c['id'], to=b['id']))
    candidates = {key: list(value) for key, value in enabled.items()}
    for link in generated:
        if link['status'] == 'requires-scene-check':
            candidates.setdefault(link['from'], []).append(dict(id=link['course'], to=link['to']))
    worksheet = {}
    for link in links:
        if link['from'] and link['to']:
            worksheet.setdefault(link['from'], []).append(link)

    pairs = []
    for m in registry:
        rows = []
        for a in m['bells']:
            for b in m['bells']:
                if a['id'] == b['id']:
                    continue
                active = path_to(enabled, a['id'], b['id'])
                pending = path_to(worksheet, a['id'], b['id'])
                candidate = path_to(candidates, a['id'], b['id']) if not active else None
                status = 'authored-reference' if active else 'special-entry-unresolved' if a['specialEntry'] or b['specialEntry'] else 'world-transfer-unresolved' if a['world'] != b['world'] else 'roadbook-candidate' if candidate else 'worksheet-only' if pending else 'missing-authored-connection'
                rows.append(dict(mapId=m['id'], **{'from': a['id']}, to=b['id'], status=status,
                                 courses=active or [], candidateCourses=candidate or [], worksheet=pending or []))
        m['pairCounts'] = dict(sorted(Counter(x['status'] for x in rows).items()))
        pairs.extend(rows)
    data = dict(schema=1, version=module('PBZRouteGuideData.js')['version'],
                source={'roadbookId': 53, 'roadbookSHA256': hashlib.sha256(book_raw).hexdigest(),
                        'flowCount': len(book['flows']), 'retrieved': '2026-11-12'},
                scope='Coverage audit, not a runtime route catalog. Authored references still require in-game verification.',
                maps=registry, worksheetLinks=links, pairs=pairs)
    (ROOT / 'authoring/bell-network-coverage.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    release = json.loads((ROOT / 'release/NEXUS-FIELDS.json').read_text(encoding='utf-8'))['version']
    out = [f'# 铃铛路网覆盖核验 · {release}', '',
           '**全图手工三维路线尚未完成。** 本报告逐对列出缺口，不能作为全图路线已可用的证明。', '',
           '保留两条固定参考路线，另编制86条由原图地面/游戏机关坐标生成的有向三维候选。候选进入寻路前必须检查当前场景的地面、碰撞和机关；尚有52条工作表连接缺失三维几何、身份或场景转移。全图连续可走路线尚未完成。', '',
           '来源：游民路书 53（18 个流程）及 8 张公开地图，2026-11-12 获取；游戏铃铛表。只保留点位事实、自编连接工作表和来源 ID，不分发攻略正文、图像或游戏解包资源。', '',
           '| 地图 | 游戏表项 | 游民标记 | 未绑定标记 | 有序铃铛对 | 启用三维参考 |',
           '| --- | ---: | ---: | ---: | ---: | ---: |']
    for m in registry:
        out.append(f"| {m['name']} | {len(m['bells'])} | {len(m['markers'])} | {sum(x['gameBell'] is None for x in m['markers'])} | {len(m['bells'])*(len(m['bells'])-1)} | {m['pairCounts'].get('authored-reference', 0)} |")
    out += ['', '统计包含特殊铃铛／龙柱表项，不能把游戏表项数等同普通可传送铃铛数。工作表的可串联关系也不等于游戏可达。完整有序对状态见仓库 `authoring/bell-network-coverage.json`。', '',
            '## 运行时范围', '',
            '- 只拼接明确同名游戏铃铛 ID 的有向三维课程；不按距离猜连接，不反转攀爬、下落或单向机关。',
            '- 两条已编制轨迹参考优先保留。新86条候选用于未激活铃铛的陆路规划，接受普通地面检查，不享受固定轨迹的免重投影规则。未知机关只显示待确认前段，不能宣称完整可走。',
            '- 物品／地图标记可以从现有三维课程的同层行走段接出。末段上限 760 厘米，必须通过当前碰撞、地面和锁检查；更远目标仍交原规划器。',
            '- 已知锁门／不可用动作不参与完整铃铛组合；运行中的障碍审计继续生效。',
            '- 无新增轨迹采样、持久化或游戏内下载。静态拓扑缓存与当前搜索的接入检查分开；没有游戏帧率实测。', '',
            '## 仍缺的资料', '',
            '52条未编制连接及原因见 `authoring/roadbook-course-audit.json`。其中49条缺连续几何，1条缺铃铛身份，1条跨world入口未绑定，1条缺端点。每条完整课程都需要连续XYZ、动作端点、方向和条件；二维路书折线不能补出缺失高度。', '',
            '游戏 GlobalMapAnchorData 提供 12 分区、7,365 投影锚点，可用于对齐地图。它们不是地面或导航网格；不能将插值高度当路面。百万级高度有对应场景副本，不能统一归零。', '',
            '梅谷湖需要船行连接和隐藏场景；庞镇／后街／戏梦山庄需要跨 world 入口；七个同名幻术师遗迹和陆家村湖畔需补游戏身份。未加载区域的扫线无命中不能证明无墙。', '',
            '## 按图核对表', '']
    for m in registry:
        matched = {x['gameBell']: x['id'] for x in m['markers'] if x['gameBell']}
        active_ids = {c['sourceBell'] for c in courses} | {c['targetBell'] for c in courses}
        out += [f"### {m['id']} · {m['name']}", '', '| 游戏 ID | 名称 | 游民标记 ID | 三维参考状态 |', '| --- | --- | --- | --- |']
        for bell in m['bells']:
            status = '参考路线端点，未全程游戏验证' if bell['id'] in active_ids else '特殊表项待核对' if bell['specialEntry'] else '缺三维课程'
            out.append(f"| `{bell['id']}` | {bell['name']} | {matched.get(bell['id'], '未绑定')} | {status} |")
        for lm in m['markers']:
            if not lm['gameBell']:
                out.append(f"| 未绑定 | {lm['name']} | {lm['id']} | 缺游戏身份 |")
        out.append('')
    (ROOT / 'docs/BELL-NETWORK-COVERAGE.md').write_text('\n'.join(out), encoding='utf-8')
    print(json.dumps(dict(bells=len(bells), publicMarkers=sum(len(m['markers']) for m in registry),
                          worksheetLinks=len(links), orderedPairs=len(pairs),
                          statuses=dict(Counter(p['status'] for p in pairs))), ensure_ascii=False))


if __name__ == '__main__':
    generate()
