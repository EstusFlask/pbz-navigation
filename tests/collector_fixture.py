"""Resolve the maintained 1.0.14 reference. Never restore a removed legacy copy."""
from pathlib import Path


def current_fixture(root: Path) -> Path:
    fixtures = sorted(path for path in root.glob('Map_Collectible_Tracker_1.0.14*') if path.is_dir())
    if len(fixtures) != 1:
        raise RuntimeError('Exactly one Map Collectible Tracker 1.0.14 reference is required')
    entry = fixtures[0]/'platform/steam/ue4ss/Mods/PbzMapTracker/Scripts/main.lua'
    if not entry.is_file():
        raise RuntimeError('Map Collectible Tracker 1.0.14 reference is incomplete')
    return fixtures[0]
