"""Failure certainty must follow every attempted physical strategy."""
from pathlib import Path
import importlib.util,unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('oracle',ROOT/'tools/build-custom-route-action-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle);np=oracle.np
POLICY=dict(gravityCm=2156,jumpVelocityCm=700,maxHeightCm=1100,speedCm=600,canJump=True)

class ActionOutcomes(unittest.TestCase):
    def geometry(self,floor=None,clear=None):
        g=object.__new__(oracle.Geometry)
        g.floor=floor or (lambda p:p.copy())
        g.clear=clear or (lambda p,air=False:True)
        return g

    def test_walk_and_air_keep_successful_point_arrays(self):
        g=self.geometry();a=np.array([0.,0.,0.]);b=np.array([100.,0.,0.])
        walk=g.walk_check(a,b)
        self.assertIsNone(walk['failure']);self.assertEqual(walk['validation'],g.walk(a,b))
        b=np.array([100.,0.,-500.]);air=g.air_check(a,b,POLICY,'fall')
        self.assertIsNone(air['failure']);self.assertEqual(air['validation'],g.air(a,b,POLICY,'fall'))

    def test_walk_support_failure_is_unknown_and_capsule_failure_is_known(self):
        a=np.array([0.,0.,0.]);b=np.array([100.,0.,0.])
        missing=self.geometry(floor=lambda p:None).walk_check(a,b)['failure']
        self.assertTrue(missing['unknown']);self.assertFalse(missing['obstructed'])
        blocked=self.geometry(clear=lambda p,air=False:False).walk_check(a,b)['failure']
        self.assertFalse(blocked['unknown']);self.assertTrue(blocked['obstructed'])
        self.assertEqual(blocked['reason'],'walk-capsule-blocked')

    def test_air_capsule_contact_and_capability_failure_remain_distinct(self):
        a=np.array([0.,0.,0.]);b=np.array([100.,0.,-500.])
        blocked=self.geometry(clear=lambda p,air=False:not air).air_check(a,b,POLICY,'fall')['failure']
        self.assertFalse(blocked['unknown']);self.assertTrue(blocked['obstructed'])
        limited=self.geometry().air_check(a,b,{**POLICY,'speedCm':1},'fall')['failure']
        self.assertFalse(limited['unknown']);self.assertFalse(limited['obstructed'])

    def test_unknown_walk_support_is_not_upgraded_by_a_blocked_flight(self):
        a=np.array([0.,0.,0.]);b=np.array([100.,0.,-500.])
        g=self.geometry(floor=lambda p:None,clear=lambda p,air=False:not air)
        result=oracle.inspect_direction(g,a,b,POLICY,'fall')
        self.assertIsNone(result['validation']);self.assertTrue(result['failure']['unknown']);self.assertFalse(result['failure']['obstructed'])

    def test_known_landing_capsule_block_is_distinct_from_missing_support(self):
        a=np.array([0.,0.,0.]);b=np.array([100.,0.,-500.])
        blocked=oracle.inspect_direction(self.geometry(clear=lambda p,air=False:False),a,b,POLICY,'fall')['failure']
        self.assertTrue(blocked['obstructed']);self.assertFalse(blocked['unknown'])
        missing=oracle.inspect_direction(self.geometry(),None,b,POLICY,'fall')['failure']
        self.assertTrue(missing['unknown']);self.assertFalse(missing['obstructed'])

    def test_native_failure_never_certifies_a_native_action_obstruction(self):
        a=np.array([0.,0.,0.]);b=np.array([100.,0.,500.])
        failed=oracle.inspect_direction(self.geometry(clear=lambda p,air=False:False),a,b,POLICY,'ladder')['failure']
        self.assertTrue(failed['unknown']);self.assertFalse(failed['obstructed'])
        passed=oracle.inspect_direction(self.geometry(),a,b,POLICY,'ladder')
        self.assertEqual(passed['validation'],dict(nativePadOnly=True));self.assertIsNone(passed['failure'])

if __name__=='__main__':unittest.main()
