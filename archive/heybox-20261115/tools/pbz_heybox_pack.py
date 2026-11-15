"""Read the user's local PBZ WKP2/HB3DPACK assets for offline route authoring.

The installed codec is read as data, never patched or executed. Its supported
build supplies the format's key material; no key or proprietary binary is kept
in this repository or shipped with the mod.
"""
from pathlib import Path, PurePosixPath
import base64
import hashlib
import json
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[1]
CODEC_SHA256 = '83d97bc6c7c662ef199d1b0f76fd558aa083373bc017b41092e8b66d8f0147cf'


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def _aes(key):
    # A build dependency only. Runtime JS uses the compiled positions.
    dependency = ROOT / 'build/tools/heybox-reader'
    if dependency.is_dir():
        sys.path.insert(0, str(dependency))
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:
        raise ValueError('Install cryptography into build/tools/heybox-reader first') from exc
    return AESGCM(key)


def codec_key(path):
    """Read the verified 1.4.2 codec's rotated shares, without running it."""
    path = Path(path)
    if sha256(path) != CODEC_SHA256:
        raise ValueError('Unsupported map-codec build; inspect the new format before importing')
    binary = path.read_bytes()
    pe = struct.unpack_from('<I', binary, 0x3c)[0]
    if binary[pe:pe+4] != b'PE\0\0':
        raise ValueError('Invalid codec PE')
    sections = struct.unpack_from('<H', binary, pe+6)[0]
    optional_size = struct.unpack_from('<H', binary, pe+20)[0]
    image_base = struct.unpack_from('<Q', binary, pe+24+24)[0]
    table = pe+24+optional_size

    def at(rva, size):
        for index in range(sections):
            virtual_size, start, raw_size, raw = struct.unpack_from('<4I', binary, table+index*40+8)
            if start <= rva and rva+size <= start+min(virtual_size, raw_size):
                return binary[raw+rva-start:raw+rva-start+size]
        raise ValueError('Codec key layout changed')

    pointers = struct.unpack('<8Q', at(0x4a440, 64))
    order, shifts = at(0x60100, 8), at(0x60108, 8)
    result = bytearray(32)
    for share in order:
        if share >= 8:
            raise ValueError('Invalid codec share index')
        for index, value in enumerate(at(pointers[share]-image_base, 32)):
            rotate = (shifts[share]+index) % 8
            result[index] ^= ((value >> rotate) | (value << (8-rotate))) & 255
    return bytes(result)


class SealedReader:
    """Authenticated, bounded random reads; retain at most two decoded chunks."""
    def __init__(self, path, key):
        self.path = Path(path)
        self.file = self.path.open('rb')
        self.cache = {}
        try:
            prefix = self.file.read(8)
            if len(prefix) != 8 or prefix[:4] != b'WKP2':
                raise ValueError('Only the inspected WKP2 format is supported')
            size = struct.unpack_from('<I', prefix, 4)[0]
            if not 28 < size <= 4*1024*1024:
                raise ValueError('Invalid sealed header length')
            block = self.file.read(size)
            if len(block) != size:
                raise ValueError('Truncated sealed header')
            self.header = json.loads(_aes(key).decrypt(block[:12], block[28:]+block[12:28], prefix[:4]))
            h = self.header
            if (h.get('schema') != 'game-3dmap.sealed.v2' or h.get('packId') != 'pbz'
                    or h.get('alg') != 'aes-256-gcm' or h.get('compression') != 'none'):
                raise ValueError('Unsupported sealed PBZ schema')
            self.size = h['plainBytes']
            self.chunk_size = h['chunkSize']
            if (not isinstance(self.size, int) or self.size < 40 or
                    not isinstance(self.chunk_size, int) or not 1 <= self.chunk_size <= 8*1024*1024):
                raise ValueError('Invalid sealed lengths')
            self.banner_hash = bytes.fromhex(h['bannerHash'])
            self.file.seek(h['payloadStart']-4096)
            if h['payloadStart']-4096 < size+8 or hashlib.sha256(self.file.read(4096)).digest() != self.banner_hash:
                raise ValueError('Sealed banner authentication failed')
            wrapped = base64.b64decode(h['wrappedKey'], validate=True)
            if len(wrapped) != 60:
                raise ValueError('Invalid wrapped key')
            self.aes = _aes(_aes(key).decrypt(wrapped[:12], wrapped[28:]+wrapped[12:28], None))
            self.offsets, offset, total = [], h['payloadStart'], 0
            if len(h['chunks']) != (self.size+self.chunk_size-1)//self.chunk_size:
                raise ValueError('Invalid sealed chunk count')
            for index, chunk in enumerate(h['chunks']):
                length = chunk['l']
                if length != min(self.chunk_size, self.size-total):
                    raise ValueError('Invalid sealed chunk length')
                self.offsets.append(offset)
                offset += length+320
                total += length
            if offset != self.path.stat().st_size:
                raise ValueError('Sealed payload length mismatch')
        except BaseException:
            self.file.close()
            raise

    def read(self, offset, length):
        if offset < 0 or length < 0 or offset+length > self.size:
            raise ValueError('Sealed read out of range')
        result = []
        while length:
            index, within = divmod(offset, self.chunk_size)
            if index not in self.cache:
                chunk = self.header['chunks'][index]
                self.file.seek(self.offsets[index])
                cipher, trailer = self.file.read(chunk['l']), self.file.read(320)
                aad = self.banner_hash+trailer+('pbz:'+str(index)).encode('ascii')
                data = self.aes.decrypt(base64.b64decode(chunk['n'], validate=True),
                                        cipher+base64.b64decode(chunk['t'], validate=True), aad)
                if len(data) != chunk['l']:
                    raise ValueError('Decoded chunk length mismatch')
                if len(self.cache) >= 2:
                    self.cache.pop(next(iter(self.cache)))
                self.cache[index] = data
            size = min(length, len(self.cache[index])-within)
            result.append(self.cache[index][within:within+size])
            offset, length = offset+size, length-size
        return b''.join(result)

    def close(self):
        self.cache.clear()
        self.file.close()


