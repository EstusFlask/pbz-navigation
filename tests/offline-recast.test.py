"""Real upstream core controls. These scenes are analytic, not PBZ map evidence."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from pbz_offline_mesh import box, combine, write_mesh
from pbz_zen import Package
from pbz_body_setup import body_setup, collision_meshes
CLI = ROOT/'offline-navigation/cli.mjs'


class RecastCore(unittest.TestCase):
    def scene(self, meshes, start, goal, *, radius=45,cell=10):
        self.assertTrue(CLI.is_file())
        folder = Path(self.temp.name)
        vertices, triangles = combine(meshes)
        write_mesh(folder/'scene.pbzmesh', vertices, triangles,
                   provenance=dict(kind='analytic-control', completeCollisionClaim=False))
        result = subprocess.run(['node', str(CLI), 'bake', str(folder/'scene.pbzmesh'), str(folder/'scene.pbznav'),
                                 str(folder/'bake.json'), str(cell), '5', str(radius), '192', '50', '55', '64', 'validated-input'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        result = subprocess.run(['node', str(CLI), 'query', str(folder/'scene.pbznav'), str(folder/'route.json'),
                                 *map(str, start), *map(str, goal)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads((folder/'route.json').read_text()), json.loads((folder/'bake.json').read_text())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pbz-real-recast-')

    def tearDown(self):
        self.temp.cleanup()

    def test_tiles_connect_without_offmesh_links(self):
        route, bake = self.scene([box((-6000,-1000,-100),(6000,1000,0))], (-5500,0,0), (5500,0,0))
        self.assertTrue(route['complete'])
        self.assertGreater(bake['tiles'], 10)
        self.assertLess(abs(route['points'][-1][0]-5500), 1)

    def test_wall_forces_a_real_detour(self):
        route, _ = self.scene([box((-1200,-1000,-100),(1200,1000,0)),
                               box((-50,-400,0),(50,400,350))], (-900,0,0), (900,0,0))
        self.assertTrue(route['complete'])
        self.assertTrue(any(abs(p[1]) >= 445 for p in route['points']), route)
        for a,b in zip(route['points'], route['points'][1:]):
            for i in range(101):
                p = [a[k]+(b[k]-a[k])*i/100 for k in range(3)]
                dx,dy=max(abs(p[0])-50,0),max(abs(p[1])-400,0)
                self.assertGreaterEqual((dx*dx+dy*dy)**.5,45-.0001, p)

    def test_closed_wall_is_partial_not_complete(self):
        route, _ = self.scene([box((-1200,-1000,-100),(1200,1000,0)),
                               box((-50,-1200,0),(50,1200,350))], (-900,0,0), (900,0,0))
        self.assertFalse(route['complete'])

    def test_player_radius_blocks_narrow_door(self):
        def scene(gap):
            return [box((-1200,-1000,-100),(1200,1000,0)),
                    box((-50,-1200,0),(50,-gap/2,350)), box((-50,gap/2,0),(50,1200,350))]
        self.assertFalse(self.scene(scene(80),(-900,0,0),(900,0,0))[0]['complete'])
        self.assertTrue(self.scene(scene(180),(-900,0,0),(900,0,0))[0]['complete'])

    def test_coincident_floors_do_not_create_vertical_walk(self):
        meshes=[box((-1200,-1000,-100),(1200,1000,0)), box((-1200,-1000,490),(1200,1000,500))]
        route,_=self.scene(meshes,(-900,0,500),(900,0,500))
        self.assertTrue(route['complete'])
        self.assertTrue(all(abs(p[2]-500)<10 for p in route['points']))
        self.assertFalse(self.scene(meshes,(-900,0,0),(900,0,500))[0]['complete'])

    def test_low_ceiling_has_no_standing_floor(self):
        route,_=self.scene([box((-1200,-1000,-100),(1200,1000,0)),
                            box((-1200,-1000,140),(1200,1000,160))],(-900,0,0),(900,0,0))
        self.assertFalse(route['complete'])

    def test_an_empty_walkable_tile_is_not_a_build_failure(self):
        route,bake=self.scene([box((-20,-1000,0),(20,1000,300))],(-10,0,0),(10,0,0))
        self.assertFalse(route['complete'])
        self.assertEqual(bake['tiles'],0)

    def test_saved_single_sided_floor_is_not_turned_upside_down(self):
        file=ROOT/'build/offline-navigation/probes/SM_Road_Mub_F.bin'
        if not file.exists():self.skipTest('Local game asset fixture unavailable')
        decoded=body_setup(Package(file.read_bytes()),0)
        # Exercise complex-as-simple using the real asset's one-sided cooked
        # floor. This is a selector control, not a claim about its original flag.
        decoded['properties']['CollisionTraceFlag']=3
        route,_=self.scene(collision_meshes(decoded),(-15,0,-10),(15,0,-10))
        self.assertTrue(route['complete'],'the saved upward floor was discarded by the collision exporter')

    def test_fine_voxels_keep_a_realistic_door_without_shrinking_the_player(self):
        meshes=[box((-1200,-1000,-100),(1200,1000,0)),
                box((-50,-1200,0),(50,-55,350)),box((-50,55,0),(50,1200,350))]
        route,bake=self.scene(meshes,(-900,0,0),(900,0,0),cell=5)
        self.assertTrue(route['complete'])
        self.assertEqual(bake['agent']['radiusCm'],45)


if __name__=='__main__':
    unittest.main()
