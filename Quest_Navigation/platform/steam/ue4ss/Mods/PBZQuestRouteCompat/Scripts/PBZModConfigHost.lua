-- Navigation-owned compatibility fix, loaded in ModConfig's VM before its entry.
-- ModConfig 1.0.4 hides entry.row, but the color swatch is its sibling in entry.outer.
-- Keep only navigation's custom-color container in sync; never edit framework files.
if rawget(_G,'__PBZQuestRouteConfigHost') then return end
local original=require
local control={}
rawset(_G,'__PBZQuestRouteConfigHost',control)
local wrapped
local function attach(Rows)
    if type(Rows)~='table' or type(Rows.create)~='function' then return false end
    local Widgets=package.loaded.PbzNativeWidgets
    if type(Widgets)~='table' or type(Widgets.valid)~='function' or type(Widgets.V)~='table' then return false end
    local create=Rows.create
    Rows.create=function(owner,host,model,...)
        local entry=create(owner,host,model,...)
        if model.providerId~='PBZQuestRoute' or model.key~='ThreadCustomColor'
            or not Widgets.valid(entry.swatch) or not Widgets.valid(entry.outer) then return entry end
        local update,dispose,discard=entry.update,entry.dispose,entry.discardWorld
        if type(update)~='function' or type(dispose)~='function' or type(discard)~='function' then return entry end
        local active=true
        local function visibility(value)
            if active and Widgets.valid(entry.outer) then
                entry.outer:SetVisibility(value.visible==false and Widgets.V.Collapsed or Widgets.V.SelfHitTestInvisible)
            end
        end
        entry.update=function(value)
            if not active then return end
            update(value);visibility(value)
        end
        entry.dispose=function(...)active=false;return dispose(...)end
        entry.discardWorld=function(...)active=false;return discard(...)end
        visibility(model)
        return entry
    end
    if require==wrapped then require=original end
    control.attached=true
    return true
end
if package.loaded.PbzNativeRows then
    attach(package.loaded.PbzNativeRows)
else
    wrapped=function(name,...)
        local values=table.pack(original(name,...))
        if name=='PbzNativeRows' then
            attach(values[1])
            if require==wrapped then require=original end
        end
        return table.unpack(values,1,values.n)
    end
    require=wrapped
end
