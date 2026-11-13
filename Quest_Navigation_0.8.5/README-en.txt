Quest and Exploration Navigation - Fork
Version: 1.0.1 (experimental release candidate)
Based on azqwq333's Quest and Exploration Navigation 0.8.5-beta and local-fix5.
Original: https://www.nexusmods.com/phantombladezero/mods/472
Fork preparation: kurosakana. Code and documentation use AI assistance.

CURRENT COVERAGE
1.0.1 shows persistent blue route-calculation/loading text with elapsed seconds above gameplay and beside the selected map target. Clear it on completion, cancellation or reset and restart timing on a new target. Do not display a no-route map label while work is pending. Widget reuse and status reads add no planner requests. All 1,334 installed 0.15.1 runtime files match its archive; field logs confirm 10-14 second waits. This update adds feedback, not a speed improvement. 202 JavaScript tests pass; the new HUD appearance is not game-verified.
0.15.1 fixes checked bell recommendations being hidden by rejected walking previews, return transfers after arrival, and worse transfers when already near the better item bell. Rank checked access above continuous atlas corridors and proximity-only estimates; reject known walls, locks and unavailable traversals. Add at most two bounded local departure detours per request (60 m / 1,600 nodes / 900 ms execution each), keeping floor/slope/capsule checks. Reject incomplete departures. 195 JavaScript tests pass, including the reported valley currency on the real atlas. Both valley scenarios still need game testing. No trail learning or persistence.

0.15.0 fixes collector 1.0.14 sync using API contracts. Item navigation compares activated bell transfers, checks departure approaches and replans the original item after teleport. Unloaded arrival walking remains pending. Audit 1,616 catalogue points and 530 native detail rows against all eight public maps; add 170 reviewed Chinese hints without replacing tracker files. See ITEM-DESCRIPTION-AUDIT.md. 181 JavaScript tests and real 1.0.9/1.0.14 Lua modules pass; live-game testing remains pending.

0.14.0 adds directed bell-course composition and checked item spurs (up to 7.6 m), with current lock/action filtering. Full-map manual 3D coverage is NOT complete: only the existing two directed reference courses are enabled. Eight maps, 171 game table entries and 4,324 ordered pairs are audited; 140 roadbook worksheet links remain disabled pending XYZ/action authoring. See BELL-NETWORK-COVERAGE.md. No new trail recording or downloads; full courses remain untested in game.

RELEASE STATUS
Nexus mod page #994 is published under the current account. The fork retains original attribution and bundled-asset credit; publication does not imply endorsement by azqwq333.

REQUIREMENTS
- Navigation: PBZModLoader #113, version 1.0.0.
- Optional navigation settings: Mods Menu #149, version 0.7.2.
- Optional collectible targets: Map Tracker Plus - Minimap and Collectibles (UE4SS) #187, version 1.0.9 / 1.0.14. Its downloaded folder is named Map Collectible Tracker.
- The 1.0.9 / 1.0.14 adapter needs UE4SS for Phantom Blade Zero #5, version 1.0.3 (v3.0.1-1195-g1ceefac8 Shipping).
Links: https://www.nexusmods.com/phantombladezero/mods/<number>

INSTALL / UPDATE
1. Close the game; back up ProjectPBZ/Content/Paks/~mods/PBZQuestRoute.txt.
2. Install PBZModLoader. For collectible sync, separately install the supported UE4SS and original Map Tracker Plus 1.0.9 / 1.0.14.
3. Disable old navigation and move its old script folder outside the game, preserving config. Merge this archive's ProjectPBZ and platform folders into the game root opened through Steam -> Manage -> Browse local files.
4. Alternatively, import the complete ZIP into UE Mod Manager. Keep navigation game files and PBZQuestRouteCompat selected. Shared install paths may identify it as an update to upstream. Enable only one navigation copy.
5. Entry: ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/main.js. Adapter: platform/steam/ue4ss/Mods/PBZQuestRouteCompat/dlls/main.dll.
6. Start normally through Steam.

