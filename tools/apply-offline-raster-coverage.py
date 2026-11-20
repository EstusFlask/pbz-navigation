"""Apply verified raster repairs to private world builds, retaining old tiles.

This changes only build/offline-navigation/worlds and keeps recoverable tile,
index and corridor backups under the separately verified candidate directory.
It never deploys a Mod or modifies installed game files.
"""
from pathlib import Path
import argparse,hashlib,importlib.util,json,os,shutil
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('raster_rebuild',ROOT/'tools/rebuild-offline-raster-coverage.py');rebuild=importlib.util.module_from_spec(spec);spec.loader.exec_module(rebuild)
def sha(file):
    with file.open('rb')as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def atomic(file,value):
    temp=file.with_suffix('.raster.tmp');temp.write_text(json.dumps(value,separators=(',',':'))+'\n',encoding='utf-8');os.replace(temp,file)
def apply_world(record,candidate,audit_sha,compiler):
    folder=(ROOT/record['folder']).resolve();grid='main'if record['grid']=='.'else Path(record['grid']).name;backup=candidate/'backup'/record['world']/grid
    if not folder.is_relative_to(ROOT/'build/offline-navigation/worlds'):raise ValueError('World path escaped')
    backup.mkdir(parents=True,exist_ok=True);indexfile=folder/'navigation-index.json';saved=backup/'navigation-index.json'
    if not saved.exists():shutil.copyfile(indexfile,saved)
    index=json.loads(saved.read_bytes());rows={(t['x'],t['y'],t['layer']):t for t in index['tiles']};blobs=dict(index['blobs']);actors={a['id']:a for a in index['actors']};changed=0;applied=[]
    for row in record['selected']:
        key=f"{row['x']}_{row['y']}";legacy=backup/'tiles'/key;target=folder/'tiles'/key;out=candidate/record['world']/grid/'tiles'/key
        originalfile=(legacy if legacy.exists()else target)/'receipt.json'
        if sha(originalfile)!=row['receiptSHA256']:raise ValueError('Original tile changed before applying '+key)
        original=json.loads(originalfile.read_bytes());current=rebuild.validated(out,original,compiler)
        if current is None:raise ValueError('Unverified candidate '+key)
        newsha=sha(out/'receipt.json');different=set(current['blobs'])!=set(original['blobs']);changed+=different
        if not legacy.exists():
            prepared=folder/'tiles'/(key+'.raster-new')
            if prepared.exists():raise ValueError('Unresolved interrupted preparation '+str(prepared))
            prepared.mkdir()
            for b in current['blobs'].values():shutil.copyfile(out/b['file'],prepared/b['file'])
            shutil.copyfile(out/'receipt.json',prepared/'receipt.json')
            legacy.parent.mkdir(parents=True,exist_ok=True)
            # Both absolute destinations are inside the named private build
            # roots; same-volume renames preserve a recoverable old directory.
            if not target.resolve().is_relative_to(folder/'tiles')or not legacy.resolve().is_relative_to(candidate):raise ValueError('Tile move escaped')
            os.rename(target,legacy);os.rename(prepared,target)
        elif not target.exists():
            prepared=folder/'tiles'/(key+'.raster-new')
            if not prepared.exists():raise ValueError('Interrupted apply lacks prepared tile '+key)
            os.rename(prepared,target)
        if sha(target/'receipt.json')!=newsha:raise ValueError('Applied candidate receipt differs '+key)
        for k in [k for k in rows if k[:2]==(row['x'],row['y'])]:del rows[k]
        for layer in current['layers']:rows[(row['x'],row['y'],layer['layer'])]=dict(x=row['x'],y=row['y'],**layer)
        for identity,b in current['blobs'].items():blobs[identity]={**b,'file':f'tiles/{key}/{b["file"]}'}
        actors.update({a['id']:{**a,**actors.get(a['id'],{})}for a in current['actors']})
        applied.append(dict(x=row['x'],y=row['y'],oldReceiptSHA256=row['receiptSHA256'],newReceiptSHA256=newsha,changedBlobs=different,exactCollisionInput=True))
    references={blob for t in rows.values()for blob in t['variants'].values()if blob};index['tiles']=list(rows.values());index['blobs']={identity:blobs[identity]for identity in references};index['actors']=list(actors.values());index['compiledLayers']=len(rows)
    builds=sorted(set(index.get('compilerBuilds',[]))|{compiler});index['compilerBuilds']=builds;index['compilerSHA256']=hashlib.sha256(json.dumps(builds).encode()).hexdigest()
    index['compilerCompatibility']=dict(compilerBuilds=builds,note='Identical collision and bake settings; corrected complete rasterization for risky legacy inputs. Small legacy inputs retain their exact bytes under the proven 512-leaf upper bound. Native format/ABI unchanged.')
    index['rasterCoverageRepair']=dict(schema=1,auditSHA256=audit_sha,legacyIndexSHA256=sha(saved),legacyChunkCapacity=512,legacySafeTriangleLimit=131072,selectedTiles=len(applied),changedTiles=changed,unaffectedTilesRetained=record['receipts']-len(applied),sameCollisionInputs=True,compilerSHA256=compiler,complete=True)
    corridors=folder/'corridors.json'
    if corridors.exists()and not(backup/'corridors.json').exists():shutil.copyfile(corridors,backup/'corridors.json')
    atomic(indexfile,index);result=dict(world=record['world'],grid=grid,selected=len(applied),changed=changed,indexSHA256=sha(indexfile),backup=backup.relative_to(ROOT).as_posix(),tiles=applied);atomic(backup/'apply-receipt.json',result)
    print('RASTER APPLIED',record['world'],grid,len(applied),'changed',changed,flush=True);return result
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--candidate',type=Path,default=ROOT/'build/offline-navigation/raster-rebuild-1112');p.add_argument('--audit',type=Path,default=ROOT/'build/offline-navigation/raster-coverage-audit.json');p.add_argument('--world');args=p.parse_args();candidate=args.candidate.resolve()
    if not candidate.is_relative_to(ROOT/'build'):raise ValueError('Candidate outside build')
    audit=json.loads(args.audit.read_bytes());manifest=json.loads((candidate/'rebuild.json').read_bytes())
    if not audit['complete']or not manifest['complete']or manifest['failed']or manifest['auditSHA256']!=sha(args.audit):raise ValueError('Reconstruction or inventory incomplete')
    if manifest['compilerSHA256']!=rebuild.compiler_hash():raise ValueError('Compiler changed after reconstruction')
    rows=[apply_world(r,candidate,sha(args.audit),manifest['compilerSHA256'])for r in audit['worlds']if r['selected']and(not args.world or r['world']==args.world)]
    atomic(candidate/'applied.json',dict(schema=1,complete=True,worlds=rows,gameChanged=False))
if __name__=='__main__':main()
