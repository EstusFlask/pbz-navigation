"""Manifest-only public world inputs for complete versioned Mod archives."""
from pathlib import Path
import hashlib
import json

PREFIX='ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/PBZRecastWorlds/'

def world_sources(root,release,override=None):
    selected=override or release.get('offlineWorldStage')
    if not selected:return {},{}
    stage=(root/selected).resolve()
    if not stage.is_relative_to(root/'build/offline-navigation'):raise ValueError('World staging must remain in workspace build/')
    receipt_file=stage.with_name(stage.name+'.receipt.json')
    if not receipt_file.exists():receipt_file=stage.with_suffix('.receipt.json')
    receipt=json.loads(receipt_file.read_text(encoding='utf-8'))
    if receipt['version']!=release['version'] or receipt['kind']!='unreleased-world-integration':raise ValueError('Staged version/kind differs')
    files={name:stage/name for name in receipt['files'] if name.startswith(PREFIX)}
    catalog=json.loads((stage/(PREFIX+'catalog.json')).read_text(encoding='utf-8'))
    if catalog['schema']!=1 or len(catalog['worlds'])!=release['offlineWorldCount']:raise ValueError('Incomplete world catalog')
    expected={PREFIX+'catalog.json'}
    def collect(prefix,manifest,world,identity):
        if manifest['world']!=world or manifest['sourceIndexSHA256']!=identity:raise ValueError('World index differs')
        expected.add(prefix+'index.json')
        if manifest.get('kind')=='multi-grid-world':
            if not 2<=len(manifest['grids'])<=16:raise ValueError('Invalid subgrid count')
            for grid in manifest['grids']:
                name=grid['id']
                if not name.replace('_','').isalnum()or grid['index']!='grids/'+name+'/index.json':raise ValueError('Invalid subgrid path')
                childprefix=prefix+'grids/'+name+'/'
                child=json.loads((stage/(childprefix+'index.json')).read_text())
                if child.get('kind')=='multi-grid-world':raise ValueError('Nested grid sets are unsupported')
                collect(childprefix,child,world,grid['sourceIndexSHA256'])
            return
        if manifest['blobLayout']!='packets-v1':raise ValueError('Unsupported world payload layout')
        if manifest.get('storage'):
            storage=manifest['storage']
            if storage['kind']!='deflate-text-v1'or storage['blockBytes']!=32768 or storage['indexPageRecords']!=512:raise ValueError('Unsupported compressed storage')
            expected.update(prefix+'directories/'+str(i)+'.json'for i in range((storage['records']+511)//512))
            expected.update(prefix+'packs/'+str(i)+'.txt'for i in range(storage['containers']))
            return
        expected.update(prefix+'pages/'+str(row['id'])+'.json' for row in manifest['pages'])
        expected.update(prefix+'packets/'+str(i)+'.txt' for i in range(manifest['packetCount']))
        graph=manifest.get('corridors')
        if not graph:raise ValueError('Missing world corridor graph')
        expected.update(prefix+'corridors/'+str(i)+'.json' for i in range((graph['nodes']+graph['pageNodes']-1)//graph['pageNodes']))
    for world,entry in catalog['worlds'].items():
        if not world.replace('_','').isalnum() or entry['index']!=world+'/index.json':raise ValueError('Invalid world path')
        prefix=PREFIX+world+'/'
        manifest=json.loads((stage/(prefix+'index.json')).read_text(encoding='utf-8'))
        collect(prefix,manifest,world,entry['sourceIndexSHA256'])
    if set(files)!=expected:raise ValueError('Missing or unreferenced staged public files')
    identities={name:receipt['files'][name] for name in files}
    for name,file in files.items():
        if not file.is_file() or not file.resolve().is_relative_to(stage):raise ValueError('Invalid staged source')
    return files,identities
