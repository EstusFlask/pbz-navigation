"""Read UHT property descriptions from the installed PE as data, never run it.

Used to recover unversioned property ordering for the indexed game build. This
does not install or distribute any executable and does not access a game process.
"""
from pathlib import Path
import argparse
import hashlib
import json
import struct


class Metadata:
    def __init__(self,file):
        self.data=Path(file).read_bytes()
        b=self.data
        pe=struct.unpack_from('<I',b,0x3c)[0]
        if b[pe:pe+4]!=b'PE\0\0' or struct.unpack_from('<H',b,pe+24)[0]!=0x20b:
            raise ValueError('Expected PE32+ metadata')
        self.base=struct.unpack_from('<Q',b,pe+48)[0]
        count=struct.unpack_from('<H',b,pe+6)[0]
        at=pe+24+struct.unpack_from('<H',b,pe+20)[0]
        self.sections=[]
        for i in range(count):
            size,va,raw_size,raw=struct.unpack_from('<4I',b,at+i*40+8)
            self.sections.append((self.base+va,self.base+va+max(size,raw_size),raw))
        self.cache={}

    def offset(self,address):
        for lo,hi,raw in self.sections:
            if lo<=address<hi:
                return raw+address-lo
        raise ValueError('Address outside PE sections')

    def address(self,offset):
        for lo,hi,raw in self.sections:
            if raw<=offset<raw+hi-lo:
                return lo+offset-raw
        raise ValueError('Offset outside PE sections')

    def string(self,address):
        try:
            at=self.offset(address)
            s=self.data[at:at+180].split(b'\0')[0].decode('ascii')
            return s if s and all(c.isalnum() or c in '_.:' for c in s) else None
        except (ValueError,UnicodeError):
            return None

    def prop(self,address):
        if address in self.cache:
            return self.cache[address]
        result=None
        try:
            at=self.offset(address)
            name,notify,flags,gen=struct.unpack_from('<4Q',self.data,at)
            label=self.string(name)
            if gen>>32==0x45 and label:
                result=dict(name=label,kind=gen&0xffff,flags=flags,
                            offset=struct.unpack_from('<Q',self.data,at+48)[0],
                            extra=struct.unpack_from('<Q',self.data,at+56)[0])
        except (ValueError,struct.error):
            pass
        self.cache[address]=result
        return result

    def tables(self,term):
        output=[]
        string_start=0
        while (at:=self.data.find(term.encode()+b'\0',string_start))>=0:
            string_start=at+len(term)+1
            try: needle=struct.pack('<Q',self.address(at))
            except ValueError: continue
            start=0
            while (hit:=self.data.find(needle,start))>=0:
                start=hit+8
                try: address=self.address(hit)
                except ValueError: continue
                if not self.prop(address):continue
                table_start=0
                while (ref:=self.data.find(struct.pack('<Q',address),table_start))>=0:
                    table_start=ref+8
                    lo,hi=ref,ref+8
                    while lo>=8 and self.prop(struct.unpack_from('<Q',self.data,lo-8)[0]):lo-=8
                    while hi+8<=len(self.data) and self.prop(struct.unpack_from('<Q',self.data,hi)[0]):hi+=8
                    if hi-lo<16 or hi-lo>4096:continue
                    rows=[self.prop(struct.unpack_from('<Q',self.data,p)[0]) for p in range(lo,hi,8)]
                    if rows not in output:output.append(rows)
        return output


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--binary',type=Path,default=Path('D:/software/Steam/steamapps/common/PBZ/platform/steam/PBZ.exe'))
    parser.add_argument('--output',type=Path,default=Path('build/offline-navigation/native-schema-candidates.json'))
    args=parser.parse_args()
    meta=Metadata(args.binary)
    terms=['AggGeom','SphereElems','BoxElems','SphylElems','CollisionTraceFlag','BuildScale3D',
           'bEnableComplexCollision','MeshBodySetup','CollisionSizeQuads','ContentBounds','PerInstanceSMData',
           'bHasPerInstanceHitProxies','CollisionScale','PlaneNormal']
    tables={term:meta.tables(term) for term in terms}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(dict(sourceSHA256=hashlib.sha256(meta.data).hexdigest(),tables=tables),indent=2)+'\n',encoding='utf-8')
    for term,rows in tables.items():
        print(term,[(len(table),[p['name'] for p in table[:7]]) for table in rows])


if __name__=='__main__':
    main()
