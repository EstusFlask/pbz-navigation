"""Package verified world tiles as bounded JSON/base64 text, without JS modules.

Experimental staging only: collision semantics and game acceptance stay separate.
"""
from pathlib import Path
from collections import defaultdict
import argparse
import base64
import hashlib
import json
import os
import re
import time

ROOT = Path(__file__).resolve().parents[1]
CHUNK_BYTES = 196608


def write_json(file, value):
    text = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    file.parent.mkdir(parents=True, exist_ok=True)
    tmp = file.with_suffix('.tmp')
    tmp.write_text(text, encoding='utf-8')
    os.replace(tmp, file)
    return len(text)


def register_world(output,world,manifest):
    catalogfile=output/'catalog.json';lock=output/'catalog.lock';deadline=time.monotonic()+30
    while True:
        try:fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY);os.close(fd);break
        except FileExistsError:
            if time.monotonic()>deadline:raise ValueError('World catalog is locked by another packager')
            time.sleep(.02)
    try:
        catalog=json.loads(catalogfile.read_text(encoding='utf-8'))if catalogfile.exists()else dict(schema=1,worlds={})
        catalog['worlds'][world]=dict(index=world+'/index.json',experimentalOnly=True,tiles=manifest['tiles'],sourceIndexSHA256=manifest['sourceIndexSHA256'])
        write_json(catalogfile,catalog)
    finally:lock.unlink()


def package_set(folder,output,index,raw):
    if index['remainingTiles']or index['failures']:raise ValueError('Incomplete grid set')
    world=index['world'];dest=output/world;dest.mkdir(parents=True,exist_ok=True);grids=[];actors={}
    for grid in index['grids']:
        name=grid['id']
        if not name.replace('_','').isalnum()or grid['folder']!='grids/'+name:raise ValueError('Invalid subgrid source path')
        child=package(folder/grid['folder'],output,dest/'grids'/name,False)
        actors.update({a['id']:a for a in child['actors']})
        if child['sourceIndexSHA256']!=grid['sourceIndexSHA256']:raise ValueError('Subgrid changed while packaging')
        grids.append(dict(id=name,index='grids/'+name+'/index.json',sourceIndexSHA256=child['sourceIndexSHA256'],selector=grid['selector']))
    manifest=dict(schema=1,world=world,kind='multi-grid-world',unknownState='closed',engine=index['engine'],sourceIndexSHA256=hashlib.sha256(raw).hexdigest(),
                  grids=grids,actors=list(actors.values()),tiles=index['compiledLayers'],experimentalOnly=True,completeCollisionClaim=False,physicalVerified=False)
    write_json(dest/'index.json',manifest);register_world(output,world,manifest)
    print('PAGED GRID SET',world,len(grids),'isolated grids',flush=True);return manifest


def bind_movement_states(manifest, bindings):
    if bindings.get('schema')!=1 or bindings.get('sourceIndexSHA256')!=manifest['sourceIndexSHA256']:
        raise ValueError('Movement state bindings belong to another navigation build')
    actors={entry['id']:entry for entry in manifest['actors']}
    for actor_id, movements in bindings['actors'].items():
        if actor_id not in actors or not isinstance(movements,list) or not 1<=len(movements)<=128:
            raise ValueError('Invalid movement state binding')
        if any(not isinstance(value,str) or not re.fullmatch(r'recast-movement:-?\d+,-?\d+,-?\d+>-?\d+,-?\d+,-?\d+',value)
               or len(value)>110 for value in movements):
            raise ValueError('Invalid conditioned movement ID')
        actors[actor_id]['movementRequiresPassable']=sorted(set(movements))
    return manifest


