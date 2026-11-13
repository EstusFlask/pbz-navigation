local Hints=assert(loadfile(adapter_scripts..'/PBZItemHints.lua'))()
local data=assert(loadfile(adapter_scripts..'/PBZItemHintsData.lua'))()
local cat=require('PbzMapCatalog')
local count,undo=Hints.apply(cat,data)
assert(count==170,'reviewed catalogue coverage changed: '..count)
local pigeon
for _,r in ipairs(cat.points) do if r.contents[1] and r.contents[1].nameKey=='Item_Weapon_TierUp_001' then pigeon=r;break end end
assert(pigeon and pigeon.sourceHint:find('虎炮'))
local again,undoAgain=Hints.apply(cat,data)
assert(again==0,'hints were appended twice');undoAgain()
-- Exercise the real presentation used by the tracker tooltip, not a JSON dump.
local api={call=function() return 'official' end,valid=function() return true end,default=function() return {} end,
    asset=function() return {} end,worldSubsystem=function() return {} end,name=function() return 'name' end,str=tostring}
local record
for _,r in ipairs(require('PbzCollectibleCompose').compose({},cat.points,function()return 'XiGu'end)) do
    if r.source and r.source.saveId==pigeon.saveId then record=r;break end
end
assert(record,'real compose discarded the source record')
local zh=require('PbzNativePresentation').create(api);zh.sync({},'zh-Hans')
local view=zh.describe(record,pigeon.contents)
assert(view.name=='鸽饲料' and view.sourceHint:find('虎炮') and view.sourceHint:find('长柄金瓜'),'real tooltip missed the hint')
local en=require('PbzNativePresentation').create(api);en.sync({},'en-US')
local english=en.describe(record,pigeon.contents)
assert(not english.sourceHint:find('虎炮'),'Chinese hints replaced another language')
undo();assert(pigeon.sourceHint=='开启宝箱')
local old=pigeon.sourceHint;pigeon.sourceHint='new author description'
local n,restore=Hints.apply(cat,{schema=1,patches={data.patches[1]}});restore()
assert(pigeon.sourceHint=='new author description','new author text was overwritten');pigeon.sourceHint=old
local row=data.patches[1]
local fake={saveId=row.saveId,sourceHint=row.original,location={0,0,0},contents={}}
assert(Hints.apply({points={fake}},data)==0,'reused IDs or different content accepted an old hint')
print('PASS: 170 reviewed hints, real pigeon tooltip, English preserved, idempotence, changed-ID/content guard, cleanup')
