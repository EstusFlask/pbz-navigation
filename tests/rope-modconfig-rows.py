"""Reproduce the installed ModConfig swatch bug without starting or changing the game."""
from pathlib import Path
import argparse
import os
import sys
sys.path.insert(0,str(Path(os.environ.get('TEMP','.'))/'pbz-navigation-test-deps'))
from lupa.lua54 import LuaRuntime
parser=argparse.ArgumentParser()
parser.add_argument('--mod-config-scripts',type=Path,required=True)
parser.add_argument('--patch',action='store_true')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
for late in ([False,True] if args.patch else [False]):
    lua=LuaRuntime()
    lua.globals().adapter_scripts=(root/'Quest_Navigation/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts').as_posix()
    lua.globals().framework_scripts=args.mod_config_scripts.resolve().as_posix()
    lua.globals().row_patch=args.patch
    lua.globals().row_patch_late=late
    lua.execute("package.path=adapter_scripts..'/?.lua;'..framework_scripts..'/?.lua;'..package.path")
    lua.execute((root/'tests/rope-modconfig-rows.lua').read_text(encoding='utf-8'))
