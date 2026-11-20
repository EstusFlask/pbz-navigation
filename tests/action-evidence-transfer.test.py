from pathlib import Path
import hashlib,importlib.util,json,unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('transfer',ROOT/'tools/transfer-action-evidence.py');transfer=importlib.util.module_from_spec(spec);spec.loader.exec_module(transfer)

class EvidenceTransfer(unittest.TestCase):
    def fixture(self):
        source=dict(number=1,world='test',sourceIndexSHA256='a'*64,policy={'height':1000},movementFeatures=[dict(guid='same',kind='fall',both=False,path=[[0,0,500],[100,0,0]],standingEntry={'x':0,'y':0,'z':500})]);raw=json.dumps(source).encode();identity=dict(oracleToolSHA256='b'*64,checkerDependenciesSHA256={'body':'c'*64},geometryIndexSHA256='d'*64)
        proof=dict(schema=1,number=1,sourceCaseSHA256=hashlib.sha256(raw).hexdigest(),policy=source['policy'],rows=[dict(guid='same',kind='fall',nativeActionUncertified=False,validation={'points':[[0,0,500],[100,0,0]]})],**identity)
        return source,raw,proof,identity
    def test_identical_feature_inputs_transfer_but_new_features_stay_unchecked(self):
        source,raw,proof,identity=self.fixture();target={**source,'number':2,'movementFeatures':[*source['movementFeatures'],dict(guid='new',kind='fall',path=[[10,0,500],[110,0,0]])]};target_raw=json.dumps(target).encode()
        result=transfer.transfer_records(raw,proof,target_raw,identity)
        self.assertEqual(result['rows'],proof['rows']);self.assertEqual(result['number'],2);self.assertEqual(result['sourceCaseSHA256'],hashlib.sha256(target_raw).hexdigest())
        changed={**source,'movementFeatures':[{**source['movementFeatures'][0],'standingEntry':{'x':1,'y':0,'z':500}}]}
        self.assertEqual(transfer.transfer_records(raw,proof,json.dumps(changed).encode(),identity)['rows'],[])
    def test_stale_geometry_policy_checker_and_source_are_rejected(self):
        source,raw,proof,identity=self.fixture()
        for changed in [{**identity,'geometryIndexSHA256':'e'*64},{**identity,'checkerDependenciesSHA256':{'body':'f'*64}}]:
            with self.assertRaises(ValueError):transfer.transfer_records(raw,proof,raw,changed)
        with self.assertRaises(ValueError):transfer.transfer_records(raw,{**proof,'sourceCaseSHA256':'f'*64},raw,identity)
        with self.assertRaises(ValueError):transfer.transfer_records(raw,proof,json.dumps({**source,'policy':{'height':2000}}).encode(),identity)
    def test_ambiguous_source_or_target_identity_is_rejected(self):
        source,raw,proof,identity=self.fixture();source['movementFeatures']*=2
        with self.assertRaises(ValueError):transfer.transfer_records(raw,proof,json.dumps(source).encode(),identity)
    def test_explicit_failure_schema_and_directional_reasons_survive_identity_transfer(self):
        source,raw,proof,identity=self.fixture();failure=dict(ok=False,unknown=False,obstructed=True,reason='standing-capsule-blocked',why='standing capsule obstructed',p=[0,0,500])
        proof['failureSchema']=1;proof['rows'][0].update(validation=None,failure=failure)
        copied=transfer.transfer_records(raw,proof,raw,identity)
        self.assertEqual(copied.get('failureSchema'),1);self.assertEqual(copied['rows'],proof['rows'])
        for schema in [None,2]:
            changed={**proof,'failureSchema':schema}
            with self.assertRaises(ValueError):transfer.transfer_records(raw,changed,raw,identity)

if __name__=='__main__':unittest.main()
