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
assert(require==saved_require, 'host did not restore require after attaching')
assert(calls==1 and #queued==1)
local api=Target.create()
api.set({key='host-selected',mapID='pbz_pangzhen_wp',location={11,22,33}})
local f=assert(io.open(bridge_test_root .. '/PBZQuestRoute-tracker.json','rb'))
local snapshot=require('dkjson').decode(f:read('*a'));f:close()
assert(snapshot.target.key=='host-selected' and snapshot.target.location[3]==33)
local control=rawget(_G,'__PBZQuestRouteHost')
assert(loadfile(adapter_scripts .. '/PBZTrackerHost.lua'))()
assert(rawget(_G,'__PBZQuestRouteHost')==control and #queued==1, 'host installed twice')
control.stop()
assert(rawget(_G,'__PBZQuestRouteHost')==nil and require==saved_require)
StaticFindObject=nil;ExecuteInGameThreadWithDelay=nil
print('PASS: navigation-owned host attaches original tracker target, restores require and avoids duplicate hooks')
