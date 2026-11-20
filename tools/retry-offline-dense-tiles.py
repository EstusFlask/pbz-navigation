"""Retry only failed offline materializations with a reviewed execution budget.

This changes neither collision, agent, voxel size nor tile extent. It never
changes the runtime frame guard. The exception and exact counts are recorded.
"""
from pathlib import Path
import argparse,importlib.util,json
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('world_tiles',ROOT/'tools/build-offline-world-tiles.py')
tiles=importlib.util.module_from_spec(spec);spec.loader.exec_module(tiles)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--world',type=Path,required=True)
parser.add_argument('--geometry-budget',type=int,default=3000000)
parser.add_argument('--review-note',required=True)
args=parser.parse_args();folder=args.world.resolve()
if not folder.is_relative_to(ROOT/'build')or not 2000000<args.geometry_budget<=4000000:raise ValueError('Invalid private offline retry budget')
metadata=json.loads((folder/'spatial-index.json').read_text());nav=json.loads((folder/'navigation-index.json').read_text())
failures=nav['failures']
if not failures or len(failures)>16 or any(r.get('phase')!='geometry-materialization'or 'memory budget exceeded'not in r['error']for r in failures):raise ValueError('Review failed materializations individually')
local={**metadata,'maxGeometryVertices':args.geometry_budget,'maxGeometryTriangles':args.geometry_budget,'materializerSHA256':tiles.digest(ROOT/'tools/build-offline-world-tiles.py')}
result=tiles.bake_worker('dense-retry',[(r['x'],r['y'])for r in failures],folder,local,True)
evidence=dict(schema=1,scope='Offline execution budget only; exact geometry and Recast configuration unchanged',reviewNote=args.review_note,previousFailures=failures,geometryBudget=args.geometry_budget,result=result,
              materializerSHA256=local['materializerSHA256'],tiles=[json.loads((folder/'tiles'/f'{r["x"]}_{r["y"]}'/'receipt.json').read_text())for r in failures])
tiles.atomic_json(folder/'dense-tile-retry.json',evidence)
metadata['materializationExecutionOverrides']=dict(file='dense-tile-retry.json',sha256=tiles.digest(folder/'dense-tile-retry.json'))
tiles.finalize(folder,metadata,args.review_note)
if result['failed']:raise SystemExit(1)
