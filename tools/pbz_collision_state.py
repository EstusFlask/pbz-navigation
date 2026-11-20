"""Version-pinned gameplay collision rules, kept separate from fixed geometry."""
from pathlib import Path
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]


class CollisionState:
    def __init__(self,assets,world,scenario,snapshot=None,explicit=None):
        self.assets=assets;self.world=world;self.scenario=scenario;self.snapshot=snapshot
        self.rules=json.loads((ROOT/'authoring/offline-collision-state-rules.json').read_text())['rules']
        self.by_class={rule['classAsset'].casefold():rule for rule in self.rules if not rule.get('nativeActorClass')}
        self.by_native={
            (rule['placement']['world'].casefold(), rule['placement']['packageSHA256'],
             rule['placement']['actor'], rule['nativeActorClass']): rule
            for rule in self.rules if rule.get('nativeActorClass')
        }
        self.validated=set()
        self.actor_cache={};self.observations={}
        self.states={key.casefold():value for key,value in (snapshot or {}).get('actors',{}).items()}
        self.explicit={key.casefold():value for key,value in (explicit or {}).get('actors',{}).items()}

    def component(self,package,index):
        row=package.exports[index];owner=row['outer']
        def selected(rule):
            return (not rule.get('componentClass') or row['className']==rule['componentClass']) and (not rule.get('components') or row['name'] in rule['components'])
        def applies_to_package(rule):
            placement=rule.get('placement')
            return not placement or (self.world.casefold()==placement['world'].casefold()
                                     and getattr(package,'asset_sha256',None)==placement['packageSHA256'])
        if not any(selected(rule) and applies_to_package(rule) for rule in self.rules):return None
        key=(getattr(package,'asset_name',id(package)),owner)
        if key not in self.actor_cache:
            actor=package.exports[owner] if owner<len(package.exports) else None
            result=None
            rule=None
            actor_class=None
            if actor and actor['cls']>>62==2:
                target=self.assets.resolve_global(package,actor['cls'])
                if target:
                    actor_class=target[0]
                    rule=self.by_class.get(actor_class.asset_name.casefold())
            elif actor and actor['cls']>>62==1:
                rule=self.by_native.get((self.world.casefold(),getattr(package,'asset_sha256',None),
                                         actor['name'],actor['className']))
            placement=rule.get('placement') if rule else None
            if rule and (not placement or applies_to_package(rule) and actor['name']==placement['actor']):
                proof=self.assets.load(rule['proofClassAsset']) if rule.get('proofClassAsset') else actor_class
                functions=[j for j,e in enumerate(proof.exports) if e['className']=='Function' and e['name']==rule['proofFunction']]
                if len(functions)!=1 or hashlib.sha256(proof.payload(functions[0])).hexdigest()!=rule['proofFunctionSHA256']:
                    raise ValueError('Gameplay collision rule proof differs from installed blueprint')
                if placement and placement.get('actorClassSHA256') and placement['actorClassSHA256']!=actor_class.asset_sha256:
                    raise ValueError('Collision placement class differs from reviewed blueprint')
                if placement and self.assets.load(placement['flowAsset']).asset_sha256!=placement['flowSHA256']:
                    raise ValueError('Collision flow binding differs from reviewed placement')
                if rule['id'] not in self.validated and rule.get('loadBindingFunctions'):
                    parent=self.assets.load(rule['loadBindingClassAsset'])
                    for name,expected in rule['loadBindingFunctions'].items():
                        matches=[j for j,e in enumerate(parent.exports) if e['className']=='Function' and e['name']==name]
                        if len(matches)!=1 or hashlib.sha256(parent.payload(matches[0])).hexdigest()!=expected:
                            raise ValueError('Save restoration binding differs from validated blueprint')
                self.validated.add(rule['id'])
                result=(actor,rule)
            self.actor_cache[key]=result
        result=self.actor_cache[key]
        if not result:return None
        actor,rule=result
        if not selected(rule):return None
        actor_id=self.world+'-'+actor['name'];saved=self.states.get(actor_id.casefold(),{})
        explicit=self.explicit.get(actor_id.casefold(),{}).get('Passable')
        value=explicit if isinstance(explicit,bool) else saved.get(rule['savedField']) if rule.get('savedField') else None
        remove=self.scenario=='base' or self.scenario=='current-save' and value is rule['omitWhen']
        condition=dict(actorID=actor_id,rule=rule['id'],field=rule['savedField'] or 'Passable',
                       savedValue=value if isinstance(value,bool) else None,omitInScenario=remove,
                       stateSource='explicit-test-condition' if isinstance(explicit,bool) else 'authenticated-save' if isinstance(value,bool) else 'unknown',
                       unknownPolicy='retain intact collision')
        self.observations[actor_id]=condition
        return condition
