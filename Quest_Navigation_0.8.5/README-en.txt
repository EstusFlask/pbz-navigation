Quest and Exploration Navigation - Fork
Version: 0.10.3-fork.1 (experimental release candidate)
Based on azqwq333's Quest and Exploration Navigation 0.8.5-beta and local-fix5.
Original: https://www.nexusmods.com/phantombladezero/mods/472
Fork preparation: kurosakana. Code and documentation use AI assistance.

RELEASE STATUS
Author permission is pending. This candidate is for local review; the Nexus draft is unpublished. The original page requires permission for modification and asset use. Discontinued maintenance does not grant those permissions.

REQUIREMENTS
- Navigation: PBZModLoader #113, version 1.0.0.
- Optional navigation settings: Mods Menu #149, version 0.7.2.
- Optional collectible targets: Map Tracker Plus - Minimap and Collectibles (UE4SS) #187, version 1.0.9. Its downloaded folder is named Map Collectible Tracker.
- The 1.0.9 adapter needs UE4SS for Phantom Blade Zero #5, version 1.0.3 (v3.0.1-1195-g1ceefac8 Shipping).
Links: https://www.nexusmods.com/phantombladezero/mods/<number>

INSTALL / UPDATE
1. Close the game; back up ProjectPBZ/Content/Paks/~mods/PBZQuestRoute.txt.
2. Install PBZModLoader. For collectible sync, separately install the supported UE4SS and original Map Tracker Plus 1.0.9.
3. Disable old navigation and move its old script folder outside the game, preserving config. Merge this archive's ProjectPBZ and platform folders into the game root opened through Steam -> Manage -> Browse local files.
4. Alternatively, import the complete ZIP into UE Mod Manager. Keep navigation game files and PBZQuestRouteCompat selected. Shared install paths may identify it as an update to upstream. Enable only one navigation copy.
5. Entry: ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/main.js. Adapter: platform/steam/ue4ss/Mods/PBZQuestRouteCompat/dlls/main.dll.
6. Start normally through Steam.

One complete PBZModLoader-layout archive is provided. No standalone Mods Menu-layout archive is included. Loaders and collector files are not bundled. Do not modify or replace PbzMapTracker files.
When migrating, move out the old JS collector ProjectPBZ/PBZModLoader/mods/pbz-map-tracker/, legacy 0.7.x zzz_PBZQuestRoute_P.pak/.utoc/.ucas, PBZQuestRouteMouse and other old navigation layouts. Keep only one collector generation.

COLLECTIBLE COMPATIBILITY
1.0.9 manual/automatic targets, switching, completion, cancellation and hover-then-middle-click selection are adapted.
The JS 0.6.7 integration's minimap route overlay, large icons and automatic accessory hints have NOT been ported to UE4SS 1.0.9. Those navigation settings have no effect on 1.0.9. The collector manages its own minimap, icons and tracking.
The adapter checks UE4SS.dll and collector entry hashes. Other builds disable sync; core quest/pin navigation remains available. See PBZQuestRouteCompat-status.txt in the adapter folder. Retained legacy JS code is not freshly certified for this release.

