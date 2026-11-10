'use strict';

function path(value) {
    const parts = String(value || '').replace(/\\/g, '/').split('/'), out = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else out.push(part); }
        else out.push(part);
    }
    return (String(value).startsWith('/') ? '/' : '') + out.join('/');
}
function relative(from, to) {
    const a = path(from).split('/'), b = path(to).split('/');
    if (/^[a-z]:$/i.test(a[0]) && a[0].toLowerCase() !== b[0]?.toLowerCase()) return null;
    let same = 0;
    while (same < a.length && same < b.length && a[same].toLowerCase() === b[same].toLowerCase()) same++;
    const result = [...a.slice(same).map(() => '..'), ...b.slice(same)].join('/');
    return result.startsWith('.') ? result : './' + result;
}
function directory(value, content) {
    const dir = String(value || '').replace(/\\/g, '/');
    if (/^(?:[A-Za-z]:\/|\/)/.test(dir)) return path(dir);
    const marker = '/Content/JavaScript/', at = dir.indexOf(marker);
    if (at >= 0) return path(content + '/JavaScript/' + dir.slice(at + marker.length));
    const foreign = /(?:^|\/)PBZModLoader\/mods\//.exec(dir);
    if (foreign) return path(content + '/../' + dir.slice(foreign.index + (dir[foreign.index] === '/' ? 1 : 0)));
    return path(content + '/JavaScript/' + dir);
}
class Provider {
    constructor(options) { Object.assign(this, options); this.dirname = directory(options.dirname, options.content); this.next = 0; this.attempts = 0; }
    roots() {
        const content = path(this.content), js = content + '/JavaScript';
        const external = path(content + '/../PBZModLoader/mods');
        const menu = js + '/PBZModsMenu/Mods', generated = js + '/PBZModLoader/generated-mods';
        // PBZModLoader executes a generated copy. Mods Menu executes originals
        // in place. Opening a second copy creates a different target singleton.
        const roots = this.runtime()?.__PBZModsMenuRuntime ? [external, menu, generated] : [generated, external, menu];
        const same = path(this.dirname + '/..');
        return [...new Set([same, ...roots].flatMap(root => ['pbz-map-tracker', 'PBZMapTracker'].map(id => root + '/' + id)))];
    }
    active(force = false) {
        const now = this.clock();
        if (!force && now < this.next) return null;
        this.next = now + (this.attempts++ < 8 ? 1500 : 30000);
        for (const root of this.roots()) {
            if (!this.exists(root + '/PbzMapBootstrap.js')) continue;
            const prefix = relative(this.dirname, root);
            if (!prefix) continue;
            const load = id => this.load(prefix + '/' + id);
            try {
                const status = load('PbzMapBootstrap').getStatus?.();
                if (!status?.started || status.error) continue;
                const target = load('PbzTrackerTarget');
                if (typeof target?.read !== 'function' || typeof target?.subscribe !== 'function') continue;
                return { load, root, target };
            } catch (_) { /* absent/disabled/failed trackers remain optional */ }
        }
        return null;
    }
}
exports.Provider = Provider;
exports.relative = relative;
exports.path = path;
exports.directory = directory;
