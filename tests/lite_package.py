"""Manifest-only bell subset inputs; legacy navigation stays in both editions."""
from pathlib import Path
import hashlib,json
from world_package import PREFIX,world_sources
from release_profiles import SCRIPTS

def package_sources(root,release,edition,override=None):
    if edition=='full':return world_sources(root,release,override)
    stage=(root/release['liteWorldStage']).resolve()
    if not stage.is_relative_to(root/'build/offline-navigation'):raise ValueError('Private Lite staging required')
    receipt=json.loads(stage.with_name(stage.name+'.receipt.json').read_bytes())
    if receipt['kind']!='bell-corridor-subset' or receipt['version']!=release['version']:raise ValueError('Lite receipt version/kind differs')
    catalog=json.loads((stage/'worlds/catalog.json').read_bytes())
    if catalog.get('scope')!='bell-corridors' or len(catalog['worlds'])!=release['liteWorldCount']:raise ValueError('Incomplete bell subset catalog')
    files={PREFIX+'catalog.json':stage/'worlds/catalog.json'}
    def packed(folder,prefix,manifest):
        if manifest['scope']!='bell-corridors' or manifest['unknownState']!='closed':raise ValueError('Invalid bell subset semantics')
        files[prefix+'index.json']=folder/'index.json'
        if manifest['kind']=='multi-grid-world':
            if not 2<=len(manifest['grids'])<=16:raise ValueError('Invalid bell grid count')
            for grid in manifest['grids']:
                if not grid['id'].replace('_','').isalnum() or grid['index']!='grids/'+grid['id']+'/index.json':raise ValueError('Invalid bell grid path')
                child=folder/Path(grid['index']).parent;value=json.loads((child/'index.json').read_bytes())
                if value['world']!=manifest['world'] or value['sourceIndexSHA256']!=grid['sourceIndexSHA256'] or value['kind']=='multi-grid-world':raise ValueError('Invalid bell grid identity')
                packed(child,prefix+str(Path(grid['index']).parent).replace('\\','/')+'/',value)
            return
        storage=manifest['storage']
        if manifest['kind']!='paged-sparse-world' or manifest['blobLayout']!='packets-v1' or storage['kind']!='deflate-text-v1' or storage['blockBytes']!=32768 or storage['indexPageRecords']!=512:raise ValueError('Invalid bell subset storage')
        for name in [*[f'directories/{i}.json' for i in range((storage['records']+511)//512)],*[f'packs/{i}.txt' for i in range(storage['containers'])]]:files[prefix+name]=folder/name
    for world,entry in catalog['worlds'].items():
        if not world.replace('_','').isalnum() or entry['index']!=world+'/index.json':raise ValueError('Invalid bell world path')
        folder=stage/'worlds'/world;manifest=json.loads((folder/'index.json').read_bytes())
        if manifest['world']!=world or manifest['sourceIndexSHA256']!=entry['sourceIndexSHA256']:raise ValueError('Bell world identity differs')
        packed(folder,PREFIX+world+'/',manifest)
        action='PBZRouteActionCorridors/'+world+'.js';action_file=stage/'overlays'/action
        if action_file.exists():
            value=json.loads(action_file.read_text(encoding='utf-8').split('exports.data=',1)[1].strip().removesuffix(';'))
            if value['world']!=world or value['sourceIndexSHA256']!=manifest['sourceIndexSHA256']:raise ValueError('Bell action build differs')
            files[SCRIPTS+action]=action_file
        corridor='PBZRouteMovementCorridors/'+world+'/';corridor_folder=stage/'overlays'/corridor
        if (corridor_folder/'index.json').exists():
            value=json.loads((corridor_folder/'index.json').read_bytes());storage=value['storage']
            if value['world']!=world or value['sourceIndexSHA256']!=manifest['sourceIndexSHA256'] or value['kind']!='paged-geometry-movement-corridors':raise ValueError('Bell movement build differs')
            names=['index.json',*[f'directories/{i}.json' for i in range((storage['records']+511)//512)],*[f'packs/{i}.txt' for i in range(storage['containers'])]]
            for name in names:files[SCRIPTS+corridor+name]=corridor_folder/name
    expected={'worlds/'+name[len(PREFIX):] for name in files if name.startswith(PREFIX)}
    expected.update('overlays/'+name[len(SCRIPTS):] for name in files if not name.startswith(PREFIX))
    if expected!=set(receipt['files']):raise ValueError('Unreferenced/missing subset data')
    hashes={}
    for name,file in files.items():
        if not file.is_file() or not file.resolve().is_relative_to(stage):raise ValueError('Invalid subset source path')
        key=file.relative_to(stage).as_posix();hashes[name]=receipt['files'][key]
        if hashlib.sha256(file.read_bytes()).hexdigest()!=hashes[name]:raise ValueError('Changed bell subset source')
    return files,hashes