class FileReader:
    def __init__(self, path):
        self.file = Path(path).open('rb')
        self.size = Path(path).stat().st_size

    def read(self, offset, length):
        if offset < 0 or length < 0 or offset+length > self.size:
            raise ValueError('Container read out of range')
        self.file.seek(offset)
        return self.file.read(length)

    def close(self):
        self.file.close()


class Pack:
    def __init__(self, path, key=None):
        self.path = Path(path)
        with self.path.open('rb') as stream:
            sealed = stream.read(4) == b'WKP2'
        if sealed and key is None:
            raise ValueError('WKP2 requires the locally installed supported codec')
        self.reader = SealedReader(path, key) if sealed else FileReader(path)
        try:
            magic, version, flags, co, cl, io, il, count, reserved = struct.unpack('<8s8I', self.reader.read(0, 40))
            if magic != b'HB3DPACK' or version not in (1, 2) or not 0 < il <= 32*1024*1024:
                raise ValueError('Unsupported HB3DPACK header')
            self.index = json.loads(self.reader.read(io, il))
            self.members = self.index['members']
            if self.index.get('schemaVersion') not in (1, 2) or self.index.get('store') or len(self.members) != count:
                raise ValueError('Unsupported HB3DPACK index')
            if self.members.get('pack.json') != [co, cl, 0]:
                raise ValueError('Config/index mismatch')
            ranges = []
            for name, row in self.members.items():
                parts = PurePosixPath(name).parts
                if not parts or any(p in ('.', '..') for p in parts) or name.startswith('/') or '\\' in name:
                    raise ValueError('Invalid member path')
                if (len(row) != 3 or any(type(v) is not int for v in row) or
                        row[2] not in (0, 1, 2) or row[0] < 40 or row[1] < 0 or row[0]+row[1] > io):
                    raise ValueError('Invalid member range')
                ranges.append((row[0], row[0]+row[1]))
            # The model container deduplicates identical member payloads.
            ranges = sorted(set(ranges))
            if any(b > c for (a, b), (c, d) in zip(ranges, ranges[1:])):
                raise ValueError('Overlapping members')
            self.config = self.json('pack.json')
            if (self.config.get('packId') != 'pbz' or self.index['packId'] != 'pbz'
                    or self.config['version'] != self.index['version']):
                raise ValueError('PBZ pack identity mismatch')
        except BaseException:
            self.close()
            raise

    def read(self, name):
        offset, length, mode = self.members[name]
        data = self.reader.read(offset, length)
        if mode:
            decoder = zlib.decompressobj(31 if mode == 1 else 15)
            data = decoder.decompress(data, 64*1024*1024+1)
            if len(data) > 64*1024*1024 or not decoder.eof or decoder.unused_data:
                raise ValueError('Invalid or oversized compressed member')
        return data

    def json(self, name):
        return json.loads(self.read(name))

    def close(self):
        self.reader.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
