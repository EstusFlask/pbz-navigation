"""Author candidate positions from observed grounded feet, never runtime trails."""
from pathlib import Path
import argparse,hashlib,json,math

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--trace',type=Path,action='append',required=True)
parser.add_argument('--expected-sha256',action='append',required=True)
args=parser.parse_args()
if len(args.trace)!=len(args.expected_sha256):raise SystemExit('Each source trace needs its expected SHA256')
points={};sources=[]
def observations(trace,raw):
    if trace.suffix.lower()=='.json':
        data=json.loads(raw)
        if data.get('schema')!=1 or data.get('kind')!='reviewed-survey-reference' or data.get('review',{}).get('acceptedAsCorrect')is not True:
            raise SystemExit('Only explicitly reviewed survey references may supply JSON candidates')
        if data.get('capture',{}).get('gaps'):raise SystemExit('Review sample gaps before compiling grounded candidates')
        for row in data['samples']:
            if row.get('world','').lower()!='pbz_xigu_wp' or row.get('mode')!=1:continue
            foot,floor=row.get('p'),row.get('floor')
            if not foot or not floor:continue
            yield [foot[k]for k in ['x','y','z']],[floor[k]for k in ['x','y','z']]
        return
    for line in raw.decode('utf-8').splitlines():
        row=json.loads(line);foot=row.get('feet');floor=row.get('floor',{});hit=floor.get('ImpactPoint')
        if row.get('world','').lower()!='pbz_xigu_wp' or row.get('movementMode')!=1:continue
        if not foot or not hit or not floor.get('bWalkableFloor') or not floor.get('bBlockingHit'):continue
        yield foot,hit
for trace,digest in zip(args.trace,args.expected_sha256):
    raw=trace.read_bytes();file_digest=hashlib.sha256(raw).hexdigest();canonical_digest=hashlib.sha256(raw.replace(bytes([13,10]),bytes([10]))).hexdigest()
    if digest not in (file_digest,canonical_digest):raise SystemExit('Source trace fingerprint mismatch: '+str(trace))
    before=len(points)
    for foot,hit in observations(trace,raw):
        if not all(math.isfinite(v) for v in [*foot,*hit]) or abs(foot[2]-hit[2])>15:continue
        p=[round(foot[0],1),round(foot[1],1),round(hit[2],1)]
        key=(round(p[0]/25),round(p[1]/25),round(p[2]/10))
        points.setdefault(key,p)
    sources.append({'trace':trace.resolve().relative_to(ROOT).as_posix(),'sourceSHA256':digest,
        'sourceFileSHA256':file_digest,'canonicalLFSHA256':canonical_digest,'addedCandidates':len(points)-before})
data={'world':'pbz_xigu_wp',**{k:sources[0][k] for k in ['sourceSHA256','sourceFileSHA256','canonicalLFSHA256']},
      'sources':sources,'role':'search candidates only; no connectivity or physical certification','points':list(points.values())}
out=ROOT/'Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteWalkHintData'
out.mkdir(exist_ok=True)
(out/'pbz_xigu_wp.js').write_text("'use strict';"+chr(10)+"// Grounded author observations; every use still requires live step checks."+chr(10)+"exports.data="+json.dumps(data,separators=(',',':'))+';'+chr(10),encoding='utf-8')
print(json.dumps({'points':len(points),'sources':sources,'output':str(out)},ensure_ascii=False))
