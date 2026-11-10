"use strict";
// UQuest UObject names acquire new numeric suffixes after travel. Selection
// identity belongs to the quest class and point, never the transient instance.
function questIdentity(quest, point) {
    if (!quest) return '';
    const cls = quest.GetClass?.();
    const path = cls?.GetPathName?.() || cls?.GetName?.();
    const name = String(path || quest.GetName?.() || '').replace(/_C_\d+$/, '_C');
    return name ? name + '/' + String(point || '') : '';
}
class QuestGate {
    constructor() { this.last = null; this.paused = false; }
    observe(id) {
        const changed = !!id && this.last !== null && this.last !== id;
        // Missing objects while loading are not an instruction to resume.
        if (id) this.last = id;
        return changed && !this.paused;
    }
    pause(id) { this.paused = true; if (id) this.last = id; }
    choose(id) { this.paused = false; if (id) this.last = id; }
}
exports.questIdentity = questIdentity;
exports.QuestGate = QuestGate;
