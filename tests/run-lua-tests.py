"""Run with Python + lupa (Lua 5.4), or run tracker-bridge.lua with a Lua 5.4 CLI."""
from pathlib import Path
import os
import sys
import subprocess
import tempfile
from collector_fixture import original_fixture

# Optional isolated test dependency location; nothing is installed in the game.
sys.path.insert(0, str(Path(os.environ.get('TEMP', '.')) / 'pbz-navigation-test-deps'))
from lupa.lua54 import LuaRuntime

root = Path(__file__).resolve().parents[1]
adapter = root / 'Quest_Navigation_0.8.5/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts'
fixtures=[original_fixture(root),next(root.glob('Map_Collectible_Tracker_1.0.14*'))]
for fixture in fixtures:
    lua = LuaRuntime()
    scripts = fixture / 'platform/steam/ue4ss/Mods/PbzMapTracker/Scripts'
    lua.globals().test_scripts = scripts.as_posix()
    lua.globals().adapter_scripts = adapter.as_posix()
    lua.execute("package.path = adapter_scripts .. '/?.lua;' .. test_scripts .. '/?.lua;' .. package.path")
    print('Testing real collector:', fixture.name, flush=True)
    lua.execute((root / 'tests/tracker-bridge.lua').read_text(encoding='utf-8'))
    lua.execute((root / 'tests/compat-contract.lua').read_text(encoding='utf-8'))
    lua.execute((root / 'tests/item-hints.lua').read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory(prefix='pbz-bridge-') as folder:
        lua.globals().bridge_test_root = Path(folder).as_posix()
        lua.execute((root / 'tests/host-bootstrap.lua').read_text(encoding='utf-8'))
        lua.execute("""
            roundtrip = require('PbzQuestRouteBridge').install({root=bridge_test_root,schedule=function() end})
            roundtrip_target = require('PbzMapTarget').create()
            roundtrip_target.set({key='roundtrip',mapID='pbz_pangzhen_wp',location={111,222,333}})
            roundtrip_selection=require('PbzMapSelection').create({target=roundtrip_target})
            roundtrip.watchSelection(roundtrip_selection)
            roundtrip_selection.setMarkers({{key='upper-roundtrip',mapID='pbz_pangzhen_wp',location={111,222,2333}}})
            roundtrip_selection.select('upper-roundtrip')
        """)
        subprocess.run(['node',str(root/'tests/bridge-roundtrip.cjs'),folder,'middle'],check=True)
        lua.execute("roundtrip.poll(); assert(roundtrip_target.read().target.location[3]==2333)")
        print('PASS: Lua hovered item -> JavaScript middle-click -> Lua manual target, height 2333 preserved')
        lua.execute("roundtrip_target.set({key='roundtrip',mapID='pbz_pangzhen_wp',location={111,222,333}})")
        subprocess.run(['node', str(root / 'tests/bridge-roundtrip.cjs'), folder], check=True)
        lua.execute("roundtrip.poll(); assert(roundtrip_target.read().target == nil); roundtrip.stop()")
        print('PASS: collector Lua -> real files -> JavaScript route Tracker -> cancel -> collector Lua')

