"""Compile local Heybox PBZ surfaces into bounded, offline planning candidates."""
from pathlib import Path, PurePosixPath
from collections import Counter, defaultdict
import argparse
import base64
import hashlib
import json
import math
import struct

from pbz_heybox_pack import Pack, codec_key, sha256, ROOT

SOURCES = {
    'pbz-nav-1.4.0.wkpack': 'ccec21b4a8b1b55ab74efb4fa3b0691957458eb18f323425ba2745bd9fa8734a',
    'pbz-model-1.4.0.wkpack': 'ba872263b6ff885254f832d91571f3296ae312d977105600855c42308c7772bb',
}
SUPPORT = {'floor', 'bridge', 'stairs', 'surface', 'terrain', 'roof', 'timber', 'building'}
WORLD = {'prologue': 'pbz_wp_zhulinguwu', 'xigu': 'pbz_xigu_wp', 'fujizhilin': 'pbz_fujizhilin_wp',
         'lujiacun': 'pbz_zhengdaodaying_wp', 'zhengdaodaying': 'pbz_zhengdaodaying_wp',
         'pangzhen': 'pbz_pangzhen_wp', 'meiguhu': 'pbz_pangzhen_wp', 'ximeng': 'pbz_ximeng_wp',
         'jialongshan': 'pbz_dengdingshandao_wp', 'huanshuyiji': 'pbz_huanshuyiji2_wp',
         'duanhunshan': 'pbz_duanhun_wp', 'duanhunya': 'pbz_duanhun_wp'}


def world_for(area):
    prefix, level = area.split(':', 1)
    if area == 'prologue:B01_BE':
        return 'pbz_wp_zhulinguwu_be'
    if prefix == 'pangzhen' and (level == 'B09' or level.startswith('B09_OFFSET_')):
        return 'pbz_houjie_wp'
    return WORLD[prefix]


def mesh(pack, name):
    md = pack.json(name)
    if md.get('schema') != 'pbz.mesh-binary.v2':
        raise ValueError('Unsupported mesh schema: '+name)
    binary = pack.read(str(PurePosixPath(name).parent / md['binary']))
    if len(binary) != md['binaryByteLength'] or hashlib.sha256(binary).hexdigest() != md['binarySha256']:
        raise ValueError('Mesh binary fingerprint mismatch')
    p, ix = md['bufferViews']['positions'], md['bufferViews']['indices']
    types = {'uint8': ('B', 1), 'uint16': ('H', 2), 'uint32': ('I', 4), 'float32': ('f', 4)}

    def column(view, components):
        kind, size = types[view['componentType']]
        count = view['count']*components
        start = view['byteOffset']
        if view['byteLength'] != count*size or start < 0 or start+count*size > len(binary):
            raise ValueError('Invalid mesh view')
        return struct.unpack_from('<'+str(count)+kind, binary, start)

    xyz, indices = column(p, 3), column(ix, 1)
    quant = p.get('quantization')
    if quant:
        maximum = {'unorm8': 255, 'unorm16': 65535}.get(quant['mode'])
        if maximum is None:
            raise ValueError('Unsupported mesh quantization')
        xyz = [quant['min'][i % 3]+v/maximum*(quant['max'][i % 3]-quant['min'][i % 3]) for i, v in enumerate(xyz)]
    vertices = list(zip(xyz[::3], xyz[1::3], xyz[2::3]))
    if len(indices) % 3 or any(i >= len(vertices) for i in indices):
        raise ValueError('Invalid mesh indices')
    return [(vertices[indices[i]], vertices[indices[i+1]], vertices[indices[i+2]]) for i in range(0, len(indices), 3)]


def instances(binary):
    if len(binary) < 12:
        raise ValueError('Truncated instances')
    magic, header_size, count = struct.unpack_from('<4sII', binary)
    if magic not in (b'WKI2', b'WKI3'):
        raise ValueError('Unsupported instance encoding')
    header = json.loads(binary[12:12+header_size])
    if count == 0:
        if len(binary) != 12+header_size:
            raise ValueError('Invalid empty instances')
        return
    stride, rest = divmod(len(binary)-12-header_size, count)
    if rest or stride not in ((100, 132) if magic == b'WKI3' else (228,)):
        raise ValueError('Invalid instance stride')
    for i in range(count):
        offset = 12+header_size+i*stride
        if magic == b'WKI3':
            asset, component, flags = struct.unpack_from('<IHH', binary, offset)
            matrix = struct.unpack_from('<16f', binary, offset+12)
            bounds = struct.unpack_from('<6f', binary, offset+76)
        else:
            asset, component = struct.unpack_from('<II', binary, offset)
            flags = struct.unpack_from('<I', binary, offset+16)[0]
            matrix = struct.unpack_from('<16d', binary, offset+20)
            bounds = struct.unpack_from('<6d', binary, offset+148)
        if component >= len(header['components']) or not all(math.isfinite(v) for v in (*matrix, *bounds)):
            raise ValueError('Invalid instance transform')
        yield asset, matrix, bounds, flags


