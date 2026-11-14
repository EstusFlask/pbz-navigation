-- Exercise the real ModConfig row/overlay path with a small native widget model.
local function widget(kind)
    local value={kind=kind,visibility=0,children={}}
    function value:IsValid()return not self.dead end
    function value:GetClass()return self.kind end
    function value:GetParent()return self.parent end
    function value:SetVisibility(v)self.visibility=v end
    function value:AddChild(child)
        self.children[#self.children+1]=child;child.parent=self;return widget('Slot')
    end
    function value:RemoveFromParent()self.parent=nil;self.removed=true end
    return setmetatable(value,{__index=function(_,key)
        if key:match('^Set') or key=='PopulateTextLabels' then return function()end end
    end})
end
local function nativeRow(kind)
    local row=widget(kind)
    row.Text_SettingName=widget('Label')
    row.Rotator_SettingValue=widget('Button')
    row.Button_Decrease=widget('Button');row.Button_Increase=widget('Button')
    row.DecreaseOverlay=widget('Overlay');row.IncreaseOverlay=widget('Overlay')
    row.OptionsScalingSizeBox=widget('SizeBox')
    return row
end
local W={V={Visible=0,Collapsed=1,Hidden=2,HitTestInvisible=3,SelfHitTestInvisible=4},
    valid=function(v)return type(v)=='table' and not v.dead end,is=function()return false end,
    text=function()end,asText=function(v)return v end,replaceControl=function()end,
    native=function(_,kind)return widget(kind)end,widget=function(_,kind)return nativeRow(kind)end}
package.loaded.PbzNativeWidgets=W
package.loaded.PbzNativeEvents={create=function()return {bindClick=function()end,dispose=function()return true end,discardWorld=function()end}end}
StaticFindObject=function()return widget('Class')end
local original=require
if row_patch and not row_patch_late then assert(loadfile(adapter_scripts..'/PBZModConfigHost.lua'))() end
local Rows=require('PbzNativeRows')
if row_patch then
    if row_patch_late then assert(loadfile(adapter_scripts..'/PBZModConfigHost.lua'))() end
    assert(require==original,'compatibility host did not restore require')
    local create=Rows.create
    assert(loadfile(adapter_scripts..'/PBZModConfigHost.lua'))()
    assert(Rows.create==create,'duplicate compatibility host')
end
local editors=require('PbzEditors').create({host={},word=function(k)return k end,refresh=function()end})
local function model(visible,provider)
    return editors.rows({type='color',key='ThreadCustomColor',id='PBZQuestRoute/ThreadCustomColor',providerId=provider or 'PBZQuestRoute',
        label='Custom color',value='#3895FF',visible=visible})[1]
end
local function visible(w)
    while w do if w.visibility==W.V.Collapsed or w.visibility==W.V.Hidden or w.removed then return false end;w=w.parent end
    return true
end
local host=widget('List')
local row=Rows.create({},host,model(false),function()end)
-- The installed Runtime sets visibility on entry.row, while the swatch is its sibling.
row.row:SetVisibility(W.V.Collapsed)
assert(not visible(row.swatch),'red/blue preset still shows the hidden custom-color blue square')
row.update(model(true));row.row:SetVisibility(W.V.SelfHitTestInvisible)
assert(visible(row.swatch),'custom color preview did not reappear')
row.update(model(false));row.row:SetVisibility(W.V.Collapsed)
assert(not visible(row.swatch),'switching back to red left a floating swatch')
row.update(model(true));row.row:SetVisibility(W.V.SelfHitTestInvisible)
assert(visible(row.swatch))
assert(row.dispose());row.outer.dead=true;row.update(model(false))
local discarded=Rows.create({},host,model(true),function()end)
discarded.discardWorld();discarded.outer.dead=true;discarded.update(model(false))
local other=Rows.create({},host,model(false,'AnotherMod'),function()end)
other.row:SetVisibility(W.V.Collapsed)
assert(visible(other.swatch),'navigation changed another provider')
other.dispose()
print('PASS: actual ModConfig hidden/custom/preset row swatch lifecycle; other providers unchanged')
