"""Audit every installed catalogue entry against cached public GamerSky markers.

Only reviewed, independently worded factual hints from authoring/ are shipped.
Names + map are required; repeated names also require a clear map projection.
Downloaded HTML and full catalogue dumps remain in ignored build/.
"""
from pathlib import Path
from collections import defaultdict, Counter
import html
import hashlib
import json
import os
import re
import sys
sys.path.insert(0, str(Path(os.environ.get('TEMP', '.')) / 'pbz-navigation-audit-deps'))
import numpy as np
from scipy.spatial import Delaunay, QhullError

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'build/gamersky'
sys.path.insert(0, str(Path(os.environ.get('TEMP', '.')) / 'pbz-navigation-test-deps'))
from lupa.lua54 import LuaRuntime

def plain(value):
    if hasattr(value, 'items'):
        data = {k: plain(v) for k, v in value.items()}
        if data and set(data) == set(range(1, len(data)+1)):
            return [data[i] for i in range(1, len(data)+1)]
        return data
    return value

def load_catalogue():
    scripts = next(ROOT.glob('Map_Collectible_Tracker_1.0.14*/platform/steam/ue4ss/Mods/PbzMapTracker/Scripts'))
    lua = LuaRuntime()
    lua.globals().scripts = scripts.as_posix()
    lua.execute("package.path=scripts..'/?.lua;'..package.path; cat=require('PbzMapCatalog'); zh=require('PbzNativePresentationLocale_zh'); keys=require('PbzNativePresentationLocales').nameKeys")
    keys={k:v for rows in plain(lua.globals()['keys']).values() for k,v in rows.items()}
    return plain(lua.globals().cat), plain(lua.globals().zh)['fallbacks'],keys

def normal(name):
    s = re.sub(r'\[[^\]]*\]|【[^】]*】', '', name)
    return re.sub(r'[\s·“”「」：:]', '', s)

def text(value):
    value=value or ''
    return html.unescape(re.sub('<[^>]+>', '', value.replace('<br>', '\n').replace('</p>', '\n'))).strip()

def projections():
    groups = defaultdict(list)
    for m in json.loads((CACHE/'game-map-anchors.json').read_text(encoding='utf-8'))['maps']:
        rows = defaultdict(list)
        for a in m['anchors']:
            rows[(a['layer'], a['group'])].append(a)
        for anchors in rows.values():
            xyz = np.array([a['xyz'] for a in anchors]); uv = np.array([a['uv'] for a in anchors])
            if len(xyz)<3:
                continue
            try:
                groups[m['area'].lower()].append((Delaunay(xyz[:, :2]), xyz, uv))
            except QhullError:
                pass
    return groups

def project(groups, area, pos):
    p = np.array(pos); found = []
    for tri, xyz, uv in groups[area.lower()]:
        i = int(tri.find_simplex(p[:2]))
        if i<0:
            continue
        t=tri.transform[i]; bary=t[:2]@(p[:2]-t[2]); bary=np.append(bary,1-bary.sum()); ids=tri.simplices[i]
        dz=abs(float(bary@xyz[ids,2])-p[2])
        if dz<1500:
            found.append((dz,bary@uv[ids]))
    return min(found,key=lambda r:r[0])[1] if found else None

