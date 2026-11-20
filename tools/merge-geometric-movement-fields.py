"""Merge source-bound local Detour candidate fields, never selected paths.

Import bounded builder directories or audit features marked recast-boundary.
Accepted paths, player samples and placed actors are never read as edges.
The world-build SHA must match the existing geometry candidate manifest.
"""
from pathlib import Path
import argparse,hashlib,json,math
ROOT=Path(__file__).resolve().parents[1]
DATA_PREFIX="'use strict';\nexports.data="
ROWS_PREFIX="'use strict';\nexports.rows="
def decode(raw,prefix):
    text=raw.decode('utf-8').replace('\r\n','\n')
    if not text.startswith(prefix):raise ValueError('Unexpected movement module')
    return json.loads(text[len(prefix):].strip().removesuffix(';'))
def parse(file,prefix):
    return decode(file.read_bytes(),prefix)
def coordinates(p):
    if len(p)!=6 or any(not isinstance(v,(int,float))or not math.isfinite(v)or abs(v)>=1e10 for v in p):
        raise ValueError('Invalid candidate coordinate')
    return tuple(round(v*1000)for v in p)
def checked_coordinates(case,oracle,original):
    raw=case.read_bytes();proof=oracle.read_bytes()
    source=json.loads(raw);evidence=json.loads(proof);source_sha=hashlib.sha256(raw).hexdigest()
    if source_sha!=evidence.get('sourceCaseSHA256'):
        raise ValueError('Collision evidence source case changed')
    if evidence.get('schema')!=1 or source['number']!=evidence.get('number') or source['policy']!=evidence.get('policy'):
        raise ValueError('Collision evidence identity or policy differs')
    if any(source.get(k)!=original.get(k) for k in ('world','sourceIndexSHA256')):
        raise ValueError('Collision evidence belongs to another navigation build')
    features={}
    for feature in source['movementFeatures']:
        guid=feature['guid']
        if guid in features:raise ValueError('Ambiguous collision evidence feature')
        features[guid]=feature
    allowed=set();seen=set()
    for row in evidence['rows']:
        guid=row['guid'];feature=features.get(guid)
        if guid in seen or not feature or row['kind']!=feature['kind']:
            raise ValueError('Unknown or duplicate collision evidence feature')
        seen.add(guid)
        if feature.get('source')!='recast-boundary' or feature['kind'] not in ('surface','fall') or row.get('nativeActionUncertified') is not False:
            continue
        forward=row.get('validation')
        reverse=row.get('reverseValidation') if feature.get('both') is True and feature['kind']=='surface' else None
        if not any(isinstance(v,dict) and not v.get('nativePadOnly') and isinstance(v.get('points'),list) and len(v['points'])>=2 for v in (forward,reverse)):
            continue
        a,b=feature['path']
        allowed.add(coordinates([*a,*b]))
    return allowed,dict(sourceCaseSHA256=source_sha,oracleSHA256=hashlib.sha256(proof).hexdigest(),checkedFeatures=len(seen),passedGeometryCoordinates=len(allowed),scope='Geometry filter only; never creates connections from route or validation paths')
def read_builder_field(folder,original,add,allowed=None):
    raw=(folder/'index.js').read_bytes();field=decode(raw,DATA_PREFIX)
    if field.get('schema')!=1 or field.get('kind')!='geometry-movement-proposals' or field.get('pageRows')!=512 or not field.get('rootedAtPlacedComponents') or not(field.get('region') or field.get('corridorSpec')):
        raise ValueError('Expected a bounded rooted geometry field')
    if any(field.get(k)!=original.get(k) for k in ('world','sourceIndexSHA256','navigationGrid','sourceGridIndexSHA256')):
        raise ValueError('Candidate field belongs to another navigation build or grid')
    pages,expected=field.get('pages'),field.get('rows')
    if type(expected) is not int or expected<0 or type(pages) is not int or pages!=(expected+511)//512:
        raise ValueError('Invalid movement field row count or page count')
    digest=hashlib.sha256();count=0;admitted=0
    for page in range(pages):
        payload=(folder/f'{page}.js').read_bytes();digest.update(hashlib.sha256(payload).digest())
        rows=decode(payload,ROWS_PREFIX)
        if not isinstance(rows,list) or len(rows)!=min(512,expected-count):raise ValueError('Invalid movement field row count')
        for row in rows:
            if allowed is None or coordinates(row) in allowed:
                add(row);admitted+=1
        count+=len(rows)
    return dict(sourceSHA256=hashlib.sha256(raw).hexdigest(),orderedPageHashesSHA256=digest.hexdigest(),sourceIndexSHA256=field['sourceIndexSHA256'],sourceGridIndexSHA256=field.get('sourceGridIndexSHA256'),generatedCandidates=count,admittedCandidates=admitted,fieldExtentCm=field.get('fieldExtentCm'),inboundRoots=field.get('inboundRoots',False))
