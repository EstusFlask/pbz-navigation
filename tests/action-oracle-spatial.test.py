"""The offline broad phase must preserve every triangle used by exact physics."""
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('oracle',ROOT/'tools/build-custom-route-action-oracle.py')
oracle=importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
np=oracle.np

class SpatialTriangleTests(unittest.TestCase):
    def test_repeated_queries_use_a_bounded_bucket_and_match_the_original_scan(self):
        rng=np.random.default_rng(20261118)
        triangles=rng.uniform(-1600,1600,(1200,1,3))+rng.uniform(-150,150,(1200,3,3))
        # Exact cell boundaries and a long diagonal covering many buckets.
        triangles=np.concatenate((triangles,np.array([
            [[-256,0,0],[-256,55,0],[-256,0,192]],
            [[-800,0,0],[800,0,0],[0,800,0]],
        ])))
        index=oracle.TriangleTile(triangles,cell_limit=4)
        lo,hi=triangles.min(axis=1),triangles.max(axis=1)
        def check(point,margin=55):
            exact=triangles[np.all((lo<=point+[margin,margin,200])&(hi>=point+[-margin,-margin,-160]),axis=1)]
            np.testing.assert_array_equal(index.near(point,margin),exact)
        for point in map(np.array,[[-256,0,0],[-255.999,20,0],[-256.001,20,0],[0,0,50],[255.9,0,0]]):
            check(point)
        for point in rng.uniform(-1600,1600,(60,3)):
            check(point)
            check(point,92)
            self.assertLessEqual(len(index.cells),4)
        check(np.array([0,0,0]),55)
        check(np.array([1,1,0]),55)
        self.assertLess(len(next(reversed(index.cells.values()))[0]),len(triangles)//2)

if __name__=='__main__':
    unittest.main()
