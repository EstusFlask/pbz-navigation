"""Resumable reconstruction of risky legacy tiles into a separate candidate.

Reads the immutable spatial index and old receipts; never replaces world data,
compressed packages, installed Mods, saves, or manager state. Every rebuilt
input must match the original materialized geometry hash.
"""
from pathlib import Path
import argparse,concurrent.futures,hashlib,importlib.util,json,sqlite3,subprocess,sys,time
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('world_tiles',ROOT/'tools/build-offline-world-tiles.py');tiles=importlib.util.module_from_spec(spec);spec.loader.exec_module(tiles)
COMPILER_FILES=['offline-navigation/build-world-tile.mjs','offline-navigation/cli.mjs','offline-navigation/build-settings.json','offline-navigation/nav-set.mjs','offline-navigation/grid-mask.mjs','offline-navigation/package-lock.json','offline-navigation/node_modules/@recast-navigation/wasm/dist/recast-navigation.wasm.wasm']
def compiler_hash():
    h=hashlib.sha256()
    for name in COMPILER_FILES:h.update((ROOT/name).read_bytes())
    return h.hexdigest()
def canonical_input(local,materializer=None):
    config={k:local['metadata'][k]for k in ('world','originUE','cellCm','tileCells','borderCm','extentCm','agent','materializerSHA256')}
    if materializer is not None:config['materializerSHA256']=materializer
    value={k:local[k]for k in ('x','y','layers','conditionalRanges','sourcePackages','meshSHA256','vertices','triangles')}
    for name in ('conservativeGridMask','nonWalkableBoundsUE'):
        if local.get(name):value[name]=local[name]
    value['config']=config
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def validated(folder,original,compiler):
    file=folder/'receipt.json'
    if not file.exists():return None
    r=json.loads(file.read_bytes())
    if r.get('error')or r.get('compilerSHA256')!=compiler or not r.get('rasterCoverage'):return None
    localfile=folder/'input.json'
    if not localfile.exists():return None
    local=json.loads(localfile.read_bytes())
    # The old hash includes the old materializer's source identity. Recompute
    # that canonical contract using current geometry to prove it is identical,
    # while recording the actual current execution identity separately.
    if canonical_input(local)!=r['inputSHA256']or canonical_input(local,original['materializerSHA256'])!=original['inputSHA256']:return None
    for c in r['rasterCoverage']:
        if c.get('schema')!=1 or c.get('triangles',0)>0 and c.get('queries')not in (1,2):return None
        if c.get('largestOverlap',0)>c.get('largestCapacity',0):return None
        if c.get('largestOverlap',0)==c.get('largestCapacity',0)<c.get('triangles',0):return None
    if any(not(folder/b['file']).is_file()or tiles.digest(folder/b['file'])!=b['sha256']for b in r['blobs'].values()):return None
    return r
