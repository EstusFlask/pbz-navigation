"""Read-only PBZS v3 navigation state. No save-writing API exists here.

Format reference: PBZ-Editor 5fdb13483cefde94e6a2f3dba3d258c84e747582.
Only authenticated state is exposed; key material remains in process memory.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys
import zlib
from pbz_dynamic_mesh import oodle_decoder

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'build/tools/crypto'))
from Crypto.Cipher import AES


def main_save():
    root=Path('D:/software/Steam/steamapps/common/PBZ/ProjectPBZ/Saved/SaveGames')
    candidates=[p for p in root.rglob('PBZSaveGame.sav') if not any(v in ('1RealTime','2Hourly','3Daily') for v in p.parts)]
    if len(candidates)!=1:raise ValueError('A unique physical main save could not be selected')
    return candidates[0]


def unseal(data,key):
    if len(data)<36 or data[:8]!=b'PBZS\x01\x01\0\0':raise ValueError('Invalid sealed save block')
    cipher=AES.new(key,AES.MODE_GCM,nonce=data[8:20])
    return cipher.decrypt_and_verify(data[36:],data[20:36])


class Save:
    def __init__(self,file=None,binary=None):
        file=Path(file) if file else main_save()
        before=file.stat();self.data=file.read_bytes();after=file.stat()
        if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns):raise ValueError('Save changed while creating read-only snapshot')
        self.sha256=hashlib.sha256(self.data).hexdigest()
        if len(self.data)<48 or self.data[:4]!=b'PBZS':raise ValueError('Invalid save container')
        version,flags,count,directory_size=struct.unpack_from('<BBHI',self.data,4)
        if version!=3 or flags!=1 or not 0<count<=256 or not 36<=directory_size<=1000000:raise ValueError('Unsupported save container layout')
        self.payload_base=12+directory_size
        if self.payload_base>len(self.data):raise ValueError('Truncated save directory')
        pe=Path(binary or 'D:/software/Steam/steamapps/common/PBZ/platform/steam/PBZ.exe').read_bytes()
        self.binary_sha256=hashlib.sha256(pe).hexdigest()
        anchor=('sealed but block is PLAINTEXT'+'\0').encode('utf-16le')
        start=0;selected=None
        while (at:=pe.find(anchor,start))>=0:
            start=at+len(anchor)
            for padding in range(16):
                material=pe[start+padding:start+padding+64]
                if len(material)!=64:continue
                key=bytes(a^b for a,b in zip(material[:32],material[32:]))
                try:
                    directory=unseal(self.data[12:self.payload_base],key)
                    if directory[:12]==self.data[:12]:selected=(key,directory);break
                except ValueError:pass
            if selected:break
        if selected is None:raise ValueError('No authenticated save key for this game build')
        self._key,directory=selected;self.entries={};cursor=12;expected_offset=0
        for _ in range(count):
            if cursor+2>len(directory):raise ValueError('Truncated slot directory')
            name_size=struct.unpack_from('<H',directory,cursor)[0];cursor+=2
            if not 0<name_size<256 or cursor+name_size+14>len(directory):raise ValueError('Invalid save slot entry')
            name=directory[cursor:cursor+name_size].decode('utf-8');cursor+=name_size
            compression,slot_flags,raw_size,offset,sealed_size=struct.unpack_from('<BBIII',directory,cursor);cursor+=14
            if name in self.entries or compression not in (0,1,2) or slot_flags!=1 or offset!=expected_offset or not 36<=sealed_size<=100000000 or raw_size>100000000:
                raise ValueError('Unsupported or overlapping save slot')
            begin=self.payload_base+offset;end=begin+sealed_size
            if end>len(self.data):raise ValueError('Slot outside save container')
            # Authenticate every slot even though only the active navigation
            # state and last-continue selection will be decompressed/inspected.
            unseal(self.data[begin:end],self._key)
            self.entries[name]=(compression,raw_size,begin,end)
            expected_offset+=sealed_size
        if cursor!=len(directory) or self.payload_base+expected_offset!=len(self.data):raise ValueError('Unconsumed save container bytes')
        self._decode_oodle=oodle_decoder()

    def slot(self,name):
        if name not in self.entries:raise ValueError('Selected save slot is absent')
        compression,size,begin,end=self.entries[name]
        raw=unseal(self.data[begin:end],self._key)
        if compression==1:
            decoder=zlib.decompressobj();plain=decoder.decompress(raw,size+1)+decoder.flush()
            if not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:raise ValueError('Invalid zlib save slot')
            raw=plain
        elif compression==2:raw=self._decode_oodle(raw,size)
        if len(raw)!=size:raise ValueError('Save slot raw length differs')
        return json.loads(raw)

    def navigation_snapshot(self,world):
        advanced=self.slot('__Advanced__');name=advanced.get('LastContinueSlot')
        if not isinstance(name,str) or name not in self.entries:raise ValueError('LastContinueSlot does not identify a valid slot')
        active=self.slot(name);actors=active.get('LevelActorManager')
        if not isinstance(actors,dict):raise ValueError('Active save has no actor state manager')
        prefix=world.casefold()+'-'
        states={}
        for key,value in actors.items():
            if not key.casefold().startswith(prefix) or not isinstance(value,dict):continue
            selected={field:value[field] for field in ('Broken','Open') if isinstance(value.get(field),bool)}
            if selected:states[key]=selected
        return dict(schema=1,scope='Authenticated active-slot navigation state; read-only',
                    saveSHA256=self.sha256,keySourceBinarySHA256=self.binary_sha256,slot=name,
                    authenticatedSlots=len(self.entries),world=world,actors=states)
