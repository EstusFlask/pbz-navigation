import sys,re,struct,json,hashlib
from pathlib import Path
from pbz_game_packages import Reader,names
sys.stdout.reconfigure(encoding='utf-8');root=Path('build/roadbook-11');reader=Reader();dest=root/'cells';dest.mkdir(parents=True,exist_ok=True)
paths={}
for line in Path('build/game-files.txt').read_text(encoding='utf-8').splitlines():
 if 'ExportBundleData' not in line:continue
 _,id,_,name=line.split(None,3)
 if '/_Generated_/' in name and name.endswith('.umap'):paths[name]=id
index=[]
for file in (root/'roots').glob('*.bin'):
 data=file.read_bytes();n=names(data);base=struct.unpack_from('<I',data,4)[0];at,end=struct.unpack_from('<II',data,32);policy=None
 for p in range(at,end,72):
  off,size,ni,num=struct.unpack_from('<QQII',data,p)
  if n[ni&0x3fffffff]=='WorldPartitionLevelStreamingPolicy':policy=data[base+off:base+off+size];break
 if policy is None:
  for p in range(at,end,72):
   off,size,ni,num=struct.unpack_from('<QQII',data,p)
   if n[ni&0x3fffffff].startswith('WorldPartitionLevelStreamingPolicy'):policy=data[base+off:base+off+size];break
 assert policy is not None,file
 world_path=next(v for v in n if v.endswith('/'+file.stem))
 for k,name in enumerate(n):
  if not re.match(r'(BP_.*(GapBlocker|Teleport|FloatingBoat|SpecialMove|ASM_|Lift|TempLadder|LionDancing)|PBZTeleport).*UAID_',name):continue
  start=0
  while (hit:=policy.find(struct.pack('<I',k),start))>=0:
   ni,num,cell,zero=struct.unpack_from('<4I',policy,hit)
   if cell<len(n) and zero==0 and re.fullmatch('[A-Z0-9]{25}',n[cell]):
    pkg='../../../ProjectPBZ/Content'+world_path.removeprefix('/Game')+'/_Generated_/'+n[cell]+'.umap'
    if pkg in paths:
     id=paths[pkg];output=dest/(id+'.bin')
     if not output.exists():output.write_bytes(reader.read(id))
     index.append(dict(world=file.stem.lower(),actor=name+('_'+str(num-1) if num else ''),cell=n[cell],id=id,package=pkg,file=str(output),sha256=hashlib.sha256(output.read_bytes()).hexdigest()))
   start=hit+4
 print(file.stem,'indexed',sum(x['world']==file.stem.lower() for x in index))
(root/'all-placed-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('actors',len(index),'unique packages',len(set(x['id'] for x in index)),sum(p.stat().st_size for p in dest.glob('*.bin')),'bytes')
