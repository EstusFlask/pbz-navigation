"""Extract validation-only grounded samples; never a geometry authoring input."""
from pathlib import Path
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]


def main():
    files=sorted((ROOT/'build/field-route1-181').glob('PBZQuestRoute-dev-20261115T102431962Z-*.json'))
    samples={};sources=[]
    for file in files:
        raw=file.read_bytes();record=json.loads(raw)
        sources.append(dict(file=file.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(raw).hexdigest()))
        for window in ('before','after'):
            for row in record[window]['samples']:
                physical=row.get('physical') or {};floor=physical.get('movementFloor')
                if row.get('world')!='pbz_pangzhen_wp' or physical.get('mode')!=1 or not isinstance(floor,dict):continue
                if not all(k in floor for k in ('x','y','z')):continue
                samples[row['at']]=dict(at=row['at'],p=[floor[k] for k in ('x','y','z')],feet=[row['feet'][k] for k in ('x','y','z')])
    out=ROOT/'build/offline-navigation/route-001/validation-samples.json'
    out.write_text(json.dumps(dict(schema=1,role='validation only; forbidden as collision/navigation authoring input',
                                  sources=sources,samples=sorted(samples.values(),key=lambda row:row['at'])),indent=2)+'\n',encoding='utf-8')
    print('Grounded validation samples',len(samples),'sources',len(sources))


if __name__=='__main__':main()
