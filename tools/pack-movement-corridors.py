"""Page existing geometry component hints without adding routes or coordinates."""
from pathlib import Path
import argparse,collections,hashlib,json,math,struct
from offline_packed import PackedWriter,PackedReader,write_json
ROOT=Path(__file__).resolve().parents[1]
MAGIC=0x31434d50

def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()

def pack(mapping_file,index_file,output):
    mapping=json.loads(mapping_file.read_bytes());index=json.loads(index_file.read_bytes())
    if mapping.get('schema')!=1 or any(mapping.get(key)!=index.get(key)for key in ('world','sourceIndexSHA256')):raise ValueError('Movement mapping belongs to another navigation build')
    active=index
    if index.get('kind')=='multi-grid-world':
        grid=next((row for row in index['grids']if row['id']==mapping.get('navigationGrid')),None)
        if grid is None:raise ValueError('Movement mapping grid is missing')
        active=json.loads((index_file.parent/grid['index']).read_bytes())
    if mapping.get('sourceGridIndexSHA256')and mapping['sourceGridIndexSHA256']!=active['sourceIndexSHA256']:raise ValueError('Movement mapping grid source differs')
    nodes=active['corridors']['nodes']
    if type(nodes)is not int or not 0<nodes<=10000000 or output.exists():raise ValueError('Fresh bounded corridor output required')
    grouped=collections.defaultdict(list)
    seen=set()
    for edge in mapping['edges']:
        first,last=edge['from'],edge['to'];entry,exit=edge['entry'],edge['exit'];reverse=edge['reverse'];kind=edge['kind']
        if any(type(value)is not int or not 0<=value<nodes for value in (first,last))or first==last or (first,last)in seen:raise ValueError('Invalid or duplicate movement component pair')
        if type(reverse)is not bool or kind not in ('surface','fall')or kind=='fall'and reverse:raise ValueError('Invalid movement direction')
        if any(not isinstance(point,list)or len(point)!=3 or any(type(value)not in (int,float)or not math.isfinite(value)or abs(value)>=1e10 for value in point)for point in (entry,exit)):raise ValueError('Invalid source geometry coordinate')
        original_entry,original_exit=(exit,entry)if reverse else(entry,exit)
        expected='recast-movement:'+','.join(str(math.floor(value+.5))for value in original_entry)+'>'+','.join(str(math.floor(value+.5))for value in original_exit)
        if edge['guid']!=expected or (original_entry[2]-original_exit[2]<100)!=(kind=='surface'):raise ValueError('Movement hint differs from its original geometry identity')
        seen.add((first,last));flags=(1 if reverse else 0)|(2 if kind=='fall'else 0)
        grouped[first].append(struct.pack('<IB6d',last,flags,*entry,*exit))
    output.mkdir(parents=True)
    writer=PackedWriter(output,mapping['world'],mapping['sourceIndexSHA256']);pages=[];pending=[];pending_bytes=8;control=[]
    def flush():
        nonlocal pending,pending_bytes
        if not pending:return
        payload=struct.pack('<II',MAGIC,len(pending))+b''.join(struct.pack('<II',first,len(edges))+b''.join(edges)for first,edges in pending)
        if len(payload)>131072:raise ValueError('Movement corridor page exceeds runtime bound')
        pages.append(dict(first=pending[0][0],last=pending[-1][0],edges=sum(len(edges)for first,edges in pending),packed=writer.put(payload)))
        control.append(hashlib.sha256(payload).hexdigest());pending=[];pending_bytes=8
    for first,edges in sorted(grouped.items()):
        if len(edges)>2048:raise ValueError('Movement node exceeds runtime adjacency bound')
        required=8+53*len(edges)
        if pending and pending_bytes+required>32768:flush()
        pending.append((first,edges));pending_bytes+=required
    flush()
    manifest=dict(schema=1,kind='paged-geometry-movement-corridors',world=mapping['world'],sourceIndexSHA256=mapping['sourceIndexSHA256'],sourceGridIndexSHA256=mapping.get('sourceGridIndexSHA256'),navigationGrid=mapping.get('navigationGrid'),nodes=nodes,edges=len(seen),pages=pages,storage=writer.finish(),mappingSHA256=digest(mapping_file),movementManifestSHA256=mapping['movementManifestSHA256'],navigationManifestSHA256=digest(index_file),packerSHA256=digest(Path(__file__)),scope='Optimistic source geometry hints only; standing, capabilities, locks and physical checks still required',physicalVerified=False)
    reader=PackedReader(output,manifest)
    if [hashlib.sha256(reader.span(page['packed'])).hexdigest()for page in pages]!=control:raise ValueError('Movement corridor roundtrip differs')
    write_json(output/'index.json',manifest)
    if (output/'index.json').stat().st_size>131072:raise ValueError('Movement corridor manifest exceeds runtime bound')
    files={file.relative_to(output).as_posix():dict(bytes=file.stat().st_size,sha256=digest(file))for file in output.rglob('*')if file.is_file()}
    receipt=dict(world=mapping['world'],nodes=nodes,edges=len(seen),pages=len(pages),files=files,roundTripPassed=True,physicalVerified=False)
    write_json(output.with_name(output.name+'.receipt.json'),receipt)
    print(json.dumps(dict(world=mapping['world'],edges=len(seen),pages=len(pages),files=len(files),bytes=sum(file['bytes']for file in files.values()))),flush=True)
    return manifest

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('mapping',type=Path);parser.add_argument('index',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
    if not args.output.resolve().is_relative_to(ROOT/'build'):raise ValueError('Private build output required')
    pack(args.mapping.resolve(),args.index.resolve(),args.output.resolve())
if __name__=='__main__':main()
