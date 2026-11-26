"""Deterministic standard/development archive profiles; no source mutation."""
import hashlib
import json

SCRIPTS = 'ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/'
BUILD = SCRIPTS + 'PBZRouteBuild.js'
ADAPTER = 'platform/steam/ue4ss/Mods/PBZQuestRouteCompat/Scripts/'
LUA_BUILD = ADAPTER+'PBZRouteBuild.lua'
DIAGNOSTICS = SCRIPTS + 'PBZRouteDiagnostics.js'
DEVELOPMENT_FILES = {DIAGNOSTICS, SCRIPTS+'PBZRouteSurvey.js', SCRIPTS+'PBZRouteSurveyTasks.js',SCRIPTS+'PBZRouteSurveyTracker.js',
                     ADAPTER+'PBZSurveyCatalog.lua',ADAPTER+'PBZSurveyCatalogData.lua'}

def lua_build_bytes(version, flavor, edition='full'):
    return ('-- Generated package flavor; independent of user settings.\nreturn {version='+json.dumps(version)+',edition='+json.dumps(edition)+',development='+str(flavor=='development').lower()+'}\n').encode()

def archive_name(version, flavor, edition='full'):
    suffix = ('_Lite' if edition=='lite' else '')+('_Development' if flavor == 'development' else '')
    return f'dist/Quest_and_Exploration_Navigation_Fork_{version}{suffix}.zip'

def included(name, flavor, edition='full'):
    if edition=='lite' and name.startswith((SCRIPTS+'PBZRouteActionCorridors/',SCRIPTS+'PBZRouteMovementCorridors/')):return False
    return flavor == 'development' or name not in DEVELOPMENT_FILES

def build_bytes(nav, version, flavor, edition='full'):
    digest = hashlib.sha256()
    for file in sorted((nav / SCRIPTS).glob('*.js')):
        if file.name == 'PBZRouteBuild.js' or SCRIPTS+file.name in DEVELOPMENT_FILES:
            continue
        digest.update(file.name.encode())
        digest.update(b'\0')
        digest.update(file.read_bytes())
    profile = dict(version=version, flavor=flavor, edition=edition,label=version+('-lite' if edition=='lite' else '')+('-dev' if flavor == 'development' else ''),
                   development=flavor == 'development', sourceSHA256=digest.hexdigest(), captureSchema=1)
    if flavor == 'development':
        profile['diagnosticsSHA256']=hashlib.sha256((nav/DIAGNOSTICS).read_bytes()).hexdigest()
        profile['surveySHA256']={name:hashlib.sha256((nav/name).read_bytes()).hexdigest() for name in sorted(DEVELOPMENT_FILES) if name!=DIAGNOSTICS}
    return ("'use strict';\nmodule.exports=" + json.dumps(profile, separators=(',', ':')) + ';\n').encode()
