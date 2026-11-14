"""Archive a live PBZ diagnostic session without changing the game or its files.

Run with --pid and --output; create <output>/stop to end the session. The source
navigation log is a rewritten ring, while the loader and UE4SS logs append.
"""
from __future__ import annotations

import argparse
from collections import deque
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import time
from pbz_field_io import publish_json


def utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class Sources:
    def __init__(self, game_root, local_saved):
        root = Path(game_root)
        self.append = {
            "loader": root / "ProjectPBZ/PBZModLoader/loader.log",
            "ue4ss": root / "platform/steam/ue4ss/UE4SS.log",
        }
        self.ring = root / "ProjectPBZ/Saved/PBZQuestRoute-log.txt"
        self.json = {"tracker": Path(local_saved) / "PBZQuestRoute-tracker.json"}
        self.offsets, self.pending, self.identities = {}, {}, {}
        self.ring_seen, self.ring_order = set(), deque()
        self.last_json = {}

    def read(self, initial=False):
        events = []
        for name, path in self.append.items():
            try:
                stat = path.stat()
                identity = (stat.st_dev, stat.st_ino)
                offset = self.offsets.get(name, 0)
                replaced = name in self.identities and identity != self.identities[name]
                if replaced or stat.st_size < offset:
                    offset = 0
                    self.pending[name] = b""
                    events.append({"source": name, "kind": "log-reset"})
                with path.open("rb") as stream:
                    stream.seek(offset)
                    data = stream.read(4 * 1024 * 1024)
                    self.offsets[name] = stream.tell()
                self.identities[name] = identity
                data = self.pending.get(name, b"") + data
                rows = data.split(b"\n")
                self.pending[name] = rows.pop()
                for row in rows:
                    text = row.decode("utf-8", errors="replace").rstrip("\r")
                    if ("PBZQuestRoute" in text or "QuestRoute" in text):
                        events.append({"source": name, "kind": "log", "line": text,
                                       "baseline": initial})
            except (OSError, ValueError):
                pass
        try:
            # Read-only ring: remember raw complete entries; never truncate it.
            text = self.ring.read_text("utf-8", errors="replace")
            for line in text.splitlines():
                if not line or line in self.ring_seen:
                    continue
                self.ring_seen.add(line)
                self.ring_order.append(line)
                while len(self.ring_order) > 4096:
                    self.ring_seen.discard(self.ring_order.popleft())
                events.append({"source": "navigation-ring", "kind": "log",
                               "line": line, "baseline": initial})
        except OSError:
            pass
        for name, path in self.json.items():
            try:
                payload = json.loads(path.read_text("utf-8-sig"))
                # Keep meaningful changes, not the bridge's one-second heartbeat.
                meaningful = {k: v for k, v in payload.items() if k != "writtenAt"}
                digest = hashlib.sha256(json.dumps(meaningful, sort_keys=True).encode()).digest()
                if self.last_json.get(name) != digest:
                    self.last_json[name] = digest
                    events.append({"source": name, "kind": "snapshot", "value": payload,
                                   "baseline": initial})
            except (OSError, ValueError, TypeError):
                pass
        return events


def process_running(pid):
    if os.name != "nt":
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
    import ctypes as C
    kernel = C.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [C.c_uint32, C.c_int, C.c_uint32]
    kernel.OpenProcess.restype = C.c_void_p
    kernel.GetExitCodeProcess.argtypes = [C.c_void_p, C.POINTER(C.c_uint32)]
    kernel.CloseHandle.argtypes = [C.c_void_p]
    handle = kernel.OpenProcess(0x1000, False, pid)  # QUERY_LIMITED_INFORMATION only
    if not handle:
        return False
    try:
        code = C.c_uint32()
        return bool(kernel.GetExitCodeProcess(handle, C.byref(code))) and code.value == 259
    finally:
        kernel.CloseHandle(handle)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-root", type=Path,
                        default=Path(r"D:/software/Steam/steamapps/common/PBZ"))
    parser.add_argument("--local-saved", type=Path,
                        default=Path(os.environ.get("LOCALAPPDATA", ".")) / "ProjectPBZ/Saved")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--duration", type=float, default=14400)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    source = Sources(args.game_root, args.local_saved)
    started = time.monotonic()
    status = {"protocol": "PBZFieldSession", "version": 1, "startedAt": utc(),
              "pid": os.getpid(), "gamePid": args.pid, "active": True,
              "events": 0, "liveEvents": 0, "lastLiveEvent": None,
              "scope": "read-only-log-archive", "output": str(args.output.resolve())}
    status_path = args.output / "status.json"
    with (args.output / "events.jsonl").open("a", encoding="utf-8", buffering=1) as out:
        first = True
        try:
            while time.monotonic() - started < args.duration:
                if (args.output / "stop").exists():
                    status["reason"] = "stop-requested"
                    break
                if not process_running(args.pid):
                    status["reason"] = "game-exited"
                    break
                for event in source.read(initial=first):
                    event["capturedAt"] = utc()
                    out.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")
                    status["events"] += 1
                    if not event.get("baseline", False):
                        status["liveEvents"] += 1
                        status["lastLiveEvent"] = event
                first = False
                status["updatedAt"] = utc()
                publish_json(status_path, status)
                if out.tell() > 200 * 1024 * 1024:
                    status["reason"] = "size-limit"
                    break
                time.sleep(.25)
            else:
                status["reason"] = "duration-limit"
        except KeyboardInterrupt:
            status["reason"] = "interrupted"
        finally:
            status.update(active=False, updatedAt=utc())
            publish_json(status_path, status)
    print(json.dumps(status, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
