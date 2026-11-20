"""Coverage-repair provenance controls; analytic data, no game acceptance."""
from pathlib import Path
import hashlib,importlib.util,json,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('raster_rebuild',ROOT/'tools/rebuild-offline-raster-coverage.py');repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)
class RasterReconstruction(unittest.TestCase):
    def fixture(self,folder):
        local=dict(x=1,y=2,layers=[dict(layer=0,triangleRanges=[[0,1]])],conditionalRanges=[],sourcePackages=[['package','mesh','receipt']],meshSHA256='mesh',vertices=3,triangles=1,metadata=dict(world='test',originUE=[0,0,0],cellCm=10,tileCells=256,borderCm=91,extentCm=2560,agent=dict(radiusCm=45),materializerSHA256='current'))
        local['inputSHA256']=repair.canonical_input(local);original=dict(inputSHA256=repair.canonical_input(local,'legacy'),materializerSHA256='legacy')
        payload=b'checked tile';(folder/'tile.bin').write_bytes(payload);(folder/'input.json').write_text(json.dumps(local))
        receipt=dict(inputSHA256=local['inputSHA256'],compilerSHA256='compiler',blobs={'tile':dict(file='tile.bin',sha256=hashlib.sha256(payload).hexdigest())},rasterCoverage=[dict(schema=1,triangles=1000,queries=1,largestOverlap=8,largestCapacity=512)])
        (folder/'receipt.json').write_text(json.dumps(receipt));return local,original,receipt
    def test_canonical_geometry_remains_bound_across_materializer_source_revision(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'build')as temp:
            folder=Path(temp);local,original,receipt=self.fixture(folder)
            self.assertIsNotNone(repair.validated(folder,original,'compiler'))
            local['layers'][0]['triangleRanges'][0][1]=2;local['inputSHA256']=repair.canonical_input(local);receipt['inputSHA256']=local['inputSHA256'];(folder/'input.json').write_text(json.dumps(local));(folder/'receipt.json').write_text(json.dumps(receipt))
            self.assertIsNone(repair.validated(folder,original,'compiler'))
    def test_corrupt_blob_or_saturated_coverage_cannot_be_applied(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'build')as temp:
            folder=Path(temp);local,original,receipt=self.fixture(folder)
            receipt['rasterCoverage'][0]['largestOverlap']=512;(folder/'receipt.json').write_text(json.dumps(receipt));self.assertIsNone(repair.validated(folder,original,'compiler'))
            receipt['rasterCoverage'][0].update(largestOverlap=8,queries=2);(folder/'receipt.json').write_text(json.dumps(receipt));self.assertIsNotNone(repair.validated(folder,original,'compiler'))
            (folder/'tile.bin').write_bytes(b'changed');self.assertIsNone(repair.validated(folder,original,'compiler'))
if __name__=='__main__':unittest.main()
