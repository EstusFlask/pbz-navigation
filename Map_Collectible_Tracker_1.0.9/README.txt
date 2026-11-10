PbzMapTracker 1.0.9
Phantom Blade Zero, Steam build 26367565.

REQUIRED
Install UE4SS #5 version 1.0.3 first.
https://www.nexusmods.com/phantombladezero/mods/5

INSTALL / UPDATE
Close the game and back up your settings.
Remove the previous ProjectPBZ/PBZModLoader/mods/pbz-map-tracker/ folder when upgrading from the JavaScript version. For older releases, remove zzz_PBZMapTracker_P.pak, zzz_PBZMapTracker_P.utoc and zzz_PBZMapTracker_P.ucas from ProjectPBZ/Content/Paks/~mods/.
Copy this ZIP's platform folder into the game folder and merge folders.
The mod belongs in platform/steam/ue4ss/Mods/PbzMapTracker/. Existing settings are preserved.

REMOVE
Close the game and remove platform/steam/ue4ss/Mods/PbzMapTracker/. Keep your settings and shared runtimes used by other mods.

Fix loss of minimap host ownership while the player pawn is temporarily unavailable, leaving an old view unmanaged. Fix stale guide cleanup cancelling a newly selected target, and failed marker replacement abandoning a visible old marker. The latest target resumes after cleanup recovers. Production-code, protected-payload and original-loader regressions passed locally; this release has not been tested in game. Talisman travel and other causes of missing minimaps remain under investigation.
