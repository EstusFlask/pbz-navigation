"""Cooked hook launch, grab and landing components; live endpoints remain mandatory."""
import math
from pbz_offline_assets import place


def extract(package, name, assets):
    actors = [i for i, e in enumerate(package.exports) if e['name'] == name]
    if len(actors) != 1:
        raise ValueError('Hook actor identity is not unique')
    actor = actors[0]
    actor_class = assets.resolve_global(package, package.exports[actor]['cls'])
    if (not actor_class or actor_class[0].exports[actor_class[1]]['name'] != 'BP_GapBlocker_C'
            or actor_class[0].asset_name.casefold() != '/game/renewalcontent/actors/gameplayblocker/bp_gapblocker'):
        raise ValueError('Unsupported hook actor class')
    proof = []

    def point(name, cls):
        found = [i for i, e in enumerate(package.exports)
                 if e['outer'] == actor and e['name'] == name and e['className'] == cls]
        if len(found) != 1:
            raise ValueError('Missing or ambiguous hook ' + name)
        index = found[0]
        chain = assets.chain(package, index)
        if any(row.get('referencePoseOnly') for row in chain):
            raise ValueError('Hook component has unsupported transform state')
        result = list(place((0, 0, 0), chain))
        if not all(math.isfinite(v) for v in result):
            raise ValueError('Hook component has nonfinite coordinates')
        proof.append(dict(name=name, export=index, world=result))
        return result

    # TriggerSphere is an aiming/detection volume, never a standing entry.
    path = [point('TriggerBox', 'BoxComponent'),
            point('GrabPoint', 'StaticMeshComponent'),
            point('LandArea', 'BoxComponent')]
    origin = point('DefaultSceneRoot', 'SceneComponent')
    launch = proof[0]['export']
    extent = assets.component(package, launch).get('boxExtent')
    if not extent or len(extent) != 3 or not all(math.isfinite(v) and v > 0 for v in extent):
        raise ValueError('Hook launch box extent is unavailable')
    launch_chain = assets.chain(package, launch)
    axes = [[a-b for a, b in zip(place(tuple(v if i == axis else 0 for i, v in enumerate(extent)), launch_chain), path[0])]
            for axis in range(3)]
    volume = dict(center=path[0], axes=axes)
    if math.dist(path[0], path[-1]) < 36:
        raise ValueError('Degenerate hook launch and landing')
    return dict(guid=name, kind='hook', both=False, fold=False,
                classPath='/Game/RenewalContent/Actors/GameplayBlocker/BP_GapBlocker.BP_GapBlocker_C',
                path=path, origin=origin, requiresLoaded=True, requiresLiveEndpoints=True,
                entrySource='TriggerBox', entryVolume=volume, endpointSource='cooked-hook-components',
                source='game-placement', componentEvidence=proof, nativeTriggersCertified=False)
