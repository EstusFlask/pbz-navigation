from pathlib import Path
import importlib.util,unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('oracle',ROOT/'tools/build-custom-route-action-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)

class ActionSelection(unittest.TestCase):
    def fixture(self):
        source=dict(number=22,world='test',sourceIndexSHA256='a'*64,movementFeatures=[dict(guid='first',path=[[0,0,0],[1,0,0]]),dict(guid='second',path=[[1,0,0],[2,0,0]])])
        selection=dict(schema=1,number=22,world='test',sourceIndexSHA256='a'*64,sourceCaseSHA256='b'*64,guids=['second'],selected=[dict(guid='second',path=[[999,999,999],[1000,1000,1000]])])
        return source,selection
    def test_selection_uses_only_original_source_features(self):
        source,selection=self.fixture();rows=oracle.select_features(source,'b'*64,selection)
        self.assertEqual(rows,[source['movementFeatures'][1]])
        self.assertIs(rows[0],source['movementFeatures'][1])
    def test_stale_unknown_or_duplicate_selection_is_rejected(self):
        source,selection=self.fixture()
        for change in [dict(sourceCaseSHA256='c'*64),dict(world='another'),dict(guids=['missing']),dict(guids=['first','first'])]:
            with self.assertRaises(ValueError):oracle.select_features(source,'b'*64,selection|change)
    def test_ambiguous_source_guid_is_rejected(self):
        source,selection=self.fixture();source['movementFeatures'].append(source['movementFeatures'][0])
        with self.assertRaises(ValueError):oracle.select_features(source,'b'*64,selection)

if __name__=='__main__':unittest.main()
