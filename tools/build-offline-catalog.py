"""Discover and build every cooked PBZ world, with per-world receipts.

Installed packages are read-only. Non-gameplay map roots remain in the census;
they are never silently counted as rebuilt worlds.
"""
from pathlib import Path
from collections import Counter
import argparse
import importlib.util
import json
import os
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('world_builder', ROOT/'tools/build-offline-world.py')
world = importlib.util.module_from_spec(spec)
spec.loader.exec_module(world)


def discover(file):
    roots = {}
    generated = Counter()
    for line in file.read_text(encoding='utf-8').splitlines():
        _, chunk, kind, path = line.split(None, 3)
        if kind != 'ExportBundleData' or not path.startswith('../../../ProjectPBZ/Content/Maps/') or not path.endswith('.umap'):
            continue
        name = '/Game' + path[len('../../../ProjectPBZ/Content'):].rsplit('.', 1)[0]
        if '/_Generated_/' in name:
            generated[name.split('/_Generated_/')[0]] += 1
        else:
            roots[name] = chunk
    missing = sorted(set(generated)-set(roots))
    if missing:
        raise ValueError('Generated packages have no indexed map root: '+str(missing))
    return [dict(world=n.rsplit('/', 1)[-1].lower(), worldPackage=n, rootChunk=c,
                 indexedGeneratedPackages=generated[n],
                 selected=n.rsplit('/', 1)[-1].startswith('PBZ_') and generated[n] > 0,
                 reason='cooked PBZ partitioned world' if n.rsplit('/', 1)[-1].startswith('PBZ_') and generated[n] > 0
                 else 'sequence, transition, service or performance map; retained for scope review')
            for n, c in sorted(roots.items())]


def run(args, folder, phase):
    log = folder/(phase+'.log')
    print(phase, folder.name, flush=True)
    with log.open('w', encoding='utf-8') as stream:
        result = subprocess.run([sys.executable, *map(str, args)], cwd=ROOT, stdout=stream,
                                stderr=subprocess.STDOUT, env=None)
    if result.returncode:
        raise RuntimeError(f'{phase} failed ({result.returncode}); see {log}')


