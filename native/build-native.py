"""Build the navigation-owned UE4SS 1195 adapter with MSVC, without changing UE4SS."""
from pathlib import Path
import argparse
import os
import re
import subprocess
import tempfile
import urllib.request
import zipfile
import sys

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '1ceefac8b8c286f0fb3eb62b4aae075ff81df0bd'
CACHE = Path(tempfile.gettempdir()) / 'pbz-navigation-native-sdk'

def fetch_zip(url, name, folder):
    archive = CACHE / name
    if not archive.exists():
        urllib.request.urlretrieve(url, archive)
    if not folder.exists():
        with zipfile.ZipFile(archive) as z:
            for item in z.namelist():
                if not (CACHE / item).resolve().is_relative_to(CACHE.resolve()):
                    raise ValueError('archive path escapes SDK cache')
            z.extractall(CACHE)
    return folder

def environment():
    vswhere = Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'Microsoft Visual Studio/Installer/vswhere.exe'
    install = subprocess.check_output([str(vswhere), '-latest', '-products', '*', '-requires',
        'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], text=True).strip()
    vc = sorted((Path(install) / 'VC/Tools/MSVC').iterdir())[-1]
    sdk = Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'Windows Kits/10'
    version = sorted((sdk / 'Lib').iterdir())[-1].name
    env = os.environ.copy()
    tools = vc / 'bin/Hostx64/x64'
    env['PATH'] = str(tools) + os.pathsep + env['PATH']
    env['INCLUDE'] = ';'.join(str(p) for p in [vc/'include', *[sdk/'Include'/version/x for x in ['ucrt','um','shared','winrt','cppwinrt']]])
    env['LIB'] = ';'.join(str(p) for p in [vc/'lib/x64', sdk/'Lib'/version/'ucrt/x64', sdk/'Lib'/version/'um/x64'])
    return env, tools

def prepare():
    CACHE.mkdir(exist_ok=True)
    source = fetch_zip('https://codeload.github.com/UE4SS-RE/RE-UE4SS/zip/'+COMMIT,
        'source-1ceefac8.zip', CACHE / ('RE-UE4SS-'+COMMIT))
    fmt = fetch_zip('https://codeload.github.com/fmtlib/fmt/zip/refs/tags/11.2.0',
        'fmt-11.2.0.zip', CACHE / 'fmt-11.2.0')
    generated = CACHE / 'minimal-sdk/Mod'
    generated.mkdir(parents=True, exist_ok=True)
    header = (source/'UE4SS/include/Mod/CppUserModBase.hpp').read_text(encoding='utf-8')
    # The public header unnecessarily imports the entire GUI/Unreal SDK.
    # Forward-declare its shared_ptr pointee and expand the identical callback
    # typedef. No base fields, virtual slots, or function signatures change.
    header = header.replace('#include <GUI/GUITab.hpp>',
        'namespace RC { class CppUserModBase; namespace GUI { class GUITab; } }')
    header = header.replace('GUI::GUITab::RenderFunctionType', 'void (*)(CppUserModBase*)')
    (generated/'CppUserModBase.hpp').write_text(header, encoding='utf-8')
    includes = [CACHE/'minimal-sdk', source/'UE4SS/include', fmt/'include']
    for name in ['File','Input','String','LuaMadeSimple','LuaRaw']:
        includes.append(source/'deps/first'/name/'include')
    return includes

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ue4ss', type=Path, required=True, help='Existing UE4SS.dll, read only')
    parser.add_argument('--test', action='store_true')
    args=parser.parse_args()
    env, tools=environment()
    includes=prepare()
    out=CACHE/'build';out.mkdir(exist_ok=True)
    exports=subprocess.check_output([str(tools/'dumpbin.exe'), '/nologo','/exports',str(args.ue4ss)],text=True,env=env)
    symbols=re.findall(r'^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(\S+)',exports,re.M)
    if not symbols: raise RuntimeError('no UE4SS exports found')
    definition=out/'UE4SS.def'
    definition.write_text('LIBRARY UE4SS.dll\nEXPORTS\n'+'\n'.join(symbols)+'\n',encoding='utf-8')
    library=out/'UE4SS.lib'
    subprocess.run([str(tools/'lib.exe'),'/nologo','/machine:x64','/def:'+str(definition),'/out:'+str(library)],check=True,env=env)
    common=[str(tools/'cl.exe'),'/nologo','/std:c++20','/EHsc','/MD','/O2','/W4','/wd4100','/utf-8','/DNDEBUG','/D_ITERATOR_DEBUG_LEVEL=0',
        *['/I'+str(p) for p in includes]]
    output=ROOT/'Quest_Navigation/platform/steam/ue4ss/Mods/PBZQuestRouteCompat/dlls/main.dll'
    output.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(common+['/LD',str(ROOT/'native/QuestRouteCompat.cpp'),'/Fo:'+str(out/'adapter.obj'),
        '/Fe:'+str(output),'/link',str(library),'bcrypt.lib','/IMPLIB:'+str(out/'adapter.lib'),'/DYNAMICBASE','/NXCOMPAT'],check=True,env=env,cwd=out)
    if args.test:
        test=out/'native-tests.exe'
        test_common=[arg for arg in common if arg!='/DNDEBUG']
        subprocess.run(test_common+['/DRC_UE4SS_API=','/DRC_LMS_API=',str(ROOT/'native/native-tests.cpp'),
            '/Fo:'+str(out/'test.obj'),'/Fe:'+str(test),'/link','bcrypt.lib'],check=True,env=env,cwd=out)
        sys.path.insert(0, str(ROOT/'tests'))
        from collector_fixture import current_fixture
        fixture=current_fixture(ROOT)/'platform/steam/ue4ss/Mods/PbzMapTracker/Scripts/main.lua'
        subprocess.run([str(test),str(args.ue4ss),str(fixture)],check=True,env=env,cwd=ROOT)
    print(output)

if __name__=='__main__': main()
