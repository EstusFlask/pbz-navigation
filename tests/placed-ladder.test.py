"""Real cooked ladder component controls; mesh axis is not a trigger proof."""
from pathlib import Path
import sys,unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
class PlacedLadder(unittest.TestCase):
    def test_real_baked_mesh_axis_recovers_missing_candidate_and_requires_live_trigger(self):
        from pbz_ladder_candidates import extract
        from pbz_zen import Package,native_classes
        from pbz_offline_assets import Assets
        from pbz_game_packages import Reader
        file=ROOT/'build/roadbook-11/cells/eb0736159464b6f000000001.bin'
        if not file.exists():self.skipTest('Private cooked component fixture unavailable')
        p=Package(file.read_bytes(),native_classes());p.asset_name='ladder-control';p.asset_sha256='fixture';assets=Assets(Reader(),native_classes(),ROOT/'build/offline-navigation/assets');actor='BP_SpecialMove_ClimLadder_C_UAID_BCFCE7058A986D7102_2124813882';r=extract(p,actor,assets)
        self.assertEqual(r['endpointSource'],'cooked-ladder-mesh-axis');self.assertTrue(r['requiresLoaded']);self.assertTrue(r['requiresLiveEndpoints']);self.assertTrue(r['fold']);self.assertEqual(r['path'][0][2],14898);self.assertEqual(r['path'][1][2],15573)
        original=p.exports;top=next(i for i,e in enumerate(original)if e['outer']==30 and e['name']=='TopLadder');p.exports=[{**e,'name':'MissingTop'}if i==top else e for i,e in enumerate(original)]
        with self.assertRaisesRegex(ValueError,'TopLadder'):extract(p,actor,assets)
    def test_native_construction_math_matches_real_saved_mesh_axes_and_recovers_stripped_meshes(self):
        from pbz_ladder_candidates import extract
        from pbz_zen import Package,native_classes
        from pbz_offline_assets import Assets
        from pbz_game_packages import Reader
        import json
        index=json.loads((ROOT/'build/roadbook-11/all-placed-index.json').read_bytes());assets=Assets(Reader(),native_classes(),ROOT/'build/offline-navigation/assets');checked=0;stripped=0
        for row in [r for r in index if 'ClimLadder'in r['actor']]:
            file=ROOT/row['file'];p=Package(file.read_bytes(),native_classes());p.asset_name=row['package'];p.asset_sha256=row['sha256'];original=extract(p,row['actor'],assets)
            if len(original['componentEvidence'])==2:
                actor=next(i for i,e in enumerate(p.exports)if e['name']==row['actor']);p.exports=[{**e,'name':'hidden-'+e['name']}if e['outer']==actor and e['name']in ['BottomLadder','TopLadder']else e for e in p.exports];generated=extract(p,row['actor'],assets)
                for a,b in zip(original['path'],generated['path']):
                    for x,y in zip(a,b):self.assertAlmostEqual(x,y,places=5)
                checked+=1
            else:stripped+=1
            self.assertTrue(original['requiresLiveEndpoints'])
        self.assertEqual(checked,50);self.assertEqual(stripped,73)
if __name__=='__main__':unittest.main()
