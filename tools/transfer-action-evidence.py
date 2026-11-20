"""Reuse per-action physics only when the complete source feature is identical."""
from pathlib import Path
import argparse,hashlib,importlib.util,json
ROOT=Path(__file__).resolve().parents[1]
def digest(raw):return hashlib.sha256(raw).hexdigest()
def features(source):
    result={feature['guid']:feature for feature in source['movementFeatures']}
    if len(result)!=len(source['movementFeatures']):raise ValueError('Ambiguous source feature identity')
    return result
def signature(feature):return json.dumps(feature,sort_keys=True,separators=(',',':'),allow_nan=False)
def transfer_records(old_bytes,proof,new_bytes,identity):
    old=json.loads(old_bytes);new=json.loads(new_bytes)
    if proof.get('schema')!=1 or proof.get('number')!=old['number'] or proof.get('sourceCaseSHA256')!=digest(old_bytes) or proof.get('policy')!=old['policy']:
        raise ValueError('Old evidence source or policy differs')
    if any(old.get(key)!=new.get(key)for key in ('world','sourceIndexSHA256','policy')):
        raise ValueError('Evidence navigation build or movement policy differs')
    if any(proof.get(key)!=identity.get(key)for key in ('oracleToolSHA256','checkerDependenciesSHA256','geometryIndexSHA256')):
        raise ValueError('Evidence checker or geometry differs')
    has_failures=any(row.get('failure')is not None or row.get('reverseFailure')is not None for row in proof['rows'])
    if ('failureSchema'in proof or has_failures)and proof.get('failureSchema')!=1:
        raise ValueError('Unsupported evidence failure schema')
    before=features(old);after=features(new);rows=[];seen=set()
    for row in proof['rows']:
        guid=row['guid'];feature=before.get(guid)
        if guid in seen or feature is None or row['kind']!=feature['kind'] or row.get('nativeActionUncertified')!=(feature['kind']not in ('surface','fall')):
            raise ValueError('Unknown or ambiguous evidence feature')
        seen.add(guid)
        if guid in after and signature(feature)==signature(after[guid]):rows.append(row)
    return dict(schema=1,**({'failureSchema':1}if proof.get('failureSchema')==1 else{}),number=new['number'],sourceCaseSHA256=digest(new_bytes),**identity,scope='Exact complete-feature identity transfer of cooked action physics only; no route, live native or game acceptance',policy=new['policy'],rows=rows,physicalVerified=False,reusedEvidence=dict(sourceCaseSHA256=digest(old_bytes),sourceOracleSHA256=digest(json.dumps(proof,sort_keys=True,separators=(',',':')).encode()),checkedFeatures=len(proof['rows']),reusedFeatures=len(rows),transferRule='Complete serialized source feature, world, navigation, policy, checker and geometry identity'))
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('old_case',type=Path);parser.add_argument('old_oracle',type=Path);parser.add_argument('new_case',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
    output=args.output.resolve()
    if not output.is_relative_to(ROOT/'build')or output.exists():raise ValueError('Fresh private evidence output required')
    target=json.loads(args.new_case.read_bytes());checker=ROOT/'tools/build-custom-route-action-oracle.py';dependencies={file:digest((ROOT/file).read_bytes())for file in ['tools/validate-offline-body.py','tools/prepared-triangle-distance.py','tools/build-offline-world-tiles.py']}
    spec=importlib.util.spec_from_file_location('current_oracle',checker);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);dependencies['numpyVersion']=module.np.__version__
    geometry=ROOT/'build/offline-navigation/worlds'/target['world'];geometry=geometry/'grids/normal'if target['world']=='pbz_ximeng_wp'else geometry
    identity=dict(oracleToolSHA256=digest(checker.read_bytes()),checkerDependenciesSHA256=dependencies,geometryIndexSHA256=digest((geometry/'spatial-index.json').read_bytes()))
    report=transfer_records(args.old_case.read_bytes(),json.loads(args.old_oracle.read_bytes()),args.new_case.read_bytes(),identity);report['reusedEvidence'].update(sourceOracleFileSHA256=digest(args.old_oracle.read_bytes()),transferToolSHA256=digest(Path(__file__).read_bytes()))
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report['reusedEvidence']),flush=True)
if __name__=='__main__':main()
