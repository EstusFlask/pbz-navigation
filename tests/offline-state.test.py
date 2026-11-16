"""Authenticated read-only save state and per-actor collision isolation."""
from pathlib import Path
import hashlib
import json
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from pbz_save_state import Save,main_save
from pbz_collision_state import CollisionState
from pbz_game_packages import Reader,PAKS
from pbz_zen import Package,native_classes
from pbz_offline_assets import Assets


@unittest.skipUnless((PAKS/'ProjectPBZ-Windows.utoc').exists(),'Local installed game unavailable')
class NavigationState(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.classes=native_classes()
        inventory=ROOT/'build/offline-navigation/route-001/inventory.json'
        if not inventory.exists():raise unittest.SkipTest('Local regional fixture unavailable')
        rows=json.loads(inventory.read_text(encoding='utf-8'))['inventory']['cells']
        row=next(r for r in rows if r['cell']=='F0G8MP0P82N869UDG1BLIEOBE')
        cls.package=Package((ROOT/row['file']).read_bytes(),cls.classes)
        cls.package.asset_name=row['package'].casefold()
        cls.component=11
        cls.actor=cls.package.exports[cls.package.exports[11]['outer']]
        cls.actor_id='PBZ_Pangzhen_WP-'+cls.actor['name']

    def state(self,actors):
        assets=Assets(Reader(),self.classes,ROOT/'build/offline-navigation/assets')
        return CollisionState(assets,'PBZ_Pangzhen_WP','current-save',dict(actors=actors))

    def test_only_the_matching_actor_and_verified_components_are_disabled(self):
        other=self.actor_id+'-different-actor'
        model=self.state({other:{'Broken':True}})
        self.assertFalse(model.component(self.package,self.component)['omitInScenario'])
        model=self.state({self.actor_id:{'Broken':True}})
        self.assertTrue(model.component(self.package,self.component)['omitInScenario'])
        candidates=[i for i,e in enumerate(self.package.exports) if e['outer']==self.package.exports[11]['outer'] and e['name'] not in ('Vine','Plane')]
        self.assertTrue(candidates)
        for i in candidates:self.assertIsNone(model.component(self.package,i))

    def test_intact_or_unknown_state_keeps_the_obstacle(self):
        for value in ({},{self.actor_id:{'Broken':False}},{self.actor_id:{'Broken':1}}):
            self.assertFalse(self.state(value).component(self.package,self.component)['omitInScenario'])

    def test_a_changed_game_function_cannot_reuse_a_stale_rule(self):
        model=self.state({self.actor_id:{'Broken':True}})
        model.by_class[next(iter(model.by_class))]['proofFunctionSHA256']='0'*64
        with self.assertRaisesRegex(ValueError,'proof differs'):
            model.component(self.package,self.component)

    def test_container_authentication_and_active_slot_selection_do_not_write(self):
        path=main_save();before=hashlib.sha256(path.read_bytes()).hexdigest()
        save=Save(path);snapshot=save.navigation_snapshot('PBZ_Pangzhen_WP')
        self.assertGreater(snapshot['authenticatedSlots'],1)
        self.assertEqual(snapshot['slot'],save.slot('__Advanced__')['LastContinueSlot'])
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)

    def test_tampering_in_an_inactive_slot_is_also_rejected(self):
        save=Save();corrupt=bytearray(save.data);corrupt[-1]^=1
        with tempfile.TemporaryDirectory(prefix='pbz-read-only-save-test-')as name:
            file=Path(name)/'corrupt.sav';file.write_bytes(corrupt)
            with self.assertRaises(ValueError):Save(file)


if __name__=='__main__':unittest.main()
