"""Carry forward an immutable, fully receipted world snapshot to a new version.

This requires local staging and its receipt, never a downloaded release ZIP.
Every carried-forward public byte is checked before linking into fresh staging.
"""
from pathlib import Path
import argparse,hashlib,json,os,shutil,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from world_package import world_sources,PREFIX

def restage(source,output):
    source=source.resolve();output=output.resolve()
    if not source.is_relative_to(ROOT/'build/offline-navigation') or not output.is_relative_to(ROOT/'build/offline-navigation') or output.exists():raise ValueError('Existing private source and fresh private destination required')
    receipt_file=source.with_name(source.name+'.receipt.json');receipt=json.loads(receipt_file.read_bytes())
    catalog=json.loads((source/(PREFIX+'catalog.json')).read_bytes())
    release=dict(version=receipt['version'],offlineWorldStage=str(source),offlineWorldCount=len(catalog['worlds']))
    files,hashes=world_sources(ROOT,release)
    for name,file in files.items():
        if hashlib.sha256(file.read_bytes()).hexdigest()!=hashes[name]:raise ValueError('Source world staging changed: '+name)
    output.mkdir(parents=True)
    for name,file in files.items():
        target=output/name;target.parent.mkdir(parents=True,exist_ok=True)
        try:os.link(file,target)
        except OSError:shutil.copyfile(file,target)
    version=json.loads((ROOT/'release/VERSION-LOCK.json').read_bytes())['currentVersion']
    record=dict(schema=1,version=version,kind='unreleased-world-integration',sourceReceiptSHA256=hashlib.sha256(receipt_file.read_bytes()).hexdigest(),sourceVersion=receipt['version'],worlds=list(catalog['worlds']),files=hashes,physicalVerified=False,completeCollisionClaim=False,note='Exact public world bytes carried forward from verified local staging; no new collision or game acceptance claim.')
    output.with_name(output.name+'.receipt.json').write_text(json.dumps(record,separators=(',',':')),encoding='utf-8')
    print('RESTAGED',len(files),'exact public world files for',version)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args();restage(args.source,args.output)
