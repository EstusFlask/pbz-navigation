"""Analytic controls for the independent collision validator, not map evidence."""
from pathlib import Path
import importlib.util
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/offline-deps'))
import numpy as np
spec=importlib.util.spec_from_file_location('body',ROOT/'tools/validate-offline-body.py');body=importlib.util.module_from_spec(spec);spec.loader.exec_module(body)


def floor(x0,x1,z=0):
    return [[[x0,-100,z],[x1,-100,z],[x1,100,z]],[[x0,-100,z],[x1,100,z],[x0,100,z]]]


class IndependentGeometry(unittest.TestCase):
    def test_flat_floor_and_capsule_perching_over_a_narrow_seam(self):
        self.assertAlmostEqual(body.capsule_support(np.array([0.,0.,0.]),np.array(floor(-100,100))),0,places=3)
        triangles=np.array(floor(-100,-10)+floor(10,100)+floor(-100,100,-60),dtype=float)
        # A centre ray falls 60cm. The lower sphere rests on the 10cm-away rim.
        expected=np.sqrt(45**2-10**2)-45
        self.assertAlmostEqual(body.capsule_support(np.array([0.,0.,0.]),triangles),expected,places=3)

    def test_vertical_wall_distance_and_intersection_are_detected(self):
        triangles=np.array([[[0,-100,0],[0,100,0],[0,100,300]],[[0,-100,0],[0,100,300],[0,-100,300]]],dtype=float)
        self.assertAlmostEqual(body.segment_distance(np.array([30.,0,96]),np.array([30.,0,147]),triangles).min(),30,places=5)
        self.assertAlmostEqual(body.segment_distance(np.array([-10.,0,100]),np.array([10.,0,100]),triangles).min(),0,places=5)


if __name__=='__main__':unittest.main()
