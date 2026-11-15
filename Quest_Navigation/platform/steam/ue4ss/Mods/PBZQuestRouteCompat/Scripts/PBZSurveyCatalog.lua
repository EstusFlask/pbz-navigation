-- Navigation-owned development catalog extension inside the real tracker VM.
local M={}
function M.apply(catalog,data)
    assert(type(catalog)=='table' and type(catalog.points)=='table','SURVEY_CATALOG_UNSUPPORTED')
    assert(type(data)=='table' and data.schema==1 and type(data.points)=='table','SURVEY_DATA_INVALID')
    if catalog.__questRouteSurveys then return catalog.__questRouteSurveys end
    local control={added={},active=true,undo={},bySaveId={},completed={},repos=setmetatable({},{__mode='k'}),presentations=setmetatable({},{__mode='k'})}
    for _,point in ipairs(data.points) do
        assert(type(point.survey)=='table' and type(point.saveId)=='string' and point.saveId:match('^pbz%-survey:'),'SURVEY_POINT_INVALID')
        assert(not control.bySaveId[point.saveId] and type(point.location)=='table' and #point.location==3,'SURVEY_POINT_DUPLICATE')
        for i=1,3 do local n=point.location[i];assert(type(n)=='number'and n==n and math.abs(n)<math.huge,'SURVEY_LOCATION_INVALID')end
        control.bySaveId[point.saveId]=point
    end
    for _,point in ipairs(data.points) do
        catalog.points[#catalog.points+1]=point;control.added[point]=true
    end
    local function owned(record)
        if type(record)~='table'then return nil end
        if type(record.source)=='table'then
            local point=control.bySaveId[record.source.saveId];if point then return point end
        end
        return control.bySaveId[record.saveId]
    end
    function control.collections(rules,repository)
        assert(type(rules)=='table' and type(rules.collected)=='function','SURVEY_COLLECTION_RULES_UNSUPPORTED')
        local collected=rules.collected
        local wrapper=function(collection,...)
            local point=owned(collection)
            if point then local done=control.completed[point.survey.id];return done and done.revision==point.survey.revision or false end
            return collected(collection,...)
        end
        rules.collected=wrapper
        control.undo[#control.undo+1]=function()if rules.collected==wrapper then rules.collected=collected end end
        assert(type(repository)=='table' and type(repository.create)=='function','SURVEY_REPOSITORY_UNSUPPORTED')
        local create=repository.create;local factory
        factory=function(options,...)
            local opts={};for k,v in pairs(options)do opts[k]=v end;setmetatable(opts,getmetatable(options))
            local eligible=options.isEligible
            opts.isEligible=function(record,...)
                if owned(record)then return control.active end
                return not eligible or eligible(record,...)
            end
            local result=table.pack(create(opts,...));local repo=result[1];control.repos[repo]=true
            return table.unpack(result,1,result.n)
        end
        repository.create=factory
        control.undo[#control.undo+1]=function()if repository.create==factory then repository.create=create end end
    end
    local function decodeText(text)
        if not text then return nil end
        if text:sub(1,2)=='\255\254' or text:sub(1,2)=='\254\255'then
            local little=text:sub(1,2)=='\255\254';local out={};local at=3
            local function unit()local a,b=text:byte(at,at+1);at=at+2;if not b then error('SURVEY_PROGRESS_UTF16_TRUNCATED')end;return little and a+b*256 or a*256+b end
            while at<=#text do
                local n=unit()
                if n>=0xD800 and n<=0xDBFF then local low=unit();assert(low>=0xDC00 and low<=0xDFFF,'SURVEY_PROGRESS_SURROGATE');n=0x10000+(n-0xD800)*1024+low-0xDC00 end
                out[#out+1]=utf8.char(n)
            end
            return table.concat(out)
        end
        return text:gsub('^\239\187\191','')
    end
    function control.refresh(force)
        if not control.root then return end
        local now=os.time();if not force and now==control.lastRead then return end;control.lastRead=now
        local file=io.open(control.root..'PBZQuestRoute-surveys.json','rb');if not file then return end
        local text=file:read(262145);file:close();assert(#text<=262144,'SURVEY_PROGRESS_TOO_LARGE')
        if text==control.lastText then return end
        local progress=assert(require('dkjson').decode(decodeText(text)));assert(progress.schema==1 and type(progress.completed)=='table','SURVEY_PROGRESS_INVALID')
        control.completed=progress.completed;control.lastText=text
        for repo in pairs(control.repos)do if type(repo.invalidateDomain)=='function'then repo.invalidateDomain()end end
    end
    function control.setRoot(root)
        control.root=root:gsub('[/\\]+$','')..'/';control.refresh(true)
    end
    function control.presentation(module)
        assert(type(module)=='table' and type(module.create)=='function','SURVEY_PRESENTATION_UNSUPPORTED')
        local create=module.create
        local wrapped
        wrapped=function(...)
            local values=table.pack(create(...));local service=values[1]
            if type(service)~='table' or type(service.describe)~='function'then control.stop();return table.unpack(values,1,values.n)end
            local describe,sync=service.describe,service.sync;local language='zh'
            local syncWrapper=function(...)
                local locale=select(2,...);if type(locale)=='string'then language=locale:lower()end
                return sync(...)
            end
            local describeWrapper=function(record,...)
                local view=describe(record,...);local point=owned(record)
                if type(view)=='table' and point then
                    local survey=point.survey
                    local title=language:match('^en') and ('Route '..survey.number..(survey.role=='start'and' Start'or' End'))or survey.name
                    view.name=title;view.title=title;view.sourceHint=point.sourceHint
                    view.color=survey.role=='start'and{.2,1,.42}or{1,.57,.12}
                end
                return view
            end
            service.describe=describeWrapper;if type(sync)=='function'then service.sync=syncWrapper end
            control.presentations[service]={describe=describe,sync=sync,describeWrapper=describeWrapper,syncWrapper=syncWrapper}
            return table.unpack(values,1,values.n)
        end
        module.create=wrapped
        control.undo[#control.undo+1]=function()if module.create==wrapped then module.create=create end end
    end
    function control.stop()
        if not control.active then return end;control.active=false
        for i=#control.undo,1,-1 do control.undo[i]()end
        for service,prior in pairs(control.presentations)do
            if service.describe==prior.describeWrapper then service.describe=prior.describe end
            if service.sync==prior.syncWrapper then service.sync=prior.sync end
        end
        for i=#catalog.points,1,-1 do if control.added[catalog.points[i]]then table.remove(catalog.points,i)end end
        for repo in pairs(control.repos)do if type(repo.invalidateDomain)=='function'then pcall(repo.invalidateDomain)end end
        if catalog.__questRouteSurveys==control then catalog.__questRouteSurveys=nil end
    end
    catalog.__questRouteSurveys=control;return control
end
return M
