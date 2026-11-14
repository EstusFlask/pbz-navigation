"""Record active gameplay abilities read-only using the current session registry."""
from pathlib import Path
import argparse,importlib.util,json,re,struct,time
from pbz_field_io import publish_json
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--registry',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--ue4ss-log',type=Path,required=True)
parser.add_argument('--duration',type=float,default=14400)
args=parser.parse_args()
spec=importlib.util.spec_from_file_location('pbz_observer',Path(__file__).with_name('observe-navigation-runtime.py'))
lib=importlib.util.module_from_spec(spec);spec.loader.exec_module(lib)
folder=args.output
folder.mkdir(parents=True,exist_ok=True)
registry=json.loads(args.registry.read_text('utf-8'))
m=lib.Memory(registry['pid']);u=lib.Reflection(m,registry);observer=lib.Observer(u,registry)
log=args.ue4ss_log.read_text('utf-8',errors='replace')
inner_offset=int(re.findall(r'FArrayProperty::Inner = (0x[0-9a-fA-F]+)',log)[-1],16)
layout=None;previous=None;last_write=0;started=time.monotonic()
status={'active':True,'startedAt':lib.utc(),'samples':0,'changes':0}
try:
    with (folder/'abilities.jsonl').open('a',encoding='utf-8',buffering=1) as out:
        while time.monotonic()-started<args.duration and not (folder/'stop-abilities').exists() and m.alive():
            tick=time.monotonic()
            try:
                pc=u.pointer(observer.player,u.fields(observer.player),'PlayerController')
                pawn=u.pointer(pc,u.fields(pc),'Pawn')
                asc=u.pointer(pawn,u.fields(pawn),'AbilitySystemComponent')
                af=u.fields(asc)['ActivatableAbilities']
                container_fields=u.schema(af['typePointer']);items=container_fields['Items']
                if layout is None:
                    field=m.u64(af['typePointer']+0x50)
                    for _ in range(200):
                        if not field:raise ValueError('Ability Items property not found')
                        if u.name(m.u32(field+0x20))=='Items':break
                        field=m.u64(field+0x10)
                    inner=m.u64(field+inner_offset);stride=m.u32(inner+0x34)
                    fields=u.schema(m.u64(inner+0x70))
                    assert fields['ActiveCount']['size']==1 and fields['Ability']['size']==8 and 0<stride<4096
                    layout={'stride':stride,'fields':fields,'arrayInnerOffsetFromUE4SSLog':inner_offset}
                    (folder/'abilities-schema.json').write_text(json.dumps(layout,indent=2),'utf-8')
                ptr,count,capacity=struct.unpack('<Qii',m.read(asc+af['offset']+items['offset'],16))
                if not 0<=count<=capacity<=4096:raise ValueError('Invalid ability array')
                data=m.read(ptr,count*layout['stride']) if count else b''
                active=[];fields=layout['fields']
                for i in range(count):
                    offset=i*layout['stride'];n=data[offset+fields['ActiveCount']['offset']]
                    if n:
                        ability=struct.unpack_from('<Q',data,offset+fields['Ability']['offset'])[0]
                        active.append({'ability':u.object_name(ability),'count':n})
                signature=json.dumps(active,sort_keys=True)
                status.update(samples=status['samples']+1,updatedAt=lib.utc(),activeAbilities=active,error=None)
                if signature!=previous or tick-last_write>=1:
                    out.write(json.dumps({'capturedAt':status['updatedAt'],'world':u.outer_world(pawn),'active':active},separators=(',',':'))+'\n')
                    status['changes']+=int(signature!=previous);last_write=tick;previous=signature
            except (OSError,ValueError,KeyError,struct.error) as exc:
                status.update(updatedAt=lib.utc(),error=str(exc))
                out.write(json.dumps({'capturedAt':lib.utc(),'kind':'read-gap','error':str(exc)})+'\n')
                time.sleep(.3)
            publish_json(folder/'abilities-status.json',status)
            time.sleep(max(0,.1-(time.monotonic()-tick)))
finally:
    m.close();status.update(active=False,updatedAt=lib.utc());publish_json(folder/'abilities-status.json',status)
