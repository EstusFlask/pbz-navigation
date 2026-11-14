"use strict";
// Native map action, Slate preview, and the held-key fallback share one press.
// A repeated callback may acknowledge it, but must not toggle/replan it twice.
class ItemConfirm {
    constructor() { this.id = ''; this.at = -Infinity; this.held = false; this.cleared = false; }
    claim(id, now) {
        if (this.held || (this.id === id && now - this.at < 180)) return false;
        this.id = id; this.at = now; this.held = true; this.cleared = false;
        return true;
    }
    sample(down, now) {
        if (!down) { this.held = false; return false; }
        if (this.held && !this.cleared && now - this.at >= 600) {
            this.cleared = true;
            return true;
        }
        return false;
    }
}
exports.ItemConfirm = ItemConfirm;
