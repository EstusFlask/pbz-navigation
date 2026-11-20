"""Saved LandscapeHeightfield collision, independent from rendered landscape."""
from pbz_chaos import Archive
from pbz_offline_components import Cursor


class LandscapeCursor(Cursor):
    def properties(self):
        fields,zeros=self.header();out={}
        names=['ComponentLayerInfos','SectionBaseX','SectionBaseY','CollisionSizeQuads','CollisionScale',
               'SimpleCollisionSizeQuads','CollisionQuadFlags','HeightfieldGuid','CachedLocalBox','RenderComponentRef','CookedPhysicalMaterials']
        for f in fields:
            if f in zeros:
                if f==126:out['parent']=0
                elif f in (130,131,132):out[{130:'location',131:'rotation',132:'scale'}[f]]=(0.,0.,0.)
                elif f<len(names):out[names[f]]=0
                continue
            if f<11:
                name=names[f]
                if f in (0,10):value=self.array('i')
                elif f in (1,2,3,5,9):value=self.read('i')
                elif f==4:value=self.read('f')
                elif f==6:value=self.array('B')
                elif f==7:value=self.read('16s').hex()
                elif f==8:value=self.read('6dB')
                out[name]=value
            elif f<125:
                from pbz_offline_components import SCHEMA
                prop=SCHEMA['primitive'][f-11];out[prop['name']]=self.primitive(prop)
            elif f==126:out['parent']=self.read('i')
            elif f in (130,131,132):out[{130:'location',131:'rotation',132:'scale'}[f]]=self.read('3d')
            else:raise ValueError('Unsupported landscape scene property '+str(f))
        if self.boolean():self.skip(16)
        if self.count(10000)!=0:raise ValueError('Unsupported component native property list')
        return out


def landscape(package,index):
    payload=package.payload(index);c=LandscapeCursor(payload);props=c.properties()
    if not c.boolean():raise ValueError('Uncooked landscape')
    if c.read('i')!=1:raise ValueError('Unexpected cooked landscape element size')
    size=c.count(100000000)
    raw=bytes(c.data[c.at:c.at+size]);c.skip(size)
    if c.at!=len(payload):raise ValueError('Unconsumed landscape native data')
    archive=Archive(raw);has_simple=archive.boolean();main=archive.pointer();simple=archive.pointer() if has_simple else None
    if archive.at!=len(raw):raise ValueError('Unconsumed landscape Chaos data')
    selected=simple or main
    if selected is None or selected['type']!=12:raise ValueError('Missing landscape heightfield')
    factor=props['CollisionScale']
    if simple:factor*=props['CollisionSizeQuads']/props['SimpleCollisionSizeQuads']
    vertices=[(p[0]*factor,p[1]*factor,p[2]/128) for p in selected['vertices']]
    return dict(properties=props,vertices=vertices,triangles=selected['triangles'],
                selected='simple' if simple else 'main',consumedCollisionBytes=len(raw),
                dimensions=(selected['rows'],selected['columns']))
