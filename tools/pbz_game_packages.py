from pathlib import Path
import sys,struct,re,ctypes,json,hashlib
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'build/tools/crypto'));from Crypto.Cipher import AES
PAKS=Path('D:/software/Steam/steamapps/common/PBZ/ProjectPBZ/Content/Paks')
class Reader:
 def __init__(self):
  self.toc=(PAKS/'ProjectPBZ-Windows.utoc').read_bytes();b=self.toc
  self.n,self.blocks=struct.unpack_from('<II',b,24);self.seeds=struct.unpack_from('<I',b,84)[0];self.overflow=struct.unpack_from('<I',b,96)[0]
  self.block_size=struct.unpack_from('<I',b,44)[0];self.partition_size=struct.unpack_from('<Q',b,88)[0];self.block_at=144+self.n*22+(self.seeds+self.overflow)*4
  self.lookup={b[144+i*12:156+i*12].hex():i for i in range(self.n)}
  secret=(ROOT/'build/tools/.game-key').read_text();key=bytes.fromhex(re.search(r'[0-9a-fA-F]{64}',secret).group());self.aes=AES.new(key,AES.MODE_ECB);self.files={}
  self.oodle=ctypes.CDLL(str(ROOT/'build/tools/retoc/oo2core_9_win64.dll'));self.dec=self.oodle.OodleLZ_Decompress
  self.dec.restype=ctypes.c_longlong;self.dec.argtypes=[ctypes.c_void_p,ctypes.c_longlong,ctypes.c_void_p,ctypes.c_longlong,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_void_p,ctypes.c_longlong,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_longlong,ctypes.c_int]
 def read(self,id):
  i=self.lookup[id];at=144+self.n*12+i*10;offset=int.from_bytes(self.toc[at:at+5],'big');length=int.from_bytes(self.toc[at+5:at+10],'big');chunks=[]
  for k in range(offset//self.block_size,(offset+length-1)//self.block_size+1):
   at=self.block_at+k*12;entry=self.toc[at:at+12];disk=int.from_bytes(entry[:5],'little');size=int.from_bytes(entry[5:8],'little');raw_size=int.from_bytes(entry[8:11],'little');method=entry[11]
   partition=disk//self.partition_size;name='ProjectPBZ-Windows'+(f'_s{partition}' if partition else '')+'.ucas'
   if name not in self.files:self.files[name]=(PAKS/name).open('rb')
   f=self.files[name];f.seek(disk%self.partition_size);compressed=self.aes.decrypt(f.read((size+15)//16*16))[:size]
   if method:
    dst=ctypes.create_string_buffer(raw_size);got=self.dec(compressed,len(compressed),dst,raw_size,1,0,0,None,0,None,None,None,0,3);assert got==raw_size,(id,k,got,raw_size);chunks.append(dst.raw)
   else:chunks.append(compressed)
  value=b''.join(chunks);return value[offset%self.block_size:offset%self.block_size+length]
def names(data):
 count=struct.unpack_from('<I',data,60)[0];assert 0<=count<200000
 sizes=[int.from_bytes(data[76+count*8+i*2:78+count*8+i*2],'big') for i in range(count)];pos=76+count*10;out=[]
 for sz in sizes:
  wide=bool(sz&0x8000);sz=(sz&0x7fff)*(2 if wide else 1);out.append(data[pos:pos+sz].decode('utf-16le' if wide else 'utf-8'));pos+=sz
 return out
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf-8');r=Reader();dest=ROOT/'build/roadbook-11/roots';dest.mkdir(parents=True,exist_ok=True)
 for line in (ROOT/'build/game-files.txt').read_text(encoding='utf-8').splitlines():
  if 'ExportBundleData' not in line:continue
  _,id,_,name=line.split(None,3)
  if re.search(r'/PBZ_(Xigu|Fujizhilin|Zhengdaodaying|Pangzhen|Houjie|Ximeng|Dengdingshandao|Duanhun)_WP\.umap$',name,re.I):
   data=r.read(id);stem=Path(name).stem;(dest/(stem+'.bin')).write_bytes(data);n=names(data);(dest/(stem+'-names.json')).write_text(json.dumps(n,ensure_ascii=False),encoding='utf-8');print(stem,len(data),len(n),'names',n[:4])
