"""Bounded raw-DEFLATE text containers, shared by packaging and verification."""
from pathlib import Path
from collections import OrderedDict
import base64,hashlib,json,os,zlib
BLOCK=32768
CAP=1048576
PAGE=512
def write_json(file,value):
    raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode('utf-8');file.parent.mkdir(parents=True,exist_ok=True);temp=file.with_suffix('.tmp');temp.write_bytes(raw);os.replace(temp,file)
class PackedWriter:
    def __init__(self,folder,world,identity):
        self.folder=folder;self.world=world;self.identity=identity;self.containers=0;self.records=0;self.rows=[];self.files={};self.original=0;self.buffer=bytearray(self.header())
    def header(self):return f'PBZDF1|{self.world}|{self.identity}|{self.containers}\n'.encode('ascii')
    def store(self,name,raw):
        file=self.folder/name;file.parent.mkdir(parents=True,exist_ok=True);tmp=file.with_suffix('.tmp');tmp.write_bytes(raw);os.replace(tmp,file);self.files[name]=dict(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
    def flush(self):
        if len(self.buffer)==len(self.header()):return
        self.store(f'packs/{self.containers}.txt',self.buffer);self.containers+=1;self.buffer=bytearray(self.header())
    def directory(self):
        if not self.rows:return
        first=self.records-len(self.rows);raw=json.dumps(dict(schema=1,world=self.world,sourceIndexSHA256=self.identity,first=first,records=self.rows),separators=(',',':')).encode('ascii')
        if len(raw)>131072:raise ValueError('Directory page exceeds runtime limit')
        self.store(f'directories/{first//PAGE}.json',raw);self.rows=[]
    def put(self,raw):
        if not 0<len(raw)<=CAP:raise ValueError('Invalid logical input extent')
        start=self.records
        for at in range(0,len(raw),BLOCK):
            part=raw[at:at+BLOCK];compressor=zlib.compressobj(6,zlib.DEFLATED,-15);packed=compressor.compress(part)+compressor.flush()
            if zlib.decompress(packed,-15)!=part:raise ValueError('Compression roundtrip differs')
            encoded=base64.b64encode(packed)
            if len(self.buffer)+len(encoded)>CAP:self.flush()
            self.rows.append([self.containers,len(self.buffer),len(encoded),len(part),zlib.crc32(part)&0xffffffff]);self.buffer.extend(encoded);self.records+=1;self.original+=len(part)
            if len(self.rows)==PAGE:self.directory()
        return[start,self.records-start,len(raw)]
    def finish(self):
        self.flush();self.directory();return dict(kind='deflate-text-v1',blockBytes=BLOCK,records=self.records,containers=self.containers,indexPageRecords=PAGE,maxContainerCharacters=CAP)
class PackedReader:
    def __init__(self,folder,manifest):
        self.folder=Path(folder);self.manifest=manifest;self.m=manifest['storage'];self.containers=OrderedDict();self.directories=OrderedDict()
        if self.m['kind']!='deflate-text-v1'or self.m['blockBytes']!=BLOCK or self.m['indexPageRecords']!=PAGE:raise ValueError('Unsupported storage')
    def record(self,index):
        if not 0<=index<self.m['records']:raise ValueError('Record outside directory')
        page=index//PAGE
        if page not in self.directories:
            raw=(self.folder/f'directories/{page}.json').read_bytes()
            if len(raw)>131072:raise ValueError('Oversized directory')
            data=json.loads(raw)
            if(data['world'],data['sourceIndexSHA256'],data['first'])!=(self.manifest['world'],self.manifest['sourceIndexSHA256'],page*PAGE):raise ValueError('Directory identity differs')
            self.directories[page]=data
        data=self.directories.pop(page);self.directories[page]=data
        while len(self.directories)>4:self.directories.popitem(last=False)
        container,offset,length,size,crc=data['records'][index%PAGE]
        if not(0<=container<self.m['containers']and 0<=offset<CAP and 0<length<=65536 and length%4==0 and 0<size<=BLOCK):raise ValueError('Invalid packed record')
        if container not in self.containers:
            raw=(self.folder/f'packs/{container}.txt').read_bytes();header=f'PBZDF1|{self.manifest["world"]}|{self.manifest["sourceIndexSHA256"]}|{container}\n'.encode('ascii')
            if len(raw)>CAP or not raw.startswith(header):raise ValueError('Container identity differs')
            self.containers[container]=raw
        raw=self.containers.pop(container);self.containers[container]=raw
        while len(self.containers)>2:self.containers.popitem(last=False)
        if offset+length>len(raw):raise ValueError('Truncated container')
        packed=base64.b64decode(raw[offset:offset+length],validate=True);decoder=zlib.decompressobj(-15);out=decoder.decompress(packed,size+1)
        if len(out)!=size or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail or zlib.crc32(out)&0xffffffff!=crc:raise ValueError('Invalid compressed expansion or CRC')
        return out
    def span(self,span):
        first,count,size=span
        if not 0<size<=CAP or count!=(size+BLOCK-1)//BLOCK:raise ValueError('Invalid logical span')
        data=b''.join(self.record(first+i)for i in range(count))
        if len(data)!=size:raise ValueError('Logical extent differs')
        return data
    def packet(self,index):
        m=self.manifest;size=m['lastPacketBytes']if index==m['packetCount']-1 else m['chunkBytes']
        return self.span([index*(m['chunkBytes']//BLOCK),(size+BLOCK-1)//BLOCK,size])
    def text(self,kind,index):
        span=self.manifest['pages'][index]['packed']if kind=='page'else self.manifest['corridors']['packed'][index]
        return self.span(span).decode('utf-8')
def packed_paths(manifest):
    m=manifest['storage'];return['index.json',*[f'directories/{i}.json'for i in range((m['records']+PAGE-1)//PAGE)],*[f'packs/{i}.txt'for i in range(m['containers'])]]
