"""Losslessly transform existing paged data; never rebake or modify the input."""
from pathlib import Path
import argparse,base64,concurrent.futures,copy,hashlib,json,os,time
from offline_packed import PackedWriter,write_json
ROOT=Path(__file__).resolve().parents[1]
def convert(folder,dest):
    original=json.loads((folder/'index.json').read_bytes());manifest=copy.deepcopy(original);dest.mkdir(parents=True,exist_ok=True)
    if original.get('kind')=='multi-grid-world':
        children=[]
        for grid in original['grids']:children.append(convert(folder/Path(grid['index']).parent,dest/Path(grid['index']).parent))
        write_json(dest/'index.json',manifest);return dict(world=manifest['world'],grids=children,files=1+sum(c['files']for c in children),bytes=(dest/'index.json').stat().st_size+sum(c['bytes']for c in children))
    if original.get('storage')or original['blobLayout']!='packets-v1':raise ValueError('Expected original uncompressed packet layout')
    writer=PackedWriter(dest,original['world'],original['sourceIndexSHA256']);proof={};input_bytes=0
    hashes=json.loads((folder/'packet-hashes.json').read_bytes())['packets']
    for i in range(original['packetCount']):
        encoded=(folder/f'packets/{i}.txt').read_bytes()
        if hashlib.sha256(encoded).hexdigest()!=hashes[i]['sha256']:raise ValueError('Source packet changed')
        raw=base64.b64decode(encoded,validate=True);expected=original['lastPacketBytes']if i==original['packetCount']-1 else original['chunkBytes']
        if len(raw)!=expected:raise ValueError('Source packet extent differs')
        span=writer.put(raw)
        if span[0]!=i*(original['chunkBytes']//32768):raise ValueError('Packet record numbering differs')
        proof[f'packets/{i}.txt']=hashlib.sha256(raw).hexdigest();input_bytes+=len(encoded)
        if(i+1)%2000==0:print('COMPRESSED',original['world'],i+1,'/',original['packetCount'],flush=True)
    for page in manifest['pages']:
        raw=(folder/f'pages/{page["id"]}.json').read_bytes();page['packed']=writer.put(raw);input_bytes+=len(raw);proof[f'pages/{page["id"]}.json']=hashlib.sha256(raw).hexdigest()
    if manifest.get('corridors'):
        graph=manifest['corridors'];graph['packed']=[]
        for i in range((graph['nodes']+graph['pageNodes']-1)//graph['pageNodes']):
            raw=(folder/f'corridors/{i}.json').read_bytes();graph['packed'].append(writer.put(raw));input_bytes+=len(raw);proof[f'corridors/{i}.json']=hashlib.sha256(raw).hexdigest()
    manifest['storage']=writer.finish();write_json(dest/'index.json',manifest)
    files=writer.files;files['index.json']=dict(bytes=(dest/'index.json').stat().st_size,sha256=hashlib.sha256((dest/'index.json').read_bytes()).hexdigest())
    report=dict(schema=1,world=manifest['world'],sourceIndexSHA256=manifest['sourceIndexSHA256'],sourceManifestSHA256=hashlib.sha256((folder/'index.json').read_bytes()).hexdigest(),inputBytes=input_bytes,files=files,logicalSHA256=proof,roundTripPassed=True,storage=manifest['storage'])
    write_json(dest/'compression-proof.json',report);result=dict(world=manifest['world'],inputBytes=input_bytes,bytes=sum(r['bytes']for r in files.values()),files=len(files),records=manifest['storage']['records']);print('COMPRESSED RESULT',json.dumps(result),flush=True);return result
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',type=Path,default=ROOT/'build/offline-navigation/mod-worlds');parser.add_argument('--output',type=Path,required=True);parser.add_argument('--jobs',type=int,default=4);args=parser.parse_args();source=args.input.resolve();dest=args.output.resolve()
    if not dest.is_relative_to(ROOT/'build')or dest.exists()or source==dest:raise ValueError('Choose a fresh private output')
    dest.mkdir(parents=True);catalog=json.loads((source/'catalog.json').read_bytes());started=time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs)as pool:results=list(pool.map(lambda w:convert(source/w,dest/w),catalog['worlds']))
    write_json(dest/'catalog.json',catalog);report=dict(schema=1,worlds=results,files=1+sum(r['files']for r in results),bytes=(dest/'catalog.json').stat().st_size+sum(r['bytes']for r in results),seconds=time.time()-started);write_json(dest/'compression-summary.json',report);print('ALL COMPRESSED',report['files'],report['bytes'],flush=True)
if __name__=='__main__':main()