def main():
    cat,names,name_keys=load_catalogue(); groups=projections()
    def item_name(i):return names.get(i.get('nameKey') or name_keys.get(i.get('id')),i.get('nameText',''))
    maps={251:['xigu'],252:['fujizhilin'],253:['lujiacun'],254:['pangzhen','houjie','ximeng'],
          255:['zhengdaodaying'],256:['meiguhu'],257:['dengdingshandao'],258:['duanhunya','duanhunshan']}
    map_for={area:m for m,areas in maps.items() for area in areas}
    gs={};by_name=defaultdict(list);calibration={}
    for m in maps:
        calibration[m]=np.array(json.loads((CACHE/f'projection-calibration-{m}.json').read_text(encoding='utf-8'))['fit'])
        for r in json.loads((CACHE/f'map-{m}-getLandmarkList.json').read_text(encoding='utf-8'))['landmarks']:
            gs[r['id']]=r;by_name[(m,normal(r['name']))].append(r)
    reviewed=json.loads((ROOT/'authoring/item-hints-zh.json').read_text(encoding='utf-8'))
    hints=reviewed['hints'];audit=[];patches=[];candidates={}
    generic={'','直接拾取','开启宝箱','探索并激活','挑战','击败此处目标后获得'}
    for index,p in enumerate(cat['points']):
        areas=[a.lower() for a in p['mapIds']];map_ids={map_for[a] for a in areas if a in map_for}
        item_names=[item_name(i) for i in p['contents']]
        row=dict(index=index,saveId=p['saveId'],mapIds=p['mapIds'],names=item_names,sourceHint=p['sourceHint'])
        matches={r['id']:r for m in map_ids for n in item_names if n for r in by_name[(m,normal(n))]}
        row['candidates']=list(matches)
        eligible=[]
        for r in matches.values():
            # A unique named source on this map needs no coordinate inference.
            name=normal(r['name']);peers=[q for q in cat['points'] if set(a.lower() for a in q['mapIds'])&set(areas)
                and any(normal(item_name(i))==name for i in q['contents'])]
            if len(by_name[(r['gameMapId'],name)])==1 and len(peers)==1:
                eligible.append(r);continue
            projected=[project(groups,a,p['location']) for a in areas]
            target=np.array([r['x'],r['y'],1])@calibration[r['gameMapId']]
            d=min((float(np.linalg.norm(uv-target)) for uv in projected if uv is not None),default=1)
            if d>.012:
                continue
            rival=[]
            for q in peers:
                if q is p:
                    continue
                for a in q['mapIds']:
                    uv=project(groups,a,q['location'])
                    if uv is not None:
                        rival.append(float(np.linalg.norm(uv-target)))
            if rival and min(rival)<d+.004:
                continue
            eligible.append(r)
        row['matched']=[r['id'] for r in eligible]
        status='existing-specific' if p['sourceHint'] not in generic else 'unmatched'
        if status=='unmatched' and matches:
            status='ambiguous' if not eligible else 'source-empty'
        snippets=[];sources=[]
        if p['sourceHint'] in generic:
            for r in eligible:
                if not text(r['description']):
                    continue
                candidates[str(r['id'])]=dict(map=r['gameMapId'],name=r['name'],category=r['landmarkCatalogName'],description=text(r['description']))
                hint=hints.get(str(r['id']))
                if hint:
                    assert len(hint)<=240 and '<' not in hint and '\\' not in hint
                    snippets.append(hint);sources.append(r['id'])
            if snippets:
                status='supplemented'
                hint=p['sourceHint']+'\n路书提示：'+'；'.join(dict.fromkeys(snippets))
                patches.append(dict(saveId=p['saveId'],location=p['location'],mapIds=p['mapIds'],
                    itemKeys=[i.get('nameKey') or i.get('id') for i in p['contents']],original=p['sourceHint'],hint=hint,sources=sources))
            elif any(text(r['description']) for r in eligible):
                status='source-no-detail' if all(r['id'] in reviewed['withoutDetail'] for r in eligible) else 'needs-review'
        row['status']=status;audit.append(row)
    # Native detail records have no item identity: audit them separately and
    # only augment co-located details sharing a supplemented catalogue source.
    native=[]
    for i,p in enumerate(cat['nativeDetails']):
        matching=[r for r in patches if p['mapID'] in r['mapIds'] and np.linalg.norm(np.array(p['location'])-r['location'])<3]
        native.append(dict(index=i,mapID=p['mapID'],category=p['category'],status='co-located' if matching else 'no-item-identity'))
    payload=dict(schema=1,date='2026-11-12',collector='1.0.14',patches=patches)
    matched_sources={s for r in audit for s in r['matched']}
    applied_sources={s for r in patches for s in r['sources']}
    source_audit=[dict(id=r['id'],map=r['gameMapId'],name=r['name'],category=r['landmarkCatalogName'],
        hasDescription=bool(text(r['description'])),status='supplemented' if r['id'] in applied_sources else
        'matched' if r['id'] in matched_sources else 'no-safe-catalogue-match') for r in gs.values()]
    result=dict(schema=1,date='2026-11-12',cataloguePoints=len(audit),nativeDetails=len(native),
        publicMarkers=len(gs),publicDescriptions=sum(bool(text(r['description'])) for r in gs.values()),
        status=dict(Counter(r['status'] for r in audit)),points=audit,native=native,sources=source_audit,
        inputs={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(CACHE.glob('map-*-getLandmarkList.json'))})
    (ROOT/'build/tracker-hint-candidates.json').write_text(json.dumps(candidates,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'authoring/item-description-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    out=ROOT/'Quest_Navigation/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts/PBZItemHintsData.lua'
    def literal(v):
        if isinstance(v,dict):return '{'+','.join('['+literal(k)+']='+literal(x) for k,x in v.items())+'}'
        if isinstance(v,list):return '{'+','.join(literal(x) for x in v)+'}'
        if isinstance(v,str):return json.dumps(v,ensure_ascii=False).replace('\\/', '/')
        return str(v)
    out.write_text('-- Reviewed location facts; full public source text stays in build/.\nreturn '+literal(payload)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['points','native','sources','inputs']},ensure_ascii=False))
    print('reviewable source descriptions:',len(candidates),'applied catalogue hints:',len(patches))

if __name__=='__main__':main()
