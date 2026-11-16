"""Version-pinned gameplay collision rules, kept separate from fixed geometry."""
from pathlib import Path
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]


class CollisionState:
    def __init__(self,assets,world,scenario,snapshot=None,explicit=None):
        self.assets=assets;self.world=world;self.scenario=scenario;self.snapshot=snapshot
        self.rules=json.loads((ROOT/'authoring/offline-collision-state-rules.json').read_text())['rules']
        self.by_class={rule['classAsset'].casefold():rule for rule in self.rules};self.validated=set()
        self.actor_cache={};self.observations={}
        self.states={key.casefold():value for key,value in (snapshot or {}).get('actors',{}).items()}
        self.explicit={key.casefold():value for key,value in (explicit or {}).get('actors',{}).items()}

    def component(self,package,index):
        row=package.exports[index];owner=row['outer']
        key=(getattr(package,'asset_name',id(package)),owner)
        if key not in self.actor_cache:
            actor=package.exports[owner] if owner<len(package.exports) else None
            result=None
            if actor and actor['cls']>>62==2:
                target=self.assets.resolve_global(package,actor['cls'])
                if target:
                    p,i=target;rule=self.by_class.get(p.asset_name.casefold())
                    if rule:
                        functions=[j for j,e in enumerate(p.exports) if e['className']=='Function' and e['name']==rule['proofFunction']]
                        if len(functions)!=1 or hashlib.sha256(p.payload(functions[0])).hexdigest()!=rule['proofFunctionSHA256']:
                            raise ValueError('Gameplay collision rule proof differs from installed blueprint')
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
        if rule.get('componentClass'):
            if row['className']!=rule['componentClass']:return None
        elif row['name'] not in rule['components']:return None
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
