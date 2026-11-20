"""Generated-field provenance controls; selected routes are never edge inputs."""
from pathlib import Path
import hashlib,importlib.util,json,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('movement_merge',ROOT/'tools/merge-geometric-movement-fields.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class MovementMerge(unittest.TestCase):
    def source(self,folder):
        source=folder/'source';source.mkdir();manifest=dict(schema=1,kind='geometry-movement-proposals',world='test',sourceIndexSHA256='a'*64,pages=0,rows=0);(source/'index.js').write_text("'use strict';\nexports.data="+json.dumps(manifest)+';\n');return source
    def test_only_generated_candidate_coordinates_are_imported(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'build')as temp:
            folder=Path(temp);source=self.source(folder);field=folder/'field.json';field.write_text(json.dumps(dict(world='test',sourceIndexSHA256='a'*64,movementFeatures=[dict(source='recast-boundary',path=[[10.1234,20,30],[40,50,60]]),dict(source='game-placement',path=[[900,900,900],[1000,1000,1000]])],result=dict(legs=[dict(points=[[99999,99999,99999]])]),before=dict(samples=[[88888,88888,88888]]))))
            output=folder/'merged';module.merge(source,[field],output);rows=module.parse(output/'0.js',"'use strict';\nexports.rows=");self.assertEqual(rows,[[10.123,20,30,40,50,60]])
    def test_a_field_from_another_world_build_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'build')as temp:
            folder=Path(temp);source=self.source(folder);field=folder/'field.json';field.write_text(json.dumps(dict(world='test',sourceIndexSHA256='b'*64,movementFeatures=[])))
            with self.assertRaisesRegex(ValueError,'another navigation build'):module.merge(source,[field],folder/'merged')
            self.assertFalse((folder/'merged').exists())
    def test_a_bounded_builder_field_merges_without_an_audit_route(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'build')as temp:
            folder=Path(temp);source=self.source(folder);field=folder/'field';field.mkdir()
            manifest=dict(schema=1,kind='geometry-movement-proposals',world='test',sourceIndexSHA256='a'*64,pages=1,rows=2,pageRows=512,rootedAtPlacedComponents=True,inboundRoots=True,region=[0,0,100,100],fieldExtentCm=640)
            (field/'index.js').write_text("'use strict';\nexports.data="+json.dumps(manifest)+';\n')
            (field/'0.js').write_text("'use strict';\nexports.rows=[[10,20,30,40,50,60],[1,2,3,4,5,6]];\n")
            output=folder/'merged';module.merge(source,[field],output)
            rows=module.parse(output/'0.js',"'use strict';\nexports.rows=");self.assertEqual(rows,[[10,20,30,40,50,60],[1,2,3,4,5,6]])
            self.assertFalse(module.parse(output/'index.js',"'use strict';\nexports.data=")['coverage'])
            for rewrite,message in [(dict(rows=3),'row count'),(dict(sourceGridIndexSHA256='b'*64),'another navigation build'),(dict(region=None),'bounded')]:
                (field/'index.js').write_text("'use strict';\nexports.data="+json.dumps(manifest|rewrite)+';\n')
                with self.assertRaisesRegex(ValueError,message):module.merge(source,[field],folder/'rejected')
                self.assertFalse((folder/'rejected').exists())
    def test_collision_filter_only_admits_checked_builder_coordinates(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'build')as temp:
            folder=Path(temp);source=self.source(folder);field=folder/'field';field.mkdir()
            manifest=dict(schema=1,kind='geometry-movement-proposals',world='test',sourceIndexSHA256='a'*64,pages=1,rows=2,pageRows=512,rootedAtPlacedComponents=True,region=[0,0,100,100],fieldExtentCm=640)
            (field/'index.js').write_text("'use strict';\nexports.data="+json.dumps(manifest)+';')
            (field/'0.js').write_text("'use strict';\nexports.rows=[[1,2,500,4,5,0],[8,9,500,11,12,0]];")
            case=folder/'case.json';oracle=folder/'oracle.json'
            case.write_text(json.dumps(dict(world='test',number=24,sourceIndexSHA256='a'*64,policy={'trial':True},movementFeatures=[
                dict(guid='proved',source='recast-boundary',kind='fall',path=[[1,2,500],[4,5,0]]),
                dict(guid='untested',source='recast-boundary',kind='fall',path=[[8,9,500],[11,12,0]])],
                result={'legs':[{'points':[[666,666,666],[777,777,777]]}]})))
            record=dict(schema=1,number=24,sourceCaseSHA256=hashlib.sha256(case.read_bytes()).hexdigest(),policy={'trial':True},rows=[
                dict(guid='proved',kind='fall',nativeActionUncertified=False,validation={'points':[[10,20,500],[40,50,0]]})])
            oracle.write_text(json.dumps(record))
            output=folder/'merged';module.merge(source,[field],output,action_proof=(case,oracle))
            self.assertEqual(module.parse(output/'0.js',module.ROWS_PREFIX),[[1,2,500,4,5,0]])
            case.write_text(case.read_text()+' ')
            with self.assertRaisesRegex(ValueError,'source case changed'):module.merge(source,[field],folder/'stale',action_proof=(case,oracle))

if __name__=='__main__':unittest.main()
