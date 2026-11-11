'use strict';

// One owner even if two loaders or two installation layouts find this mod.
// A failed partial start is never retried within the same game session.
const BUILD = '0.8.8-fork.1';
function start(load, output) {
    output.version = BUILD;
    output.stop = function () {
        throw new Error('Restart the game to update navigation and its active map hooks.');
    };
    const old = globalThis.__PBZQuestRouteRuntime;
    if (old) {
        if (old.build !== BUILD) throw new Error('Two navigation versions are installed; keep one version and restart.');
        if (old.phase !== 'ready') throw new Error('Navigation startup already failed; check PBZQuestRoute-startup.txt and restart.');
        output.ready = true;
        output.state = old;
        return old;
    }
    const state = globalThis.__PBZQuestRouteRuntime = {
        build: BUILD, phase: 'starting', navigation: false, tracker: 'optional', error: ''
    };
    const report = () => {
        const message = JSON.stringify(state);
        try { console.log('[PBZQuestRoute startup] ' + message); } catch (_) {}
        try {
            const ue = load('ue'), k = ue.KismetSystemLibrary;
            const file = k.ConvertToAbsolutePath(k.GetProjectSavedDirectory().replace(/[\\/]?$/, '/') + 'PBZQuestRoute-startup.txt');
            ue.EasyCsv.SaveStringToFileWithFullPath(message + '\n', file);
        } catch (_) {}
    };
    try {
        state.loader = globalThis.__PBZModsMenuRuntime ? 'Mods Menu' : globalThis.__PBZModLoader ? 'PBZModLoader' : 'script loader';
        if (globalThis.__PBZQuestRouteInstalled && globalThis.PBZQuestRouteBridge?.version !== BUILD)
            throw new Error('An older navigation copy is already running; keep one installation and restart.');
        load('./PBZQuestRoute').install();
        state.navigation = globalThis.__PBZQuestRouteInstalled === true;
        if (!state.navigation) throw new Error('Navigation entry returned without confirming initialization');
        // A missing or incompatible optional tracker must not disable map pins
        // or quest navigation, or turn an otherwise loaded mod into a failure.
        try {
            load('./PBZRouteTrackerCompat').install();
            if (state.tracker === 'optional') state.tracker = 'waiting for installed tracker';
        } catch (error) {
            state.tracker = 'optional adapter unavailable';
            state.trackerError = String(error && error.message || error).replace(/[\r\n]+/g, ' ').slice(0, 240);
        }
        state.phase = 'ready';
        output.ready = true;
        output.state = state;
        (globalThis.__PBZLoaderEntries ||= Object.create(null)).PBZQuestRoute = 'loaded';
        report();
        return state;
    } catch (error) {
        state.phase = 'failed';
        state.error = String(error && error.message || error).replace(/[\r\n]+/g, ' ').slice(0, 300);
        output.ready = false;
        output.state = state;
        report();
        throw error;
    }
}
exports.start = start;
