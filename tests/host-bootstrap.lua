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
local Target=require('PbzMapTarget') -- original 1.0.14 bytecode, in the collector VM
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
assert(snapshot.markers and #snapshot.markers==1 and snapshot.markers[1].key=='upstairs-hover',
    'the visible marker catalogue was not published for directional controller selection')
local markerRevision=snapshot.markerRevision
selection.setMarkers({
    {key='upstairs-hover',mapID='pangzhen',location={100,200,2300}},
    {key='right-item',mapID='pangzhen',location={300,200,3300}},
})
f=assert(io.open(bridge_test_root .. '/PBZQuestRoute-tracker.json','rb'));snapshot=require('dkjson').decode(f:read('*a'));f:close()
assert(snapshot.markerRevision>markerRevision and #snapshot.markers==2)
local function sendMarker(action,key,revision,session)
    local value={protocol=snapshot.protocol,version=1,session=session or snapshot.session,action=action,key=key,markerRevision=revision}
    local out=assert(io.open(bridge_test_root .. '/PBZQuestRoute-command.json','wb'));out:write(require('dkjson').encode(value));out:close()
    control.bridge.poll()
end
sendMarker('focus','right-item',snapshot.markerRevision)
assert(selection.selectedKey()=='right-item' and api.read().target.key=='host-selected','D-pad focus changed the tracked target')
sendMarker('select','right-item',snapshot.markerRevision)
assert(api.read().target.key=='right-item' and api.read().target.location[3]==3300,'A did not confirm the directional item')
sendMarker('select','upstairs-hover',snapshot.markerRevision-1)
assert(api.read().target.key=='right-item','stale marker catalogue changed the tracked target')
sendMarker('select','upstairs-hover',snapshot.markerRevision,'previous-session')
assert(api.read().target.key=='right-item','previous-session marker command was accepted')
sendMarker('select','missing',snapshot.markerRevision)
assert(api.read().target.key=='right-item','missing marker command changed the target')
selection.select('upstairs-hover')
f=assert(io.open(bridge_test_root .. '/PBZQuestRoute-tracker.json','rb'));snapshot=require('dkjson').decode(f:read('*a'));f:close()
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
