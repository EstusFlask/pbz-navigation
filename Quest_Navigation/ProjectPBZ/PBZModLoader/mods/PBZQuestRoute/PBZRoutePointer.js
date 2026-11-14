"use strict";
// Preserve short presses that begin and end between map ticks. Coordinates are
// sampled at the event; polling is only used to finish a hold, never to invent
// a release before Slate has actually delivered it.
class Pointer {
    constructor() { this.press=null; this.actions=[]; this.until=0; }
    down(sample) {
        this.cancel();
        if (!sample?.allowed || !Number.isFinite(sample.uv?.x + sample.uv?.y)) return false;
        this.press={...sample,uv:{...sample.uv},cancelled:false,handled:false};
        return true;
    }
    move(sample) {
        const p=this.press;
        if (!p) return;
        if (!sample?.allowed || !Number.isFinite(sample.uv?.x + sample.uv?.y) || p.area!==sample.area ||
            Math.hypot((sample.uv.x-p.uv.x)*sample.width,(sample.uv.y-p.uv.y)*sample.height)>9)
            p.cancelled=true;
    }
    hold(sample) {
        this.move(sample);
        const p=this.press;
        if (p&&!p.cancelled&&!p.handled&&sample.now-p.now>=600) {
            p.handled=true;this.actions.push({type:'clear',area:p.area});
        }
    }
    up(sample) {
        const p=this.press;if(!p)return false;
        this.hold(sample);
        if(!p.cancelled&&!p.handled)this.actions.push({type:'pin',uv:p.uv,area:p.area});
        this.press=null;this.until=sample.now+180;
        return true;
    }
    cancel() { this.press=null; }
    take(area) {
        const result=this.actions.filter(a=>a.area===area);
        this.actions=[];return result;
    }
    owns(now) { return !!this.press || this.actions.length>0 || now<this.until; }
}
exports.Pointer=Pointer;
