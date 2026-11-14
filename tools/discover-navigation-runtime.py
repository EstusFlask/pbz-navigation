"""Discover this session's read-only player bindings from current UE4SS metadata.

Requires capstone in the author environment (or --module-dir). Does not install
anything, execute in-game code, or reuse an earlier session's object addresses.
"""
from pathlib import Path
import argparse
import importlib.util
import json
import re
import struct
import sys


def load_observer():
    path = Path(__file__).with_name('observe-navigation-runtime.py')
    spec = importlib.util.spec_from_file_location('pbz_observer', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def addresses(log):
    def last(pattern):
        values = re.findall(pattern, log)
        if not values:
            raise ValueError('Current UE4SS metadata not ready: ' + pattern)
        return int(values[-1], 16)
    return (last(r'GUObjectArray address: (0x[0-9a-fA-F]+)'),
            last(r'Found FName::ToString: (0x[0-9a-fA-F]+)'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--ue4ss-log', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--module-dir', type=Path)
    args = parser.parse_args()
    if args.module_dir:
        sys.path.insert(0, str(args.module_dir.resolve()))
    from capstone import Cs, CS_ARCH_X86, CS_MODE_64
    lib = load_observer()
    memory = lib.Memory(args.pid)
    try:
        objects, stringify = addresses(args.ue4ss_log.read_text('utf-8', errors='replace'))
        decoder = Cs(CS_ARCH_X86, CS_MODE_64)
        decoder.detail = True
        call = next(i for i in decoder.disasm(memory.read(stringify, 100), stringify) if i.mnemonic == 'call')
        resolver = int(call.op_str, 16)
        lea = next(i for i in decoder.disasm(memory.read(resolver, 60), resolver)
                   if i.mnemonic == 'lea' and 'rip' in i.op_str)
        pool = lea.address + lea.size + lea.operands[1].mem.disp
        registry = {'pid': args.pid, 'objects': objects, 'pool': pool,
                    'discoveredAt': lib.utc(), 'targets': []}
        ue = lib.Reflection(memory, registry)
        chunks, count = memory.u64(objects + 0x18), memory.u32(objects + 0x20)
        if not 0 < count < 5_000_000:
            raise ValueError('Current object registry mismatch')
        classes = {}
        for index in range((count + 0xFFFF) // 0x10000):
            raw = memory.read(memory.u64(chunks + index * 8), min(0x10000, count - index * 0x10000) * 24)
            for offset in range(8, len(raw), 24):
                ptr = struct.unpack_from('<Q', raw, offset)[0]
                if not ptr:
                    continue
                try:
                    cls = memory.u64(ptr + 0x10)
                    if cls not in classes:
                        classes[cls] = ue.object_name(cls)
                    name = classes[cls]
                    if 'playercontroller' not in name.lower():
                        continue
                    fields = ue.fields(ptr)
                    if 'Player' not in fields:
                        continue
                    player = ue.pointer(ptr, fields, 'Player')
                    if not player or ue.object_name(ptr).startswith('Default__'):
                        continue
                    pf = ue.fields(player)
                    if ue.pointer(player, pf, 'PlayerController') != ptr:
                        continue
                    pawn = ue.pointer(ptr, fields, 'Pawn')
                    if not pawn:
                        continue
                    registry['targets'].append({'ptr': ptr, 'classPtr': cls,
                                                'class': name, 'name': ue.object_name(ptr)})
                except (OSError, ValueError, KeyError, struct.error):
                    continue
        if len(registry['targets']) != 1:
            raise ValueError('Load a save first; expected one live local player controller')
        # Probe the complete public sampling path before publishing bindings.
        sample = lib.Observer(ue, registry).sample()
        registry['initialSample'] = sample
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(registry, ensure_ascii=False, indent=2), 'utf-8')
        print(json.dumps({'registry': str(args.output), 'pid': args.pid,
                          'world': sample['world'], 'feet': sample['feet'],
                          'movementMode': sample['movementMode']}, ensure_ascii=False))
    finally:
        memory.close()


if __name__ == '__main__':
    main()
