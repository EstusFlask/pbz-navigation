-- Independent of Map Tracker. The C++ component still attaches only the
-- collectible bridge to the collector's VM; this VM owns navigation settings.
local function report(code, detail)
    print('[PBZQuestRouteConfig] ' .. code .. ' ' .. tostring(detail or '') .. '\n')
end
if type(ExecuteInGameThread)~='function' then report('UNAVAILABLE','game thread scheduler');return end
ExecuteInGameThread(function()
    if rawget(_G,'__PBZQuestRouteConfig') then return end
    local ok, err = pcall(function()
        local library=StaticFindObject('/Script/Engine.Default__KismetSystemLibrary')
        assert(library and library:IsValid(),'SETTINGS_LIBRARY_UNAVAILABLE')
        local absolute=library:ConvertToAbsolutePath(library:GetProjectSavedDirectory())
        local root=(type(absolute)=='string' and absolute or absolute:ToString()):gsub('[/\\]+$','')
        local provider=require('PBZRouteConfig').create({path=root..'/PBZQuestRoute-settings.json'})
        local client=require('PbzModConfigClient').register(provider,{report=report})
        rawset(_G,'__PBZQuestRouteConfig',{provider=provider,client=client})
        report('REGISTERED','PBZQuestRoute rope colors')
    end)
    if not ok then report('START_FAILED',err) end
end)