def worker(number,record,rows,output,compiler):
    folder=ROOT/record['folder'];world=record['world'];grid='main'if record['grid']=='.'else Path(record['grid']).name
    destination=output/world/grid;work=destination/'work'/str(number);work.mkdir(parents=True,exist_ok=True)
    m=json.loads((folder/'spatial-index.json').read_bytes());m['materializerSHA256']=tiles.digest(ROOT/'tools/build-offline-world-tiles.py')
    if tiles.digest(folder/'spatial.sqlite')!=m['databaseSHA256']:raise ValueError('Spatial index changed')
    # Four previously reviewed dense tiles needed the existing 3M execution
    # override. Preserve that exact geometry rather than silently omitting it.
    m['maxGeometryTriangles']=max(m['maxGeometryTriangles'],3000000)
    db=sqlite3.connect(f'file:{(folder/"spatial.sqlite").as_posix()}?mode=ro',uri=True)
    child=subprocess.Popen(['node',str(ROOT/'offline-navigation/build-world-tile.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8',cwd=ROOT)
    results=[];began=time.time()
    try:
        for row in rows:
            x,y=row['x'],row['y'];key=f'{x}_{y}';oldfile=folder/'tiles'/key/'receipt.json';raw=oldfile.read_bytes();out=destination/'tiles'/key
            if hashlib.sha256(raw).hexdigest()!=row['receiptSHA256']:raise ValueError('Legacy receipt changed: '+str(oldfile))
            original=json.loads(raw);saved=destination/'legacy'/f'{key}.json';saved.parent.mkdir(parents=True,exist_ok=True)
            if saved.exists()and saved.read_bytes()!=raw:raise ValueError('Legacy backup differs')
            if not saved.exists():saved.write_bytes(raw)
            result=validated(out,original,compiler);resumed=bool(result)
            if not result:
                try:
                    local=tiles.materialize(db,folder,x,y,m,work)
                    if canonical_input(local,original['materializerSHA256'])!=row['sourceInputSHA256']:raise ValueError('Materialized collision differs from original tile input')
                    out.mkdir(parents=True,exist_ok=True);(out/'input.json').write_bytes((work/'input.json').read_bytes())
                    request=dict(input=str(work/'input.pbzmesh'),metadata=str(work/'input.json'),output=str(out));child.stdin.write(json.dumps(request)+'\n');child.stdin.flush();line=child.stdout.readline()
                    if not line:raise RuntimeError('Recast worker ended: '+str(child.poll()))
                    response=json.loads(line)
                    if response.get('error'):raise ValueError(response['error'].splitlines()[0])
                    result=validated(out,original,compiler)
                    if result is None:raise ValueError('Corrected bake/coverage/hash validation failed')
                    (out/'input.json').write_bytes((work/'input.json').read_bytes())
                except (ValueError,OSError)as error:
                    results.append(dict(x=x,y=y,error=str(error)));print('RASTER FAILURE',world,grid,key,str(error),flush=True);continue
            changed={k:v for k,v in result['blobs'].items()if k not in original['blobs']}
            entry=dict(x=x,y=y,resumed=resumed,inputSHA256=result['inputSHA256'],legacyCanonicalInputSHA256=original['inputSHA256'],collisionInputIdentical=True,materializerExecutionSHA256=m['materializerSHA256'],oldReceiptSHA256=row['receiptSHA256'],newReceiptSHA256=tiles.digest(out/'receipt.json'),changedBlobs=len(changed),expandedVariants=sum(c.get('expandedQueries',0)>0 for c in result['rasterCoverage']),largestOverlap=max(c.get('largestOverlap',0)for c in result['rasterCoverage']),candidate=out.relative_to(ROOT).as_posix())
            results.append(entry)
            tiles.atomic_json(destination/f'progress-{number}.json',dict(worker=number,processed=len(results),total=len(rows),elapsedSeconds=round(time.time()-began,1),results=results))
            if len(results)%5==0 or len(results)==len(rows):print('RASTER',world,grid,'worker',number,len(results),'/',len(rows),'elapsed',round(time.time()-began,1),flush=True)
    finally:
        db.close();child.stdin.close();child.wait();child.stdout.close()
    return dict(world=world,grid=grid,worker=number,results=results)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--audit',type=Path,default=ROOT/'build/offline-navigation/raster-coverage-audit.json');p.add_argument('--output',type=Path,default=ROOT/'build/offline-navigation/raster-rebuild-1112');p.add_argument('--world');p.add_argument('--jobs',type=int,default=4);args=p.parse_args()
    output=args.output.resolve()
    if not output.is_relative_to(ROOT/'build')or not 1<=args.jobs<=8:raise ValueError('Invalid candidate directory or concurrency')
    audit=json.loads(args.audit.read_bytes())
    if not audit.get('complete'):raise ValueError('Wait for the complete coverage inventory')
    compiler=compiler_hash();output.mkdir(parents=True,exist_ok=True);summaries=[]
    manifest=dict(schema=1,scope='Exact reconstructed candidate tiles; source worlds and game unchanged',auditSHA256=tiles.digest(args.audit),compilerSHA256=compiler,compilerSourcesSHA256={n:tiles.digest(ROOT/n)for n in COMPILER_FILES},complete=False,results=summaries)
    tiles.atomic_json(output/'rebuild.json',manifest)
    for record in audit['worlds']:
        if args.world and record['world']!=args.world:continue
        rows=sorted(record['selected'],key=lambda r:r.get('inputTriangles')or 0,reverse=True)
        if not rows:continue
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs)as pool:
            tasks=[pool.submit(worker,i,record,rows[i::args.jobs],output,compiler)for i in range(min(args.jobs,len(rows)))]
            for future in concurrent.futures.as_completed(tasks):summaries.append(future.result());tiles.atomic_json(output/'rebuild.json',manifest)
    manifest['complete']=True;manifest['failed']=sum('error'in r for w in summaries for r in w['results']);manifest['rebuilt']=sum('error'not in r for w in summaries for r in w['results']);tiles.atomic_json(output/'rebuild.json',manifest)
    print('RASTER COMPLETE',manifest['rebuilt'],'failed',manifest['failed'],flush=True)
    if manifest['failed']:raise SystemExit(2)
if __name__=='__main__':main()
