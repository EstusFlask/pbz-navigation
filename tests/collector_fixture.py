"""Resolve the original pinned collector test fixture without restoring deletes.

The user's current collector folder is never changed or treated as a compatible
version. If the old fixture was removed, read its Git tree into build/ only.
"""
from pathlib import Path
import io
import hashlib
import subprocess
import tarfile


def original_fixture(root):
    folder = 'Map_Collectible_Tracker_1.0.9'
    current = root / folder
    if current.is_dir():
        return current
    tree = subprocess.check_output(['git', 'rev-parse', 'HEAD:'+folder], cwd=root, text=True).strip()
    output = root / 'build/test-references' / ('collector-1.0.9-'+tree)
    # git archive can apply the host's checkout EOL conversion. The native
    # compatibility gate is byte-exact, so materialize the original LF bytes.
    blob = subprocess.check_output(['git', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf',
                                    'archive', 'HEAD:'+folder], cwd=root)
    output.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
        for item in archive.getmembers():
            destination = (output / item.name).resolve()
            assert destination.is_relative_to(output.resolve()), 'fixture path escaped build directory'
            assert item.isfile() or item.isdir(), 'unexpected fixture symlink/type'
            if item.isdir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.extractfile(item).read())
    entry = output / 'platform/steam/ue4ss/Mods/PbzMapTracker/Scripts/main.lua'
    assert hashlib.sha256(entry.read_bytes()).hexdigest() == '196e2780771516feb76603f60c05f81921cfa32346024b6e0ee2c897ec3c5192', 'original collector fixture bytes changed'
    return output
