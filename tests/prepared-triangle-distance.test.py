from pathlib import Path
import importlib.util,unittest
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
reference=module('reference_body','tools/validate-offline-body.py');prepared=module('prepared_body','tools/prepared-triangle-distance.py');np=reference.np

class PreparedTriangles(unittest.TestCase):
    def test_distances_match_reference_for_repeated_points_and_degenerate_triangles(self):
        random=np.random.default_rng(20261118);triangles=random.uniform(-100,100,(250,3,3))+[-260000,110000,-6000]
        triangles=np.concatenate([triangles,triangles[:2,:1].repeat(3,axis=1)])
        query=prepared.TriangleDistances(triangles)
        for point in random.uniform(-140,140,(40,3))+[-260000,110000,-6000]:
            np.testing.assert_array_equal(query.point(point),reference.point_distance(point,triangles))
    def test_support_matches_reference_on_floor_edges_slopes_and_penetrating_initial_sphere(self):
        ground=np.array([[[-100,-100,0],[100,-100,0],[100,100,0]],[[-100,-100,0],[100,100,0],[-100,100,0]]],dtype=float)
        for slope in [0,.2,.7]:
            triangles=ground.copy();triangles[:,:,2]=triangles[:,:,0]*slope
            for point in [[0,0,0],[90,0,20],[130,0,20],[0,0,-150]]:
                value=np.array(point,dtype=float)
                self.assertEqual(prepared.capsule_support(value,triangles),reference.capsule_support(value,triangles))

if __name__=='__main__':unittest.main()
