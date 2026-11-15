"""Archive a user-confirmed field reference without changing game reports or saves."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--attempt', required=True)
parser.add_argument('--correct-route-statement', required=True)
parser.add_argument('--input', type=Path, default=ROOT/'build/development-cases')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = args.input.resolve()
manifest_file = source/f'PBZQuestRoute-survey-{args.attempt}.json'
assert manifest_file.parent == source
manifest = json.loads(manifest_file.read_bytes())
assert manifest['attemptId'] == args.attempt and manifest['kind'] == 'survey'
files = [manifest_file]
chunks = []
for i, ref in enumerate(manifest['chunks'], 1):
    file = source/ref['file']
    assert file.parent == source and file.name == f'PBZQuestRoute-surveydata-{args.attempt}-{i:03}.json'
    data = json.loads(file.read_bytes())
    assert data['attemptId'] == args.attempt and data['index'] == i
    chunks.append(data)
    files.append(file)
raw_samples = [s for c in chunks for s in c['samples']]
assert len(raw_samples) == manifest['sampleCount']
samples = []
for row in raw_samples:
    physical = row.get('physical', {})
    samples.append(dict(at=row['at'], context=row['context'], world=row['world'], p=row['feet'],
                        mode=physical.get('mode'), customMode=physical.get('customMode'),
                        floor=physical.get('movementFloor')))


def dist(a, b):
    return math.sqrt(sum((a[k]-b[k])**2 for k in ('x', 'y', 'z')))


gaps = []
for a, b in zip(samples, samples[1:]):
    if a['context'] != b['context'] or b['at']-a['at'] > 1000 or dist(a['p'], b['p']) > 1200:
        gaps.append(dict(after=a['at'], before=b['at']))
assert not gaps, 'Review discontinuities before accepting a continuous reference'
markers = []
for c in chunks:
    for event in [*c.get('markers', []), *c.get('events', [])]:
        if event['kind'] != 'user marker':
            continue
        file = source/Path(event['data']['path']).name
        data = json.loads(file.read_bytes())
        assert data.get('surveyAttempt') == args.attempt
        files.append(file)
        state = data['snapshot']
        markers.append(dict(case=data['caseId'], at=data['at'], kind=data.get('markerKind'),
            feet=data['before']['samples'][-1]['feet'], renderedInputs=len(state.get('rendered', [])),
            legs=[{k: leg.get(k) for k in ('provider', 'partial', 'diagnostic', 'meters', 'moves', 'obstacles')}
                  for leg in state.get('trip', {}).get('legs', [])]))
segments = []
for i, row in enumerate(samples):
    if not segments or segments[-1]['mode'] != row['mode']:
        segments.append(dict(mode=row['mode'], first=i, last=i))
    else:
        segments[-1]['last'] = i
descents = []
for segment in segments:
    if segment['mode'] == 1:
        continue
    first = max(0, segment['first']-1)
    last = min(len(samples)-1, segment['last']+1)
    a, b = samples[first], samples[last]
    descents.append(dict(first=first, last=last, fromAt=a['at'], toAt=b['at'],
        verticalDropCm=a['p']['z']-b['p']['z'], xyCm=math.hypot(a['p']['x']-b['p']['x'], a['p']['y']-b['p']['y']),
        scope='Observed falling/descent; no walking edge or reverse permission'))
output = args.output.resolve()
assert output.is_relative_to(ROOT/'authoring')
archive = ROOT/'build'/f'field-survey-{args.attempt}-raw.zip'
fingerprints = []
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for file in dict.fromkeys(files):
        raw = file.read_bytes()
        z.writestr(file.name, raw)
        fingerprints.append(dict(file=file.name, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
reference = dict(schema=1, kind='reviewed-survey-reference', task=manifest['task'],
    world=manifest['task']['world'], sourceBuild=manifest['build'], sourceAttempt=args.attempt,
    review=dict(acceptedAsCorrect=True, userStatement=args.correct_route_statement, clientDate='2026-11-15',
                scope='Observed forward route only; navigation acceptance, inverse movement and shortest path are not certified'),
    capture=dict(status=manifest['status'], reason=manifest.get('reason'), manualCompletion=manifest.get('completionInput'),
                 sampleCount=len(samples), observedMeters=sum(dist(a['p'], b['p']) for a, b in zip(samples, samples[1:]))/100,
                 seconds=(samples[-1]['at']-samples[0]['at'])/1000, startDistanceCm=dist(samples[0]['p'], manifest['task']['start']['p']),
                 endDistanceCm=dist(samples[-1]['p'], manifest['task']['end']['p']), gaps=gaps),
    provenance=dict(archive=archive.relative_to(ROOT).as_posix(), archiveSHA256=hashlib.sha256(archive.read_bytes()).hexdigest(), files=fingerprints),
    samples=samples, segments=segments, descents=descents, markers=markers,
    runtimePolicy='Only grounded candidates may be compiled; air intervals stay separate; every connector needs live support/body/lock checks')
output.write_text(json.dumps(reference, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(reference=str(output), samples=len(samples), status=manifest['status'],
                      observedMeters=reference['capture']['observedMeters'], descents=descents,
                      markers=[m['case'] for m in markers], archive=str(archive)), ensure_ascii=False))