CHANGES FROM UPSTREAM 0.8.5-beta
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
- Scan all 17 resident traversal classes, including ziplines. Defer connectors in cost order so crowded entrances do not exhaust the search before a second climb/grapple action.
- Charge local, action and repair budgets for execution time, excluding suspension between game frames. Keep the overall 30-second wall-time limit.
- Attempt short physically checked walking links at disconnected endpoints of long trips, only in the measured direction. Apply known typed lock/item requirements to planning and audits; inventory ownership is not queried.
- Validate floor support and capsule clearance; compare feasible 3D walking lengths and reject known-blocked fallbacks.
- Roll back 0.9.0 alternatives to delivered 0.8.7 single-route behavior. Normal local searches cover about 120 m; long scene searches extend to 200 m. Preserve checked map prefixes and pending authored tails; the scene strand stops at checked positions.
- Approach collectibles within same-floor interaction range and follow uneven ground.
- Chain recognized ladders, climbs, rope/grapple links, slides and lifts with direction/unlock checks. Operate traversal actions yourself.
- Replace trailing particles with an immediate thin-line mesh, keep endpoints above ground, bound far-segment collision checks and repeated updates.
- Sync original collector 1.0.9 targets/cancellation with a navigation-owned adapter; preserve item height on middle-click.
- Correct buried interaction anchors; refresh the planning origin after landing, changing floors or capsule dimensions without reselecting the target.
- Remove candidate collection, background alternative searches and the three-color overlay. Retain the single-route obstacle/lock logic.
- Merge data strings from 256 KiB to 512 KiB: 1772 loading modules become 951. Original data values are preserved.
- Reuse unchanged vertex colors and skip capsule reads in throttled callbacks. Keep the existing sampling, collision checks and update frequency.
- Avoid testing all collectible standing positions before trying an action chain; nearby climbs are considered even when the player starts near the target height.
- Limit mesh updates to about 30 Hz and cache identical near collision geometry for 250 ms. Equivalent blocked previews retain their caches. Navigation never cold-loads interaction classes.
- Load atlas modules and columns incrementally. A first regional load takes several seconds, then replans automatically. Original route values are preserved.
- Unify runtime, native adapter, ZIP and docs as 0.10.3-fork.1; label the settings entry as Fork.

CONTROLS / SETTINGS
Track quests normally. Left-click a 1.0.9 icon, or hover it and middle-click. Middle-click blank map space for a ground pin; hold on blank space for about 0.6 s to cancel. Controller confirmation uses the game's binding, normally A.
Close filters before placing pins. Close the map to see the world line. WorldThread must be on; Sense30 requires Sense first. Same-floor arrival dismisses guidance until reselected. Travel and traversal remain player-controlled.
Mods Menu: F9, Quest & Exploration Navigation - Fork.
Config: ProjectPBZ/Content/Paks/~mods/PBZQuestRoute.txt
MapRoute, WorldThread, FogBellSense: on/off. DisplayMode: Always/Sense30.
MinimapRoute, LargeItemIcons, AutoAccessory: legacy JS collector options.
Startup state: PBZQuestRoute-startup.txt in the actual game Saved directory.
Log: ProjectPBZ/Saved/PBZQuestRoute-log.txt.

LIMITS / UNINSTALL
132 local JS regressions, original data hashes, real Lua integration, native tests and ZIP checks are used for validation. The 13 new cases cover cancellation, portal attribution, climb frontiers, checked attachments, narrow starts and diagnostics. Physics is simulated; cave coordinates and upward arcs come from original data. The original graph already contains the two ascents; its complete grapple chain to the bell remains unconfirmed. This candidate has not been tested in game. Retest the Great Corridor Bridge to Xiao Zhang hideout cave/climb/grapple detour, the Cemetery to Mo Jizi cenotaph start and uphill detour, and both return trips. The cave candidate still lacks a confirmed complete action chain. Of 462 directed Lujiacun bell pairs, 362 are disconnected in the original graph; this is not a live failure rate or proof of inaccessibility. Lock positions are approximate, and inventory ownership is not queried. No measured FPS or global-shortest-path claim. Original world data values are retained. Choose Update in the manager, or move out the old script folder before manual installation, to avoid leftover shards.
Close the game and remove this package's PBZQuestRoute script folder, ProjectPBZ/Content/Mods/PBZQuestRoute/ and platform/steam/ue4ss/Mods/PBZQuestRouteCompat/, or uninstall via the manager. Preserve settings, collector and shared runtimes. Move out Fork scripts/adapter before restoring upstream.

CREDITS
azqwq333: original navigation, world graphs, walking surfaces and original assets.
PiPiFanDev: separate Map Tracker Plus, not bundled or maintained by this fork.
UE4SS contributors: public runtime interfaces; UE4SS-LICENSE.txt is retained.
