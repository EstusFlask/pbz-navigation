-- Run against an installed, unmodified PbzModConfig host (optional test input).
local Client=require('PbzModConfigClient')
local Remote=require('PbzRemoteHost')
local cells,records,clock={},{},1
local shared={get=function(k)return cells[k]end,set=function(k,v)cells[k]=v end}
local host={providers=function()return {}end,registerProvider=function(p)
    records[p.modId]=p;return {dispose=function()records[p.modId]=nil end}
end}
local options={shared=shared,host=host,hostId='rope-real-host-001',now=function()return clock end,
    schedule=function()end,report=function(c,d)error(c..tostring(d))end}
local remote=Remote.start(options)
local provider=require('PBZRouteConfig').create({path='unused',read=function()end,write=function()end})
local client=Client.register(provider,options)
local function pump()for _=1,3 do clock=clock+.1;remote.tick();client.tick()end end
pump()
local proxy=assert(records.PBZQuestRoute,'actual ModConfig host rejected navigation')
assert(require('PbzLocale').resolve(proxy.displayName,'zh-CN')=='任务与探索导航')
for _,entry in ipairs(proxy.entries) do assert(entry.key~='ReverseSearch','retired search toggle remains on host') end
for _,patch in ipairs({{ThreadColor='red'},{ThreadColor='blue'},{ThreadColor='custom'},{ThreadCustomColor='#00FF00'}}) do
    assert(proxy.apply(patch,{baseRevision=proxy.read().revision}).ok);pump()
    for k,v in pairs(patch) do assert(provider.read().values[k]==v and proxy.read().values[k]==v) end
end
remote.stop();client.close()
print('PASS: actual ModConfig remote host discovers navigation, omits the retired search toggle and applies color edits')
