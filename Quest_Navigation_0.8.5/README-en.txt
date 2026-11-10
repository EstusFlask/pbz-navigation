Quest and Exploration Navigation 0.8.5-beta (local patch 0.8.5-local-fix5)

Layout: PBZModLoader 1.0.0
Release: 0.8.5-beta.

INSTALL
1. Close the game and install PBZModLoader 1.0.0.
2. Merge this archive's ProjectPBZ folder into the PBZ game root opened through Steam -> Manage -> Browse local files.
3. Confirm the entry: ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/main.js
4. Keep Map Collectible Tracker 1.0.9 unchanged. Install this navigation package's platform folder: PBZQuestRouteCompat is a navigation-owned adapter for the existing UE4SS 1195 Shipping runtime. Minimap route overlays, large icons and accessory hints have not been ported.
5. Start the game normally through Steam.

This layout keeps the PBZModLoader folder structure. Mods Menu is optional for in-game settings.
Choose one full archive. When switching layouts, back up and move out the old PBZQuestRoute folder, preserving Paks/~mods/PBZQuestRoute.txt.
Remove legacy 0.7.x zzz_PBZQuestRoute_P.pak/.utoc/.ucas and PBZQuestRouteMouse before upgrading.

CHANGES
- fix5: repair local rock detours, keep a safe prefix/X/unfinished map tail during and after failed searches, and approach collectibles within interaction range. Follow uneven ground rather than its straight height interpolation.
- fix5: chain static and loaded ladders, climbs, rope swings, slides and lifts with checked walking connectors; respect direction and unlock state. Movement actions still use the game's normal player controls.
- fix4: validate floor/capsule clearance before accepting paths; compare checked 3D path length, including upstairs/downstairs and same-floor detours; remove known-blocked fallbacks. Draw an immediate mesh with no stock trailing particles and keep the endpoint above the floor.
- 46 local regressions and Lua integration checks passed. The reported gear and upstairs locations still need in-game testing; loading, sampling and search budgets limit any shortest-path claim.
- Local patch: bounded far-ribbon collision auditing, update throttling, no spline readbacks, and a navigation-owned UE4SS target bridge. No collector files are modified. Atlas data is unchanged. Not verified in game.
- Confirm startup explicitly and prevent duplicate navigation hooks within a session.
- Native Mods Menu layout and tracker resolution across original, native-menu and generated folders.
- An absent or incompatible optional tracker cannot fail core map/quest navigation startup.
- Retains 0.8.4 routes, cancellation, arrival dismissal, bounded searches and unchanged atlas data.

CONTROLS
- Track quests normally; a newly tracked quest replaces your manual pin.
- Left-click a 1.0.9 collectible icon, or hover it and middle-click for navigation. Middle-click blank map space for a ground pin; hold for about 0.6 seconds to cancel.
- Controller: position the cursor or snap to an item and press A. Hold A on blank map space to cancel.
- Close the filter panel to place pins. Dragging does not place a pin; bell windows keep their native actions.
- Map routes, world thread and minimap routes have separate switches. Choose continuous display or 30 seconds after Sense.
- With no quest/manual target, use Sense inside unexplored fog for reachable local-bell guidance.
- Reaching the target on the same floor dismisses guidance until you select it again.
- Cross-region journeys use walking routes where available, or departure/arrival bell legs. Operate travel yourself.

SETTINGS / DIAGNOSIS
Mods Menu shortcut: F9 by default. Open the navigation section.
Config: ProjectPBZ/Content/Paks/~mods/PBZQuestRoute.txt
Switches (on/off): MapRoute, WorldThread, MinimapRoute, LargeItemIcons, AutoAccessory, FogBellSense.
DisplayMode=Always or DisplayMode=Sense30.
Startup state: PBZQuestRoute-startup.txt in the game's actual Saved directory.
Runtime log: ProjectPBZ/Saved/PBZQuestRoute-log.txt.
Check pins, cancellation, controller items and the minimap before checking the world thread.

Dense intersections, stacked floors and special interactive passages can still cause detours, missing routes or incorrect connections in some areas. Follow the actual environment if a route is blocked; these routes will continue to be corrected.
Most size comes from 11 world graphs and walking-surface datasets; this update leaves them unchanged.
To uninstall, close the game and move out only this package's PBZQuestRoute script folder and ProjectPBZ/Content/Mods/PBZQuestRoute.