def merge(source,files,output,action_proof=None):
    original=parse(source/'index.js',"'use strict';\nexports.data=")
    if original['schema']!=1 or original['kind']!='geometry-movement-proposals':raise ValueError('Expected original candidate coordinates')
    if output.exists():raise ValueError('Fresh private output required')
    rows={}
    def add(p):
        fixed=coordinates(p);rows[fixed]=[v/1000 for v in fixed]
    for page in range(original['pages']):
        for row in parse(source/f'{page}.js',"'use strict';\nexports.rows="):add(row)
    prior=len(rows);proof=[]
    if action_proof and any(not p.is_dir() for p in files):
        raise ValueError('Collision filter requires builder fields')
    allowed,filter_receipt=checked_coordinates(*action_proof,original) if action_proof else (None,None)
    for file in files:
        if file.is_dir():
            record=read_builder_field(file,original,add,allowed)
            if filter_receipt:record['collisionFilter']=filter_receipt
            proof.append(record);continue
        raw=file.read_bytes();field=json.loads(raw)
        if field['world']!=original['world']or field.get('sourceIndexSHA256')!=original['sourceIndexSHA256']:raise ValueError('Candidate field belongs to another navigation build')
        count=0
        for feature in field['movementFeatures']:
            if feature.get('source')!='recast-boundary':continue
            if len(feature['path'])!=2:raise ValueError('Generated movement candidate has unexpected waypoints')
            add([*feature['path'][0],*feature['path'][1]]);count+=1
        proof.append(dict(sourceSHA256=hashlib.sha256(raw).hexdigest(),sourceIndexSHA256=field['sourceIndexSHA256'],generatedCandidates=count))
    output.mkdir(parents=True);values=list(rows.values());pages=math.ceil(len(values)/512)
    for i in range(pages):(output/f'{i}.js').write_text("'use strict';\nexports.rows="+json.dumps(values[i*512:(i+1)*512],separators=(',',':'))+';\n',encoding='utf-8')
    manifest={**original,'pages':pages,'rows':len(values),'coverage':[],'supplementalGeometrySources':[*original.get('supplementalGeometrySources',[]),*proof],'mergeToolSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()};(output/'index.js').write_text("'use strict';\nexports.data="+json.dumps(manifest,separators=(',',':'))+';\n',encoding='utf-8')
    receipt=dict(schema=1,world=original['world'],priorRows=prior,mergedRows=len(values),addedRows=len(values)-prior,sources=proof,sourceIndexSHA256=original['sourceIndexSHA256'],scope='Only generated Detour boundary coordinates; no accepted path or trajectory inputs',physicalVerified=False);output.with_name(output.name+'.merge-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8');print(json.dumps(receipt),flush=True)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--fields',type=Path,nargs='+',required=True);p.add_argument('--action-proof',type=Path,nargs=2,metavar=('CASE','ORACLE'));a=p.parse_args()
    if not a.output.resolve().is_relative_to(ROOT/'build'):raise ValueError('Private output only')
    merge(a.source.resolve(),[f.resolve()for f in a.fields],a.output.resolve(),a.action_proof)
if __name__=='__main__':main()
