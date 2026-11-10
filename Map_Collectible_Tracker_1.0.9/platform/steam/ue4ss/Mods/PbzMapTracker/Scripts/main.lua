-- Map tracker for UE4SS: an independent mod. It owns its settings file (the same two-slot
-- format, location and keys as the JS 0.6.7 release) and works without ModConfig. When
-- ModConfig is installed, whichever of the two starts first, the settings are registered
-- there through PbzModConfigClient (UE4SS shared variables) and edited on its "Mods" page.
-- All game access runs on the game thread.
local function report(code, detail)
    print('[PbzMapTracker] ' .. code .. ' ' .. tostring(detail or '') .. '\n')
end
-- The UE4SS edition's version (1.0.0 replaced the JS 0.6.x line); the release build checks it.
local VERSION = '1.0.9'
-- Keep the measured collector pacing for this mod's lifetime. Restore ownership
-- only after a successful stop, or when startup fails before publishing the mod.
local performancePreviousStepMul
local function restorePerformanceStepMul()
    if performancePreviousStepMul ~= nil then
        collectgarbage('setstepmul', performancePreviousStepMul)
        performancePreviousStepMul = nil
    end
end
local MOD_SLOT = '__PBZ_MAP_MOD_V1__'
-- Directory of this file, e.g. .../Mods/PbzMapTracker/Scripts (used for bundled assets).
local scriptsDir = (debug.getinfo(1, 'S').source:gsub('^@', ''):gsub('\\', '/'):match('^(.*)/[^/]*$')) or '.'
local function defaultObject(path)
    local object = StaticFindObject(path)
    assert(object and object:IsValid(), 'LOCALE_LIBRARY_UNAVAILABLE ' .. path)
    return object
end
local function asString(value)
    if type(value) == 'string' then return value end
    return value:ToString()
end
local function nativeText(key)
    local library = defaultObject('/Script/ProjectPBZ.Default__PBZBlueprintFunctionLibrary')
    return asString(library:MakeTextByKey(key))
end
local function engineLanguage()
    local library = defaultObject('/Script/Engine.Default__KismetInternationalizationLibrary')
    return asString(library:GetCurrentLanguage())
