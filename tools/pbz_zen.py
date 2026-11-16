"""Bounded read-only access to this game's modern Zen exports and bulk map.

The layout is pinned to the already indexed game build. Unsupported layouts fail.
No property-value or geometry scanning is used to locate cooked body blobs.
"""
from pathlib import Path
import re
import struct
from pbz_game_packages import names

ROOT = Path(__file__).resolve().parents[1]


def name_batch(data,at):
    count=struct.unpack_from('<I',data,at)[0]
    if count>1000000:raise ValueError('Oversized name batch')
    lengths=[int.from_bytes(data[at+16+count*8+i*2:at+18+count*8+i*2],'big') for i in range(count)]
    cursor=at+16+count*10;output=[]
    for size in lengths:
        wide=bool(size&32768);size=(size&32767)*(2 if wide else 1)
        output.append(data[cursor:cursor+size].decode('utf-16le' if wide else 'utf-8'));cursor+=size
    return output,cursor


class Package:
    def __init__(self, data, classes=None):
        self.data = data
        self.names = names(data)
        self.base = struct.unpack_from('<I', data, 4)[0]
        hashes, imports, exports, end = struct.unpack_from('<4I', data, 24)
        if not 60 <= hashes <= imports <= exports <= end <= self.base <= len(data) or (end-exports) % 72:
            raise ValueError('Unsupported Zen package layout')
        self.imports = [v[0] for v in struct.iter_unpack('<Q', data[imports:exports])]
        self.public_import_hashes=[v[0] for v in struct.iter_unpack('<Q',data[hashes:imports])]
        imported_at=struct.unpack_from('<I',data,48)[0]
        self.imported_names,number_at=name_batch(data,imported_at)
        for i in range(len(self.imported_names)):
            number=struct.unpack_from('<i',data,number_at+i*4)[0]
            if number:self.imported_names[i]+='_'+str(number-1)
        self.exports = []
        for at in range(exports, end, 72):
            offset,size,index,number,outer,cls,superclass,template,public_hash = struct.unpack_from('<QQIIQQQQQ',data,at)
            if offset+size > len(data)-self.base or index & 0x3fffffff >= len(self.names):
                raise ValueError('Zen export exceeds package')
            name = self.names[index & 0x3fffffff] + ('_'+str(number-1) if number else '')
            self.exports.append(dict(name=name, offset=offset, size=size, outer=outer, cls=cls,
                                     className=(classes or {}).get(cls), template=template, publicHash=public_hash,superclass=superclass))
        count = len(self.names)
        sizes = [int.from_bytes(data[76+count*8+i*2:78+count*8+i*2], 'big') for i in range(count)]
        name_end = 76+count*10+sum((v & 32767)*(2 if v & 32768 else 1) for v in sizes)
        padding = struct.unpack_from('<Q',data,name_end)[0]
        if padding > 7:
            raise ValueError('Unsupported bulk map alignment')
        map_at = name_end+8+padding
        map_size = struct.unpack_from('<q',data,map_at)[0]
        map_at += 8
        if map_size < 0 or map_size % 32 or map_at+map_size != hashes:
            raise ValueError('Invalid Zen bulk map extent')
        self.bulk = [dict(zip(('offset','duplicateOffset','size','flags','cookedIndex','padding'),
                             struct.unpack_from('<qqqIB3s',data,at))) for at in range(map_at,map_at+map_size,32)]

    def payload(self, index):
        row = self.exports[index]
        at = self.base+row['offset']
        return self.data[at:at+row['size']]

    def reference(self,value):
        if value==0:return None
        if value>0:
            if value>len(self.exports):raise ValueError('Invalid export reference')
            return dict(export=value-1)
        i=-value-1
        if i>=len(self.imports):raise ValueError('Invalid import reference')
        raw=self.imports[i];kind=raw>>62
        if kind==1:return dict(script=raw)
        if kind!=2:raise ValueError('Unsupported package reference kind')
        package_index=(raw>>32)&0x3fffffff;hash_index=raw&0xffffffff
        if package_index>=len(self.imported_names) or hash_index>=len(self.public_import_hashes):
            raise ValueError('Package import range invalid')
        return dict(package=self.imported_names[package_index],publicHash=self.public_import_hashes[hash_index])

    def body_blob(self, export_index):
        """Validate GUID/cooked/format native tail and indexed inline body blob."""
        payload = self.payload(export_index)
        candidates = []
        for i,row in enumerate(self.bulk):
            offset,size = row['offset'],row['size']
            if not row['flags'] & 0x40 or row['flags'] & 0x100 or size < 28 or offset < 40 or offset+size != len(payload):
                continue
            guid,cooked,has_data,formats,name,number,data_index = struct.unpack_from('<16siiiIIi',payload,offset-40)
            if cooked!=1 or has_data!=1 or formats!=1 or number!=0 or data_index!=i or name>=len(self.names) or self.names[name]!='Chaos':
                continue
            candidates.append((payload[offset:offset+size],dict(bulkIndex=i,bytes=size,nativeTailOffset=offset-40,
                                                               propertyPrefixBytes=offset-40,bodyGuid=guid.hex())))
        if len(candidates)!=1:
            raise ValueError('BodySetup has no single validated inline Chaos format')
        return candidates[0]


def native_classes():
    text = (ROOT/'build/game-script-objects.txt').read_text(encoding='utf-8')
    return {int(v):name for name,v in re.findall(r'^([^\n]+):\n  global_index:\s+Some\((\d+)\)',text,re.M)}
