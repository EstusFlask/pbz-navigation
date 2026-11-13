local saved_require = require
local calls, queued = 0, {}
StaticFindObject = function(name)
    calls = calls + 1
    assert(name == '/Script/Engine.Default__KismetSystemLibrary')
    return {IsValid=function() return true end,
        GetProjectSavedDirectory=function() return bridge_test_root end,
        ConvertToAbsolutePath=function(_, path) return {ToString=function() return path end} end}
end
ExecuteInGameThreadWithDelay=function(delay,fn) assert(delay==200);queued[#queued+1]=fn end
assert(loadfile(adapter_scripts .. '/PBZTrackerHost.lua'))()
assert(calls==0, 'host touched engine objects before tracker game-thread boot')
assert(require~=saved_require)
local Target=require('PbzMapTarget') -- original 1.0.9 bytecode, in the collector VM
assert(require~=saved_require, 'selection factory has not been observed yet')
local Selection=require('PbzMapSelection')
assert(require==saved_require, 'host did not restore require after attaching')
assert(calls==1 and #queued==1)
local api=Target.create()
local selection=Selection.create({target=api})
api.set({key='host-selected',mapID='pbz_pangzhen_wp',location={11,22,33}})
local f=assert(io.open(bridge_test_root .. '/PBZQuestRoute-tracker.json','rb'))
local snapshot=require('dkjson').decode(f:read('*a'));f:close()
assert(snapshot.target.key=='host-selected' and snapshot.target.location[3]==33)
local control=rawget(_G,'__PBZQuestRouteHost')
local hinted=false
for _,p in ipairs(require('PbzMapCatalog').points) do
 if p.contents[1] and p.contents[1].nameKey=='Item_Weapon_TierUp_001' then hinted=p.sourceHint:find('虎炮')~=nil end
end
assert(hinted,'host did not connect item hints to the collector catalogue')
selection.setMarkers({{key='upstairs-hover',mapID='pangzhen',location={100,200,2300},x=10,y=20,width=30,height=30}})
selection.select('upstairs-hover')
f=assert(io.open(bridge_test_root .. '/PBZQuestRoute-tracker.json','rb'));snapshot=require('dkjson').decode(f:read('*a'));f:close()
assert(snapshot.hover.key=='upstairs-hover' and snapshot.hover.location[3]==2300)
local cmd={protocol=snapshot.protocol,version=1,session=snapshot.session,action='select',key='upstairs-hover',selectionRevision=snapshot.selectionRevision}
f=assert(io.open(bridge_test_root .. '/PBZQuestRoute-command.json','wb'));f:write(require('dkjson').encode(cmd));f:close()
control.bridge.poll()
assert(api.read().target.key=='upstairs-hover' and api.read().target.location[3]==2300,'middle-click lost the upper floor')
selection.clearSelection()
cmd.selectionRevision=cmd.selectionRevision-1
f=assert(io.open(bridge_test_root .. '/PBZQuestRoute-command.json','wb'));f:write(require('dkjson').encode(cmd));f:close()
control.bridge.poll()
assert(api.read().target.key=='upstairs-hover','stale hover command changed the target')
assert(loadfile(adapter_scripts .. '/PBZTrackerHost.lua'))()
assert(rawget(_G,'__PBZQuestRouteHost')==control and #queued==1, 'host installed twice')
control.stop()
assert(rawget(_G,'__PBZQuestRouteHost')==nil and require==saved_require)
StaticFindObject=nil;ExecuteInGameThreadWithDelay=nil
print('PASS: original tracker target/hover APIs, middle-click selection preserves height, stale hover rejected, require restored')
