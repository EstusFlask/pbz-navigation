"use strict";
const UE = require("ue");
const W = require("./PBZRouteWorld");
const R = require("./PBZRouteCore");
const lower = value => String(value || "").toLowerCase();
function findRow(host, id) {
    if (!id || lower(id) === 'none') return null;
    const rows = host.focusItemMap, direct = rows?.get(id) || rows?.get(lower(id));
    if (direct) return direct;
    for (const [key, row] of rows || []) if (lower(key) === lower(id)) return row;
    return null;
}
function isNativeAction(row) {
    return !!row && ([0, 1, 3, 4].includes(row.itemType) || !!row.lockGuid || !!row.questObjName);
}
function readItem(host, id, row, width, height) {
    const widget = row?.widget;
    if (isNativeAction(row) || !W.alive(widget) || !(width > 0 && height > 0)) return null;
    const visibility = widget.GetVisibility?.();
    if (visibility === UE.ESlateVisibility.Hidden || visibility === UE.ESlateVisibility.Collapsed ||
        widget.GetRenderOpacity?.() === 0) return null;
    const point = widget.__pbzPoint, target = host.pbzWidgetTarget?.get(widget);
    const gear = host.pbzWidgetItem?.get(widget), kind = host.pbzWidgetKinds?.get(widget);
    if (lower(target?.kind || kind) === 'quest' || point?.collected) return null;
    if (!point && !target && !gear && !kind && !row.pbzLoc &&
        (row.itemType !== 2 || !host.AdvancedSlots?.Contains?.(widget))) return null;
    const slot = UE.WidgetLayoutLibrary.SlotAsCanvasSlot(widget);
    if (!slot) return null;
    const pos = slot.GetPosition(), x = Number(pos.X), y = Number(pos.Y);
    const p = Array.isArray(point?.location) ?
        {x: Number(point.location[0]), y: Number(point.location[1]), z: Number(point.location[2])} :
        W.plain(target || row.pbzLoc || gear?.Location || widget.Location || row.location);
    if (!Number.isFinite(x + y) || !R.finite(p)) return null;
    const area = lower(point?.mapID || target?.mapID || gear?.MapID || row.mapID || widget.OwnMapID || host.CurrentDisplayMapID);
    return {p, area, id: point?.key || target?.key || id, name: point?.title || target?.name || kind || '',
        provider: point ? '187' : target ? '134' : 'native', tracked: point || null,
        uv: {x: x / width, y: y / height}};
}
function candidates(host, uv, width, height) {
    if (!uv || !(width > 0 && height > 0) || !Number.isFinite(uv.x + uv.y)) return [];
    const pixel = new UE.Vector2D(uv.x * width, uv.y * height);
    const native = host.getFocusCandidatesSorted?.(pixel) || [];
    const nativeKeys = new Set(native.map(c => lower(c.key)));
    const rows = [];
    for (const [id, row] of host.focusItemMap || []) {
        const w = row.widget;
        if (!W.alive(w)) continue;
        const visibility = w.GetVisibility?.();
        if (visibility === UE.ESlateVisibility.Hidden || visibility === UE.ESlateVisibility.Collapsed || w.GetRenderOpacity?.() === 0) continue;
        const slot = UE.WidgetLayoutLibrary.SlotAsCanvasSlot(w);
        if (!slot) continue;
        const pos = slot.GetPosition(), size = slot.GetSize();
        const distance = Math.hypot(pixel.X - Number(pos.X), pixel.Y - Number(pos.Y));
        const radius = R.clamp(Math.max(Number(size.X) || 25, Number(size.Y) || 25) * .64, 14, 46);
        // The native hit area owns a latched, still-moving reticle. Artwork
        // hit testing also covers larger unframed icons and stale snap caches.
        if (nativeKeys.has(lower(id)) || distance <= radius)
            rows.push({id, row, distance});
    }
    return rows.sort((a, b) => a.distance - b.distance);
}
function pickItem(host, uv, width, height) {
    for (const hit of candidates(host, uv, width, height)) {
        const item = readItem(host, hit.id, hit.row, width, height);
        if (item) return {...item, distance: hit.distance};
    }
    return null;
}
function mapIntent(host, uv, width, height, gamepad, type) {
    if (!gamepad) return {item: pickItem(host, uv, width, height), allowed: true};
    const hits = candidates(host, uv, width, height);
    const selected = lower(host.SlotWidgetGroup?.GetSelectedSlotID?.());
    const snapped = lower(host.lastSnappedIconID);
    // A selected slot is authoritative only while it is under the reticle.
    // Empty/stale lastSnappedIconID must not shadow a current valid selection.
    let hit = hits.find(h => lower(h.id) === selected && h.row.widget.GetIsSelected?.() !== false);
    if (!hit) hit = hits.find(h => lower(h.id) === snapped);
    if (!hit) hit = hits[0];
    if (hit) {
        const item = readItem(host, hit.id, hit.row, width, height);
        return {allowed: !!item, item, focus: lower(hit.id)};
    }
    return {allowed: !host.isCursorOverIcon?.(type), item: null, focus: ''};
}
exports.findRow = findRow;
exports.pickItem = pickItem;
exports.mapIntent = mapIntent;
exports.readItem = readItem;
