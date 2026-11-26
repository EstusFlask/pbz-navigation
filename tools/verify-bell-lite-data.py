"""Independently check source tile/state preservation and directed bell reachability.

Topology checks and exact cooked bytes do not certify live collision or actions.
"""
from pathlib import Path
from collections import deque,defaultdict
import argparse,hashlib,importlib.util,json,math
from offline_packed import PackedReader
spec=importlib.util.spec_from_file_location('bell_builder',Path(__file__).with_name('build-bell-lite.py'));builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)

def verify(source,subset,anchors_file,output):
    receipt=json.loads(subset.with_name(subset.name+'.receipt.json').read_bytes());anchors=json.loads(anchors_file.read_bytes())['records'];results=[]
    for record in receipt['records']:
        world,grid=record['world'],record['grid'];tail=Path('grids')/grid if grid else Path('.')
        original_folder=source/world/tail;folder=subset/'worlds'/world/tail
        original=json.loads((original_folder/'index.json').read_bytes());manifest=json.loads((folder/'index.json').read_bytes())
        assert original['actors']==manifest['actors'] and manifest['unknownState']=='closed'
        reader=PackedReader(folder,manifest);control=PackedReader(original_folder,original);tiles={};blobs={};kept=set()
        for descriptor in manifest['pages']:
            page=json.loads(reader.text('page',descriptor['id']));blobs.update(page['blobs'])
            for tile in page['tiles']:
                key=(tile['x'],tile['y'],tile['layer']);assert key not in tiles;tiles[key]=tile;kept.update(row[0] for row in tile['coarseSeeds'])
        checked=set()
        for descriptor in original['pages']:
            for tile in json.loads(control.text('page',descriptor['id']))['tiles']:
                key=(tile['x'],tile['y'],tile['layer'])
                if key in tiles:assert tile==tiles[key];checked.add(key)
        assert len(checked)==len(tiles)==manifest['tiles']
        for identity,row in blobs.items():
            raw=b''.join(reader.packet(i)[offset:offset+size] for i,offset,size in row['parts'])
            assert len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==identity
        adjacency={}
        for page in range(math.ceil(manifest['corridors']['nodes']/manifest['corridors']['pageNodes'])):
            current=json.loads(reader.text('corridor',page));previous=json.loads(control.text('corridor',page))
            assert current['first']==previous['first'] and len(current['nodes'])==len(previous['nodes'])
            for offset,(node,old) in enumerate(zip(current['nodes'],previous['nodes'])):
                identity=current['first']+offset
                if identity in kept:
                    assert node[:6]==old[:6] and node[6]==[n for n in old[6] if n in kept];adjacency[identity]=set(node[6])
                else:assert node==[0,0,0,0,0,0,[]]
        hints_file=subset/'overlays/PBZRouteActionCorridors'/(world+'.js')
        if hints_file.exists():
            hints=builder.module(hints_file)
            if hints.get('navigationGrid')==grid:
                for hint in hints['rows']:
                    assert hint['from'] in kept and hint['to'] in kept;adjacency[hint['from']].add(hint['to'])
                    if hint.get('both'):adjacency[hint['to']].add(hint['from'])
        movement,edges=builder.movement_edges(subset/'overlays/PBZRouteMovementCorridors'/world)
        if movement and movement.get('navigationGrid')==grid:
            for first,last,_,_ in edges:assert first in kept and last in kept;adjacency[first].add(last)
        local={row['id']:row for row in anchors if row['world']==world and row.get('grid')==grid and not row.get('unresolved')}
        pairs=defaultdict(list)
        for pair in record['pairs']:pairs[pair['source']].append(pair)
        for source_bell,group in pairs.items():
            found={local[source_bell]['start']['id']};queue=deque(found)
            while queue:
                for neighbor in adjacency.get(queue.popleft(),()):
                    if neighbor not in found:found.add(neighbor);queue.append(neighbor)
            for pair in group:assert (local[pair['target']]['goal']['id'] in found)==pair['reachable'],pair
        results.append(dict(world=world,grid=grid,tiles=len(tiles),blobs=len(blobs),reachablePairs=sum(pair['reachable'] for pair in record['pairs']),allSourceBellTopologyPreserved=True,exactTileVariantsPreserved=True,unknownActorsClosed=True))
        print('BELL DATA VERIFIED',world,grid,len(tiles),flush=True)
    output.write_text(json.dumps(dict(scope='Exact cooked tile/state variants and directed source topology only; no live/game acceptance',records=results,physicalVerified=False),indent=2),encoding='utf-8')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('source','subset','anchors','output'):parser.add_argument(name,type=Path)
    args=parser.parse_args();verify(args.source,args.subset,args.anchors,args.output)