One complete PBZModLoader-layout archive is provided. No standalone Mods Menu-layout archive is included. Loaders and collector files are not bundled. Do not modify or replace PbzMapTracker files.
When migrating, move out the old JS collector ProjectPBZ/PBZModLoader/mods/pbz-map-tracker/, legacy 0.7.x zzz_PBZQuestRoute_P.pak/.utoc/.ucas, PBZQuestRouteMouse and other old navigation layouts. Keep only one collector generation.

COLLECTIBLE COMPATIBILITY
1.0.9 / 1.0.14 manual/automatic targets, switching, completion, cancellation and hover-then-middle-click selection are adapted.
The JS 0.6.7 integration's minimap route overlay, large icons and automatic accessory hints have NOT been ported to UE4SS 1.0.9 / 1.0.14. Those navigation settings have no effect on 1.0.9 / 1.0.14. The collector manages its own minimap, icons and tracking.
The adapter keeps the exact UE4SS 1195 ABI/hash check and validates collector target/selection service contracts. Entry text changes no longer disable sync; unsupported contracts restore the original interfaces. See PBZQuestRouteCompat-status.txt in the adapter folder. Retained legacy JS code is not freshly certified for this release.

CHANGES FROM UPSTREAM 0.8.5-beta
- 0.13.0: verify the installed 0.12.0 files match the delivered archive; fix inherited-component discovery through K2_GetComponentsByClass. Add directed fixed 3D reference courses for Great Corridor Bridge -> Xiaozhang and Mass Grave -> Mo Jizi cenotaph, preserving cave climbs/grapple and the actual uphill detour. Use checked same-floor joins, live locks/mechanism state and current collision clipping. Check the final ~3 m cave approach locally. No learning, trail file access or runtime network requests. Both full routes still need game testing. See MANUAL-ROUTES.md for provenance and limits.
- 0.12.0: remove player-route memory, its settings entry and trail file reads/writes. Old records do not participate in planning. Keep the blue strand about 105 cm above ground.
- Reduce retries after small same-level movement: diagnostic/frontier/off-route retries require 6 m horizontally or 75 cm vertically and wait for the current search. Preserve ordinary hops and checked continuous ramps; clear stale candidate retries when a route completes.
- Use CharacterMovement IsWalkable, component slope overrides and step-up restrictions. Read resident forced-slide volumes and native downhill direction instead of treating their uphill direction as ordinary walking.
- Inspect game packages, blueprint components and native metadata. Expand discovery to 29 class entries, fix inherited components and add GapBlocker hook trigger/grab/landing geometry. Apply folding-ladder, moving/broken-lift and interaction requirements.
- Read door item maps, names, required/owned counts, and weapon/tag requirements. Refresh locks with the map closed and poll nearby discovered mechanisms. GAME-TRAVERSAL-AUDIT.md lists findings and types still missing full support.
- 0.10.3: remember measured walls before repairs can be cancelled, preserve individual portal edge IDs, and clip known-blocked atlas tails.
- Keep a checked multi-climb frontier when the final grapple is unavailable. A farther pending backtrack cannot replace it; complete checked alternatives remain eligible.
- Attach validated action pads and walking connectors during planning and immediately retry the atlas. Timer discovery only caches actors.
- Search the start corridor even when the distant goal is unloaded; refine trapped broad-grid starts with 70/35 cm steps. Log resident action extraction and precise search termination/rejection reasons.
- 0.10.2: inspect authored cave corridors before costly scene repairs. Failed native/direct candidates retain only physically checked prefixes, without unchecked straight tails.
- Use mechanism hints for pending/unloaded passages, X for measured obstructions, and lock/item hints for known locks. Repair walking gaps while retaining surrounding climbs/grapples; try resident interactions for missing connectors.
- Extend bounded long-range scene search to 200 m. Allow short downward drops only after landing and descent-clearance checks. Publish safe prefixes during search and retain progress along verified slopes and detours. Node, execution and 30-second wall limits still apply.
- Change the scene strand to blue at about 105 cm above ground, including its endpoint. Check collisions against the actual raised strand.
- 0.10.1: middle-click/gamepad bell selection preserves the bell location. Fix the cenotaph target snapping about 101 m away; limit blank-paper road snapping to 13 pixels.
- Preserve authored action edge IDs so failed landings exclude the correct connection and allow alternatives. Check support when a route ends immediately after an action. Both reported routes require fresh in-game testing.
- 0.10.0: refine failed samples across dense legal stairs and require opposite capsule support across narrow cracks. Preserve wide-pit, high-ledge and body-collision rejection.
- Scan 29 resident traversal class entries, including ziplines. Defer connectors in cost order so crowded entrances do not exhaust the search before a second climb/grapple action.
- Charge local, action and repair budgets for execution time, excluding suspension between game frames. Keep the overall 30-second wall-time limit.
- Attempt short physically checked walking links at disconnected endpoints of long trips, only in the measured direction. Apply known typed lock/item requirements to planning and audits; item names and required/owned counts are queried.
- Validate floor support and capsule clearance; compare feasible 3D walking lengths and reject known-blocked fallbacks.
- Roll back 0.9.0 alternatives to delivered 0.8.7 single-route behavior. Normal local searches cover about 120 m; long scene searches extend to 200 m. Preserve checked map prefixes and pending authored tails; the scene strand stops at checked positions.
- Approach collectibles within same-floor interaction range and follow uneven ground.
- Chain recognized ladders, climbs, rope/grapple links, slides and lifts with direction/unlock checks. Operate traversal actions yourself.
- Replace trailing particles with an immediate thin-line mesh, keep endpoints above ground, bound far-segment collision checks and repeated updates.
- Sync original collector 1.0.9 / 1.0.14 targets/cancellation with a navigation-owned adapter; preserve item height on middle-click.
- Correct buried interaction anchors; refresh the planning origin after landing, changing floors or capsule dimensions without reselecting the target.
- Remove candidate collection, background alternative searches and the three-color overlay. Retain the single-route obstacle/lock logic.
- Merge data strings from 256 KiB to 512 KiB: 1772 loading modules become 951. Original data values are preserved.
- Reuse unchanged vertex colors and skip capsule reads in throttled callbacks. Keep the existing sampling, collision checks and update frequency.
- Avoid testing all collectible standing positions before trying an action chain; nearby climbs are considered even when the player starts near the target height.
- Limit mesh updates to about 30 Hz and cache identical near collision geometry for 250 ms. Equivalent blocked previews retain their caches. Navigation never cold-loads interaction classes.
- Load atlas modules and columns incrementally. A first regional load takes several seconds, then replans automatically. Original route values are preserved.
- Unify runtime, native adapter, ZIP and docs as 1.0.1; label the settings entry as Fork.

