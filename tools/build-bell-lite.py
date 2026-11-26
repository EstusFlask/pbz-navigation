"""Extract bell corridors from existing cooked grids, retaining exact tile variants.

No game installation, saves or player traces are read. All direction/actor truth
remains the responsibility of the normal runtime and physical audit.
"""
from pathlib import Path
from collections import defaultdict
import argparse,copy,hashlib,heapq,json,math,struct,sys
from offline_packed import PackedReader,PackedWriter,write_json,packed_paths

ROOT=Path(__file__).resolve().parents[1]
SCRIPTS='ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/'
CHUNK=196608

def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def module(file):return json.loads(file.read_text(encoding='utf-8').split('exports.data=',1)[1].strip().removesuffix(';'))
def encoded(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).encode('utf-8')
def tilekey(row):return tuple(row[:3])
def distance(a,b):return math.dist(a[3:6],b[3:6])

def shortest_paths(nodes,extra,anchors):
    """Union of directed shortest bell-to-bell paths; no invented reverse edges."""
    selected=set();pairs=[]
    goals={r['goal']['id'] for r in anchors}
    for anchor in anchors:
        start=anchor['start']['id'];selected.update((start,anchor['goal']['id']))
        queue=[(0,start)];scores={start:0};parent={};remaining=set(goals)
        while queue and remaining:
            cost,node=heapq.heappop(queue)
            if cost!=scores[node]:continue
            remaining.discard(node)
            for to,weight in [(to,distance(nodes[node],nodes[to])) for to in nodes[node][6]]+extra.get(node,[]):
                score=cost+max(weight,.001)
                if score<scores.get(to,math.inf):scores[to]=score;parent[to]=node;heapq.heappush(queue,(score,to))
        for target in anchors:
            if target['id']==anchor['id']:continue
            end=target['goal']['id'];reachable=end in scores and end not in remaining
            pairs.append(dict(source=anchor['id'],target=target['id'],reachable=reachable))
            if reachable:
                selected.add(end)
                while end!=start:end=parent[end];selected.add(end)
    return selected,pairs

def movement_edges(folder):
    file=folder/'index.json'
    if not file.exists():return None,[]
    manifest=json.loads(file.read_bytes());reader=PackedReader(folder,manifest);edges=[]
    for page in manifest['pages']:
        raw=reader.span(page['packed']);magic,count=struct.unpack_from('<II',raw);at=8
        if magic!=0x31434d50:raise ValueError('Invalid source movement page')
        for _ in range(count):
            first,size=struct.unpack_from('<II',raw,at);at+=8
            for _ in range(size):
                last,flags,*points=struct.unpack_from('<IB6d',raw,at);at+=53
                edges.append((first,last,flags,points))
        if at!=len(raw):raise ValueError('Source movement extent differs')
    if len(edges)!=manifest['edges']:raise ValueError('Source movement count differs')
    return manifest,edges

def pack_movements(folder,manifest,edges):
    writer=PackedWriter(folder,manifest['world'],manifest['sourceIndexSHA256']);groups=defaultdict(list)
    for first,last,flags,points in edges:groups[first].append(struct.pack('<IB6d',last,flags,*points))
    pages=[];pending=[];size=8
    def flush():
        nonlocal pending,size
        if not pending:return
        raw=struct.pack('<II',0x31434d50,len(pending))+b''.join(struct.pack('<II',first,len(rows))+b''.join(rows) for first,rows in pending)
        pages.append(dict(first=pending[0][0],last=pending[-1][0],edges=sum(len(rows) for _,rows in pending),packed=writer.put(raw)));pending=[];size=8
    for first,rows in sorted(groups.items()):
        if pending and size+8+53*len(rows)>32768:flush()
        pending.append((first,rows));size+=8+53*len(rows)
    flush();result={**manifest,'pages':pages,'edges':len(edges),'storage':writer.finish(),'scope':'Bell corridor subset; live capability and collision checks required'}
    write_json(folder/'index.json',result)

