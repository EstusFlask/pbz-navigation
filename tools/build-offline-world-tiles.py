"""Sparse exact collision indexing and resumable Recast baking for a full world.

The SQLite spatial index holds component bounds; tile geometry is materialized
one window at a time. No dense global grid or world-sized geometry allocation.
"""
from pathlib import Path
from collections import OrderedDict,defaultdict
import argparse
import concurrent.futures
import hashlib
import json
import math
import os
import sqlite3
import struct
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np


def digest(file):
    with Path(file).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def atomic_json(file,value):
    file=Path(file);tmp=file.with_name(file.name+'.tmp')
    tmp.write_text(json.dumps(value,separators=(',',':'))+'\n',encoding='utf-8')
    for attempt in range(6):
        try:os.replace(tmp,file);return
        except PermissionError:
            if attempt==5:raise
            time.sleep(.02*(attempt+1))  # Short Windows scanner/share-delete contention.


def mesh_arrays(file):
    with file.open('rb') as stream:magic,version,nv,nt=struct.unpack('<8sIII',stream.read(20))
    if magic!=b'PBZCOL01' or version!=1 or file.stat().st_size!=20+nv*24+nt*12:raise ValueError('Invalid package mesh')
    if not nt:return np.empty((0,3)),np.empty((0,3),dtype='<u4')
    return (np.memmap(file,dtype='<f8',mode='r',offset=20,shape=(nv,3)),
            np.memmap(file,dtype='<u4',mode='r',offset=20+nv*24,shape=(nt,3)))


