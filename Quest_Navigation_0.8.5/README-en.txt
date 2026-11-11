Quest and Exploration Navigation - Fork
Version: 0.8.8-fork.1 (experimental release candidate)
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
- Validate floor support and capsule clearance; compare feasible 3D walking lengths and reject known-blocked fallbacks.
- Roll back 0.9.0 alternatives to delivered 0.8.7 single-route behavior. Try local detours within about 120 m; preserve checked map prefixes, blocked X markers and unfinished dashed tails. The scene strand stops at checked positions.
- Approach collectibles within same-floor interaction range and follow uneven ground.
- Chain recognized ladders, climbs, rope/grapple links, slides and lifts with direction/unlock checks. Operate traversal actions yourself.
- Replace trailing particles with an immediate thin-line mesh, keep endpoints above ground, bound far-segment collision checks and repeated updates.
- Sync original collector 1.0.9 targets/cancellation with a navigation-owned adapter; preserve item height on middle-click.
- Correct buried interaction anchors; refresh the planning origin after landing, changing floors or capsule dimensions without reselecting the target.
- Remove candidate collection, background alternative searches and the three-color overlay. Retain the single-route obstacle/lock logic.
- Merge data strings from 256 KiB to 512 KiB: 1772 loading modules become 951, about 1333 files in the full package. Original data values are preserved.
- Reuse unchanged vertex colors and skip capsule reads in throttled callbacks. Keep the existing sampling, collision checks and update frequency.
- Avoid testing all collectible standing positions before trying an action chain; nearby climbs are considered even when the player starts near the target height.
- Limit mesh updates to about 30 Hz and cache identical near collision geometry for 250 ms. Equivalent blocked previews retain their caches. Navigation never cold-loads interaction classes.
- Load atlas modules and columns incrementally. A first regional load takes several seconds, then replans automatically. Original route values are preserved.
- Unify runtime, native adapter, ZIP and docs as 0.8.8-fork.1; label the settings entry as Fork.

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
84 local JS regressions, 21 differential mesh cases, original data hashes, Lua integration, native tests and ZIP checks pass. This candidate has not been tested in game; no measured FPS, global-shortest-path or earlier-route-fix claim. Original world data values are retained. Choose Update in the manager, or move out the old script folder before manual installation, to avoid leftover shards.
Close the game and remove this package's PBZQuestRoute script folder, ProjectPBZ/Content/Mods/PBZQuestRoute/ and platform/steam/ue4ss/Mods/PBZQuestRouteCompat/, or uninstall via the manager. Preserve settings, collector and shared runtimes. Move out Fork scripts/adapter before restoring upstream.

CREDITS
azqwq333: original navigation, world graphs, walking surfaces and original assets.
PiPiFanDev: separate Map Tracker Plus, not bundled or maintained by this fork.
UE4SS contributors: public runtime interfaces; UE4SS-LICENSE.txt is retained.