def extract_grid(source,dest,anchors,overlay,outoverlay,world,grid=None,endpoint_ring=1):
    original=json.loads((source/'index.json').read_bytes());reader=PackedReader(source,original)
    nodes=[]
    for i in range(math.ceil(original['corridors']['nodes']/original['corridors']['pageNodes'])):nodes.extend(json.loads(reader.text('corridor',i))['nodes'])
    if len(nodes)!=original['corridors']['nodes']:raise ValueError('Source coarse node extent differs')
    hints=module(overlay/'PBZRouteActionCorridors'/(world+'.js'))
    movement,edges=movement_edges(overlay/'PBZRouteMovementCorridors'/world)
    relevant=hints.get('navigationGrid')==grid
    extra=defaultdict(list)
    if relevant:
        for h in hints['rows']:
            extra[h['from']].append((h['to'],max(h['cost'],distance(nodes[h['from']],nodes[h['to']]))))
            if h.get('both'):extra[h['to']].append((h['from'],max(h['cost'],distance(nodes[h['from']],nodes[h['to']]))))
    if movement and movement.get('navigationGrid')==grid:
        for first,last,_,points in edges:extra[first].append((last,max(math.dist(points[:3],points[3:]),distance(nodes[first],nodes[last]))))
    selected,pairs=shortest_paths(nodes,extra,anchors)
    # Mixed topology can prefer a jump over an existing walking detour. Keep
    # both alternatives so the ordinary walking solver retains its corridor.
    walking,walking_pairs=shortest_paths(nodes,{},anchors);selected.update(walking)
    footprint={tilekey(nodes[i]) for i in selected}
    # Nearby endpoint tiles allow standing-pad projection and local reattachment.
    endpoint_nodes=[nodes[r[k]['id']] for r in anchors for k in ('start','goal')]
    for node in nodes:
        if any(abs(node[0]-end[0])<=endpoint_ring and abs(node[1]-end[1])<=endpoint_ring and abs(node[5]-end[5])<=400 for end in endpoint_nodes):footprint.add(tilekey(node))
    kept={i for i,node in enumerate(nodes) if tilekey(node) in footprint}
    result=copy.deepcopy(original);result.pop('storage',None)
    writer=PackedWriter(dest,world,original['sourceIndexSHA256']);pages=[];tiles=[];blobs={};page_tiles=[]
    for descriptor in original['pages']:
        page=json.loads(reader.text('page',descriptor['id']))
        rows=[t for t in page['tiles'] if (t['x'],t['y'],t['layer']) in footprint]
        if rows:
            tiles.extend(rows);page_tiles.append(rows)
            for tile in rows:
                for identity in tile['variants'].values():
                    if identity:blobs[identity]=page['blobs'][identity]
    # Copy exact bytes of every state variant; only packet layout changes.
    packet=bytearray();packets=[];descriptors={}
    def flush_packet():
        if packet:packets.append(writer.put(bytes(packet)));packet.clear()
    for identity,row in sorted(blobs.items()):
        raw=b''.join(reader.packet(i)[offset:offset+size] for i,offset,size in row['parts'])
        if len(raw)!=row['bytes'] or hashlib.sha256(raw).hexdigest()!=identity:raise ValueError('Tile source SHA differs')
        parts=[];at=0
        while at<len(raw):
            size=min(len(raw)-at,CHUNK-len(packet));parts.append([len(packets),len(packet),size]);packet.extend(raw[at:at+size]);at+=size
            if len(packet)==CHUNK:flush_packet()
        descriptors[identity]={**row,'parts':parts}
    last_size=len(packet) or (CHUNK if packets else 0);flush_packet()
    for rows in page_tiles:
        used={v for t in rows for v in t['variants'].values() if v}
        page=dict(schema=1,world=world,id=len(pages),tiles=rows,blobs={v:descriptors[v] for v in sorted(used)})
        raw=encoded(page);size=original['extentCm']
        pages.append(dict(id=page['id'],characters=len(raw.decode('utf-8')),packed=writer.put(raw),boundsUE=[min(t['x'] for t in rows)*size,-(max(t['y'] for t in rows)+1)*size,(max(t['x'] for t in rows)+1)*size,-min(t['y'] for t in rows)*size],verticalBoundsUE=[min(t['verticalBoundsUE'][0] for t in rows),max(t['verticalBoundsUE'][1] for t in rows)]))
    # Keep original coarse IDs for existing placement/movement identity contracts.
    coarse={**original['corridors'],'packed':[]};edge_count=0
    for at in range(0,len(nodes),coarse['pageNodes']):
        rows=[]
        for i in range(at,min(len(nodes),at+coarse['pageNodes'])):
            row=nodes[i];adj=[n for n in row[6] if n in kept] if i in kept else [];edge_count+=len(adj);rows.append([*row[:6],adj] if i in kept else [0,0,0,0,0,0,[]])
        coarse['packed'].append(writer.put(encoded(dict(schema=1,world=world,first=at,nodes=rows))))
    coarse['directedEdges']=edge_count
    result.update(pages=pages,tiles=len(tiles),blobs=len(blobs),navigationBytes=sum(b['bytes'] for b in blobs.values()),packetCount=len(packets),lastPacketBytes=last_size,corridors=coarse,storage=writer.finish(),scope='bell-corridors',sourceManifestSHA256=sha(source/'index.json'),semanticPolicy='Exact original cooked tile variants on selected bell corridors; all live physical rules retained')
    write_json(dest/'index.json',result)
    if relevant:
        hints={**hints,'rows':[h for h in hints['rows'] if h['from'] in kept and h['to'] in kept]}
        file=outoverlay/'PBZRouteActionCorridors'/(world+'.js');file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(b"'use strict';\nexports.data="+encoded(hints)+b';\n')
    if movement and movement.get('navigationGrid')==grid:pack_movements(outoverlay/'PBZRouteMovementCorridors'/world,movement,[e for e in edges if e[0] in kept and e[1] in kept])
    # Roundtrip every selected blob through the actual packed layout.
    check=PackedReader(dest,result)
    for identity,row in descriptors.items():
        raw=b''.join(check.packet(i)[offset:offset+size] for i,offset,size in row['parts'])
        if hashlib.sha256(raw).hexdigest()!=identity:raise ValueError('Subset tile roundtrip differs')
    return dict(world=world,grid=grid,bells=len(anchors),sourceTiles=original['tiles'],tiles=len(tiles),blobs=len(blobs),pairs=pairs,walkingPairs=sum(p['reachable'] for p in walking_pairs),exactTileSHA256Passed=True,footprint=[list(k) for k in sorted(footprint)])