def build_index(folder,cell_cm,tile_cells,allow_partial=False,source_folder=None,grid_policy=None):
    source_folder=source_folder or folder;folder.mkdir(parents=True,exist_ok=True)
    inventory=json.loads((source_folder/'inventory.json').read_text(encoding='utf-8'))
    coverage=json.loads((source_folder/'coverage.json').read_text(encoding='utf-8'))
    if grid_policy:
        if grid_policy['sourceRootSHA256']!=inventory['rootSHA256'] or grid_policy['extractionBuildID']!=coverage['buildID']:raise ValueError('Grid policy source differs')
        if grid_policy['mode']not in ('include','exclude')or grid_policy['zBandUE'][0]>=grid_policy['zBandUE'][1]:raise ValueError('Invalid grid separation policy')
    if coverage['remainingPackages'] and not allow_partial:raise ValueError('World extraction is incomplete; use --allow-partial only for diagnostic work')
    settings=json.loads((ROOT/'offline-navigation/build-settings.json').read_text())
    extent=cell_cm*tile_cells
    border=(math.ceil((45+(settings['maxSimplificationErrorVoxels']+settings['voxelBoundaryReserveVoxels'])*cell_cm)/cell_cm)+3)*cell_cm+1
    path=folder/'spatial.sqlite';tmp=path.with_suffix('.tmp.sqlite')
    if tmp.exists():tmp.unlink()
    db=sqlite3.connect(tmp)
    db.executescript('''
      CREATE TABLE metadata (key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE packages (id INTEGER PRIMARY KEY,folder TEXT,receiptHash TEXT,meshHash TEXT);
      CREATE TABLE sources (id INTEGER PRIMARY KEY,packageID INTEGER,firstTriangle INTEGER,triangles INTEGER,condition TEXT);
      CREATE TABLE policies (sourceID INTEGER PRIMARY KEY,navFloorAllowed INTEGER);
      CREATE VIRTUAL TABLE bounds USING rtree(id,minX,maxX,minY,maxY);
      CREATE TABLE tiles (x INTEGER,y INTEGER,PRIMARY KEY(x,y));
      CREATE TABLE failures (packageID INTEGER,reason TEXT,detail TEXT);
    ''')
    metadata=dict(schema=1,world=inventory['world'],originUE=[0,0,0],cellCm=cell_cm,tileCells=tile_cells,borderCm=border,
                  extentCm=extent,agent=dict(radiusCm=45,heightCm=192,climbCm=50,slope=55),
                  maxGeometryVertices=2000000,maxGeometryTriangles=2000000,
                  extractionBuildID=coverage['buildID'],sourceContainerSHA256=inventory['containerSHA256'],
                  sourceRootSHA256=inventory['rootSHA256'],totalPackages=coverage['totalPackages'],
                  completedPackages=coverage['completedPackages'],sourcePolicySchema=1,completeCollisionClaim=False,physicalVerified=False)
    if grid_policy:metadata['gridPolicy']=grid_policy
    population=dict(selectedSources=0,delegatedSources=0,selectedTriangles=0,delegatedTriangles=0)
    inputs=[];packages=0;sources=0;start=time.time()
    try:
        for cell in inventory['cells']:
            part=source_folder/'packages'/cell['chunk'];receipt=part/'receipt.json';mesh=part/'collision.pbzmesh'
            if not receipt.exists():continue
            record=json.loads(receipt.read_text(encoding='utf-8'))
            if record.get('buildID') not in coverage.get('compatibleBuildIDs',[coverage['buildID']]):raise ValueError('Unreviewed extraction build ID')
            rh=digest(receipt);mh=digest(mesh)
            if mh!=record['meshSHA256']:raise ValueError('Package collision hash differs: '+cell['package'])
            packages+=1;pid=packages;inputs.append((cell['chunk'],rh,mh))
            db.execute('INSERT INTO packages VALUES (?,?,?,?)',(pid,Path(os.path.relpath(part,folder)).as_posix(),rh,mh))
            active=np.ones(record['triangles'],dtype=bool)
            for source in record['sources']:
                if grid_policy:
                    lo,hi=grid_policy['zBandUE'];z0,z1=source['boundsUE'][2],source['boundsUE'][5]
                    inside=z0>=lo and z1<=hi
                    if not inside and z0<=hi and z1>=lo:raise ValueError('Source crosses supposedly isolated grid band')
                    selected=inside if grid_policy['mode']=='include'else not inside
                    if not selected:
                        active[source['firstTriangle']:source['firstTriangle']+source['triangles']]=False
                        population['delegatedSources']+=1;population['delegatedTriangles']+=source['triangles'];continue
                population['selectedSources']+=1;population['selectedTriangles']+=source['triangles']
                sources+=1;b=source['boundsUE'];condition=source.get('condition')
                db.execute('INSERT INTO sources VALUES (?,?,?,?,?)',(sources,pid,source['firstTriangle'],source['triangles'],json.dumps(condition) if condition else None))
                db.execute('INSERT INTO bounds VALUES (?,?,?,?,?)',(sources,b[0],b[3],b[1],b[4]))
                if source.get('navFloorAllowed') is False:db.execute('INSERT INTO policies VALUES (?,0)',(sources,))
            for failure in record['unresolved']:
                db.execute('INSERT INTO failures VALUES (?,?,?)',(pid,'collision-parse',json.dumps(failure)))
            if record['pendingCollisionTypes']:
                db.execute('INSERT INTO failures VALUES (?,?,?)',(pid,'pending-collision-semantics',json.dumps(record['pendingCollisionTypes'])))
            positions,triangles=mesh_arrays(mesh)
            # Only triangles classified walkable by Recast can seed occupied tiles.
            # Every collider, including walls and conditional ones, stays in the spatial index.
            for at in range(0,len(triangles),100000):
                v=positions[triangles[at:at+100000][active[at:at+100000]]]
                n=np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]);length=np.linalg.norm(n,axis=1)
                v=v[(length>0)&(n[:,2]>length*math.cos(math.radians(55)))]
                if not len(v):continue
                lo=np.min(v[:,:,:2],axis=1);hi=np.max(v[:,:,:2],axis=1)
                boxes=np.stack((np.floor((lo[:,0]-border)/extent),np.floor((-hi[:,1]-border)/extent),
                                np.floor((hi[:,0]+border)/extent),np.floor((-lo[:,1]+border)/extent)),axis=1).astype(np.int64)
                for x0,y0,x1,y1 in np.unique(boxes,axis=0):
                    if (x1-x0+1)*(y1-y0+1)>16384:
                        db.execute('INSERT INTO failures VALUES (?,?,?)',(pid,'oversized-walkable-triangle',json.dumps([int(x0),int(y0),int(x1),int(y1)])))
                        continue
                    db.executemany('INSERT OR IGNORE INTO tiles VALUES (?,?)',((int(x),int(y)) for y in range(y0,y1+1) for x in range(x0,x1+1)))
            del positions,triangles
            if packages%500==0:
                db.commit();print('Indexed',packages,'packages;',sources,'sources;',round(time.time()-start,1),'seconds',flush=True)
        metadata['sourceLedgerSHA256']=hashlib.sha256(json.dumps(inputs,separators=(',',':')).encode()).hexdigest()
        metadata['completedPackages']=packages
        metadata['candidateTiles']=db.execute('SELECT count(*) FROM tiles').fetchone()[0]
        metadata['indexedSources']=sources
        if grid_policy:metadata['gridPopulation']=population
        metadata['indexFailures']=dict(db.execute('SELECT reason,count(*) FROM failures GROUP BY reason'))
        metadata['indexerSHA256']=digest(Path(__file__))
        metadata['spatialIndexSHA256']=hashlib.sha256(json.dumps(metadata,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        for key,value in metadata.items():db.execute('INSERT INTO metadata VALUES (?,?)',(key,json.dumps(value)))
        db.commit()
    finally:db.close()
    os.replace(tmp,path);metadata['databaseSHA256']=digest(path);atomic_json(folder/'spatial-index.json',metadata)
    print('SPATIAL RESULT',metadata,flush=True)


def materialize(db,folder,x,y,metadata,out):
    if 'materializerSHA256' not in metadata:metadata={**metadata,'materializerSHA256':digest(Path(__file__))}
    extent=metadata['extentCm'];border=metadata['borderCm'];left=x*extent;top=-y*extent
    policy_column='COALESCE(policy.navFloorAllowed,1)' if metadata.get('sourcePolicySchema') else '1'
    policy_join='LEFT JOIN policies policy ON policy.sourceID=s.id' if metadata.get('sourcePolicySchema') else ''
    rows=db.execute(f'''SELECT s.packageID,p.folder,s.firstTriangle,s.triangles,s.condition,p.meshHash,p.receiptHash,{policy_column}
                       FROM bounds b JOIN sources s ON s.id=b.id JOIN packages p ON p.id=s.packageID
                       {policy_join}
                       WHERE b.minX<=? AND b.maxX>=? AND b.minY<=? AND b.maxY>=?
                       ORDER BY s.packageID,s.id''',(left+extent+border,left-border,top+border,top-extent-border)).fetchall()
    grouped=defaultdict(list)
    for row in rows:grouped[row[1]].append(row)
    points=[];faces=[];ranges=[];blocked_bounds=[];nv=0;nt=0;inputs=[];height_lows=[];height_highs=[]
    for name,entries in grouped.items():
        p,t=mesh_arrays(folder/name/'collision.pbzmesh');inputs.append((name,entries[0][5],entries[0][6]))
        for row in entries:
            first,count=row[2:4];selected=[]
            for start in range(first,first+count,100000):
                tri=t[start:min(start+100000,first+count)];v=p[tri]
                lo=np.min(v[:,:,:2],axis=1);hi=np.max(v[:,:,:2],axis=1)
                keep=(lo[:,0]<=left+extent+border)&(hi[:,0]>=left-border)&(lo[:,1]<=top+border)&(hi[:,1]>=top-extent-border)
                if np.any(keep):selected.append(tri[keep])
            if not selected:continue
            selected=np.concatenate(selected);used,inverse=np.unique(selected,return_inverse=True)
            pv=np.asarray(p[used],dtype='<f8');pf=np.asarray(inverse,dtype='<u4').reshape((-1,3))+nv
            if nv+len(pv)>metadata['maxGeometryVertices'] or nt+len(pf)>metadata['maxGeometryTriangles']:
                raise ValueError('Tile collision memory budget exceeded; subdivide this tile')
            points.append(pv);faces.append(pf)
            z=pv[np.asarray(inverse).reshape((-1,3)),2]
            height_lows.append(np.min(z,axis=1));height_highs.append(np.max(z,axis=1))
            if row[4]:ranges.append(dict(firstTriangle=nt,triangles=len(pf),condition=json.loads(row[4])))
            if not row[7]:blocked_bounds.append(dict(boundsUE=[*np.min(pv,axis=0).tolist(),*np.max(pv,axis=0).tolist()],actorID=json.loads(row[4]).get('actorID') if row[4] else None))
            nv+=len(pv);nt+=len(pf)
        del p,t
    file=out/'input.pbzmesh'
    with file.open('wb') as stream:
        stream.write(struct.pack('<8sIII',b'PBZCOL01',1,nv,nt))
        for v in points:stream.write(v.tobytes())
        for t in faces:stream.write(t.tobytes())
    local=dict(x=x,y=y,conditionalRanges=ranges,sourcePackages=inputs,meshSHA256=digest(file),
               vertices=nv,triangles=nt,metadata=metadata)
    if metadata.get('gridPolicy',{}).get('conservativeMask'):local['conservativeGridMask']=metadata['gridPolicy']['conservativeMask']
    if blocked_bounds:local['nonWalkableBoundsUE']=blocked_bounds
    # Separate only genuinely disconnected height intervals. Continuous walls,
    # ramps and stair treads remain in one cluster; no clipping/caps are added.
    low=np.concatenate(height_lows)if height_lows else np.array([]);high=np.concatenate(height_highs)if height_highs else np.array([]);order=np.argsort(low,kind='stable')
    end=np.maximum.accumulate(high[order]);start=np.r_[True,low[order][1:]>end[:-1]+300]if len(low)else np.array([],dtype=bool)
    assignment=np.empty(nt,dtype=np.int32);assignment[order]=np.cumsum(start)-1
    layers=[]
    for layer in range(int(np.max(assignment))+1 if len(assignment)else 0):
        ids=np.flatnonzero(assignment==layer);split=np.flatnonzero(np.diff(ids)>1)+1
        blocks=np.split(ids,split)
        layers.append(dict(layer=layer,boundsZUE=[float(np.min(low[ids])),float(np.max(high[ids]))],
                           triangleRanges=[[int(a[0]),len(a)] for a in blocks]))
    if len(layers)>32:raise ValueError('More than 32 disconnected height layers in one tile')
    local['layers']=layers
    # Hash the actual selected geometry, condition ranges, provenance, and configuration.
    tile_config={key:metadata[key] for key in ('world','originUE','cellCm','tileCells','borderCm','extentCm','agent','materializerSHA256')}
    tile_inputs={key:local[key] for key in ('x','y','layers','conditionalRanges','sourcePackages','meshSHA256','vertices','triangles')}
    if local.get('conservativeGridMask'):tile_inputs['conservativeGridMask']=local['conservativeGridMask']
    if blocked_bounds:tile_inputs['nonWalkableBoundsUE']=blocked_bounds
    tile_inputs['config']=tile_config
    local['inputSHA256']=hashlib.sha256(json.dumps(tile_inputs,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    atomic_json(out/'input.json',local)
    return local


def bake_worker(worker,tiles,folder,metadata,keep_inputs):
    db=sqlite3.connect(f'file:{(folder/"spatial.sqlite").as_posix()}?mode=ro',uri=True)
    directory=folder/'tile-work'/str(worker);directory.mkdir(parents=True,exist_ok=True)
    process=subprocess.Popen(['node',str(ROOT/'offline-navigation/build-world-tile.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8',cwd=ROOT)
    compiled=0;resumed=0;failed=0;start=time.time()
    try:
        for x,y in tiles:
            key=f'{x}_{y}';out=folder/'tiles'/key;out.mkdir(parents=True,exist_ok=True)
            try:local=materialize(db,folder,x,y,metadata,directory)
            except (ValueError,OSError) as error:
                failed+=1
                atomic_json(out/'receipt.json',dict(x=x,y=y,error=str(error),phase='geometry-materialization',
                            spatialIndexSHA256=metadata['spatialIndexSHA256'],sourceLedgerSHA256=metadata['sourceLedgerSHA256']))
                print('TILE FAILURE',key,str(error),flush=True)
                continue
            request=dict(input=str(directory/'input.pbzmesh'),metadata=str(directory/'input.json'),output=str(out))
            process.stdin.write(json.dumps(request)+'\n');process.stdin.flush()
            line=process.stdout.readline()
            if not line:raise RuntimeError('Recast worker ended unexpectedly: '+str(process.poll()))
            response=json.loads(line)
            if response.get('error'):failed+=1;print('TILE FAILURE',key,response['error'].splitlines()[0],flush=True)
            elif response.get('resumed'):resumed+=1
            else:compiled+=1
            if keep_inputs:
                # Optional reproducible diagnostic input, including failed tiles.
                import shutil
                shutil.copyfile(directory/'input.pbzmesh',out/'input.pbzmesh');shutil.copyfile(directory/'input.json',out/'input.json')
            if (compiled+resumed+failed)%50==0:
                atomic_json(folder/f'bake-progress-{worker}.json',dict(worker=worker,processed=compiled+resumed+failed,total=len(tiles),compiled=compiled,resumed=resumed,failed=failed,updatedUnix=time.time()))
                print('Worker',worker,compiled+resumed+failed,'/',len(tiles),'tiles;',failed,'failures;',round(time.time()-start,1),'seconds',flush=True)
    finally:
        db.close();process.stdin.close();process.wait();process.stdout.close()
    return dict(compiled=compiled,resumed=resumed,failed=failed)


def bake(folder,jobs,limit,bounds,keep_inputs,compatibility_note=None):
    metadata=json.loads((folder/'spatial-index.json').read_text())
    metadata['materializerSHA256']=digest(Path(__file__))
    if digest(folder/'spatial.sqlite')!=metadata['databaseSHA256']:raise ValueError('Spatial index hash differs')
    db=sqlite3.connect(folder/'spatial.sqlite')
    tiles=db.execute('SELECT x,y FROM tiles ORDER BY y,x').fetchall();db.close()
    if bounds:
        extent=metadata['extentCm'];a,b,c,d=bounds
        tiles=[(x,y) for x,y in tiles if x*extent<=c and (x+1)*extent>=a and -y*extent>=b and -(y+1)*extent<=d]
    if limit is not None:tiles=tiles[:limit]
    print('Baking',len(tiles),'/',metadata['candidateTiles'],'sparse tiles with',jobs,'workers',flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as pool:
        results=list(pool.map(lambda i:bake_worker(i,tiles[i::jobs],folder,metadata,keep_inputs),range(jobs)))
    print('BAKE RESULT',results,flush=True)
    finalize(folder,metadata,compatibility_note)


def finalize(folder,metadata,compatibility_note=None):
    rows=[];failures=[];actors={};blobs={};headers=set();settings=set();completed=0
    for file in sorted((folder/'tiles').glob('*/receipt.json')):
        r=json.loads(file.read_text())
        if r.get('spatialIndexSHA256')!=metadata['spatialIndexSHA256']:continue
        if r.get('error'):failures.append(r);continue
        invalid=[]
        for blob in r['blobs'].values():
            output=file.parent/blob['file']
            if not output.exists() or digest(output)!=blob['sha256']:invalid.append(blob['file'])
        if invalid:
            failures.append(dict(x=r['x'],y=r['y'],error='Missing or damaged baked blobs',files=invalid));continue
        rows.extend(dict(x=r['x'],y=r['y'],**layer) for layer in r['layers']);completed+=1
        actors.update({a['id']:a for a in r['actors']});blobs.update({key:dict(value,file=f'tiles/{file.parent.name}/{value["file"]}') for key,value in r['blobs'].items()})
        headers.add(r['navHeaderBase64']);settings.add(r['compilerSHA256'])
    if len(headers)>1:raise ValueError('Mixed navigation header parameters')
    compatibility_file=folder/'compiler-compatibility.json'
    proof=json.loads(compatibility_file.read_text()) if compatibility_file.exists() else {}
    if len(settings)>1:
        if compatibility_note:
            proof=dict(compilerBuilds=sorted(settings),note=compatibility_note)
            atomic_json(compatibility_file,proof)
        elif not settings.issubset(set(proof.get('compilerBuilds',[]))):raise ValueError('Mixed navigation compilers require a recorded compatibility review')
    compiler_id=next(iter(settings),None) if len(settings)<=1 else hashlib.sha256(json.dumps(sorted(settings)).encode()).hexdigest()
    result=dict(**metadata,engine='recast-navigation@0.44.0',backend='upstream-recast-detour-webassembly',
                kind='experimental-sparse-world',compiledTiles=completed,compiledLayers=len(rows),remainingTiles=metadata['candidateTiles']-completed,
                failures=failures,actors=list(actors.values()),blobs=blobs,tiles=rows,
                navHeaderBase64=next(iter(headers),None),compilerSHA256=compiler_id,compilerBuilds=sorted(settings),compilerCompatibility=proof or None,
                unknownState='closed',runtimeMaxTiles=256,experimentalOnly=True)
    atomic_json(folder/'navigation-index.json',result)
    print('NAVIGATION RESULT',completed,'/',metadata['candidateTiles'],'tiles;',len(rows),'layers;',len(failures),'failures;',len(blobs),'unique blobs',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase',choices=['index','bake','finalize'])
    parser.add_argument('--world',type=Path,default=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp')
    parser.add_argument('--cell-cm',type=float,default=10)
    parser.add_argument('--tile-cells',type=int,default=256)
    parser.add_argument('--allow-partial',action='store_true')
    parser.add_argument('--jobs',type=int,default=2)
    parser.add_argument('--limit',type=int)
    parser.add_argument('--bounds',nargs=4,type=float,metavar=('MIN_X','MIN_Y','MAX_X','MAX_Y'))
    parser.add_argument('--keep-inputs',action='store_true')
    parser.add_argument('--source-world',type=Path,help='Read-only extracted source for an independently indexed subgrid')
    parser.add_argument('--grid-policy',type=Path,help='Hash-bound, vertically isolated include/exclude grid policy')
    parser.add_argument('--compiler-compatibility-note',help='Explicit review for compatible compiler-policy/metadata changes; never different geometry/configuration')
    args=parser.parse_args();folder=args.world.resolve()
    if not folder.is_relative_to(ROOT/'build'):raise ValueError('Outputs must stay inside build/')
    prior_index=folder/'navigation-index.json'
    is_grid_set=False
    if prior_index.exists():
        with prior_index.open('rb')as stream:is_grid_set=b'"multi-grid-world"'in stream.read(512)
    if is_grid_set:
        raise ValueError('This is an isolated grid-set root; rebuild its leaf grids and reassemble instead of overwriting the root')
    if args.cell_cm<2 or not 32<=args.tile_cells<=1024 or not 1<=args.jobs<=8:raise ValueError('Invalid build budget')
    if args.source_world and not args.source_world.resolve().is_relative_to(ROOT/'build'):raise ValueError('Source must remain in private build/')
    policy=json.loads(args.grid_policy.read_text())if args.grid_policy else None
    if args.phase=='index':build_index(folder,args.cell_cm,args.tile_cells,args.allow_partial,args.source_world.resolve()if args.source_world else None,policy)
    elif args.phase=='bake':bake(folder,args.jobs,args.limit,args.bounds,args.keep_inputs,args.compiler_compatibility_note)
    else:finalize(folder,json.loads((folder/'spatial-index.json').read_text()),args.compiler_compatibility_note)


if __name__=='__main__':main()