def package(folder, output, _dest=None, _catalog=True, movement_states=None):
    raw = (folder/'navigation-index.json').read_bytes()
    index = json.loads(raw)
    if index.get('kind')=='multi-grid-world':
        if movement_states is not None:raise ValueError('Apply movement state bindings to the specific grid')
        return package_set(folder,output,index,raw)
    if index['schema'] != 1 or index['kind'] != 'experimental-sparse-world' or index['unknownState'] != 'closed':
        raise ValueError('Unsupported world index')
    if index['remainingTiles'] or index['failures'] or index['completedPackages'] != index['totalPackages']:
        raise ValueError('Incomplete world cannot be packaged')
    if any(value for key,value in index.get('indexFailures',{}).items() if key!='pending-collision-semantics'):
        raise ValueError('Unresolved collision/index failures cannot be packaged')
    world = index['world']
    if not world.replace('_', '').isalnum() or world.lower() != world:
        raise ValueError('Invalid world identity')
    dest = _dest or output/world
    dest.mkdir(parents=True, exist_ok=True)
    corridor_file=folder/'corridors.json'
    corridors=json.loads(corridor_file.read_text(encoding='utf-8')) if corridor_file.exists() else None
    if corridors and (corridors['sourceIndexSHA256']!=hashlib.sha256(raw).hexdigest() or corridors['world']!=world):
        raise ValueError('Coarse corridor inputs differ')
    ordered=sorted(index['tiles'],key=lambda t:(t['x']//8,t['y']//8,t['x'],t['y'],t['layer']))
    identities=list(dict.fromkeys(blob for tile in ordered for blob in tile['variants'].values() if blob))
    if set(identities)!=set(index['blobs']):raise ValueError('Unreferenced or missing world blob')
    descriptors={};packets=[];buffer=bytearray()
    def flush_packet():
        if not buffer:return
        encoded=base64.b64encode(buffer);file=dest/'packets'/(str(len(packets))+'.txt');file.parent.mkdir(parents=True,exist_ok=True)
        if not file.exists() or file.read_bytes()!=encoded:
            tmp=file.with_suffix('.tmp');tmp.write_bytes(encoded);os.replace(tmp,file)
        packets.append(dict(bytes=len(buffer),sha256=hashlib.sha256(encoded).hexdigest()));buffer.clear()
    for n, identity in enumerate(identities):
        blob=index['blobs'][identity]
        file = (folder/blob['file']).resolve()
        if not file.is_relative_to(folder.resolve()) or len(identity) != 64:
            raise ValueError('Invalid world blob path')
        data = file.read_bytes()
        if len(data) != blob['bytes'] or hashlib.sha256(data).hexdigest() != identity:
            raise ValueError('World blob hash differs: '+identity)
        parts=[];at=0
        while at<len(data):
            size=min(len(data)-at,CHUNK_BYTES-len(buffer));parts.append([len(packets),len(buffer),size]);buffer.extend(data[at:at+size]);at+=size
            if len(buffer)==CHUNK_BYTES:flush_packet()
        descriptors[identity] = dict(bytes=len(data),polygons=blob.get('polygons',16384),parts=parts)
        if (n+1) % 10000 == 0:
            print('PACKAGED', world, n+1, '/', len(index['blobs']), flush=True)
    flush_packet()
    groups = defaultdict(list)
    for tile in index['tiles']:
        if corridors:
            ids=corridors['seeds'].get(f"{tile['x']},{tile['y']},{tile['layer']}",[])
            tile={**tile,'coarseSeeds':[[i,*corridors['nodes'][i][3:6]] for i in ids]}
        groups[(tile['x']//8, tile['y']//8)].append(tile)
    pages = []
    size = index['extentCm']
    for _, tiles in sorted(groups.items()):
        tiles.sort(key=lambda t: (t['x'], t['y'], t['layer']))
        for at in range(0, len(tiles), 128):
            rows = tiles[at:at+128]
            identities = {i for t in rows for i in t['variants'].values() if i}
            page = dict(schema=1, world=world, id=len(pages), tiles=rows, blobs={i: descriptors[i] for i in sorted(identities)})
            characters = write_json(dest/'pages'/(str(len(pages))+'.json'), page)
            if characters > 1048576:
                raise ValueError('Metadata page exceeds budget')
            pages.append(dict(id=page['id'], characters=characters,
                              boundsUE=[min(t['x'] for t in rows)*size, -(max(t['y'] for t in rows)+1)*size,
                                        (max(t['x'] for t in rows)+1)*size, -min(t['y'] for t in rows)*size],
                              verticalBoundsUE=[min(t['verticalBoundsUE'][0] for t in rows), max(t['verticalBoundsUE'][1] for t in rows)]))
    rules = {r['id']: r for r in json.loads((ROOT/'authoring/offline-collision-state-rules.json').read_text())['rules']}
    actors = []
    for actor in index['actors']:
        prefix = world+'-'
        if not actor['id'].lower().startswith(prefix):
            raise ValueError('Actor belongs to another world')
        rule = rules[actor['rule']]
        actors.append({**actor, 'name': actor['id'][len(prefix):],
                       **{k: rule[k] for k in ('componentClass', 'components', 'nativeActorClass', 'actorTag') if k in rule}})
    manifest = {k: index[k] for k in ('schema', 'world', 'engine', 'originUE', 'extentCm', 'navHeaderBase64', 'unknownState')}
    manifest.update(kind='paged-sparse-world',pages=pages,actors=actors,chunkBytes=CHUNK_BYTES,blobLayout='packets-v1',
                    packetCount=len(packets),lastPacketBytes=packets[-1]['bytes'] if packets else 0,
                    tiles=len(index['tiles']), blobs=len(index['blobs']), navigationBytes=sum(b['bytes'] for b in descriptors.values()),
                    sourceIndexSHA256=hashlib.sha256(raw).hexdigest(), experimentalOnly=True,
                    completeCollisionClaim=False, physicalVerified=False,
                    semanticPolicy='All cooked layers retained; live physical auditing required before display')
    if corridors:
        for at in range(0,len(corridors['nodes']),256):
            length=write_json(dest/'corridors'/(str(at//256)+'.json'),dict(schema=1,world=world,first=at,nodes=corridors['nodes'][at:at+256]))
            if length>1048576:raise ValueError('Coarse corridor page exceeds budget')
        manifest['corridors']=dict(nodes=len(corridors['nodes']),pageNodes=256,directedEdges=corridors['directedEdges'])
    # Encoded packet hashes are build evidence; the game only needs count and
    # the final packet length, rather than tens of thousands of hash strings.
    write_json(dest/'packet-hashes.json',dict(schema=1,world=world,sourceIndexSHA256=manifest['sourceIndexSHA256'],packets=packets))
    if movement_states is not None:bind_movement_states(manifest,movement_states)
    write_json(dest/'index.json', manifest)
    if _catalog:register_world(output,world,manifest)
    print('PAGED WORLD', world, len(pages), 'metadata pages;', len(descriptors), 'blobs in',len(packets),'bounded packets', flush=True)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world', type=Path, default=ROOT/'build/offline-navigation/worlds/pbz_pangzhen_wp')
    parser.add_argument('--output', type=Path, default=ROOT/'build/offline-navigation/mod-worlds')
    parser.add_argument('--movement-state-bindings', type=Path)
    args = parser.parse_args()
    if not args.output.resolve().is_relative_to(ROOT/'build'):
        raise ValueError('Experimental world staging must stay under private build/')
    bindings=json.loads(args.movement_state_bindings.read_bytes()) if args.movement_state_bindings else None
    package(args.world.resolve(), args.output.resolve(),movement_states=bindings)


if __name__ == '__main__':
    main()