def build(source,anchors_file,output,overlay):
    if not output.resolve().is_relative_to(ROOT/'build/offline-navigation') or output.exists():raise ValueError('Fresh private output required')
    anchor_data=json.loads(anchors_file.read_bytes())
    if anchor_data['source']!='cooked-navigation-bell-projections':raise ValueError('Cooked endpoint projections required')
    if anchor_data['sourceCatalogSHA256']!=sha(source/'catalog.json'):raise ValueError('Anchor catalog source differs')
    catalog=json.loads((source/'catalog.json').read_bytes());records=[];worlds={};outoverlay=output/'overlays'
    for world,entry in catalog['worlds'].items():
        if anchor_data['sources'][world]!=sha(source/world/'index.json'):raise ValueError('Anchor world source differs')
        anchors=[r for r in anchor_data['records'] if r['world']==world and not r.get('unresolved')]
        if not anchors:continue
        original=json.loads((source/world/'index.json').read_bytes());dest=output/'worlds'/world
        grids=original.get('grids') or [dict(id=None,index='index.json')]
        selected=[]
        for grid in grids:
            local=[r for r in anchors if r['grid']==grid['id']]
            if not local:continue
            record=extract_grid(source/world/Path(grid['index']).parent,dest/Path(grid['index']).parent,local,overlay,outoverlay,world,grid['id']);records.append(record);selected.append(grid)
            print('BELL SUBSET',world,grid['id'],record['tiles'],'/',record['sourceTiles'],'tiles;',sum(p['reachable'] for p in record['pairs']),'directed pairs',flush=True)
        if original.get('kind')=='multi-grid-world':
            # Retain both selectors, with an empty valid subset for an unused grid.
            for grid in grids:
                if grid in selected:continue
                record=extract_grid(source/world/Path(grid['index']).parent,dest/Path(grid['index']).parent,[],overlay,outoverlay,world,grid['id']);records.append(record)
            original={**original,'scope':'bell-corridors','tiles':sum(r['tiles'] for r in records if r['world']==world)};write_json(dest/'index.json',original)
        worlds[world]={**entry,'tiles':sum(r['tiles'] for r in records if r['world']==world)}
    write_json(output/'worlds/catalog.json',dict(schema=1,scope='bell-corridors',worlds=worlds))
    files={f.relative_to(output).as_posix():sha(f) for f in output.rglob('*') if f.is_file()}
    report=dict(schema=1,version=json.loads((ROOT/'release/VERSION-LOCK.json').read_bytes())['currentVersion'],kind='bell-corridor-subset',sourceCatalogSHA256=sha(source/'catalog.json'),anchorsSHA256=sha(anchors_file),records=records,unresolved=[r for r in anchor_data['records'] if r.get('unresolved')],files=files,bytes=sum((output/f).stat().st_size for f in files),physicalVerified=False,completeCollisionClaim=False)
    write_json(output.with_name(output.name+'.receipt.json'),report)
    return report

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,required=True);parser.add_argument('--anchors',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--overlays',type=Path,default=ROOT/'Quest_Navigation'/SCRIPTS);args=parser.parse_args()
    report=build(args.source.resolve(),args.anchors.resolve(),args.output.resolve(),args.overlays.resolve());print('BELL LITE BYTES',report['bytes'],flush=True)
if __name__=='__main__':main()
