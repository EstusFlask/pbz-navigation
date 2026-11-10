"use strict";
// Optional integration: read the installed author's target service. No tracker
// implementation or catalogue is copied into the route package.
class Tracker {
    constructor(load, changed, log) {
        this.load = load; this.changed = changed; this.log = log;
        this.api = null; this.unsubscribe = null; this.muted = 0;
        this.revision = -1; this.identity = ''; this.attempted = false;
    }
    connect() {
        if (this.api || Date.now()-(this.lastAttempt||0)<1000) return;
        this.lastAttempt=Date.now();
        this.attempted = true;
        let api;
        try { api = this.load('Mods/PbzTrackerTarget'); } catch (_) { return; }
        if (typeof api?.read !== 'function' || typeof api?.subscribe !== 'function') return;
        this.api = api;
        this.unsubscribe = api.subscribe(event => this.receive(event));
        this.log('tracker', 'Map Tracker Plus target service connected');
        this.receive({...api.read(), reason: 'restore'});
    }
    notify(value,reason) {try {this.changed(value,reason);} catch(e) {this.log('tracker route error',String(e)+'; tracker selection retained');}}
    receive(event) {
        this.revision = event.revision;
        const raw = event.target;
        const previousHint=this.hintOnly, previousAuto=this.autoRoute;
        const id = raw ? JSON.stringify([raw.key,String(raw.mapID||'').toLowerCase(),raw.location,raw.trackingMode==='auto',!!raw.hintOnly]) : '';
        if (this.muted) { this.identity = id; this.hintOnly=!!raw?.hintOnly; this.autoRoute=raw?.trackingMode==='auto'&&!raw.hintOnly; return; }
        if (id === this.identity) return; // language/filter repaint is not a new choice
        this.identity = id;
        this.hintOnly=!!raw?.hintOnly;
        this.autoRoute=raw?.trackingMode==='auto'&&!raw.hintOnly;
        if (raw?.hintOnly) {
            if(previousAuto) this.notify(null,'automatic route cleared for hint mode');
            return;
        }
        if (!raw && previousHint) return;
        if (!raw) {
            this.notify(null, event.reason || 'cancelled');
            return;
        }
        const p = raw.location;
        if (!raw.key || !raw.mapID || !Array.isArray(p) || p.length < 3 ||
            !p.slice(0,3).every(Number.isFinite)) return;
        this.notify({p:{x:p[0],y:p[1],z:p[2]}, area:String(raw.mapID).toLowerCase(),
            id:String(raw.key), name:raw.title || raw.name || '', provider:'187',
            auto:raw.trackingMode === 'auto'}, event.reason || 'selected');
    }
    poll() {
        this.connect();
        if (!this.api) return;
        const value = this.api.read();
        if (value.revision !== this.revision) this.receive({...value,reason:'selected'});
    }
    clear(reason='route replaced') {
        if (!this.api) return;
        this.muted++;
        try { this.api.clear(reason); this.identity=''; }
        finally { this.muted--; }
    }
    choose(host, item) {
        if (!this.api || item.provider !== '187' || !item.tracked) return false;
        if(typeof this.api.choose==='function')return this.api.choose(item.tracked);
        // Calling the author's public toggle keeps its HUD marker and minimap
        // highlight in step with mouse middle-click and controller A.
        const UE=this.load('ue'), P=this.load('puerts');
        const helper=this.load('Library/TsHelper').default;
        const ui=this.load('Library/UIHelper').default;
        const runtime=this.load('Mods/PbzCollectibleRuntime');
        const guide=this.load('Mods/PbzCollectibleGuide');
        const point=item.tracked;
        this.muted++;
        try { (guide.select || guide.toggle)(host, {...point,location:point.location.slice()}, {
            UE,puerts:P,TsHelper:helper,UIHelper:ui,
            isCollected:t=>runtime.getCurrent()?.repo.get(t.key)?.collected===true,
            canShowTarget:t=>runtime.getCurrent()?.repo.get(t.key)?.visible===true,
            fontTemplate:UE.Widget.Find('TaskTitle',host.WidgetTree)
        });
        } finally { this.muted--; }
        return this.api.read().target?.key === point.key;
    }
}
exports.Tracker=Tracker;
