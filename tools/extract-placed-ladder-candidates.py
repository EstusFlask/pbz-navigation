"""Read-only ladder recovery with explicit mesh-axis candidate semantics."""
from pathlib import Path
import argparse,hashlib,json
from pbz_zen import Package,native_classes
from pbz_offline_assets import Assets
from pbz_game_packages import Reader
from pbz_ladder_candidates import extract
ROOT=Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args();out=a.output.resolve()
    if not out.is_relative_to(ROOT/'build')or out.exists():raise ValueError('Fresh private output only')
    out.mkdir(parents=True);classes=native_classes();assets=Assets(Reader(),classes,ROOT/'build/offline-navigation/assets');file=ROOT/'build/roadbook-11/all-placed-index.json';index=json.loads(file.read_bytes());rows=[];errors=[]
    schema_file=ROOT/'authoring/ladder-construction-schema.json';schema=json.loads(schema_file.read_bytes());blueprint=assets.load(schema['blueprint'])
    if blueprint.asset_sha256!=schema['blueprintSHA256']:raise ValueError('Ladder Blueprint differs from the reviewed prefix/construction schema')
    native=json.loads((ROOT/'authoring/offline-native-serialization-schema.json').read_bytes())
    if native['sourceBinarySHA256']!=schema['sourceBinarySHA256']:raise ValueError('Ladder native construction build differs')
    for r in [r for r in index if 'ClimLadder'in r['actor']]:
        raw=(ROOT/r['file']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=r['sha256']:raise ValueError('Cooked ladder package changed')
        package=Package(raw,classes);package.asset_name=r['package'];package.asset_sha256=r['sha256']
        try:
            row=extract(package,r['actor'],assets);row.update(world=r['world'],package=r['package'],packageSHA256=r['sha256']);rows.append(row)
        except (ValueError,KeyError,IndexError)as error:errors.append(dict(world=r['world'],guid=r['actor'],error=str(error)))
    sourceSHA256=hashlib.sha256(file.read_bytes()).hexdigest();worlds=sorted({r['world']for r in rows})
    for world in worlds:
        values=[{k:v for k,v in r.items()if k not in ['world','package','packageSHA256','componentEvidence']}for r in rows if r['world']==world];(out/(world+'.js')).write_text("'use strict';\nexports.rows="+json.dumps(values,separators=(',',':'))+';\n',encoding='utf-8')
    report=dict(schema=1,sourceIndexSHA256=sourceSHA256,constructionSchemaSHA256=hashlib.sha256(schema_file.read_bytes()).hexdigest(),extractorSHA256=hashlib.sha256(Path(__file__).with_name('pbz_ladder_candidates.py').read_bytes()).hexdigest(),scope='Actual cooked mesh/native construction axes; current loaded native trigger endpoints and conditions mandatory; no trajectory inputs',worlds=worlds,rows=rows,errors=errors,nativeTriggersCertified=False,physicalVerified=False)
    (out/'receipt.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');(out/'index.js').write_text("'use strict';\nconst worlds=new Set("+json.dumps(worlds)+");\nexports.forWorld=world=>worlds.has(world)?require('./'+world).rows:[];\n",encoding='utf-8');print('LADDER CANDIDATES',len(rows),'errors',len(errors),'worlds',len(worlds),flush=True)
if __name__=='__main__':main()
