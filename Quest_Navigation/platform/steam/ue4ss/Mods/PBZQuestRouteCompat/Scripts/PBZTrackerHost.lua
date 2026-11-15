-- Runs through UE4SS's C++ on_lua_start event, before PbzMapTracker/main.lua.
-- Wrap only this VM's require: the original collector files stay untouched.
if rawget(_G, '__PBZQuestRouteHost') then return end
local source = debug.getinfo(1, 'S').source:gsub('^@', ''):gsub('\\', '/')
local directory = assert(source:match('^(.*)/[^/]+$'), 'ROUTE_HOST_PATH_UNAVAILABLE')
local adapter = assert(loadfile(directory .. '/PbzQuestRouteBridge.lua'))()
local original = require
local control = {active = true}
local buildLoader=loadfile(directory .. '/PBZRouteBuild.lua')
local build=buildLoader and buildLoader() or {development=false}
rawset(_G, '__PBZQuestRouteHost', control)
local function report(code, detail)
    print('[PBZQuestRouteCompat] ' .. code .. ' ' .. tostring(detail or '') .. '\n')
end
local wrapped
local selectionModule, originalCreate, selectionCreate
function control.stop()
    control.active = false
    if require == wrapped then require = original end
    if selectionModule and selectionModule.create == selectionCreate then selectionModule.create = originalCreate end
    if control.bridge then control.bridge.stop(); control.bridge = nil end
    if control.undoHints then control.undoHints();control.undoHints=nil end
    if control.surveys then control.surveys.stop();control.surveys=nil end
    rawset(_G, '__PBZQuestRouteHost', nil)
end
local function unsupported(code)
    control.stop()
    report(code, 'collector API changed; navigation adapter disabled')
end
local function restoreRequire()
    if control.bridge and selectionModule and require == wrapped then require = original end
end
wrapped = function(name, ...)
    local value, loader = original(name, ...)
    if name=='PbzMapCatalog' and build.development and not control.surveys then
        local ok,result=pcall(function()
            local survey=assert(loadfile(directory .. '/PBZSurveyCatalog.lua'))()
            local data=assert(loadfile(directory .. '/PBZSurveyCatalogData.lua'))()
            local result=survey.apply(value,data)
            local setup,err=pcall(function()
                result.presentation(original('PbzNativePresentation'))
                result.collections(original('PbzCollectibleRules'),original('PbzCollectibleRepository'))
                if control.bridge then result.setRoot(control.bridge.savedRoot)end
            end)
            if not setup then result.stop();error(err)end
            return result
        end)
        if ok then control.surveys=result;report('SURVEY_CATALOG_CONNECTED','94 tracker items')
        else report('SURVEY_CATALOG_SKIPPED',result)end
    end
    if name == 'PbzMapSelection' and not selectionModule then
        if not adapter.selectionModule(value) then unsupported('SELECTION_MODULE_CONTRACT_UNSUPPORTED');return value, loader end
        selectionModule, originalCreate = value, value.create
        selectionCreate = function(...)
            local values = table.pack(originalCreate(...))
            local service = values[1]
            if control.bridge then
                if not control.bridge.watchSelection(service) then unsupported('SELECTION_SERVICE_CONTRACT_UNSUPPORTED') end
            else control.pendingSelection = service end
            return table.unpack(values,1,values.n)
        end
        value.create = selectionCreate
        restoreRequire()
    end
    if name == 'PbzMapTarget' and not control.bridge and control.active then
        -- PbzMapTracker requires this service from its game-thread boot before
        -- constructing the live target. Nothing is booted in a second VM.
        local ok, result = pcall(adapter.install, {target = value, report = report, onUnsupported = unsupported,
            onPoll=function()if control.surveys then control.surveys.refresh()end end})
        if ok then
            control.bridge = result
            -- This catalogue is a pure data module, loaded once in this same
            -- game-thread boot. A missing/changed catalogue cannot break sync.
            local hintsOk,hintsErr=pcall(function()
                local hints=assert(loadfile(directory .. '/PBZItemHints.lua'))()
                local data=assert(loadfile(directory .. '/PBZItemHintsData.lua'))()
                local count,undo=hints.apply(wrapped('PbzMapCatalog'),data)
                control.undoHints=undo
                report('ITEM_HINTS_CONNECTED',count)
            end)
            if not hintsOk then report('ITEM_HINTS_SKIPPED',hintsErr) end
            if control.surveys then
                local ready,err=pcall(control.surveys.setRoot,result.savedRoot)
                if not ready then report('SURVEY_PROGRESS_WAITING',err)end
            end
            if control.pendingSelection then
                if not result.watchSelection(control.pendingSelection) then unsupported('SELECTION_SERVICE_CONTRACT_UNSUPPORTED');return value,loader end
                control.pendingSelection=nil
            end
            restoreRequire()
            report('TARGET_CONNECTED', 'Map Tracker target/selection contract v1')
        else unsupported('CONNECT_FAILED: ' .. tostring(result)) end
    end
    return value, loader
end
require = wrapped
report('WAITING_TARGET', 'navigation adapter loaded; collector files unchanged')