def transform(p, matrix, offset=(0, 0, 0)):
    # Both mesh buffers and column-major instance matrices use Unreal XYZ/cm.
    # The viewer's Y-up/metres conversion belongs only to its rendering stage.
    return tuple(sum(matrix[i+j*4]*p[j] for j in range(3))+matrix[12+i]+offset[i] for i in range(3))


def base_model(row, binary):
    """The newer base model stores quantized vertices in viewer Y-up metres."""
    count, index_count, bits = row['vertices'], row['indices'], row['indexBits']
    if (type(count) is not int or count < 3 or type(index_count) is not int or
            index_count < 3 or index_count % 3 or bits not in (16, 32) or
            len(binary) != count*6+index_count*(bits//8)):
        raise ValueError('Invalid base-model lengths')
    origin, scale = row['origin'], row['scale']
    if len(origin) != 3 or len(scale) != 3 or not all(math.isfinite(v) for v in (*origin, *scale)):
        raise ValueError('Invalid base-model quantization')
    quantized = struct.unpack_from('<'+str(count*3)+'H', binary)
    vertices = []
    for i in range(count):
        # Match the viewer's Float32 position buffer before reversing its axes.
        xyz = [struct.unpack('<f', struct.pack('<f', origin[k]+quantized[i*3+k]*scale[k]))[0] for k in range(3)]
        vertices.append((xyz[0]*100, xyz[2]*100, xyz[1]*100))
    indices = struct.unpack_from('<'+str(index_count)+('H' if bits == 16 else 'I'), binary, count*6)
    if any(i >= count for i in indices):
        raise ValueError('Invalid base-model indices')
    for group in row.get('groups', []):
        start, length = group['start'], group['count']
        if (type(start) is not int or type(length) is not int or start < 0 or length < 0 or
                start % 3 or length % 3 or start+length > index_count):
            raise ValueError('Invalid base-model group')
        if group['category'] in SUPPORT:
            for i in range(start, start+length, 3):
                yield vertices[indices[i]], vertices[indices[i+1]], vertices[indices[i+2]]


class SurfaceCompiler:
    def __init__(self, spacing=140):
        self.spacing = spacing
        self.points = defaultdict(dict)
        self.counts = defaultdict(Counter)

    def add(self, world, p, source):
        if not all(math.isfinite(v) and abs(v) < 2e8 for v in p):
            raise ValueError('Invalid surface coordinate')
        key = (round(p[0]/70), round(p[1]/70), round(p[2]/35))
        if key not in self.points[world]:
            self.points[world][key] = tuple(round(v*10) for v in p)
            self.counts[world][source+'Points'] += 1

    def triangle(self, world, triangle, source, bounds=None):
        a, b, c = triangle
        if not all(math.isfinite(v) for p in triangle for v in p):
            raise ValueError('Non-finite triangle')
        bx, by, bz = (b[i]-a[i] for i in range(3))
        cx, cy, cz = (c[i]-a[i] for i in range(3))
        det = bx*cy-by*cx
        normal = math.sqrt((by*cz-bz*cy)**2+(bz*cx-bx*cz)**2+det*det)
        self.counts[world][source+'Triangles'] += 1
        if bounds is False or bounds and any(max(p[i] for p in triangle) < bounds[0][i] or
                                            min(p[i] for p in triangle) > bounds[1][i] for i in range(3)):
            self.counts[world]['outsidePlanningBounds'] += 1
            return
        if normal < .01 or abs(det)/normal < .573576:
            self.counts[world]['steepOrDegenerate'] += 1
            return
        lo = [math.ceil(min(p[i] for p in triangle)/self.spacing) for i in range(2)]
        hi = [math.floor(max(p[i] for p in triangle)/self.spacing) for i in range(2)]
        if bounds:
            lo = [max(lo[i], math.ceil(bounds[0][i]/self.spacing)) for i in range(2)]
            hi = [min(hi[i], math.floor(bounds[1][i]/self.spacing)) for i in range(2)]
        # Exclude giant scenery planes from this candidate layer explicitly.
        if (hi[0]-lo[0]+1)*(hi[1]-lo[1]+1) > 32768:
            self.counts[world]['oversizedTriangles'] += 1
            return
        found = False
        for ix in range(lo[0], hi[0]+1):
            x = ix*self.spacing
            for iy in range(lo[1], hi[1]+1):
                y = iy*self.spacing
                u, v = ((x-a[0])*cy-(y-a[1])*cx)/det, (bx*(y-a[1])-by*(x-a[0]))/det
                if u >= -1e-6 and v >= -1e-6 and u+v <= 1.000001:
                    z = a[2]+u*bz+v*cz
                    if not bounds or bounds[0][2] <= z <= bounds[1][2]:
                        self.add(world, (x, y, z), source)
                        found = True
        if not found:
            p = tuple(sum(p[i] for p in triangle)/3 for i in range(3))
            if not bounds or all(bounds[0][i] <= p[i] <= bounds[1][i] for i in range(3)):
                self.add(world, p, source)


def compile_nav(pack, compiler):
    manifest = pack.json('manifest.json')
    if manifest.get('schema') != 'game-3dmap.merged-v1':
        raise ValueError('Unsupported navigation manifest')
    for row in manifest['nav']:
        raw = pack.read(row['url'])
        if len(raw) != row['vertices']*12 or len(raw) % 36:
            raise ValueError('Invalid navigation triangle buffer')
        world = world_for(row['area'])
        for values in struct.iter_unpack('<9f', raw):
            compiler.triangle(world, (values[:3], values[3:6], values[6:]), 'nav')
    return manifest


def compile_models(pack, compiler, navigation):
    coverage, seen, seen_base, cache = [], set(), set(), {}
    areas = {row['id']: row for row in navigation['areas']}

    def planning_bounds(area):
        row = areas.get(area)
        if not row or not row.get('navPolygons') or not row.get('navBounds'):
            return False
        return tuple(tuple(v+(-3200 if side == 'min' else 3200) for v in row['navBounds'][side]) for side in ('min', 'max'))
    for chapter in pack.config['chapterPacks']['chapters']:
        root = 'chapters/'+str(chapter['id'])+'/'
        data = pack.json(root+'stream-index.json')
        if data.get('schema') != 'pbz-model-stream-v1':
            raise ValueError('Unsupported model stream')
        manifest = pack.json(root+'manifest.json')
        base = manifest.get('baseModel') or {}
        if base and base.get('schema') != 'game-3dmap.base-model.v1':
            raise ValueError('Unsupported base-model schema')
        base_chunks = base.get('chunks', [])
        coverage.append(dict(chapter=chapter['id'], label=chapter['label'], assets=len(data['assets']), chunks=len(data['chunks']),
                             baseModelChunks=len(base_chunks), baseModelTriangles=base.get('triangles', 0),
                             available=bool(base_chunks or data['assets'])))
        for row in base_chunks:
            world, binary = world_for(row['area']), pack.read(root+row['url'])
            identity = (world, hashlib.sha256(binary).digest(), tuple(row['origin']), tuple(row['scale']))
            if identity in seen_base:
                continue
            seen_base.add(identity)
            bounds = planning_bounds(row['area'])
            for triangle in base_model(row, binary):
                compiler.triangle(world, triangle, 'baseModel', bounds)
        for row in data['chunks']:
            if row['category'] not in SUPPORT:
                continue
            if row.get('byteShuffle'):
                raise ValueError('Inspect shuffled instance format before importing')
            world = world_for(row['area'])
            candidate_bounds = planning_bounds(row['area'])
            for asset_index, matrix, bounds, flags in instances(pack.read(root+row['url'])):
                if flags & 2:  # Hidden components are not route candidates.
                    continue
                asset = data['assets'][row.get('assetOffset', 0)+asset_index]
                identity = (world, asset['assetId'], matrix, tuple(row.get('levelOffset', (0, 0, 0))))
                if identity in seen or asset.get('excluded'):
                    continue
                seen.add(identity)
                # Keep only bounded structural instances, not giant background planes.
                if max(bounds[i+3]-bounds[i] for i in range(3)) > 6400:
                    compiler.counts[world]['oversizedInstances'] += 1
                    continue
                name = root+asset['metadata']
                if name not in cache:
                    cache[name] = mesh(pack, name)
                for triangle in cache[name]:
                    compiler.triangle(world, tuple(transform(p, matrix, row.get('levelOffset', (0, 0, 0))) for p in triangle),
                                      'model', candidate_bounds)
        print('Read model chapter', chapter['id'], len(data['assets']), 'instanced meshes,', len(base_chunks), 'base-model chunks', flush=True)
    return coverage


def write(compiler, output, sources, coverage):
    output.mkdir(parents=True, exist_ok=True)
    modules, worlds = [], {}

    def module(name, value):
        file = output/(name+'.js')
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("'use strict';exports.data="+json.dumps(value, separators=(',', ':'), ensure_ascii=True)+';\n', encoding='utf8')
        modules.append(name+'.js')

    for world, points in sorted(compiler.points.items()):
        tiles = defaultdict(list)
        for p in sorted(points.values()):
            tiles[(p[0]//32000, p[1]//32000)].append(p)
        index = {}
        for (x, y), values in sorted(tiles.items()):
            rows = []
            slabs = defaultdict(list)
            for p in values:
                slabs[p[2]//32000].append(p)
            for z, slab in sorted(slabs.items()):
                for i in range(0, len(slab), 4096):
                    page = slab[i:i+4096]
                    name = f'{world}/{x}_{y}_{z}_{i//4096}'
                    binary = b''.join(struct.pack('<3i', *p) for p in page)
                    digest = hashlib.sha256(binary).hexdigest()
                    module(name, dict(p=base64.b64encode(binary).decode('ascii')))
                    rows.append(dict(name=name, lo=min(p[2] for p in page)/10, hi=max(p[2] for p in page)/10,
                                     n=len(page), sha256=digest))
            index[f'{x},{y}'] = rows
        module(world+'/index', dict(schema=1, world=world, tileSize=3200, zBandCm=3200, scale=10, points=len(points), tiles=index))
        worlds[world] = dict(points=len(points), tiles=len(tiles), **compiler.counts[world])
        print('Compiled', world, len(points), 'candidates in', len(tiles), 'tiles', flush=True)
    module('index', dict(schema=1, worlds=list(worlds), sourceVersions=['Heybox PBZ 1.4.0'],
                         role='surface candidates; every connection requires current game floor/body/lock checks'))
    old_file = output/'manifest.json'
    if old_file.exists():
        for name in set(json.loads(old_file.read_bytes())['modules'])-set(modules):
            stale = (output/name).resolve()
            if stale.is_relative_to(output.resolve()) and stale.suffix == '.js':
                stale.unlink(missing_ok=True)
    report = dict(schema=1, sources=sources, spacingCm=compiler.spacing, dedupCm=[70, 70, 35],
                  role='planning candidates only; no edges or collision certificates imported',
                  modelPlanningBounds='declared navigation bounds + 32m; model-only backdrop areas excluded',
                  modelSupportCategories=sorted(SUPPORT), modelCoverage=coverage, worlds=worlds, modules=modules)
    old_file.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packs', type=Path, required=True)
    parser.add_argument('--codec', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'build/heybox-map')
    parser.add_argument('--audit', type=Path, default=ROOT/'authoring/heybox-map-audit.json')
    args = parser.parse_args()
    key, compiler, sources = codec_key(args.codec), SurfaceCompiler(), []
    for name, expected in SOURCES.items():
        path = args.packs/name
        digest = sha256(path)
        if digest != expected:
            raise ValueError('Source fingerprint mismatch: '+name)
        sources.append(dict(file=name, sha256=digest, bytes=path.stat().st_size))
    with Pack(args.packs/'pbz-nav-1.4.0.wkpack', key) as pack:
        navigation = compile_nav(pack, compiler)
    print('Navigation surfaces read', flush=True)
    with Pack(args.packs/'pbz-model-1.4.0.wkpack', key) as pack:
        coverage = compile_models(pack, compiler, navigation)
    report = write(compiler, args.output, sources, coverage)
    args.audit.parent.mkdir(parents=True, exist_ok=True)
    args.audit.write_text(json.dumps({k: v for k, v in report.items() if k != 'modules'}, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


if __name__ == '__main__':
    main()
