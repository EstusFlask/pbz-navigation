"""Native ordinary ISM matrices after its reflected property prefix."""
from pbz_offline_components import Cursor


def instances(package,index,effective=None):
    c=Cursor(package.payload(index));own=c.component('InstancedStaticMeshComponent',full=True)
    effective=effective or own
    if c.boolean():c.skip(16)
    for _ in range(c.count(100000)):
        c.read('i');c.read('2I');c.skip(16)  # FSimpleMemberReference
    if effective.get('bComputeBoundsOnceForGame'):
        if c.boolean():c.read('7d')
    if c.count(1000)!=0:raise ValueError('Unsupported nonempty instance LOD data')
    if not c.boolean():raise ValueError('Uncooked mesh paint data')
    c.read('i')
    cooked=c.boolean();has_data=c.boolean()
    if not cooked:raise ValueError('Uncooked instance buffer')
    matrices=[]
    if has_data:
        width,count=c.read('2i')
        if width not in (64,128) or not 0<=count<=1000000:raise ValueError('Invalid instance matrix bulk data')
        matrices=[c.read('16d' if width==128 else '16f') for _ in range(count)]
        width,count=c.read('2i')
        if width!=4 or count<0:raise ValueError('Invalid instance custom data')
        c.skip(count*4)
    elif effective.get('instanceField12'):
        raise ValueError('Inherited native instance data requires template buffer')
    render_data=c.boolean()
    if render_data:
        for _ in range(2):
            width,count=c.read('2i')
            if width not in (4,8,16) or not 0<=count<=1000000:raise ValueError('Unsupported cooked instance render buffer')
            c.skip(width*count)
    if c.at!=len(c.data):raise ValueError(f'Unconsumed instance component bytes {len(c.data)-c.at}')
    return matrices
