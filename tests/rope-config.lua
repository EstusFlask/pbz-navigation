local Config=require('PBZRouteConfig')
local Core=require('PbzConfigCore')
local Client=require('PbzModConfigClient')
local json=Core.json
local path=config_test_root..'/PBZQuestRoute-settings.json'
local provider=Config.create({path=path})
local schema=Core.compile(provider)
assert(provider.read().values.ThreadColor=='blue')
assert(#provider.entries[1].options==3 and provider.entries[2].type=='color')
assert(not Core.visible(schema.entries.ThreadCustomColor,provider.read().values))
local cells,clock={},1
local shared={get=function(k)return cells[k] end,set=function(k,v)cells[k]=v end}
local client=Client.register(provider,{shared=shared,now=function()return clock end,
    instance='rope-client-0001',schedule=function()end,report=function(code,detail)error(code..tostring(detail))end})
cells[Client.names.host]=json.encode({p=1,host='rope-host-000001',beat=1})
client.tick()
assert(cells[Client.names.index]:find(';PBZQuestRoute;',1,true))
local descriptor=json.decode(cells[Client.names.schema('PBZQuestRoute')]).d
assert(descriptor.modId=='PBZQuestRoute' and descriptor.displayName['zh-Hans']=='任务与探索导航')
local id=0
local function command(op,patch,base,group)
    id=id+1;clock=clock+.1
    cells[Client.names.down('PBZQuestRoute')]=json.encode({p=1,i=client.instance,h='rope-host-000001',
        cmds=json.array({{id=id,op=op,patch=patch,base=base,group=group}})})
    client.tick()
    local up=json.decode(cells[Client.names.up('PBZQuestRoute')])
    return up.res[#up.res]
end
assert(command('apply',{ThreadColor='red'},0).ok)
assert(Config.create({path=path}).read().values.ThreadColor=='red','color was not persisted')
assert(not command('apply',{ThreadColor='custom'},0).ok,'stale revision accepted')
assert(command('apply',{ThreadColor='custom'},1).ok)
assert(Core.visible(schema.entries.ThreadCustomColor,provider.read().values))
assert(command('apply',{ThreadCustomColor='#00FF00'},2).ok)
assert(not command('apply',{ThreadCustomColor='#oops'},3).ok)
assert(provider.read().values.ThreadCustomColor=='#00FF00')
assert(Config.create({path=path}).read().values.ThreadCustomColor=='#00FF00')
local f=assert(io.open(config_test_root..'/rope-roundtrip.json','wb'))
local input=assert(io.open(path,'rb'));f:write(input:read('*a'));input:close();f:close()
assert(command('reset',nil,3,'thread').ok)
assert(provider.read().values.ThreadColor=='blue' and provider.read().values.ThreadCustomColor=='#3895FF')
assert(not command('apply',{ThreadCustomColor='#FFFFFF'},4).ok,'hidden picker was editable')
assert(not command('reset',nil,4,'unknown').ok)
assert(Config.create({path=path,read=function()return '{' end}).read().values.ThreadColor=='blue')
assert(Config.create({path=path,read=function()return json.encode({schemaVersion=1,values={ThreadColor='oops',ThreadCustomColor='#001122'}})end}).read().values.ThreadColor=='blue')
local fail=true
local broken=Config.create({path=path,read=function()end,write=function()if fail then error('disk full')end end})
assert(not broken.apply({ThreadColor='red'}).ok and broken.read().persistence.state=='error')
fail=false;assert(broken.flush().ok and broken.read().persistence.state=='saved')
client.close()

-- Run the packaged entry in its own VM, without any Map Tracker modules.
local callbacks={}
ExecuteInGameThread=function(fn)callbacks[#callbacks+1]=fn end
ExecuteInGameThreadWithDelay=function(_,fn)callbacks[#callbacks+1]=fn end
ModRef={GetSharedVariable=function(_,k)return cells[k]end,SetSharedVariable=function(_,k,v)cells[k]=v end}
local calls=0
StaticFindObject=function(name)
    calls=calls+1;assert(name=='/Script/Engine.Default__KismetSystemLibrary')
    return {IsValid=function()return true end,GetProjectSavedDirectory=function()return config_test_root end,
        ConvertToAbsolutePath=function(_,p)return p end}
end
assert(loadfile(adapter_scripts..'/main.lua'))()
assert(calls==0 and #callbacks==1,'config entry touched Unreal off the game thread')
table.remove(callbacks,1)()
assert(calls==1 and __PBZQuestRouteConfig,'navigation provider failed without Map Tracker')
table.remove(callbacks,1)()
assert(cells[Client.names.schema('PBZQuestRoute')])
__PBZQuestRouteConfig.client.close()
print('PASS: rope ModConfig protocol, picker visibility, save/restart/reset, invalid values, save retry, standalone game-thread boot')
