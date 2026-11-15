-- Owned by Quest Navigation; loaded in the tracker's VM without editing it.
local M = {}
local PROTOCOL = 'PBZQuestRouteTracker'
local function hasFunctions(value, names)
    if type(value) ~= 'table' then return false end
    for _, name in ipairs(names) do if type(value[name]) ~= 'function' then return false end end
    return true
end
M.targetModule = function(value) return hasFunctions(value, {'create'}) end
M.selectionModule = M.targetModule
M.targetService = function(value) return hasFunctions(value, {'read','subscribe','clear'}) end
M.selectionService = function(value) return hasFunctions(value, {'selected','selectedKey','trackSelected'}) end
function M.install(options)
    options = options or {}
    local Target = options.target or require('PbzMapTarget')
    assert(M.targetModule(Target), 'ROUTE_TARGET_CONTRACT_UNSUPPORTED')
    if Target.__questRouteBridge then return Target.__questRouteBridge end
    local json = require('dkjson')
    local now = options.clock or function() return os.time() * 1000 end
    local schedule = options.schedule or ExecuteInGameThreadWithDelay
    assert(type(schedule)=='function', 'ROUTE_GAME_THREAD_SCHEDULER_UNAVAILABLE')
    local root = options.root
    if not root then
        local k = StaticFindObject('/Script/Engine.Default__KismetSystemLibrary')
        assert(k and k:IsValid(), 'ROUTE_BRIDGE_LIBRARY_UNAVAILABLE')
        local saved = k:GetProjectSavedDirectory()
        local absolute = k:ConvertToAbsolutePath(saved)
        root = (type(absolute) == 'string' and absolute or absolute:ToString()):gsub('\\', '/')
    end
    root = root:gsub('[/\\]+$', '') .. '/'
    local function read(name)
        local f = io.open(root .. name, 'rb'); if not f then return nil end
        local text = f:read(65537); f:close()
        if not text or #text > 65536 then return nil end
        return text
    end
    local function write(name, text)
        local f = assert(io.open(root .. name, 'wb'))
        local ok, err = f:write(text); f:close(); assert(ok, err)
    end
    read, write = options.read or read, options.write or write
    local control = {session = tostring(now()) .. '-' .. tostring({}), revision = 0, selectionRevision = 0, markerRevision = 0, active = true,savedRoot=root}
    local current, unsubscribe, lastCommand, lastWrite, reason, selection, hover, hoverSignature
    local markers, markerIndex, markerSignature = {}, {}, nil
    local undoSelection = {}
    local function plainOf(target)
        if not target then return nil end
        local plain = {}
        for _, key in ipairs({'key','mapID','location','title','name','trackingMode','hintOnly','kind','collected','visible'}) do plain[key] = target[key] end
        return plain
    end
    local function publish()
        local target = current and current.read().target
        write('PBZQuestRoute-tracker.json', json.encode({protocol=PROTOCOL,version=1,session=control.session,
            revision=control.revision,writtenAt=now(),target=plainOf(target),reason=reason,
            hover=hover,selectionRevision=control.selectionRevision,
            markers=markers,markerRevision=control.markerRevision}))
        lastWrite = now()
    end
    local function refreshHover()
        local point = selection and selection.selected()
        local plain = plainOf(point)
        local signature = json.encode(plain)
        if signature == hoverSignature then return end
        hover, hoverSignature = plain, signature
        control.selectionRevision = control.selectionRevision + 1
        publish()
    end
    local function refreshMarkers(rows)
        local nextRows, index = {}, {}
        for _, row in ipairs(type(rows)=='table' and rows or {}) do
            local p=plainOf(row)
            if p and p.key and p.mapID and type(p.location)=='table' and #p.location>=3
                and not p.collected and p.visible~=false then
                local valid=true
                for i=1,3 do local n=p.location[i];if type(n)~='number' or n~=n or math.abs(n)==math.huge then valid=false end end
                if valid and not index[p.key] then
                    p.location={p.location[1],p.location[2],p.location[3]}
                    nextRows[#nextRows+1]=p;index[p.key]=p
                end
            end
        end
        local signature=json.encode(nextRows)
        if signature==markerSignature then return end
        markers,markerIndex,markerSignature=nextRows,index,signature
        control.markerRevision=control.markerRevision+1
        publish()
    end
    function control.watchSelection(service)
        if service and not M.selectionService(service) then
            if options.report then options.report('SELECTION_CONTRACT_UNSUPPORTED') end
            return false
        end
        for _, undo in ipairs(undoSelection) do undo() end
        undoSelection = {}; selection = service; hover = nil; hoverSignature = nil
        markers,markerIndex,markerSignature={},{},nil
        control.markerRevision=control.markerRevision+1
        control.selectionRevision = control.selectionRevision + 1
        if service then
            for _, name in ipairs({'select','selectAt','selectIndex','selectNext','selectPrevious','clearSelection','setMarkers'}) do
                local original = service[name]
                if type(original) == 'function' then
                    local wrapped = function(...)
                        local result = table.pack(original(...))
                        if name=='setMarkers' then pcall(refreshMarkers,select(1,...)) end
                        pcall(refreshHover)
                        return table.unpack(result, 1, result.n)
                    end
                    service[name] = wrapped
                    undoSelection[#undoSelection+1] = function() if service[name] == wrapped then service[name] = original end end
                end
            end
        end
        pcall(refreshHover)
        return true
    end
    local create = Target.create
    local wrappedCreate
    wrappedCreate = function(...)
        local result = table.pack(create(...))
        local api = result[1]
        if not M.targetService(api) then
            control.stop()
            if options.onUnsupported then options.onUnsupported('TARGET_SERVICE_CONTRACT_UNSUPPORTED') end
            return table.unpack(result, 1, result.n)
        end
        if unsubscribe then pcall(unsubscribe) end
        control.watchSelection(nil)
        current = api
        control.revision = control.revision + 1
        reason = 'restore'
        local ok, dispose = pcall(api.subscribe, function(event)
            control.revision = control.revision + 1
            reason = type(event)=='table' and event.reason or 'selected'
            -- A bridge write failure must not break the author's selection.
            local ok, err = pcall(publish)
            if not ok and options.report then options.report('ROUTE_BRIDGE_WRITE_FAILED', err) end
        end)
        if not ok or type(dispose) ~= 'function' then
            control.stop()
            if options.onUnsupported then options.onUnsupported('TARGET_SUBSCRIBE_CONTRACT_UNSUPPORTED') end
            return table.unpack(result, 1, result.n)
        end
        unsubscribe = dispose
        pcall(publish)
        return table.unpack(result, 1, result.n)
    end
    Target.create = wrappedCreate
    function control.poll()
        if options.onPoll then
            local ok,err=pcall(options.onPoll)
            if not ok and control.sidecarError~=tostring(err)and options.report then options.report('SURVEY_PROGRESS_WAITING',err)end
            control.sidecarError=not ok and tostring(err)or nil
        end
        local text = read('PBZQuestRoute-command.json')
        if text and text ~= lastCommand then
            local cmd = json.decode(text)
            if type(cmd) == 'table' and cmd.protocol == PROTOCOL and cmd.version == 1 then
                lastCommand = text
                local selected = current and current.read().target
                -- Late cancellation cannot clear a newer item or another session.
                if (cmd.action=='focus' or cmd.action=='select') and cmd.session==control.session and selection
                    and cmd.markerRevision==control.markerRevision and markerIndex[cmd.key]
                    and type(selection.select)=='function' then
                    selection.select(cmd.key)
                    if cmd.action=='select' and selection.selectedKey()==cmd.key then
                        selection.trackSelected({selectReason='navigation controller item'})
                    end
                elseif cmd.action == 'select' and cmd.session == control.session and selection
                    and cmd.selectionRevision == control.selectionRevision and selection.selectedKey() == cmd.key then
                    selection.trackSelected({selectReason='navigation middle-click'})
                elseif selected and cmd.session == control.session and cmd.revision == control.revision
                    and cmd.key == selected.key and cmd.action == 'clear' then
                    current.clear(tostring(cmd.reason or 'route cleared'))
                end
            end
        end
        refreshHover()
        if current and (not lastWrite or now() - lastWrite >= 1000) then publish() end
    end
    function control.stop()
        control.active = false
        if unsubscribe then pcall(unsubscribe); unsubscribe = nil end
        control.watchSelection(nil)
        if Target.create == wrappedCreate then Target.create = create end
        if Target.__questRouteBridge == control then Target.__questRouteBridge = nil end
    end
    Target.__questRouteBridge = control
    local function tick()
        if not control.active then return end
        local ok, err = pcall(control.poll)
        if not ok and options.report then options.report('ROUTE_BRIDGE_POLL_FAILED', err) end
        schedule(200, tick)
    end
    schedule(200, tick)
    return control
end
return M
