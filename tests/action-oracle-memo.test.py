from pathlib import Path
from collections import OrderedDict
import importlib.util,unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('oracle',ROOT/'tools/build-custom-route-action-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle);np=oracle.np

class MemoizedPhysics(unittest.TestCase):
    def geometry(self,triangles):
        geometry=object.__new__(oracle.Geometry);geometry.floor_cache=OrderedDict();geometry.clear_cache=OrderedDict();geometry.memo_limit=3;calls=[]
        def near(point):calls.append(point.copy());return triangles
        geometry.near=near
        return geometry,calls
    def test_floor_memo_reuses_exact_pads_and_protects_them_from_caller_changes(self):
        triangles=np.array([[[-100,-100,0],[100,-100,0],[100,100,0]],[[-100,-100,0],[100,100,0],[-100,100,0]]],dtype=float)
        geometry,calls=self.geometry(triangles);point=np.array([0.,0.,0.]);first=geometry.floor(point);first[0]=999
        self.assertEqual(geometry.floor(point)[0],0);self.assertEqual(len(calls),1)
        for height in [400,500,600,700]:
            missing=np.array([0.,0.,height]);self.assertIsNone(geometry.floor(missing));self.assertIsNone(geometry.floor(missing))
            self.assertLessEqual(len(geometry.floor_cache),3)
        self.assertEqual(len(calls),5)
    def test_clear_memo_distinguishes_air_and_walking_capsules(self):
        triangles=np.array([[[-100,-100,40],[100,-100,40],[100,100,40]],[[-100,-100,40],[100,100,40],[-100,100,40]]],dtype=float)
        geometry,calls=self.geometry(triangles);point=np.array([0.,0.,0.])
        self.assertTrue(geometry.clear(point));self.assertFalse(geometry.clear(point,True))
        self.assertTrue(geometry.clear(point));self.assertFalse(geometry.clear(point,True));self.assertEqual(len(calls),2)

if __name__=='__main__':unittest.main()
