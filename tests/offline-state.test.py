"""Authenticated read-only save state and per-actor collision isolation."""
from pathlib import Path
import hashlib
import importlib.util
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

    def test_story_barrier_is_a_live_only_box_on_the_reviewed_placement(self):
        source=ROOT/'build/offline-navigation/worlds/pbz_zhengdaodaying_wp/world-root.bin'
        if not source.exists():self.skipTest('Local world root fixture unavailable')
        package=Package(source.read_bytes(),self.classes)
        package.asset_name='/game/maps/b04_05/pbz_zhengdaodaying_wp'
        package.asset_sha256=hashlib.sha256(package.data).hexdigest()
        box=697
        self.assertEqual(package.exports[box]['name'],'Box')
        actor=package.exports[package.exports[box]['outer']]['name']
        self.assertTrue(actor.endswith('_1663502731'))
        world='PBZ_Zhengdaodaying_WP'
        actor_id=world+'-'+actor
        assets=Assets(Reader(),self.classes,ROOT/'build/offline-navigation/assets')
        model=CollisionState(assets,world,'current-save',dict(actors={actor_id:{'Open':True,'Passable':True}}))
        state=model.component(package,box)
        self.assertIsNotNone(state)
        self.assertEqual(state['actorID'],actor_id)
        self.assertEqual(state['field'],'Passable')
        self.assertIsNone(state['savedValue'])
        self.assertFalse(state['omitInScenario'])
        for i,e in enumerate(package.exports):
            if i!=box and e['outer']==package.exports[box]['outer']:
                self.assertIsNone(model.component(package,i))
        other=CollisionState(assets,'PBZ_Pangzhen_WP','intact')
        self.assertIsNone(other.component(package,box))
        package.asset_sha256='0'*64
        self.assertIsNone(CollisionState(assets,world,'intact').component(package,box))

    def test_cooked_story_box_is_emitted_as_conditional_collision(self):
        source=ROOT/'build/offline-navigation/worlds/pbz_zhengdaodaying_wp/world-root.bin'
        if not source.exists():self.skipTest('Local world root fixture unavailable')
        spec=importlib.util.spec_from_file_location('collision_builder',ROOT/'tools/build-offline-collision.py')
        builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
        package='/Game/Maps/B04_05/PBZ_Zhengdaodaying_WP'
        digest=hashlib.sha256(source.read_bytes()).hexdigest()
        inventory={'world':'pbz_zhengdaodaying_wp','case':{'boundsUE':[-40625,115400,-2390,-40565,115550,-1400]},'inventory':{'classes':{}}}
        cell={'file':str(source),'sha256':digest,'package':package,'cell':'persistent-level'}
        assets=Assets(Reader(),self.classes,ROOT/'build/offline-navigation/assets')
        emitted=[]
        class Sink:
            def inspect_package(self,*args):pass
            def emit(self,points,faces,row,negative):
                if row.get('export')==697:emitted.append((points,faces,row))
        builder.reconstruct(inventory,source.parent,assets,CollisionState(assets,package.split('/')[-1],'intact'),
                            builder.profiles(),self.classes,'intact',sink=Sink(),cells=[cell])
        [(points,faces,row)]=emitted
        self.assertEqual((len(points),len(faces)),(8,12))
        self.assertEqual(row['condition']['rule'],'flow-story-box-live-collision')
        self.assertFalse(row['condition']['omitInScenario'])

    def test_native_flow_keeps_its_exact_bridge_deck_conditional(self):
        assets=Assets(Reader(),self.classes,ROOT/'build/offline-navigation/assets')
        world='PBZ_Fujizhilin_WP'
        package=assets.load('/game/maps/b03/pbz_fujizhilin_wp/_generated_/1ojxiq5lyo8myoomljv66iqg0')
        actor=package.exports[32]['name']
        actor_id=world+'-'+actor
        model=CollisionState(assets,world,'current-save',dict(actors={actor_id:{'Open':True,'Passable':True}}))
        condition=model.component(package,57)
        self.assertIsNotNone(condition,'the native bridge deck was still emitted as fixed ground')
        self.assertEqual(condition['actorID'],actor_id)
        self.assertEqual(condition['rule'],'flow-bridge-deck-live-collision')
        self.assertIsNone(condition['savedValue'])
        self.assertFalse(condition['omitInScenario'])
        self.assertIsNone(model.component(package,58),'the visual mesh inherited the deck rule')
        self.assertIsNone(model.component(package,59),'a permanent neighboring collider inherited the deck rule')
        self.assertIsNone(CollisionState(assets,'PBZ_Pangzhen_WP','intact').component(package,57))

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
