"""Assemble complementary, hash-verified vertical grids without joining them."""
from pathlib import Path
from collections import Counter
import argparse,hashlib,json,os,shutil
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--world',type=Path,required=True);args=parser.parse_args();folder=args.world.resolve()
if not folder.is_relative_to(ROOT/'build'):raise ValueError('Private output only')
coverage=json.loads((folder/'coverage.json').read_text());inventory=json.loads((folder/'inventory.json').read_text())
rows=[];graphs=[];blobs={};actors={};populations=[];counts=Counter();bands=[]
for name in ['normal','giant']:
    file=folder/'grids'/name/'navigation-index.json';raw=file.read_bytes();index=json.loads(raw);policy=index['gridPolicy']
    if index['remainingTiles']or index['failures']or index['extractionBuildID']!=coverage['buildID']or index['sourceRootSHA256']!=inventory['rootSHA256']:raise ValueError('Incomplete or incompatible subgrid')
    if any(v for k,v in index['indexFailures'].items()if k!='pending-collision-semantics'):raise ValueError('Unresolved subgrid index failure')
    bands.append(policy['zBandUE']);populations.append(index['gridPopulation']);counts.update({k:index[k]for k in ['candidateTiles','compiledTiles','compiledLayers','remainingTiles']})
    for identity,blob in index['blobs'].items():blobs[identity]={**blob,'file':'grids/'+name+'/'+blob['file']}
    actors.update({a['id']:a for a in index['actors']})
    rows.append(dict(id=name,folder='grids/'+name,sourceIndexSHA256=hashlib.sha256(raw).hexdigest(),selector=dict(mode=policy['mode'],zBandUE=policy['zBandUE']),cellCm=index['cellCm'],extentCm=index['extentCm']))
    graphs.append(index)
if bands[0]!=bands[1]or [g['gridPolicy']['mode']for g in graphs]!=['exclude','include']:raise ValueError('Subgrids are not complementary')
if sum(p['selectedTriangles']for p in populations)!=coverage['triangles']:raise ValueError('Subgrid triangle conservation failed')
if any(populations[0]['selected'+k]!=populations[1]['delegated'+k]for k in ['Sources','Triangles']):raise ValueError('Subgrid source conservation failed')
result=dict(schema=1,world=inventory['world'],kind='multi-grid-world',engine=graphs[0]['engine'],unknownState='closed',grids=rows,**counts,
            totalPackages=coverage['totalPackages'],completedPackages=coverage['completedPackages'],sourceRootSHA256=inventory['rootSHA256'],extractionBuildID=coverage['buildID'],
            sourceLedgerSHA256=graphs[0]['sourceLedgerSHA256'],gridPopulations=populations,blobs=blobs,actors=list(actors.values()),tiles=[],failures=[],indexFailures={},
            sourceTriangleConservation=sum(p['selectedTriangles']for p in populations),completeCollisionClaim=False,physicalVerified=False,
            gridPolicy='Independent vertical graphs. Ordinary grid remains 10cm. Giant-box stratum uses conservative complete-cell support and obstacle-column exclusion; no implicit cross-grid connection.')
file=folder/'navigation-index.json';prior=folder/'navigation-index.pre-subgrid.json'
if file.exists()and not prior.exists():shutil.copyfile(file,prior)
tmp=file.with_suffix('.tmp');tmp.write_text(json.dumps(result,separators=(',',':')));os.replace(tmp,file)
print('GRID SET',inventory['world'],dict(counts),'triangles conserved',result['sourceTriangleConservation'],flush=True)