CONTROLS / SETTINGS
Track quests normally. Left-click a 1.0.9 / 1.0.14 icon, or hover it and middle-click. Middle-click blank map space for a ground pin; hold on blank space for about 0.6 s to cancel. Controller confirmation uses the game's binding, normally A.
Close filters before placing pins. Close the map to see the world line. WorldThread must be on; Sense30 requires Sense first. Same-floor arrival dismisses guidance until reselected. Travel and traversal remain player-controlled.
Mods Menu: F9, Quest & Exploration Navigation - Fork.
Config: ProjectPBZ/Content/Paks/~mods/PBZQuestRoute.txt
MapRoute, WorldThread, FogBellSense: on/off. DisplayMode: Always/Sense30.
MinimapRoute, LargeItemIcons, AutoAccessory: legacy JS collector options.
Startup state: PBZQuestRoute-startup.txt in the actual game Saved directory.
Log: ProjectPBZ/Saved/PBZQuestRoute-log.txt.

LIMITS / UNINSTALL
202 local JavaScript regressions pass, including seven new cases for framed loading status, cancellation/reset/new targets, atlas streaming, viewport reuse/recovery and map label refresh. Bell selection, actual valley atlas, locks, terrain and action tests remain covered. Physics, reflected calls and new HUD rendering are simulated; this version's HUD appearance, valley scenarios and both complete reference courses are unverified in game. 0.15.1 field logs confirm slow first-route publication; synchronous completion tests do not measure game response time. The original 11-world atlas is unchanged. Unloaded regions and unknown mechanisms may still leave gaps; no full-map, global-shortest-path or measured FPS claim. No learning run is required. See GAME-TRAVERSAL-AUDIT.md for support boundaries. Update the existing navigation to avoid mixed scripts.
