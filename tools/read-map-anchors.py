"""Decode the installed game's baked map anchors for offline route authoring.

Input is a locally extracted Zen GlobalMapAnchorData package. This does not
extract files from, or modify, the game. The decoded game data stays in build/.
The anchors describe a painted-map projection, NOT walkable geometry.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('package', type=Path)
parser.add_argument('--output', type=Path, default=Path('build/gamersky/game-map-anchors.json'))
args = parser.parse_args()
data = args.package.read_bytes()
count = struct.unpack_from('<I', data, 60)[0]
lengths = [int.from_bytes(data[76 + count * 8 + i * 2:78 + count * 8 + i * 2], 'big') for i in range(count)]
position, names = 76 + count * 10, []
for length in lengths:
    wide, length = bool(length & 0x8000), length & 0x7fff
    size = length * (2 if wide else 1)
    names.append(data[position:position + size].decode('utf-16le' if wide else 'utf-8'))
    position += size
position = struct.unpack_from('<I', data, 4)[0]


def read(fmt):
    global position
    values = struct.unpack_from('<' + fmt, data, position)
    position += struct.calcsize('<' + fmt)
    return values[0] if len(values) == 1 else list(values)


def name():
    index, number = read('II')
    assert number == 0 and index < len(names)
    return names[index]


def header():
    global position
    fields, zero_fields, index = [], [], 0
    while True:
        value = read('H')
        index += value & 127
        length = value >> 9
        fields.extend(range(index, index + length))
        if value & 128:
            zero_fields.extend(range(index, index + length))
        index += length
        if value & 256:
            break
    bits = 0
    if zero_fields:
        length = len(zero_fields)
        size = 1 if length <= 8 else 2 if length <= 16 else ((length + 31) // 32) * 4
        bits = int.from_bytes(data[position:position + size], 'little')
        position += size
    omitted = {field for i, field in enumerate(zero_fields) if bits >> i & 1}
    return [field for field in fields if field not in omitted]


assert header() == [0] and read('I') == 0
maps = []
for _ in range(read('I')):
    area = name()
    assert header() == [0, 1]
    world, anchors = name(), []
    for _ in range(read('I')):
        row = dict(layer=0, uv=[0, 0], group=0, xyz=[0, 0, 0])
        for field in header():
            key, fmt = {0: ('layer', 'i'), 1: ('uv', 'ff'), 2: ('group', 'i'), 3: ('xyz', 'ddd')}[field]
            row[key] = read(fmt)
        anchors.append(row)
    maps.append(dict(area=area, world=world.lower(), anchors=anchors))
    print(area, world, len(anchors), 'anchors;', len({(a['layer'], a['group']) for a in anchors}), 'projection groups')
assert data[position:] == bytes(4), ('unconsumed package data', position, len(data))
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(dict(sourceSHA256=hashlib.sha256(data).hexdigest(), maps=maps)), encoding='utf-8')