end
local function verifySchema(storage, view)
    assert(type(view) == 'table' and view.modId == 'PbzMapTracker' and type(view.groups) == 'table'
        and type(view.entries) == 'table' and #view.entries == #storage.entries, 'CONFIG_DESCRIPTOR_MISMATCH')
    for index, entry in ipairs(storage.entries) do
        local other = view.entries[index]
        assert(type(other) == 'table', 'CONFIG_DESCRIPTOR_MISMATCH')
        for _, key in ipairs({'key','type','group','defaultValue','min','max','step','format'}) do
            assert(entry[key] == other[key], 'CONFIG_DESCRIPTOR_MISMATCH ' .. tostring(entry.key) .. ' ' .. key)
        end
        local a, b = entry.options or {}, other.options or {}
        assert(#a == #b, 'CONFIG_DESCRIPTOR_MISMATCH ' .. tostring(entry.key) .. ' options')
        for n, option in ipairs(a) do
            assert(option.value == b[n].value, 'CONFIG_DESCRIPTOR_MISMATCH ' .. tostring(entry.key) .. ' option')
        end
    end
end

-- Keep the private store compatible with old settings. The menu receives only
-- registered controls and their values; its reader rejects undeclared fields.
local function menuProvider(provider)
    local result={}
    for key,value in pairs(provider) do result[key]=value end
    result.entries={}
    for _,entry in ipairs(provider.entries) do
        if entry.key~='guide.autoTrack' then result.entries[#result.entries+1]=entry end
    end
    result.read=function()
        local snapshot=provider.read()
        snapshot.values['guide.autoTrack']=nil
        return snapshot
    end
    return result
end

if type(ExecuteInGameThread) ~= 'function' or type(ExecuteInGameThreadWithDelay) ~= 'function' then
    report('START_FAILED', 'Required game-thread scheduling API is unavailable')
    return
end

-- build_test.py rewrites these two lines; a player build keeps them exactly as written.
local Dev = nil -- PBZ_DEV_CONFIG
local MapCapabilityText = [[autoTracking=true
cursorGeometry=true
freeTraversal=true
hoverSelect=true
inputType=true
keyHints=true
keyPolling=true
mapClickBinding=true
markerPool=true
modalCheck=true
nameBar=true
nativeSelectionYield=true
panel=true
panelClicks=true
panelHover=true
trackedEffect=true]]
local Bridge = Dev and Dev.bridgeRoot and require('PbzDevBridge') or nil
if Bridge then Bridge.prepare(Dev.bridgeRoot) end

-- Owns everything the mod starts; stop() releases it in reverse order and, on any failure,
-- keeps what is still running so a later stop() retries only the unfinished steps.
local function newModule(parts)
    local self = {provider = parts.provider, store = parts.store, plugin = parts.plugin,
        client = parts.client, monitor = parts.monitor}
    local done = {}
    local stopped = false
    local function step(name, fn)
        if done[name] then return true end
        local ok, result = pcall(fn)
        if ok and result ~= false then done[name] = true; return true end
        report('MAP_STOP_FAILED', name .. ' ' .. (ok and 'incomplete release' or tostring(result)))
        return false
    end
    function self.stop()
        if stopped then return false end
        if not step('save', function()
            local result = parts.provider.flush()
            return type(result) == 'table' and result.ok == true
                and type(result.persistence) == 'table' and result.persistence.state == 'saved'
        end) then return false end
        if parts.plugin and not step('plugin', parts.plugin.stop) then return false end
        if parts.client and not step('client', function() parts.client.close(); return true end) then return false end
        if not step('monitor', parts.monitor.stop) then return false end
        parts.autosave.stop()
        if parts.extra then pcall(parts.extra.dispose) end
        restorePerformanceStepMul()
        stopped = true
        if rawget(_G, MOD_SLOT) == self then rawset(_G, MOD_SLOT, nil) end
        return true
    end
    return self
end

local function boot()
    local started = {}
    local ok, err = xpcall(function()
        local Files = require('PbzNativeConfigIO')
        local Store = require('PbzMapConfigStore')
        local Schema = require('PbzMapConfigSchema')
        local View = require('PbzMapLocalizedSchema')
        local LocaleMonitor = require('PbzLocaleMonitor')
        local StoreProvider = require('PbzStoreProvider')
        local Autosave = require('PbzMapAutosave')
        local MapPlugin = require('PbzMapPlugin')
        local catalog = require('PbzMapCatalog')
        verifySchema(Schema, View)
        local previous = rawget(_G, MOD_SLOT)
        assert(not previous or type(previous.stop) == 'function', 'MOD_SLOT_ALREADY_OWNED')
        if previous then assert(previous.stop(), 'PREVIOUS_MODULE_SAVE_FAILED') end
        performancePreviousStepMul = collectgarbage('setstepmul', 4)
        report('LUA_GC_CONFIGURED', 'stepmul=4')
        local roots = Files.roots()
        if Dev and Dev.configRoot then roots = {root = Dev.configRoot, legacyRoot = Dev.configRoot} end
        local current, legacy = Files.create(roots.root), Files.create(roots.legacyRoot)
        local store = Store.create({root = roots.root, legacyRoot = roots.legacyRoot, io = {
            read = function(path)
                if path:sub(1, #roots.root + 1):lower() == (roots.root .. '/'):lower() then return current.read(path) end
                return legacy.read(path)
            end,
            write = current.write,
        }})
        local loaded = store.load()
        assert(loaded.ok, 'CONFIG_LOAD_FAILED ' .. tostring(loaded.error))
        started.monitor = LocaleMonitor.start({nativeText = nativeText, engineLanguage = engineLanguage,
            schedule = ExecuteInGameThreadWithDelay, report = report})
        local base = StoreProvider.create(store, View, {schemaVersion = 3, modVersion = VERSION, report = report})
        -- UE4SS-only settings sit in their own file (the released JavaScript store rejects unknown keys);
        -- the map and the ModConfig page see one merged provider.
        local Extra = require('PbzMapExtraSettings')
        local ConfigStore = require('PbzConfigStore')
        local function extraReport(event) report('MAP_EXTRA_CONFIG', tostring(type(event) == 'table' and event.code or event)) end
        local Deleted = require('PbzMapDeletedMarkers')
        local deletedOk, deleted = pcall(function()
            return Deleted.create(ConfigStore.journal(ConfigStore.nativeIO(Deleted.MOD_ID, {root = roots.root}),
                Deleted.MOD_ID, extraReport), report)
        end)
        if not deletedOk then report('MAP_DELETED_UNAVAILABLE', tostring(deleted)); deleted = nil end
        local journal = ConfigStore.journal(ConfigStore.nativeIO(Extra.MOD_ID, {root = roots.root}), Extra.MOD_ID, extraReport)
        started.extra = ConfigStore.create(Extra.descriptor(), {storage = Extra.storage(journal), report = extraReport,
            actions = {['markers.restoreDeleted'] = function()
                return Extra.restoreDeleted(deleted)
            end}})
        local provider = Extra.merge(base, started.extra)
        -- Settings changed by the map itself or through ModConfig are written shortly after, as in the JS store.
        started.autosave = Autosave.start(provider, {schedule = ExecuteInGameThreadWithDelay, report = report})
        -- Native map capabilities stay off until an in-game probe confirms them: one `name=true`
        -- per line, written by the build only (a player build leaves the text empty).
        local capabilityText = MapCapabilityText
        if Bridge then
            -- Test builds only: the bridge overlay may switch capabilities between reloads.
            local found, override = pcall(require, 'PbzMapCapabilities')
            if found then assert(type(override) == 'string', 'DEV_CAPABILITIES_INVALID'); capabilityText = override end
        end
        -- A failing map feature must not take the settings (and their ModConfig page) down.
        local pluginOk, plugin = pcall(MapPlugin.start, {provider = provider, catalog = catalog, report = report,
            localeMonitor = started.monitor, mapCapabilityText = capabilityText, scriptsDir = scriptsDir, deleted = deleted})
        if not pluginOk then report('MAP_START_FAILED', plugin); plugin = nil end
        -- ModConfig is optional and may start before or after this mod; the client keeps
        -- retrying quietly. Registration problems never affect the map itself.
        local clientOk, client = pcall(function()
            return require('PbzModConfigClient').register(menuProvider(provider), {report = report})
        end)
        if not clientOk then report('MODCONFIG_CLIENT_UNAVAILABLE', client); client = nil end
        local mod = newModule({provider = provider, store = store, plugin = plugin, client = client,
            monitor = started.monitor, autosave = started.autosave, extra = started.extra})
        started.mod = mod
        rawset(_G, MOD_SLOT, mod)
        report('MAP_INITIALIZED', 'version=' .. VERSION .. ' revision=' .. tostring(loaded.revision) .. ' entries=' .. #Schema.entries
            .. ' map=' .. tostring(plugin ~= nil) .. ' modconfig_client=' .. tostring(client ~= nil))
    end, debug.traceback)
    if not ok then
        if started.mod then pcall(started.mod.stop)
        else
            if started.autosave then started.autosave.stop() end
            if started.monitor then started.monitor.stop() end
            if started.extra then pcall(started.extra.dispose) end
        end
        restorePerformanceStepMul()
        report('START_FAILED', err)
    end
    return ok
end

local scheduled, scheduleError = pcall(ExecuteInGameThread, function()
    boot()
    if Bridge then
        Bridge.start({root=Dev.bridgeRoot, schedule=ExecuteInGameThreadWithDelay, log=report, ctx={
            report=report,
            host=function() return rawget(_G, MOD_SLOT) end,
            -- Stops the mod (and its plugin), forgets loaded modules and boots again, so
            -- files placed in the bridge overlay take effect without restarting the game.
            reload=function()
                local mod = rawget(_G, MOD_SLOT)
                if mod then assert(mod.stop(), 'MODULE_STOP_FAILED') end
                for name in pairs(package.loaded) do
                    if (name:match('^Pbz') or name == 'dkjson') and name ~= 'PbzDevBridge' then
                        package.loaded[name] = nil
                    end
                end
                return boot()
            end,
        }})
    end
end)
if not scheduled then report('START_FAILED', scheduleError) end
