-- Add reviewed Chinese acquisition facts to the author's in-memory catalogue.
-- Source files, save IDs, coordinates, filters and other languages are retained.
local M={}
function M.apply(catalog,data)
    assert(type(catalog)=='table' and type(catalog.points)=='table', 'ITEM_HINT_CATALOG_UNSUPPORTED')
    assert(type(data)=='table' and data.schema==1 and type(data.patches)=='table', 'ITEM_HINT_DATA_INVALID')
    local byId={}
    for _,r in ipairs(data.patches) do byId[r.saveId]=r end
    local changed={}
    for _,point in ipairs(catalog.points) do
        local row=byId[point.saveId]
        if row and point.sourceHint==row.original and type(point.location)=='table' and type(point.contents)=='table' then
            -- ID reuse or a changed content table in a later release must not
            -- attach a valid old hint to a different item.
            local same=#point.contents==#row.itemKeys
            for i=1,3 do same=same and type(point.location[i])=='number' and math.abs(point.location[i]-row.location[i])<3 end
            for i,item in ipairs(point.contents) do same=same and (item.nameKey or item.id)==row.itemKeys[i] end
            if same then
                changed[#changed+1]={point=point,original=point.sourceHint,patched=row.hint}
                point.sourceHint=row.hint
            end
        end
    end
    return #changed,function()
        for _,r in ipairs(changed) do if r.point.sourceHint==r.patched then r.point.sourceHint=r.original end end
    end
end
return M
