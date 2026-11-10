-- Runs through UE4SS's C++ on_lua_start event, before PbzMapTracker/main.lua.
-- Wrap only this VM's require: the original collector files stay untouched.
if rawget(_G, '__PBZQuestRouteHost') then return end
local source = debug.getinfo(1, 'S').source:gsub('^@', ''):gsub('\\', '/')
local directory = assert(source:match('^(.*)/[^/]+$'), 'ROUTE_HOST_PATH_UNAVAILABLE')
local adapter = assert(loadfile(directory .. '/PbzQuestRouteBridge.lua'))()
local original = require
local control = {active = true}
rawset(_G, '__PBZQuestRouteHost', control)
local function report(code, detail)
    print('[PBZQuestRouteCompat] ' .. code .. ' ' .. tostring(detail or '') .. '\n')
end
local wrapped
local selectionModule, originalCreate, selectionCreate
local function restoreRequire()
    if control.bridge and selectionModule and require == wrapped then require = original end
end
wrapped = function(name, ...)
    local value, loader = original(name, ...)
    if name == 'PbzMapSelection' and not selectionModule then
        selectionModule, originalCreate = value, value.create
        selectionCreate = function(...)
            local service = originalCreate(...)
            if control.bridge then control.bridge.watchSelection(service)
            else control.pendingSelection = service end
            return service
        end
        value.create = selectionCreate
        restoreRequire()
    end
    if name == 'PbzMapTarget' and not control.bridge and control.active then
        -- PbzMapTracker requires this service from its game-thread boot before
        -- constructing the live target. Nothing is booted in a second VM.
        local ok, result = pcall(adapter.install, {target = value, report = report})
        if ok then
            control.bridge = result
            if control.pendingSelection then result.watchSelection(control.pendingSelection);control.pendingSelection=nil end
            restoreRequire()
            report('TARGET_CONNECTED', 'Map Collectible Tracker 1.0.9')
        else report('CONNECT_FAILED', result) end
    end
    return value, loader
end
require = wrapped
function control.stop()
    control.active = false
    if require == wrapped then require = original end
    if selectionModule and selectionModule.create == selectionCreate then selectionModule.create = originalCreate end
    if control.bridge then control.bridge.stop(); control.bridge = nil end
    rawset(_G, '__PBZQuestRouteHost', nil)
end
report('WAITING_TARGET', 'navigation adapter loaded; collector files unchanged')
