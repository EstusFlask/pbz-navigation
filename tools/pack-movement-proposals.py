"""Lossless spatial paging for geometry-derived movement candidates.

Candidate coordinates retain the generator's 0.001cm precision. Binary pages
store signed integer offsets from a local cell origin; bounded DEFLATE text
storage is the same format already used by the navigation world. No route,
trajectory, saved progress or native executable is distributed.
"""
from pathlib import Path
import argparse,hashlib,json,sqlite3,struct,tempfile
from offline_packed import PackedWriter,PackedReader,write_json
ROOT=Path(__file__).resolve().parents[1]
def value(file,prefix):
    text=file.read_text(encoding='utf-8')
    if not text.startswith(prefix):raise ValueError('Unexpected movement module')
    return json.loads(text[len(prefix):].strip().removesuffix(';'))
def pack(source,dest):
    original=value(source/'index.js',"'use strict';\nexports.data=")
    if original['schema']!=1 or original['kind']!='geometry-movement-proposals':raise ValueError('Expected legacy geometry proposals')
    if dest.exists():raise ValueError('Choose a fresh candidate output')
    dest.mkdir(parents=True);db=sqlite3.connect(dest/'packing.sqlite');db.execute('CREATE TABLE candidates(cx,cy,cz,ax,ay,az,bx,by,bz,UNIQUE(ax,ay,az,bx,by,bz))');sources={}
    for page in range(original['pages']):
        file=source/f'{page}.js';sources[file.name]=hashlib.sha256(file.read_bytes()).hexdigest();rows=value(file,"'use strict';\nexports.rows=")
        if len(rows)>512:raise ValueError('Oversized source page')
        values=[]
        for row in rows:
            if len(row)!=6:raise ValueError('Invalid movement row')
            fixed=tuple(round(v*1000)for v in row)
            if any(abs(v-fixed[i]/1000)>1e-7 for i,v in enumerate(row)):raise ValueError('Source precision exceeds declared 0.001cm')
            cell=tuple(fixed[i]//2560000 for i in range(3));values.append((*cell,*fixed))
        db.executemany('INSERT OR IGNORE INTO candidates VALUES (?,?,?,?,?,?,?,?,?)',values)
    db.commit();writer=PackedWriter(dest,original['world'],original['sourceIndexSHA256']);descriptors=[];count=0;page_rows=[];cell=None;logical=[]
    def flush():
        nonlocal page_rows,count
        if not page_rows:return
        origin=[c*2560000 for c in cell];payload=bytearray()
        for row in page_rows:
            offsets=[v-origin[i%3]for i,v in enumerate(row)]
            if any(not -2147483648<=v<=2147483647 for v in offsets):raise ValueError('Movement local coordinate overflow')
            payload.extend(struct.pack('<6i',*offsets))
        span=writer.put(payload);bounds=[min(min(r[0],r[3])for r in page_rows)/1000,min(min(r[1],r[4])for r in page_rows)/1000,max(max(r[0],r[3])for r in page_rows)/1000,max(max(r[1],r[4])for r in page_rows)/1000];vertical=[min(min(r[2],r[5])for r in page_rows)/1000,max(max(r[2],r[5])for r in page_rows)/1000]
        descriptors.append(dict(first=count,rows=len(page_rows),originUE=[v/1000 for v in origin],boundsUE=bounds,verticalBoundsUE=vertical,packed=span));logical.append(hashlib.sha256(payload).hexdigest());count+=len(page_rows);page_rows=[]
    try:
        for row in db.execute('SELECT cx,cy,cz,ax,ay,az,bx,by,bz FROM candidates ORDER BY cx,cy,cz,ax,ay,az,bx,by,bz'):
            if cell!=row[:3]or len(page_rows)==512:flush();cell=row[:3]
            page_rows.append(row[3:])
        flush()
    finally:db.close();(dest/'packing.sqlite').unlink()
    index_pages=[]
    for first in range(0,len(descriptors),128):
        rows=descriptors[first:first+128];raw=json.dumps(dict(schema=1,world=original['world'],first=first,pages=rows),separators=(',',':')).encode();span=writer.put(raw)
        index_pages.append(dict(first=first,pages=len(rows),boundsUE=[min(r['boundsUE'][0]for r in rows),min(r['boundsUE'][1]for r in rows),max(r['boundsUE'][2]for r in rows),max(r['boundsUE'][3]for r in rows)],verticalBoundsUE=[min(r['verticalBoundsUE'][0]for r in rows),max(r['verticalBoundsUE'][1]for r in rows)],packed=span))
    storage=writer.finish();manifest={**original,'schema':2,'kind':'spatial-geometry-movement-proposals','pageRows':512,'pages':len(descriptors),'rows':count,'coverage':original.get('coverage',[])if original.get('allComponentsCertified')else[],'coordinateEncoding':'local-int32-mm-v1','quantizationCm':.001,'indexPages':index_pages,'storage':storage,'packedFromManifestSHA256':hashlib.sha256((source/'index.js').read_bytes()).hexdigest(),'packerSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (dest/'index.js').write_text("'use strict';\nexports.data="+json.dumps(manifest,separators=(',',':'))+';\n',encoding='utf-8');reader=PackedReader(dest,manifest)
    for i,descriptor in enumerate(descriptors):
        if hashlib.sha256(reader.span(descriptor['packed'])).hexdigest()!=logical[i]:raise ValueError('Packed movement roundtrip differs')
    for descriptor in index_pages:
        if len(json.loads(reader.span(descriptor['packed']))['pages'])!=descriptor['pages']:raise ValueError('Packed movement index roundtrip differs')
    files={name:row for name,row in writer.files.items()};files['index.js']=dict(bytes=(dest/'index.js').stat().st_size,sha256=hashlib.sha256((dest/'index.js').read_bytes()).hexdigest());receipt=dict(schema=1,world=original['world'],sourceIndexSHA256=original['sourceIndexSHA256'],legacySourcesSHA256=sources,legacyManifestSHA256=manifest['packedFromManifestSHA256'],files=files,rows=count,pages=len(descriptors),metadataPages=len(index_pages),roundTripPassed=True,physicalVerified=False)
    write_json(dest.with_name(dest.name+'.packed-receipt.json'),receipt);print(json.dumps(dict(world=original['world'],rows=count,pages=len(descriptors),files=len(files),bytes=sum(r['bytes']for r in files.values()))),flush=True);return manifest
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);args=p.parse_args();source=args.source.resolve();output=args.output.resolve()
    if not output.is_relative_to(ROOT/'build'):raise ValueError('Private candidate output only')
    pack(source,output)
if __name__=='__main__':main()