def snapshot(folder, rows, evidence=False):
    for row in rows:
        if not row['selected']:
            continue
        dest = folder/row['world']
        for filename, key in [('coverage.json', 'extraction'), ('geometry-validation.json','geometry'), ('spatial-index.json', 'spatial'), ('navigation-index.json', 'navigation')]:
            file = dest/filename
            if not file.exists():
                continue
            record = json.loads(file.read_text(encoding='utf-8'))
            keys = ('totalPackages', 'completedPackages', 'remainingPackages', 'triangles', 'vertices',
                    'candidateTiles', 'compiledTiles', 'compiledLayers', 'remainingTiles', 'buildID',
                    'spatialIndexSHA256', 'compilerSHA256','verifiedPackages','sourceLedgerSHA256')
            row[key] = {k: record[k] for k in keys if k in record}
            row[key]['failures'] = len(record.get('unresolved', record.get('failures', [])))
            if key=='navigation':
                row[key]['uniqueBlobs']=len(record['blobs']);row[key]['navigationBytes']=sum(b['bytes'] for b in record['blobs'].values())
        if evidence:
            row['artifacts']={name:dict(bytes=(dest/name).stat().st_size,sha256=world.digest(dest/name)) for name in
                              ('inventory.json','coverage.json','geometry-validation.json','spatial-index.json','navigation-index.json','corridors.json',
                               'cell-semantics.json','component-coverage.json','cooked-gates-audit.json','dynamic-compression-audit.json') if (dest/name).exists()}
    selected=[r for r in rows if r['selected']]
    baked=[r['navigation'] for r in selected if r.get('navigation',{}).get('remainingTiles')==0 and not r['navigation']['failures']]
    report = dict(schema=1, maps=rows, selectedWorlds=sum(r['selected'] for r in rows),
                  totals=dict(inventoriedPackages=sum(r['indexedGeneratedPackages']+1 for r in selected),
                              extractedPackages=sum(r.get('extraction',{}).get('completedPackages',0) for r in selected),
                              triangles=sum(r.get('extraction',{}).get('triangles',0) for r in selected),
                              collisionParseFailures=sum(r.get('extraction',{}).get('failures',0) for r in selected),
                              knownGeometryValidationFailures=sum(r.get('geometry',{}).get('failures',0) for r in selected),
                              bakedWorlds=len(baked),spatialTiles=sum(r['compiledTiles'] for r in baked),heightLayers=sum(r['compiledLayers'] for r in baked),
                              uniqueBlobs=sum(r['uniqueBlobs'] for r in baked),navigationBytes=sum(r['navigationBytes'] for r in baked)),
                  updatedUnix=time.time(), completeCollisionClaim=False, physicalVerified=False)
    temporary=folder/('catalog-build.'+str(os.getpid())+'.tmp')
    temporary.write_text(json.dumps(report,separators=(',',':')),encoding='utf-8')
    os.replace(temporary,folder/'catalog-build.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['inventory', 'extract', 'bake', 'all', 'status'])
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('--world', action='append', help='Exact world identifier; absent selects every PBZ world')
    parser.add_argument('--reuse-successful-build', action='append', default=[])
    parser.add_argument('--compatibility-note')
    args = parser.parse_args()
    if not 1 <= args.jobs <= 8:
        raise ValueError('jobs must be 1..8')
    folder = ROOT/'build/offline-navigation/worlds'
    folder.mkdir(parents=True, exist_ok=True)
    rows = discover(ROOT/'build/game-files.txt')
    if args.world and not set(args.world) <= {r['world'] for r in rows if r['selected']}:
        raise ValueError('Unknown world selector')
    if args.phase == 'status':
        snapshot(folder, rows, True)
        print(json.dumps(rows, ensure_ascii=False))
        return
    reader = world.Reader()
    classes = world.native_classes()
    assets = world.TrackingAssets(reader, classes, ROOT/'build/offline-navigation/assets')
    assets.dependencies = {}
    errors = []
    # Inventory all worlds before starting expensive work on any one world.
    for row in rows:
        if not row['selected']:
            continue
        dest = folder/row['world']
        dest.mkdir(exist_ok=True)
        try:
            inventory = world.world_inventory(reader, classes, assets, row['worldPackage'], dest)
            world.atomic_json(dest/'inventory.json', inventory)
            row['inventoryPackages'] = len(inventory['cells'])
            row['inventoryFailures'] = inventory['inventoryFailures']
            if inventory['inventoryFailures']:
                raise ValueError('World inventory has unaccounted packages')
            print('INVENTORY', row['world'], len(inventory['cells']), flush=True)
        except Exception as error:
            row['error'] = repr(error)
            errors.append(row['world'])
        snapshot(folder, rows)
    for row in rows:
        if not row['selected'] or row.get('error') or args.world and row['world'] not in args.world:
            continue
        dest = folder/row['world']
        try:
            if args.phase in ('extract', 'all'):
                reuse=[part for build in args.reuse_successful_build for part in ['--reuse-successful-build',build]]
                if args.compatibility_note:reuse+=['--compatibility-note',args.compatibility_note]
                run([ROOT/'tools/build-offline-world.py', '--world-package', row['worldPackage'], '--output', dest,*reuse], dest, 'extract')
                coverage = json.loads((dest/'coverage.json').read_text(encoding='utf-8'))
                if coverage['remainingPackages'] or coverage['unresolved'] or coverage['inventoryFailures']:
                    raise ValueError('Extraction has unresolved collision/package failures')
            if args.phase in ('bake', 'all'):
                coverage=json.loads((dest/'coverage.json').read_text(encoding='utf-8'))
                if coverage['remainingPackages'] or coverage['unresolved'] or coverage['inventoryFailures']:
                    raise ValueError('Resolve extraction failures before baking this world')
                prior_file=dest/'navigation-index.json';is_grid_set=False
                if prior_file.exists():
                    with prior_file.open('rb')as stream:is_grid_set=b'"multi-grid-world"'in stream.read(512)
                if is_grid_set:
                    existing=json.loads(prior_file.read_text())
                    if existing['extractionBuildID']!=coverage['buildID']:raise ValueError('Grid-set extraction changed; rebuild leaf policies and reassemble explicitly')
                    for grid in existing['grids']:
                        file=dest/grid['folder']/'navigation-index.json';child=json.loads(file.read_text())
                        if world.digest(file)!=grid['sourceIndexSHA256']or child['remainingTiles']or child['failures']:raise ValueError('Incomplete or changed subgrid; reassemble explicitly')
                    print('GRID SET already complete; leaf hashes verified:',row['world'],flush=True)
                    continue
                if not (dest/'spatial-index.json').exists():
                    run([ROOT/'tools/build-offline-world-tiles.py', 'index', '--world', dest], dest, 'index')
                run([ROOT/'tools/build-offline-world-tiles.py', 'bake', '--world', dest, '--jobs', args.jobs], dest, 'bake')
                nav = json.loads((dest/'navigation-index.json').read_text(encoding='utf-8'))
                if nav['remainingTiles'] or nav['failures']:
                    raise ValueError('Navigation bake has unresolved tiles')
        except Exception as error:
            row['error'] = repr(error)
            errors.append(row['world'])
        snapshot(folder, rows)
    print('CATALOG RESULT', len([r for r in rows if r['selected']]), 'worlds;', len(errors), 'failures', flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
