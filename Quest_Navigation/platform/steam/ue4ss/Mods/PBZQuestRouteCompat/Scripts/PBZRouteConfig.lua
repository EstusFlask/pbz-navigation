-- Navigation owns this provider and its settings file. ModConfig owns the UI.
local Core = require('PbzConfigCore')
local json = Core.json
local M = {}
local function text(en, zh, hant) return {en=en, ['zh-Hans']=zh, ['zh-Hant']=hant or zh} end
M.descriptor = {
    apiVersion=1, modId='PBZQuestRoute', modVersion='1.11.5', schemaVersion=1,
    displayName=text('Quest & Exploration Navigation', '任务与探索导航', '任務與探索導航'),
    groups={{id='thread', label=text('Guiding thread', '导航绳子', '導航繩子'), order=0}},
    entries={
        {key='ThreadColor', group='thread', type='choice', defaultValue='blue',
            label=text('Rope color', '绳子颜色', '繩子顏色'),
            options={{value='red',label=text('Red','红色','紅色')},
                {value='blue',label=text('Blue','蓝色','藍色')},
                {value='custom',label=text('Custom','自定义','自訂')}}},
        {key='ThreadCustomColor', group='thread', type='color', defaultValue='#3895FF', alpha=false,
            label=text('Custom color', '自定义颜色', '自訂顏色'),
            description=text('Applies to the scene guiding rope immediately.', '即时应用到场景中的导航绳子。', '即時套用至場景中的導航繩子。'),
            visibleWhen={key='ThreadColor', equals='custom'}},

    }
}

function M.create(options)
    options = options or {}
    local schema = Core.compile(M.descriptor)
    local path = assert(options.path, 'ROUTE_SETTINGS_PATH_UNAVAILABLE')
    local read = options.read or function()
        local file = io.open(path, 'rb'); if not file then return nil end
        local value = file:read(65537); file:close()
        return value and #value <= 65536 and value or nil
    end
    local write = options.write or function(value)
        local file, err = io.open(path, 'wb'); if not file then error(err,0) end
        local ok, problem = file:write(value)
        local closed, closeError = file:close()
        assert(ok and closed, problem or closeError)
    end
    local values, revision, listeners = Core.copy(schema.defaults), 0, {}
    local dirty, persistence = false, {state='saved'}
    local raw = read()
    if raw then
        local ok, saved = pcall(json.decode, raw)
        if ok and type(saved)=='table' and saved.schemaVersion==1 and type(saved.values)=='table' then
            for key, entry in pairs(schema.values) do
                if Core.valueError(entry,saved.values[key])==nil then values[key]=saved.values[key] end
            end
        end
    end
    local self = Core.copy(M.descriptor)
    function self.read()
        return {revision=revision,values=Core.copy(values),persistence=Core.copy(persistence)}
    end
    local function notify()
        for callback in pairs(listeners) do pcall(callback,self.read()) end
    end
    function self.subscribe(callback)
        listeners[callback]=true
        return function() listeners[callback]=nil end
    end
    function self.flush()
        if not dirty then return {ok=true,revision=revision} end
        local ok, err = pcall(write,json.encode({schemaVersion=1,values=values}))
        persistence = ok and {state='saved'} or {state='error',error=tostring(err)}
        dirty = not ok; notify()
        return {ok=ok,revision=revision,error=not ok and 'SAVE_FAILED' or nil}
    end
    function self.apply(patch,context)
        if context and context.baseRevision~=nil and context.baseRevision~=revision then
            return {ok=false,error='REVISION_CONFLICT',revision=revision}
        end
        local errors = Core.validatePatch(schema,patch,values)
        if next(errors) then return {ok=false,error='VALIDATION_FAILED',fields=errors,revision=revision} end
        local changed = false
        for key, value in pairs(patch) do if values[key]~=value then changed=true;values[key]=value end end
        if changed then revision=revision+1;dirty=true end
        local result = self.flush()
        if changed then notify() end
        return result
    end
    function self.reset(group,context)
        if group~=nil and not schema.groups[group] then return {ok=false,error='UNKNOWN_GROUP',revision=revision} end
        local patch={}
        for key,value in pairs(schema.defaults) do
            if group==nil or schema.entries[key].group==group then patch[key]=Core.copy(value) end
        end
        return self.apply(patch,context)
    end
    return self
end
return M
