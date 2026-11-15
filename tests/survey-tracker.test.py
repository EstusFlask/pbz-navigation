"""Exercise the real collector catalog/compose/name/selection through our VM host."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(os.environ.get('TEMP', '.'))/'pbz-navigation-test-deps'))
from lupa.lua54 import LuaRuntime
from collector_fixture import current_fixture

ADAPTER = ROOT/'Quest_Navigation/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts'


class TrackerSurveys(unittest.TestCase):
    def run_host(self, fixture, development):
        temp = tempfile.TemporaryDirectory(prefix='pbz-real-survey-')
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        scripts = root/'adapter'
        scripts.mkdir()
        for file in ADAPTER.glob('*.lua'):
            shutil.copy2(file, scripts/file.name)
        (scripts/'PBZRouteBuild.lua').write_text('return {development='+str(development).lower()+'}\n', encoding='utf-8')
        lua = LuaRuntime()
        lua.globals().adapter_scripts = scripts.as_posix()
        lua.globals().tracker_scripts = (fixture/'platform/steam/ue4ss/Mods/PbzMapTracker/Scripts').as_posix()
        lua.globals().saved_root = root.as_posix()
        lua.execute("""
            package.path=adapter_scripts..'/?.lua;'..tracker_scripts..'/?.lua;'..package.path
            ExecuteInGameThreadWithDelay=function(delay,fn) assert(delay==200) end
            StaticFindObject=function() return {IsValid=function()return true end,
                GetProjectSavedDirectory=function()return saved_root end,
                ConvertToAbsolutePath=function(_,path)return path end} end
            assert(loadfile(adapter_scripts..'/PBZTrackerHost.lua'))()
            require('PbzMapTarget');require('PbzMapSelection')
        """)
        return lua, root

    def test_real_tracker_sees_named_selectable_survey_items(self):
        for fixture in [current_fixture(ROOT)]:
            with self.subTest(fixture=fixture.name):
                lua, root = self.run_host(fixture, True)
                lua.execute("""
                    local catalog=require('PbzMapCatalog')
                    local records=require('PbzCollectibleCompose').compose({},catalog.points,function()return'XiGu'end)
                    local surveys={}
                    for _,r in ipairs(records)do if r.source and r.source.survey then surveys[#surveys+1]=r end end
                    assert(#surveys==94,'real collector has '..#surveys..' survey items; expected 94')
                    local api={call=function()return'official'end,valid=function()return true end,default=function()return{}end,
                        asset=function()return{}end,worldSubsystem=function()return{}end,name=function()return'name'end,str=tostring}
                    local presentation=require('PbzNativePresentation').create(api);presentation.sync({},'zh-Hans')
                    for _,point in ipairs(catalog.points)do
                        if point.contents[1]and point.contents[1].nameKey=='Item_Weapon_TierUp_001'then
                            local other=require('PbzCollectibleCompose').compose({}, {point},function()return'XiGu'end)[1]
                            assert(presentation.describe(other,point.contents).name=='鸽饲料','survey names changed a real collectible')
                            break
                        end
                    end
                    local record=surveys[1];local view=presentation.describe(record,record.source.contents)
                    assert(view.name=='1号路线开始','real tracker tooltip name is '..tostring(view.name))
                    assert(view.sourceHint:find('轻攻击',1,true),'real tracker tooltip lost capture instructions')
                    local config=require('PbzMapConfigSchema').values;test_clock=100000
                    local repo=require('PbzCollectibleRepository').create({
                        config={read=function()return{revision=1,values=config}end,categoryVisible=function()return true end},
                        services=function()return{save={},state={}}end,now=function()return test_clock end,
                        isEligible=function()return false end,isExplored=function()return true end,
                        describe=function(...)return presentation.describe(...)end,mapForLocation=function()return'XiGu'end,
                        presentationRevision=function()return presentation.revision()end})
                    local points={};for _,r in ipairs(surveys)do points[#points+1]=r.source end
                    repo.replace({points=points,nativeDetails={},iconLayouts={}},{})
                    local markers=repo.snapshot(record.mapID);local marker
                    assert(#repo.snapshot('XiGu')==12,'real tracker did not expose all six Xigu routes')
                    for _,r in ipairs(markers)do if r.key==record.key then marker=r end end
                    local brief={};for k,v in pairs(markers[1]or{})do brief[k]=type(v)=='table'and('table '..tostring(v.key))or v end
                    assert(marker and marker.title=='1号路线开始','real repository did not publish the named survey marker: '..require('dkjson').encode(brief))
                    local target=require('PbzMapTarget').create()
                    local selection=require('PbzMapSelection').create({target=target})
                    marker.x=120;marker.y=140;marker.w=24;marker.h=24
                    selection.setMarkers({marker});selection.selectAt({x=132,y=152},{marker})
                    assert(selection.selectedKey()==record.key and selection.selected().title=='1号路线开始')
                    selection.trackSelected()
                    assert(target.read().target.key==record.key and target.read().target.location[3]==record.location[3])
                    test_repo=repo;test_record=record;test_catalog=catalog
                    test_selection=selection;test_markers=markers
                """)
                subprocess.run(['node',str(ROOT/'tests/survey-tracker-roundtrip.cjs'),str(root),'start'],check=True,cwd=ROOT)
                lua.execute("""
                    local key='pbz:world:pbz-survey:b03:end'
                    test_selection.setMarkers(test_markers)
                    test_selection.select(key);test_selection.trackSelected()
                """)
                subprocess.run(['node',str(ROOT/'tests/survey-tracker-roundtrip.cjs'),str(root),'end'],check=True,cwd=ROOT)
                (root/'PBZQuestRoute-surveys.json').write_bytes(json.dumps(dict(schema=1, completed={'B03':{'revision':1}})).encode('utf-16'))
                lua.execute("""
                    local host=rawget(_G,'__PBZQuestRouteHost');host.surveys.refresh(true)
                    assert(require('PbzCollectibleRules').collected(test_record.collection,{})==true,'completed collection rule failed')
                    test_clock=test_clock+5000
                    local markers=test_repo.snapshot(test_record.mapID);local marker
                    for _,r in ipairs(markers)do if r.key==test_record.key then marker=r end end
                    assert(not marker,'completed survey stayed in the real tracker visible marker list')
                    host.stop()
                    for _,point in ipairs(test_catalog.points)do assert(not point.survey,'survey catalog cleanup failed')end
                """)

    def test_standard_host_does_not_add_surveys_even_with_leftover_development_files(self):
        lua, root = self.run_host(next(ROOT.glob('Map_Collectible_Tracker_1.0.14*')), False)
        lua.execute("""
            for _,p in ipairs(require('PbzMapCatalog').points)do assert(not p.survey)end
            rawget(_G,'__PBZQuestRouteHost').stop()
        """)


if __name__ == '__main__':
    unittest.main()
