local Target = require('PbzMapTarget') -- the actual 1.0.9 protected payload
local json = require('dkjson')
local Bridge = require('PbzQuestRouteBridge')
local files, time, scheduled = {}, 100000, {}
local control = Bridge.install({target=Target,root='test',clock=function() return time end,
    read=function(name) return files[name] end,write=function(name,text) files[name]=text end,
    schedule=function(delay,fn) assert(delay==200); scheduled[#scheduled+1]=fn end})
local api = Target.create()
local function snapshot() return assert(json.decode(files['PBZQuestRoute-tracker.json'])) end
local function command(value) files['PBZQuestRoute-command.json']=json.encode(value); control.poll() end
api.set({key='item-a',mapID='pbz_pangzhen_wp',location={1,2,3},title='饰品'}, 'selected')
local first = snapshot()
assert(first.target.key=='item-a' and first.target.location[3]==3)
local cancel={protocol=first.protocol,version=1,session=first.session,revision=first.revision,key='item-a',action='clear'}
api.set({key='item-b',mapID='pbz_pangzhen_wp',location={4,5,6}})
command(cancel)
assert(api.read().target.key=='item-b', 'late cancellation cleared the new target')
local latest = snapshot()
cancel.revision=latest.revision;cancel.key='item-b';cancel.session='old-session';command(cancel)
assert(api.read().target.key=='item-b', 'previous-session command was accepted')
cancel.session=latest.session;command(cancel)
assert(api.read().target==nil and snapshot().target==nil, 'matching cancel was not propagated')
api.set({key='auto',mapID='map',location={7,8,9},trackingMode='auto',hintOnly=true})
assert(snapshot().target.hintOnly and snapshot().target.trackingMode=='auto')
local revision=snapshot().revision;time=time+1000;control.poll()
assert(snapshot().writtenAt==time and snapshot().revision==revision, 'heartbeat changed target revision')
files['PBZQuestRoute-command.json']='{partial';control.poll()
assert(api.read().target.key=='auto', 'partial command damaged the target')
control.stop()
assert(not control.active and Target.__questRouteBridge==nil)
print('PASS: actual Lua 1.0.9 selection, cancellation, stale commands, hint mode, heartbeat, cleanup')
