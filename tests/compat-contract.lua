local Bridge=require('PbzQuestRouteBridge')
local original=require
local Target=require('PbzMapTarget')
local originalCreate=Target.create
assert(not pcall(Bridge.install,{target={},root='test'}))
local invalid={create=function() return {untouched=true},'author-result' end}
local c=Bridge.install({target=invalid,root='test',schedule=function() end})
local service,extra=invalid.create()
assert(service.untouched and extra=='author-result' and not c.active)
assert(invalid.__questRouteBridge==nil)
local other=function() end
c=Bridge.install({target=Target,root='test',read=function() end,write=function() error('disk unavailable') end,schedule=function() end})
assert(not c.watchSelection({selected=function() end}), 'incompatible selection was wrapped')
local api=Target.create()
api.set({key='still-works',mapID='XiGu',location={1,2,3456}})
assert(api.read().target.key=='still-works','bridge write failure broke collector')
Target.create=other;c.stop()
assert(Target.create==other,'cleanup replaced a later third-party wrapper')
Target.create=originalCreate
-- Module drift must restore require and leave the original service alone.
local saved=package.loaded.PbzMapTarget
package.loaded.PbzMapTarget={}
assert(loadfile(adapter_scripts..'/PBZTrackerHost.lua'))()
assert(require~=original)
local value=require('PbzMapTarget')
assert(value==package.loaded.PbzMapTarget and require==original)
assert(rawget(_G,'__PBZQuestRouteHost')==nil)
package.loaded.PbzMapTarget=saved
print('PASS: unsupported contracts disable safely; disk failure and later wrappers preserve collector behavior')
