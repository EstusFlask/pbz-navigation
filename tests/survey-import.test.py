"""Real JS recorder -> files -> Python importer; never touch the game's Saved directory."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SurveyImport(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.saved = Path(self.temporary.name) / 'saved'
        self.output = Path(self.temporary.name) / 'output'
        self.saved.mkdir()
        code = r"""
const fs=require('node:fs'),path=require('node:path');
const {Survey}=require('./Quest_Navigation/ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRouteSurvey');
const root=process.argv[1]+'/',p=x=>({x,y:0,z:0});let now=0,key=null;
const s=new Survey({root,tasks:[{id:'T1',revision:1,world:'w',start:{name:'起点',p:p(0)},end:{name:'终点',p:p(8000)},issue:'测试'}],
clock:()=>now,build:{label:'test-dev'},read:f=>fs.existsSync(f)?fs.readFileSync(f,'utf8'):'',write:(f,t)=>{fs.writeFileSync(f,t);return fs.readFileSync(f,'utf8')===t;},
start:()=>key='survey:T1',capture:()=>({target:{key},trip:{legs:[{world:'w',provider:'native',searchDirection:'forward',points:[p(0),p(8000)]}]}})});
for(now=0;now<=32000;now+=100){const feet=p(Math.max(0,Math.min(8000,(now-900)*.27)));s.sample({feet,world:'w',context:'w/1',physical:{mode:1,movementFloor:feet},targetKey:key,routeVersion:1},true,now);
 if(now===10000)s.event('user marker',{caseId:'wrong-1',markerKind:'player-mistake'},now);
 if(now===12000)s.event('user marker',{caseId:'nav-1',markerKind:'navigation-issue'},now);
 if(now===800||now===32000){s.poll({light:false},true,now-1);s.poll({light:true},true,now);}}
"""
        subprocess.run(['node', '-e', code, str(self.saved)], cwd=ROOT, check=True, capture_output=True)

    def run_import(self):
        raw = subprocess.check_output([sys.executable, str(ROOT/'tools/import-development-cases.py'), '--saved', str(self.saved), '--output', str(self.output)], cwd=ROOT)
        return json.loads(raw), json.loads((self.output/'index.json').read_bytes())

    def test_exact_bytes_complete_walk_and_comparison(self):
        # Engine exports UTF-16 BOM JSON. Import it without normalizing source bytes.
        for source in self.saved.glob('*.json'):
            source.write_bytes(source.read_text(encoding='utf-8').encode('utf-16'))
        hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.saved.glob('*.json')}
        result, index = self.run_import()
        self.assertEqual(result['errors'], [])
        self.assertEqual(result['importedSurveys'], 1)
        survey = index['surveys'][0]
        self.assertEqual(survey['status'], 'completed')
        self.assertTrue(survey['dataComplete'])
        self.assertGreater(survey['samples'], 280)
        self.assertAlmostEqual(survey['comparison']['plannedMeters'], 80)
        self.assertAlmostEqual(survey['comparison']['p95DeviationMeters'], 0)
        self.assertEqual(survey['markerCases'], ['nav-1'])
        self.assertEqual(survey['personalMistakeCases'][0]['case'], 'wrong-1')
        for p in self.output.glob('PBZQuestRoute-survey*.json'):
            if not p.name.endswith('-analysis.json'):
                self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(), hashes[p.name])
        self.assertEqual(hashes, {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.saved.glob('*.json')})
        self.assertIn('起点', (self.output/'SURVEY-REPORT.md').read_text(encoding='utf-8'))

    def test_missing_chunk_is_explicit_incomplete_evidence(self):
        next(self.saved.glob('PBZQuestRoute-surveydata-*.json')).unlink()
        result, index = self.run_import()
        self.assertTrue(result['errors'])
        self.assertFalse(index['surveys'][0]['dataComplete'])

    def test_chunk_reference_cannot_escape_saved_directory(self):
        manifest = next(self.saved.glob('PBZQuestRoute-survey-*.json'))
        data = json.loads(manifest.read_bytes())
        data['chunks'][0]['file'] = '../outside.json'
        manifest.write_text(json.dumps(data), encoding='utf-8')
        result, index = self.run_import()
        self.assertEqual(result['importedSurveys'], 0)
        self.assertIn('invalid chunk reference', result['errors'][0]['error'])


if __name__ == '__main__':
    unittest.main()
