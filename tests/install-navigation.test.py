"""Exercise the actual installer transaction in a private synthetic game."""
from pathlib import Path
import contextlib,hashlib,importlib.util,io,json,os,sys,tempfile,unittest,zipfile
ROOT=Path(__file__).resolve().parents[1]
class InstallTransaction(unittest.TestCase):
 def run_case(self,fail):
  with tempfile.TemporaryDirectory(prefix='install-control-',dir=ROOT/'build')as tmp:
   root=Path(tmp).resolve();self.assertTrue(root.is_relative_to(ROOT/'build'))
   for p in ['dist','release','build','game/ProjectPBZ/Binaries/Win64','manager/Data/games/phantom-blade-zero']: (root/p).mkdir(parents=True,exist_ok=True)
   spec=importlib.util.spec_from_file_location('installer',ROOT/'tools/install-navigation-candidate.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.ROOT=root;m.idle=lambda:None
   game=root/'game';manager=root/'manager';nav=game/m.NAV;compat=game/m.COMPAT;nav.mkdir(parents=True);compat.mkdir(parents=True);(nav/'stale.txt').write_bytes(b'old navigation');(compat/'old.dll').write_bytes(b'old compat')
   other=game/'other-mod.lua';other.write_bytes(b'user other mod');save=game/'ProjectPBZ/Saved/SaveGames/user.sav';save.parent.mkdir(parents=True);save.write_bytes(b'user save')
   foreign=dict(id='other',name='Other Mod',enabled=True,files=[dict(fileName='other-mod.lua',target='InstallRoot',deployedPath=str(other))]);state=dict(version=1,mods=[foreign],offForTest=[],sets=[]);statefile=manager/'Data/games/phantom-blade-zero/mods.json';original=json.dumps(state).encode();statefile.write_bytes(original)
   archive=root/'dist/control.zip'
   with zipfile.ZipFile(archive,'w')as z:
    z.writestr(m.NAV+'PBZRouteBuild.js',"module.exports="+json.dumps(dict(version='1.10.1',development=True))+';');z.writestr(m.NAV+'main.js','new navigation');z.writestr(m.COMPAT+'dlls/main.dll',b'new compat');z.writestr('INSTALL-README.md','do not install in game root')
   report=dict(packages=[dict(flavor='development',archive='dist/control.zip',sha256=hashlib.sha256(archive.read_bytes()).hexdigest())]);(root/'release/LOCAL-CANDIDATE-1.10.1.json').write_text(json.dumps(report))
   if fail:
    original_atomic=m.atomic
    def atomic(file,raw):
     if file==statefile:raise OSError('forced state commit failure')
     return original_atomic(file,raw)
    m.atomic=atomic
   args=sys.argv;local=os.environ['LOCALAPPDATA'];sys.argv=['install','--version','1.10.1','--game',str(game),'--manager',str(manager)];os.environ['LOCALAPPDATA']=str(root/'local')
   try:
    with contextlib.redirect_stdout(io.StringIO()):
     if fail:
      with self.assertRaisesRegex(OSError,'forced'):m.main()
     else:m.main()
   finally:sys.argv=args;os.environ['LOCALAPPDATA']=local
   self.assertEqual(other.read_bytes(),b'user other mod');self.assertEqual(save.read_bytes(),b'user save');self.assertFalse((game/'INSTALL-README.md').exists())
   if fail:
    self.assertEqual(statefile.read_bytes(),original);self.assertEqual((nav/'stale.txt').read_bytes(),b'old navigation');self.assertEqual((compat/'old.dll').read_bytes(),b'old compat')
   else:
    after=json.loads(statefile.read_bytes());self.assertEqual(after['mods'][0],foreign);self.assertEqual(after['mods'][1]['version'],'1.10.1');self.assertFalse((nav/'stale.txt').exists());self.assertTrue((nav/'main.js').is_file());self.assertEqual(len(list((root/'build').glob('install-navigation-*/backup/navigation/stale.txt'))),1)
 def test_install_preserves_saves_and_other_mods(self):self.run_case(False)
 def test_failed_state_commit_rolls_back_owned_directories(self):self.run_case(True)
if __name__=='__main__':unittest.main()
