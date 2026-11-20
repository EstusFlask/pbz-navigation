"""Full sparse pipeline controls; analytic scenes are not game acceptance."""
from pathlib import Path
import importlib.util
import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from pbz_offline_mesh import box,read_mesh
from pbz_offline_components import Cursor
from pbz_zen import Package,native_classes
from pbz_landscape import landscape


def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


world=module('world_builder','tools/build-offline-world.py')
tiles=module('world_tiles','tools/build-offline-world-tiles.py')
portable=module('world_package','tools/package-offline-world.py')


class WorldPipeline(unittest.TestCase):
    def test_secret_passage_flow_barrier_follows_live_only_collision_rule(self):
        from pbz_collision_state import CollisionState
        source = ROOT/'build/offline-navigation/worlds/pbz_zhengdaodaying_wp/world-root.bin'
        if not source.is_file():
            self.skipTest('Cooked secret passage fixture unavailable')
        from pbz_game_packages import Reader
        from pbz_offline_assets import Assets

        data = source.read_bytes()
        package = Package(data, native_classes())
        package.asset_name = '/game/maps/b04_05/pbz_zhengdaodaying_wp'
        package.asset_sha256 = hashlib.sha256(data).hexdigest()
        actor_id = 'PBZ_Zhengdaodaying_WP-'+package.exports[894]['name']
        assets = Assets(Reader(), native_classes(), ROOT/'build/offline-navigation/assets')
        state = CollisionState(assets, 'PBZ_Zhengdaodaying_WP', 'current-save',
                               {'actors': {actor_id: {'Passable': True}}})
        self.assertIsNone(state.component(package,4318))
        barrier = state.component(package,4319)
        self.assertIsNotNone(barrier)
        self.assertEqual(barrier['actorID'], actor_id)
        self.assertFalse(barrier['omitInScenario'])
        self.assertIsNone(barrier['savedValue'])
        trial = CollisionState(assets, 'PBZ_Zhengdaodaying_WP', 'current-save',
                               explicit={'actors': {actor_id: {'Passable': True}}})
        self.assertTrue(trial.component(package,4319)['omitInScenario'])
        package.asset_sha256 = '0'*64
        self.assertIsNone(CollisionState(assets, 'PBZ_Zhengdaodaying_WP', 'base').component(package,4319))

    def test_real_dense_tile_uses_upper_polygon_references_without_codegen(self):
        folder=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp'
        if not (folder/'dense-world-validation.json').exists():self.skipTest('Private dense fixture unavailable')
        result=subprocess.run(['node',str(ROOT/'offline-navigation/validate-world-dense.mjs'),str(folder)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
        report=json.loads((folder/'dense-world-validation.json').read_text())
        self.assertTrue(report['complete']);self.assertGreaterEqual(report['sampledPolygonIndex'],16384)
        self.assertEqual(report['maxPolys'],32768);self.assertEqual(report['maxDifferenceCm'],0)

    def test_real_world_partial_portal_quantization_and_frozen_routes(self):
        folder=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp'
        reference=ROOT/'build/offline-navigation/route-001/saved-navigation-state.json'
        if not (folder/'navigation-index.json').exists() or not reference.exists():self.skipTest('Private world route fixtures unavailable')
        result=subprocess.run(['node',str(ROOT/'offline-navigation/validate-world-region.mjs'),str(folder),str(reference)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
        report=json.loads((folder/'regional-world-validation.json').read_text())
        row=next(r for r in report['rows'] if r['name']=='frozenReferenceAndTwoFogDoors' and r['target']=='nearBell')
        self.assertTrue(row['complete']);self.assertEqual(row['maxDifferenceCm'],0)
        # Corrected rasterization can replace the old quantized seam with a
        # continuous floor. Retain the actual old bytes as a separate, exact
        # regression fixture rather than asserting that every new path takes
        # the same obsolete portal.
        backup=ROOT/'build/offline-navigation/raster-rebuild-1112/backup/pbz_pangzhen_wp/main'
        if (backup/'navigation-index.json').exists():
            result=subprocess.run(['node',str(ROOT/'offline-navigation/validate-world-region.mjs'),str(folder),str(reference),str(backup)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
            legacy=json.loads((backup/'regional-world-validation.json').read_text())
            row=next(r for r in legacy['rows'] if r['name']=='frozenReferenceAndTwoFogDoors' and r['target']=='nearBell')
        self.assertTrue(row['complete']);self.assertEqual(row['quantizedPortalClamps'],1)
        self.assertGreater(row['maxSurfaceClampCm'],4);self.assertLess(row['maxSurfaceClampCm'],5)

    def test_real_landscape_component_relative_transform_is_preserved(self):
        folder=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp'
        if not (folder/'inventory.json').exists():self.skipTest('Private installed-game fixture unavailable')
        inventory=json.loads((folder/'inventory.json').read_text(encoding='utf-8'))
        file=ROOT/'build/offline-navigation/cells'/inventory['containerSHA256'][:16]/'a1ee6ac7489acd6a00000001.bin'
        if not file.exists():self.skipTest('Private landscape fixture unavailable')
        data=landscape(Package(file.read_bytes(),native_classes()),9)
        self.assertEqual(data['properties']['location'],(126.,0.,0.))
        for value in data['properties']['scale']:self.assertAlmostEqual(value,1,places=12)
        self.assertEqual(data['dimensions'],(127,127))
        self.assertEqual(len(data['triangles']),31752)

    def test_reviewed_build_reuse_is_scoped_and_never_accepts_failed_old_packages(self):
        with tempfile.TemporaryDirectory(prefix='world-compat-',dir=ROOT/'build') as temp:
            folder=Path(temp);cells=[]
            for chunk,errors in [('good',[]),('failed',[dict(why='unknown field')])]:
                part=folder/'packages'/chunk;part.mkdir(parents=True)
                world.atomic_json(part/'receipt.json',dict(buildID='old',unresolved=errors))
                cells.append(dict(chunk=chunk,package=chunk))
            world.atomic_json(folder/'compatible-builds.json',dict(targets={'new':dict(sourceBuildIDs=['old'])}))
            inventory=dict(world='control',cells=cells,inventoryFailures=[],persistentLevelCells=[])
            result=world.summarize(folder,inventory,'new')
            self.assertEqual(result['completedPackages'],1);self.assertEqual(result['outdatedReceipts'],1)
            self.assertEqual(world.accepted_builds(folder,'future'),{'future'})

    def test_real_landscape_spline_parents_keep_world_placement(self):
        folder=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp'
        if not (folder/'inventory.json').exists():self.skipTest('Private installed-game fixture unavailable')
        inventory=json.loads((folder/'inventory.json').read_text(encoding='utf-8'))
        file=ROOT/'build/offline-navigation/cells'/inventory['containerSHA256'][:16]/'f798cbcae2e9e3d800000001.bin'
        if not file.exists():self.skipTest('Private landscape-spline fixture unavailable')
        self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(),'11eeed871fcd5824a9ded594cfa198c2f99c9bf995fc4fe2a7be1991431a5096')
        p=Package(file.read_bytes(),native_classes())
        for export,size,points,segments,position in [(69,144,13,12,(-179064.81560272747,-2789.926483575736,807.08912168791)),
                                                   (70,88,6,5,(-179064.815603,-1449.3501902207568,973.5280445671016))]:
            c=Cursor(p.payload(export));props=c.component('LandscapeSplinesComponent',full=True)
            self.assertEqual(len(c.data),size);self.assertEqual(c.at,size-8)
            self.assertEqual(len(props['landscapeSplineControlPoints']),points)
            self.assertEqual(len(props['landscapeSplineSegments']),segments)
            for a,b in zip(props['location'],position):self.assertAlmostEqual(a,b,places=7)

    def test_summary_keeps_an_existing_package_field_on_a_decode_failure(self):
        with tempfile.TemporaryDirectory(prefix='world-summary-',dir=ROOT/'build') as temp:
            folder=Path(temp);part=folder/'packages'/'one';part.mkdir(parents=True)
            world.atomic_json(part/'receipt.json',dict(buildID='control',unresolved=[dict(package='one',why='unsupported parent')]))
            inventory=dict(world='control',cells=[dict(chunk='one',package='one')],inventoryFailures=[],persistentLevelCells=[])
            result=world.summarize(folder,inventory,'control')
            self.assertEqual(result['completedPackages'],1)
            self.assertEqual(result['unresolved'],[dict(package='one',why='unsupported parent')])

    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='world-control-',dir=ROOT/'build')
        cls.folder=Path(cls.temp.name);cells=[]
        geometry=[('floor',[box((-6000,-1800,-100),(6000,1800,0)),
                             box((-6000,4000,-100),(-500,6000,0)),box((500,4000,-100),(6000,6000,0))]),
                  ('wall',[box((-50,-2000,0),(50,2000,350))]),
                  ('distant',[box((-6000,-1800,2999900),(6000,1800,3000000))]),
                  ('long',[box((-60000,20000,-100),(60000,22000,0))]),
                  ('moving',[box((-2000,34000,200),(2000,36000,300))])]
        for chunk,meshes in geometry:
            sink=world.PackageSink(cls.folder/'packages'/chunk)
            for points,faces in meshes:
                source=dict(kind='analytic-control',package=chunk)
                if chunk=='moving':source['navFloorAllowed']=False
                if chunk=='wall':source['condition']=dict(actorID='pbz_test-door',rule='fogdoor-passability',omitInScenario=True)
                sink.emit(points,faces,source)
            r=sink.finish();r.update(buildID='analytic-control',unresolved=[],chunk=chunk,package=chunk)
            world.atomic_json(sink.folder/'receipt.json',r);cells.append(dict(chunk=chunk,package=chunk))
        world.atomic_json(cls.folder/'inventory.json',dict(world='pbz_test',cells=cells,containerSHA256='analytic',rootSHA256='analytic'))
        world.atomic_json(cls.folder/'coverage.json',dict(remainingPackages=0,totalPackages=len(cells),completedPackages=len(cells),buildID='analytic-control'))
        tiles.build_index(cls.folder,10,256)
        tiles.bake(cls.folder,2,None,None,False)

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def test_sparse_index_preserves_exact_geometry_and_negative_coordinates(self):
        m=json.loads((self.folder/'spatial-index.json').read_text())
        self.assertLess(m['candidateTiles'],190)
        db=sqlite3.connect(self.folder/'spatial.sqlite')
        self.assertTrue(db.execute('SELECT count(*) FROM tiles WHERE x<0 AND y<0').fetchone()[0])
        work=self.folder/'exact';work.mkdir(exist_ok=True)
        tiles.materialize(db,self.folder,0,0,m,work);db.close()
        points,faces=read_mesh(work/'input.pbzmesh')
        actual={tuple(points[i] for i in face) for face in faces}
        originals=set()
        for file in (self.folder/'packages').glob('*/collision.pbzmesh'):
            p,t=read_mesh(file);originals.update(tuple(p[i] for i in face) for face in t)
        self.assertTrue(actual);self.assertLessEqual(actual,originals)

    def test_isolated_subgrids_partition_every_source_without_dropping_geometry(self):
        populations=[]
        for mode in ('include','exclude'):
            folder=self.folder/'grids'/mode;policy=dict(sourceRootSHA256='analytic',extractionBuildID='analytic-control',mode=mode,zBandUE=[2999000,3001000])
            tiles.build_index(folder,10,256,source_folder=self.folder,grid_policy=policy)
            metadata=json.loads((folder/'spatial-index.json').read_text());populations.append(metadata['gridPopulation'])
            db=sqlite3.connect(folder/'spatial.sqlite');out=folder/'control';out.mkdir();local=tiles.materialize(db,folder,-1,-1,metadata,out);db.close()
            p,t=read_mesh(out/'input.pbzmesh');self.assertTrue(len(p))
            self.assertEqual(all(v[2]>2999000 for v in p),mode=='include')
        self.assertEqual(populations[0]['selectedTriangles'],12)
        self.assertEqual(populations[0]['selectedTriangles'],populations[1]['delegatedTriangles'])
        self.assertEqual(populations[1]['selectedSources'],populations[0]['delegatedSources'])

    def test_real_js_window_safety_conditions_cancellation_and_wasm_differential(self):
        result=subprocess.run(['node',str(ROOT/'tests/offline-world-runtime.cjs'),str(self.folder)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)

    def test_paged_plain_js_data_and_mod_provider(self):
        output=self.folder/'portable'
        graph=subprocess.run(['node',str(ROOT/'offline-navigation/build-world-corridors.mjs'),str(self.folder)],capture_output=True,text=True)
        self.assertEqual(graph.returncode,0,graph.stdout+'\n'+graph.stderr)
        portable.package(self.folder,output)
        result=subprocess.run(['node',str(ROOT/'tests/offline-world-paged.cjs'),str(output)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
        compressed=self.folder/'compressed';compressed.mkdir()
        compressor=module('compressed_worlds','tools/compress-offline-worlds.py');compressor.convert(output/'pbz_test',compressed/'pbz_test')
        (compressed/'catalog.json').write_bytes((output/'catalog.json').read_bytes())
        result=subprocess.run(['node',str(ROOT/'tests/offline-world-paged.cjs'),str(compressed)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)

    def test_hash_tampering_is_detected_and_failed_builds_are_not_reused(self):
        # A tile's actual bytes are checked before a receipt can be reused.
        index=json.loads((self.folder/'navigation-index.json').read_text())
        blob=next(iter(index['blobs'].values()));file=self.folder/blob['file'];original=file.read_bytes()
        file.write_bytes(original[:-1]+bytes([original[-1]^1]))
        tiles.bake(self.folder,2,None,None,False)
        self.assertEqual(file.read_bytes(),original)


if __name__=='__main__':unittest.main()
