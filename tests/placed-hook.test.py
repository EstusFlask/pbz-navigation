"""Real cooked hook endpoints, distinct from the airborne aiming sphere."""
from pathlib import Path
import sys,json,unittest,copy,hashlib
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
class PlacedHook(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from pbz_zen import Package,native_classes
        from pbz_offline_assets import Assets
        from pbz_game_packages import Reader
        rows=json.loads((ROOT/'build/roadbook-11/all-placed-index.json').read_bytes());cls.row=next(r for r in rows if r['actor'].endswith('_1708767337'));raw=(ROOT/cls.row['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==cls.row['sha256'];cls.package=Package(raw,native_classes());cls.package.asset_name=cls.row['package'];cls.package.asset_sha256=cls.row['sha256'];cls.assets=Assets(Reader(),native_classes(),ROOT/'build/offline-navigation/assets')

    def test_real_hook_uses_its_trigger_box_and_keeps_the_airborne_grab_point(self):
        from pbz_hook_candidates import extract
        r=extract(self.package,self.row['actor'],self.assets);proof=json.loads((ROOT/'build/movement-caps-research-20261116/hook-world-verified.json').read_bytes())
        self.assertEqual(r['kind'],'hook');self.assertTrue(r['requiresLiveEndpoints']);self.assertFalse(r['both']);self.assertEqual(r['entrySource'],'TriggerBox');self.assertEqual(len(r['path']),3)
        for p,k in zip(r['path'],['TriggerBox','GrabPoint','LandArea']):
            for a,b in zip(p,proof[k]):self.assertAlmostEqual(a,b,places=6)
        self.assertNotEqual(r['path'][0],r['path'][1]);self.assertGreater(abs(r['path'][0][0]-r['path'][1][0]),1000)

    def test_missing_or_ambiguous_launch_box_never_uses_the_aiming_sphere(self):
        from pbz_hook_candidates import extract
        for change in ['missing','wrong-owner','duplicate']:
            package=copy.copy(self.package);package.exports=copy.deepcopy(self.package.exports);box=next(e for e in package.exports if e['name']=='TriggerBox')
            if change=='missing':box['name']='MissingLaunchBox'
            elif change=='wrong-owner':box['outer']=0
            else:package.exports.append(copy.deepcopy(box))
            with self.assertRaisesRegex(ValueError,'hook TriggerBox'):extract(package,self.row['actor'],self.assets)
if __name__=='__main__':unittest.main()
