"""Run with Python + lupa (Lua 5.4), or run tracker-bridge.lua with a Lua 5.4 CLI."""
from pathlib import Path
import argparse
import os
import sys
import subprocess
import tempfile
from collector_fixture import current_fixture

# Optional isolated test dependency location; nothing is installed in the game.
sys.path.insert(0, str(Path(os.environ.get('TEMP', '.')) / 'pbz-navigation-test-deps'))
from lupa.lua54 import LuaRuntime

root = Path(__file__).resolve().parents[1]
adapter = root / 'Quest_Navigation/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts'
parser = argparse.ArgumentParser()
parser.add_argument('--mod-config-scripts', type=Path, help='Read-only PbzModConfig/Scripts for an actual-host integration test')
args = parser.parse_args()
if args.mod_config_scripts:
    lua = LuaRuntime()
    lua.globals().adapter_scripts = adapter.as_posix()
    lua.globals().framework_scripts = args.mod_config_scripts.resolve().as_posix()
    lua.execute("package.path = adapter_scripts .. '/?.lua;' .. framework_scripts .. '/?.lua;' .. package.path")
    lua.execute((root / 'tests/rope-modconfig-host.lua').read_text(encoding='utf-8'))
    subprocess.run([sys.executable,str(root/'tests/rope-modconfig-rows.py'),
        '--mod-config-scripts',str(args.mod_config_scripts),'--patch'],check=True)
with tempfile.TemporaryDirectory(prefix='pbz-rope-') as folder:
    lua = LuaRuntime()
    lua.globals().adapter_scripts = adapter.as_posix()
    lua.globals().config_test_root = Path(folder).as_posix()
    lua.execute("package.path = adapter_scripts .. '/?.lua;' .. package.path")
    lua.execute((root / 'tests/rope-config.lua').read_text(encoding='utf-8'))
    lua.execute((root / 'tests/navigation-config.lua').read_text(encoding='utf-8'))
    subprocess.run(['node', str(root/'tests/rope-color-roundtrip.cjs'), folder], check=True)
fixtures=[current_fixture(root)]
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
        lua.execute("roundtrip_target.set({key='roundtrip',mapID='pbz_pangzhen_wp',location={111,222,333}}); roundtrip_selection.clearSelection()")
        subprocess.run(['node',str(root/'tests/bridge-roundtrip.cjs'),folder,'controller'],check=True)
        lua.execute("roundtrip.poll(); assert(roundtrip_target.read().target.key=='upper-roundtrip' and roundtrip_target.read().target.location[3]==2333)")
        print('PASS: Lua visible markers -> JavaScript controller focus/confirm -> Lua target without prior hover')
        lua.execute("roundtrip_target.set({key='roundtrip',mapID='pbz_pangzhen_wp',location={111,222,333}})")
        subprocess.run(['node', str(root / 'tests/bridge-roundtrip.cjs'), folder], check=True)
        lua.execute("roundtrip.poll(); assert(roundtrip_target.read().target == nil); roundtrip.stop()")
        print('PASS: collector Lua -> real files -> JavaScript route Tracker -> cancel -> collector Lua')
subprocess.run([sys.executable,str(root/'tests/survey-tracker.test.py')],check=True)

