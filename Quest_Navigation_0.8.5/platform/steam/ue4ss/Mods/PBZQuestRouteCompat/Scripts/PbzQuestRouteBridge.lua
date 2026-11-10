-- Owned by Quest Navigation; loaded in the tracker's VM without editing it.
local M = {}
local PROTOCOL = 'PBZQuestRouteTracker'
function M.install(options)
    options = options or {}
    local Target = options.target or require('PbzMapTarget')
    if Target.__questRouteBridge then return Target.__questRouteBridge end
    local json = require('dkjson')
    local now = options.clock or function() return os.time() * 1000 end
    local schedule = options.schedule or ExecuteInGameThreadWithDelay
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
    local control = {session = tostring(now()) .. '-' .. tostring({}), revision = 0, selectionRevision = 0, active = true}
    local current, unsubscribe, lastCommand, lastWrite, reason, selection, hover, hoverSignature
    local undoSelection = {}
    local function plainOf(target)
        if not target then return nil end
        local plain = {}
        for _, key in ipairs({'key','mapID','location','title','name','trackingMode','hintOnly'}) do plain[key] = target[key] end
        return plain
    end
    local function publish()
        local target = current and current.read().target
        write('PBZQuestRoute-tracker.json', json.encode({protocol=PROTOCOL,version=1,session=control.session,
            revision=control.revision,writtenAt=now(),target=plainOf(target),reason=reason,
            hover=hover,selectionRevision=control.selectionRevision}))
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
    function control.watchSelection(service)
        for _, undo in ipairs(undoSelection) do undo() end
        undoSelection = {}; selection = service; hover = nil; hoverSignature = nil
        control.selectionRevision = control.selectionRevision + 1
        if service then
            for _, name in ipairs({'select','selectAt','selectIndex','selectNext','selectPrevious','clearSelection','setMarkers'}) do
                local original = service[name]
                if type(original) == 'function' then
                    local wrapped = function(...)
                        local result = table.pack(original(...))
                        pcall(refreshHover)
                        return table.unpack(result, 1, result.n)
                    end
                    service[name] = wrapped
                    undoSelection[#undoSelection+1] = function() if service[name] == wrapped then service[name] = original end end
                end
            end
        end
        pcall(refreshHover)
    end
    local create = Target.create
    Target.create = function(...)
        local api = create(...)
        if unsubscribe then unsubscribe() end
        control.watchSelection(nil)
        current = api
        control.revision = control.revision + 1
        reason = 'restore'
        unsubscribe = api.subscribe(function(event)
            control.revision = control.revision + 1
            reason = event.reason or 'selected'
            -- A bridge write failure must not break the author's selection.
            local ok, err = pcall(publish)
            if not ok and options.report then options.report('ROUTE_BRIDGE_WRITE_FAILED', err) end
        end)
        pcall(publish)
        return api
    end
    function control.poll()
        local text = read('PBZQuestRoute-command.json')
        if text and text ~= lastCommand then
            local cmd = json.decode(text)
            if type(cmd) == 'table' and cmd.protocol == PROTOCOL and cmd.version == 1 then
                lastCommand = text
                local selected = current and current.read().target
                -- Late cancellation cannot clear a newer item or another session.
                if cmd.action == 'select' and cmd.session == control.session and selection
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
        if unsubscribe then unsubscribe(); unsubscribe = nil end
        control.watchSelection(nil)
        Target.create = create
        Target.__questRouteBridge = nil
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
