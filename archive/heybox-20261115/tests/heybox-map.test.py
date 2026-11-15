"""Container integrity, coordinate and candidate compilation regression tests."""
from pathlib import Path
import base64
import gzip
import hashlib
import importlib.util
import json
import struct
import sys
import tempfile
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from pbz_heybox_pack import Pack, SealedReader, _aes
spec = importlib.util.spec_from_file_location('heybox_build', ROOT/'tools/build-heybox-map.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def container():
    members, body = {}, bytearray(b'\0'*40)
    for name, value, mode in [('plain', b'nav', 0), ('gzip', b'floor', 1), ('deflate', b'bridge', 2),
                               ('pack.json', json.dumps(dict(packId='pbz', version='test')).encode(), 0)]:
        data = gzip.compress(value) if mode == 1 else zlib.compress(value) if mode == 2 else value
        members[name] = [len(body), len(data), mode]
        body.extend(data)
    members['shared'] = members['plain'][:]
    index = json.dumps(dict(schemaVersion=1, packId='pbz', version='test', members=members)).encode()
    co, cl, _ = members['pack.json']
    body[:40] = struct.pack('<8s8I', b'HB3DPACK', 1, 0, co, cl, len(body), len(index), len(members), 0)
    body.extend(index)
    return bytes(body)


def sealed(plain):
    master, key, banner, trailer = bytes(range(32)), bytes(reversed(range(32))), b'A'*4096, b'B'*320
    payload, chunks = bytearray(), []
    banner_hash = hashlib.sha256(banner).digest()
    for index, start in enumerate(range(0, len(plain), 128)):
        nonce = index.to_bytes(12, 'little')
        value = plain[start:start+128]
        cipher = _aes(key).encrypt(nonce, value, banner_hash+trailer+('pbz:'+str(index)).encode())
        chunks.append(dict(l=len(value), n=base64.b64encode(nonce).decode(), t=base64.b64encode(cipher[-16:]).decode()))
        payload.extend(cipher[:-16]+trailer)
    wrapped_nonce = b'W'*12
    wrapped = _aes(master).encrypt(wrapped_nonce, key, None)
    header = dict(schema='game-3dmap.sealed.v2', packId='pbz', alg='aes-256-gcm', compression='none',
                  plainBytes=len(plain), chunkSize=128, payloadStart=69640, bannerHash=banner_hash.hex(), chunks=chunks,
                  wrappedKey=base64.b64encode(wrapped_nonce+wrapped[-16:]+wrapped[:-16]).decode())
    nonce = b'H'*12
    value = _aes(master).encrypt(nonce, json.dumps(header).encode(), b'WKP2')
    block = nonce+value[-16:]+value[:-16]
    prefix = b'WKP2'+struct.pack('<I', len(block))+block
    return prefix+b'\0'*(69640-4096-len(prefix))+banner+payload, master


class ContainerTests(unittest.TestCase):
    def test_members_compression_and_deduplicated_payloads(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'test.hbpack'
            path.write_bytes(container())
            with Pack(path) as pack:
                self.assertEqual([pack.read(n) for n in ['plain', 'shared', 'gzip', 'deflate']],
                                 [b'nav', b'nav', b'floor', b'bridge'])

    def test_rejects_out_of_container_member(self):
        raw = container().replace(b'"plain": [40, 3, 0]', b'"plain": [39, 3, 0]')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'bad.hbpack'
            path.write_bytes(raw)
            with self.assertRaisesRegex(ValueError, 'member range'):
                Pack(path)

    def test_sealed_random_read_and_authentication(self):
        plain = container()
        raw, master = sealed(plain)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'test.wkpack'
            path.write_bytes(raw)
            reader = SealedReader(path, master)
            try:
                length = min(240, len(plain)-60)
                self.assertEqual(reader.read(60, length), plain[60:60+length])
                self.assertEqual(reader.read(0, len(plain)), plain)
                self.assertLessEqual(len(reader.cache), 2)
                with self.assertRaisesRegex(ValueError, 'out of range'):
                    reader.read(len(plain), 1)
            finally:
                reader.close()
            tampered = bytearray(raw)
            tampered[69640+140] ^= 1  # Authenticated per-chunk trailer.
            path.write_bytes(tampered)
            reader = SealedReader(path, master)
            try:
                from cryptography.exceptions import InvalidTag
                with self.assertRaises(InvalidTag):
                    reader.read(0, 1)
            finally:
                reader.close()
            tampered = bytearray(raw)
            tampered[69640-10] ^= 1
            path.write_bytes(tampered)
            with self.assertRaisesRegex(ValueError, 'banner authentication'):
                SealedReader(path, master)


class GeometryTests(unittest.TestCase):
    def test_world_aliases_and_isolated_worlds(self):
        self.assertEqual(build.world_for('pangzhen:B09_OFFSET_2'), 'pbz_houjie_wp')
        self.assertEqual(build.world_for('meiguhu:MeiGuHu'), 'pbz_pangzhen_wp')
        self.assertEqual(build.world_for('prologue:B01_BE'), 'pbz_wp_zhulinguwu_be')
        self.assertEqual(build.world_for('duanhunya:B08_09_12_13'), 'pbz_duanhun_wp')

    def test_matrix_keeps_unreal_centimetres_and_column_major_translation(self):
        matrix = (0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, -20000, 30000, 40000, 1)
        self.assertEqual(build.transform((5, 10, 15), matrix, (0, 0, 1000000)), (-20030, 30010, 1040060))

    def test_raster_preserves_floors_and_rejects_walls(self):
        compiler = build.SurfaceCompiler()
        compiler.triangle('test', ((0, 0, 0), (420, 0, 42), (0, 420, 0)), 'nav')
        compiler.triangle('test', ((0, 0, 600), (420, 0, 642), (0, 420, 600)), 'nav')
        values = list(compiler.points['test'].values())
        self.assertIn((1400, 1400, 140), values)
        self.assertIn((1400, 1400, 6140), values)
        before = len(values)
        compiler.triangle('test', ((0, 0, 0), (0, 420, 0), (0, 0, 600)), 'model')
        self.assertEqual(len(compiler.points['test']), before)

    def test_model_candidates_stay_inside_the_declared_planning_envelope(self):
        compiler = build.SurfaceCompiler()
        triangle = ((0, 0, 0), (10000, 0, 0), (0, 10000, 0))
        compiler.triangle('test', triangle, 'baseModel', ((0, 0, -100), (280, 280, 100)))
        self.assertTrue(compiler.points['test'])
        self.assertTrue(all(0 <= p[0] <= 2800 and 0 <= p[1] <= 2800 for p in compiler.points['test'].values()))
        compiler.triangle('backdrop', triangle, 'baseModel', False)
        self.assertFalse(compiler.points['backdrop'])

    def test_compact_instance_row_keeps_flags_matrix_and_bounds(self):
        header = json.dumps(dict(components=['actor'])).encode()
        matrix = (1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 100., 200., 300., 1.)
        bounds = (90., 190., 290., 110., 210., 310.)
        raw = struct.pack('<4sII', b'WKI3', len(header), 1)+header+struct.pack('<IHHf16f6f', 2, 0, 3, 0., *matrix, *bounds)
        self.assertEqual(list(build.instances(raw)), [(2, matrix, bounds, 3)])

    def test_base_model_uses_its_own_quantization_axes_and_unaligned_32_bit_indices(self):
        row = dict(vertices=3, indices=3, indexBits=32, origin=[-10, -20, 30], scale=[.1, .2, .3],
                   groups=[dict(category='floor', start=0, count=3)])
        raw = struct.pack('<9H3I', 0, 5, 10, 10, 5, 10, 0, 5, 20, 0, 1, 2)
        self.assertEqual(list(build.base_model(row, raw)),
                         [((-1000., 3300., -1900.), (-900., 3300., -1900.), (-1000., 3600., -1900.))])
        row['groups'][0]['category'] = 'water'
        self.assertEqual(list(build.base_model(row, raw)), [])
        row['groups'][0]['start'] = 1
        with self.assertRaisesRegex(ValueError, 'group'):
            list(build.base_model(row, raw))


if __name__ == '__main__':
    unittest.main()
