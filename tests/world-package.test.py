"""Public file allowlist controls; synthetic metadata, no game acceptance."""
from pathlib import Path
import hashlib,json,sys,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
from world_package import world_sources,PREFIX

class WorldPackage(unittest.TestCase):
 def test_only_referenced_public_data_enters_versioned_archive(self):
  with tempfile.TemporaryDirectory(prefix='package-control-',dir=ROOT/'build/offline-navigation')as temp:
   stage=Path(temp);files={
    PREFIX+'catalog.json':dict(schema=1,worlds={'pbz_test':dict(index='pbz_test/index.json',sourceIndexSHA256='test')}),
    PREFIX+'pbz_test/index.json':dict(world='pbz_test',sourceIndexSHA256='test',blobLayout='packets-v1',pages=[dict(id=0)],packetCount=1,corridors=dict(nodes=1,pageNodes=128)),
    PREFIX+'pbz_test/pages/0.json':{},PREFIX+'pbz_test/corridors/0.json':{},PREFIX+'pbz_test/packets/0.txt':'AA==',
    'private/frozen-save.json':{'saved':True}}
   hashes={}
   for name,row in files.items():
    p=stage/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(row));hashes[name]=hashlib.sha256(p.read_bytes()).hexdigest()
   receipt=stage.with_suffix('.receipt.json');record=dict(version='1.10.0',kind='unreleased-world-integration',files=hashes)
   release=dict(version='1.10.0',offlineWorldCount=1,offlineWorldStage=str(stage))
   try:
    receipt.write_text(json.dumps(record));sources,_=world_sources(ROOT,release)
    self.assertEqual(set(sources),set(files)-{'private/frozen-save.json'})
    with self.assertRaises(ValueError):world_sources(ROOT,{**release,'offlineWorldCount':2})
    with self.assertRaises(ValueError):world_sources(ROOT,{**release,'version':'1.9.4'})
    record['files'][PREFIX+'pbz_test/packet-hashes.json']='private';receipt.write_text(json.dumps(record))
    with self.assertRaises(ValueError):world_sources(ROOT,release)
   finally:receipt.unlink(missing_ok=True)

if __name__=='__main__':unittest.main()
