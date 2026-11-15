"""Keep late, locally replanned tails separate from whole-trip comparisons."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'tools'))
from survey_analysis import summarize, markdown


class SurveyComparison(unittest.TestCase):
    def test_late_complete_tail_cannot_be_reported_as_a_plan_from_the_original_start(self):
        p = lambda x: dict(x=x, y=0, z=0)
        task = dict(id='T', world='w', issue='field', start=dict(name='start', p=p(0)), end=dict(name='end', p=p(10000)))
        manifest = dict(attemptId='test', task=task, sampleCount=3, chunks=[{}], status='interrupted')
        samples = [dict(at=t, feet=p(x), context='w/1', physical=dict(mode=1)) for t,x in [(0,0),(10000,8000),(15000,10000)]]
        # Larger timing gaps are explicit; they do not change the origin identity.
        snapshot = dict(at=10000, snapshot=dict(target=dict(key='survey:T'), trip=dict(legs=[dict(world='w', provider='native', searchDirection='forward', points=[p(8000),p(10000)])])))
        result = summarize(manifest, [dict(samples=samples, snapshots=[snapshot])])
        self.assertFalse(result['comparison']['fullCaptureComparison'])
        self.assertAlmostEqual(result['comparison']['originOffsetMeters'], 80)
        self.assertAlmostEqual(result['comparison']['secondsFromCaptureStart'], 10)
        self.assertIn('末段', markdown([result]))


if __name__ == '__main__':
    unittest.main()
