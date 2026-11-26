"""Directed selection and edition controls; no game acceptance claims."""
from pathlib import Path
import hashlib,importlib.util,json,sys,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'tools'),str(ROOT/'tests')]
spec=importlib.util.spec_from_file_location('bell_lite',ROOT/'tools/build-bell-lite.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
from release_profiles import archive_name,build_bytes,lua_build_bytes,included,SCRIPTS
from lite_package import package_sources

class BellLite(unittest.TestCase):
 def test_directed_geometry_path_includes_its_action_but_does_not_invent_a_reverse(self):
  nodes=[[0,0,0,0,0,0,[1]],[1,0,0,100,0,0,[]],[2,0,0,200,0,100,[]],[3,0,0,300,0,100,[]]]
  anchors=[dict(id='a',start=dict(id=0),goal=dict(id=0)),dict(id='b',start=dict(id=2),goal=dict(id=2))]
  kept,pairs=builder.shortest_paths(nodes,{1:[(2,150)]},anchors)
  self.assertEqual(kept,{0,1,2});self.assertEqual([p['reachable'] for p in pairs],[True,False])
 def test_lite_retains_every_legacy_feature_file_and_has_independent_development_flavors(self):
  for file in ['PBZQuestRoute.js','PBZRouteTracker.js','PBZRouteInk.js','PBZRouteItems.js','PBZRouteGuideData.js','PBZRecastData/route-001/index.js']:
   self.assertTrue(included(SCRIPTS+file,'release','lite'))
  self.assertFalse(included(SCRIPTS+'PBZRouteDiagnostics.js','release','lite'))
  self.assertTrue(included(SCRIPTS+'PBZRouteDiagnostics.js','development','lite'))
  self.assertNotEqual(archive_name('1.12.0','release','lite'),archive_name('1.12.0','release'))
  profile=build_bytes(ROOT/'Quest_Navigation','1.12.0','release','lite')
  self.assertIn(b'"edition":"lite"',profile);self.assertIn(b'"development":false',profile)
  self.assertIn(b'development=false',lua_build_bytes('1.12.0','release','lite'))
 def test_package_allowlist_rejects_unreferenced_private_files_and_changed_receipt_bytes(self):
  with tempfile.TemporaryDirectory(prefix='bell-package-',dir=ROOT/'build/offline-navigation') as temp:
   stage=Path(temp);world='pbz_test';identity='test'
   values={'worlds/catalog.json':dict(schema=1,scope='bell-corridors',worlds={world:dict(index=world+'/index.json',sourceIndexSHA256=identity)}),
    'worlds/'+world+'/index.json':dict(world=world,scope='bell-corridors',unknownState='closed',sourceIndexSHA256=identity,kind='paged-sparse-world',blobLayout='packets-v1',storage=dict(kind='deflate-text-v1',blockBytes=32768,indexPageRecords=512,records=0,containers=0))}
   hashes={}
   for name,value in values.items():
    file=stage/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text(json.dumps(value),encoding='utf-8');hashes[name]=hashlib.sha256(file.read_bytes()).hexdigest()
   receipt=stage.with_name(stage.name+'.receipt.json');record=dict(kind='bell-corridor-subset',version='1.12.0',files=hashes)
   release=dict(version='1.12.0',liteWorldCount=1,liteWorldStage=str(stage))
   try:
    receipt.write_text(json.dumps(record),encoding='utf-8');files,_=package_sources(ROOT,release,'lite');self.assertEqual(len(files),2)
    record['files']['overlays/PBZRouteActionCorridors/private-save.json']='private';receipt.write_text(json.dumps(record),encoding='utf-8')
    with self.assertRaises(ValueError):package_sources(ROOT,release,'lite')
    del record['files']['overlays/PBZRouteActionCorridors/private-save.json'];receipt.write_text(json.dumps(record),encoding='utf-8')
    (stage/'worlds/catalog.json').write_text(json.dumps(values['worlds/catalog.json'])+' ',encoding='utf-8')
    with self.assertRaises(ValueError):package_sources(ROOT,release,'lite')
   finally:receipt.unlink(missing_ok=True)
if __name__=='__main__':unittest.main()
