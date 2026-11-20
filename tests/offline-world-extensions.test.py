"""Real installed component-prefix regressions; no game acceptance implied."""
from pathlib import Path
import json
import math
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from pbz_zen import Package,native_classes
from pbz_offline_components import Cursor
from pbz_offline_assets import TransformChain,place


class WorldExtensions(unittest.TestCase):
    def test_real_missing_spline_collision_requires_exact_saved_local_body(self):
        from pbz_game_packages import Reader
        from pbz_offline_assets import Assets
        from pbz_spline_collision import exact_sibling_index,resolve_exact_sibling_body,REVIEWED_MESH_SHA256,canonical,equivalent_key
        if not (ROOT/'build/offline-navigation/worlds/pbz_dengdingshandao_wp/inventory.json').exists():self.skipTest('Private spline fixture unavailable')
        assets=Assets(Reader(),native_classes(),ROOT/'build/offline-navigation/assets')
        p=assets.load('/Game/Maps/DengDingShanDao/PBZ_DengDingShanDao_WP/_Generated_/1MV3GLY6SNG8OZK162I9IWC2D')
        candidates=exact_sibling_index(assets,p,REVIEWED_MESH_SHA256)
        for i in range(82,114):
            body,proof,_,_=resolve_exact_sibling_body(assets,p,i,candidates)
            self.assertEqual(proof['siblingExport'],i-32);self.assertTrue(body['chaos']['complex'])
        cachekey=(p.asset_name,82);original=assets.component(p,82)
        for change in [dict(splineAxis=1),dict(splineSmooth=True),dict(splineDirty=True),dict(BodyInstance={**original['BodyInstance'],'CollisionEnabled':0})]:
            assets.props[cachekey]={**original,**change}
            try:
                with self.assertRaises(ValueError):resolve_exact_sibling_body(assets,p,82,candidates)
            finally:assets.props[cachekey]=original
        key,_=equivalent_key(assets,p,82);ambiguous={**candidates,canonical(key):candidates[canonical(key)]*2}
        with self.assertRaises(ValueError):resolve_exact_sibling_body(assets,p,82,ambiguous)

    def test_real_typed_bone_attachment_reference_is_not_parent_origin(self):
        from pbz_game_packages import Reader
        from pbz_offline_assets import Assets
        folder=ROOT/'build/offline-navigation/worlds/pbz_xigu_wp'
        if not (folder/'inventory.json').exists():self.skipTest('Private world unavailable')
        inv=json.loads((folder/'inventory.json').read_text());entry=next(r for r in inv['cells'] if r['cell']=='205I5TU4N4V6Q5ZKXD7E6662B')
        file=ROOT/'build/offline-navigation/cells'/inv['containerSHA256'][:16]/(entry['chunk']+'.bin');p=Package(file.read_bytes(),native_classes());p.asset_name=entry['package'].lower()
        assets=Assets(Reader(),native_classes(),ROOT/'build/offline-navigation/assets')
        chain=assets.chain(p,263)
        self.assertTrue(any(r.get('referencePoseOnly') for r in chain));self.assertTrue(any(r.get('navFloorAllowed') is False for r in chain))
        self.assertNotEqual(place((0,0,0),chain),place((0,0,0),assets.chain(p,218)))

    def test_real_geometry_collection_parent_preserves_saved_proxy_transform(self):
        folder=ROOT/'build/offline-navigation/worlds/pbz_houjie_wp'
        if not (folder/'inventory.json').exists():self.skipTest('Private world unavailable')
        inv=json.loads((folder/'inventory.json').read_text());file=ROOT/'build/offline-navigation/cells'/inv['containerSHA256'][:16]/'5924ab6e55966d4700000001.bin'
        if not file.exists():self.skipTest('Private GC fixture unavailable')
        from pbz_game_packages import Reader
        from pbz_offline_assets import Assets
        assets=Assets(Reader(),native_classes(),ROOT/'build/offline-navigation/assets')
        p=Package(file.read_bytes(),native_classes());p.asset_name='/game/maps/b09/pbz_houjie_wp/_generated_/dap8fit604yga1i7c4t1cep05'
        actual=place((0,0,0),assets.chain(p,13))
        for a,b in zip(actual,(-274364.232939,43263.707366,-3287.394433)):self.assertAlmostEqual(a,b,places=6)

    def test_real_equal_size_oodle_block_is_still_decompressed(self):
        folder=ROOT/'build/offline-navigation/worlds/pbz_dengdingshandao_wp'
        if not (folder/'inventory.json').exists():self.skipTest('Private installed-world fixture unavailable')
        inventory=json.loads((folder/'inventory.json').read_text())
        file=ROOT/'build/offline-navigation/cells'/inventory['containerSHA256'][:16]/'bdb84d8f90d8b74a00000001.bin'
        if not file.exists():self.skipTest('Private DynamicMesh fixture unavailable')
        from pbz_dynamic_mesh import geometry,oodle_decoder
        p=Package(file.read_bytes(),native_classes());mesh=geometry(p.payload(206),oodle_decoder())
        self.assertEqual(len(mesh['vertices']),20);self.assertEqual(len(mesh['triangles']),36)
        self.assertTrue(all(math.isfinite(v) for point in mesh['vertices'] for v in point))

    def test_mirrored_nonuniform_parent_uses_engine_signed_axis_decomposition(self):
        chain=TransformChain([dict(rotation=(0,90,0),location=(1,2,3)),dict(scale=(-2,3,4),location=(10,20,30))])
        for a,b in zip(place((1,0,0),chain),(8,28,42)):self.assertAlmostEqual(a,b,places=9)

    def test_never_cooked_convex_has_no_runtime_shape(self):
        from pbz_body_setup import collision_meshes
        decoded=dict(properties=dict(bNeverNeedsCookedCollisionData=1,AggGeom=[dict(kind='convex')]),chaos=dict(simple=[],complex=[]))
        self.assertEqual(collision_meshes(decoded),[])

    def test_real_spline_and_child_actor_prefixes_are_consumed(self):
        folder=ROOT/'build/offline-navigation/worlds/pbz_xigu_wp'
        if not (folder/'inventory.json').exists():self.skipTest('Private installed world unavailable')
        inventory=json.loads((folder/'inventory.json').read_text())
        cache=ROOT/'build/offline-navigation/cells'/inventory['containerSHA256'][:16]
        for name,index,cls in [('B1HSEBTI3RHIIUUX21EXCAKDB',61,'SplineComponent'),('1MEN2ZZZM5CT2PABVEB8BWCMA',8,'ChildActorComponent'),
                               ('205I5TU4N4V6Q5ZKXD7E6662B',218,'SkeletalMeshComponent')]:
            with self.subTest(cls=cls):
                row=next(r for r in inventory['cells'] if r['cell']==name)
                p=Package((cache/(row['chunk']+'.bin')).read_bytes(),native_classes())
                c=Cursor(p.payload(index));props=c.component(cls,full=True)
                self.assertIn('parent',props)
                self.assertEqual(c.at,len(c.data)-8)
                self.assertEqual(c.read('II'),(0,0))


if __name__=='__main__':unittest.main()
