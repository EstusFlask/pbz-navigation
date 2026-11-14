"""Observe game-foreground Y presses and timestamp field cases, without sending input."""
from __future__ import annotations

import argparse
import ctypes as C
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import time
from pbz_field_io import publish_json


def utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class PressGate:
    def __init__(self, cooldown=2.):
        self.previous = False
        self.last = float("-inf")
        self.cooldown = cooldown

    def update(self, down, game_foreground, now):
        rising = down and not self.previous
        self.previous = bool(down)
        if rising and game_foreground and now - self.last >= self.cooldown:
            self.last = now
            return True
        return False


def read_json(path):
    try:
        return json.loads(path.read_text("utf-8-sig"))
    except (OSError, ValueError):
        return None


def tail_records(path, since, limit=2 * 1024 * 1024):
    try:
        with path.open("rb") as stream:
            stream.seek(0, 2)
            size = stream.tell()
            stream.seek(max(0, size - limit))
            raw = stream.read()
        rows = raw.splitlines()
        if size > limit:
            rows = rows[1:]
        result = []
        for line in rows:
            try:
                row = json.loads(line.decode("utf-8"))
                if row.get("capturedAt", "") >= since:
                    result.append(row)
            except (ValueError, UnicodeError):
                continue
        return result
    except OSError:
        return []


def capture_case(session, at, source, game_pid):
    safe = at.replace("-", "").replace(":", "").replace("+00:00", "Z")
    case = session / ("case-" + safe + "-Y")
    case.mkdir()
    runtime = read_json(session / "runtime-status.json")
    logs = read_json(session / "status.json")
    marker = {"at": at, "case": case.name, "source": source,
              "label": "User Y: navigation problem here", "gamePid": game_pid,
              "runtime": runtime, "logs": logs,
              "timing": "OS button rising edge; player snapshot may lag up to 0.5 seconds"}
    (case / "marker.json").write_text(json.dumps(marker, ensure_ascii=False, indent=2), "utf-8")
    index = {k: marker[k] for k in ["at", "case", "source", "label"]}
    with (session / "markers.jsonl").open("ab") as stream:
        stream.write((json.dumps(index, ensure_ascii=False) + "\n").encode("utf-8"))
    since = (datetime.fromisoformat(at) - timedelta(seconds=20)).isoformat(timespec="milliseconds")
    for name in ["player", "events"]:
        rows = tail_records(session / (name + ".jsonl"), since)
        (case / (name + "-before.jsonl")).write_text(
            "".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows), "utf-8")
    return {"at": at, "case": case.name, "source": source}


class Inputs:
    class Gamepad(C.Structure):
        _fields_ = [("buttons", C.c_ushort), ("leftTrigger", C.c_ubyte), ("rightTrigger", C.c_ubyte),
                    ("thumbLX", C.c_short), ("thumbLY", C.c_short),
                    ("thumbRX", C.c_short), ("thumbRY", C.c_short)]

    def __init__(self, game_pid):
        class State(C.Structure):
            _fields_ = [("packet", C.c_uint32), ("gamepad", self.Gamepad)]
        self.state_type = State
        self.game_pid = game_pid
        self.user = C.WinDLL("user32", use_last_error=True)
        self.user.GetForegroundWindow.restype = C.c_void_p
        self.user.GetWindowThreadProcessId.argtypes = [C.c_void_p, C.POINTER(C.c_uint32)]
        self.user.GetAsyncKeyState.argtypes = [C.c_int]
        self.user.GetAsyncKeyState.restype = C.c_short
        self.xinput = None
        for name in ["xinput1_4.dll", "xinput1_3.dll", "xinput9_1_0.dll"]:
            try:
                self.xinput = C.WinDLL(name)
                self.xinput.XInputGetState.argtypes = [C.c_uint32, C.POINTER(State)]
                self.xinput.XInputGetState.restype = C.c_uint32
                break
            except OSError:
                pass
        self.kernel = C.WinDLL("kernel32", use_last_error=True)
        self.kernel.OpenProcess.argtypes = [C.c_uint32, C.c_int, C.c_uint32]
        self.kernel.OpenProcess.restype = C.c_void_p
        self.kernel.GetExitCodeProcess.argtypes = [C.c_void_p, C.POINTER(C.c_uint32)]
        self.kernel.CloseHandle.argtypes = [C.c_void_p]
        self.handle = self.kernel.OpenProcess(0x1000, False, game_pid)
        if not self.handle:
            raise OSError(C.get_last_error(), "Game process unavailable")

    def alive(self):
        code = C.c_uint32()
        return bool(self.kernel.GetExitCodeProcess(self.handle, C.byref(code))) and code.value == 259

    def sample(self):
        foreground = C.c_uint32()
        self.user.GetWindowThreadProcessId(self.user.GetForegroundWindow(), C.byref(foreground))
        connected, sources = [], []
        if self.user.GetAsyncKeyState(0x59) & 0x8000:
            sources.append("keyboard-Y")
        if self.xinput:
            for index in range(4):
                state = self.state_type()
                if self.xinput.XInputGetState(index, C.byref(state)) == 0:
                    connected.append(index)
                    if state.gamepad.buttons & 0x8000:
                        sources.append(f"gamepad-{index}-Y")
        return bool(sources), foreground.value == self.game_pid, connected, sources

    def close(self):
        self.kernel.CloseHandle(self.handle)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--duration", type=float, default=14400)
    args = parser.parse_args()
    inputs, gate = Inputs(args.pid), PressGate()
    status = {"protocol": "PBZFieldMarkers", "version": 1, "active": True,
              "gamePid": args.pid, "startedAt": utc(), "markers": 0}
    index = args.session / "markers.jsonl"
    if index.exists():
        existing = {}
        for line in index.read_text("utf-8").splitlines():
            try:
                row = json.loads(line)
                if row.get("source"):
                    existing[row["case"]] = row
            except (ValueError, KeyError):
                continue
        status["markers"] = len(existing)
        if existing:
            status["lastMarker"] = list(existing.values())[-1]
    started, last_status = time.monotonic(), 0.
    try:
        while time.monotonic() - started < args.duration and not (args.session / "stop-markers").exists():
            tick = time.monotonic()
            if tick - last_status >= .5 and not inputs.alive():
                status["reason"] = "game-exited"
                break
            down, foreground, connected, sources = inputs.sample()
            if gate.update(down, foreground, tick):
                marker = capture_case(args.session, utc(), sources, args.pid)
                status.update(markers=status["markers"] + 1, lastMarker=marker)
                print(json.dumps(marker, ensure_ascii=False), flush=True)
            if tick - last_status >= .5:
                status.update(updatedAt=utc(), gameForeground=foreground,
                              connectedControllers=connected, yDown=down)
                publish_json(args.session / "marker-status.json", status)
                last_status = tick
            if status["markers"] >= 100:
                status["reason"] = "100-case-limit"
                break
            time.sleep(max(0, .02 - (time.monotonic() - tick)))
    finally:
        inputs.close()
        status.update(active=False, updatedAt=utc())
        publish_json(args.session / "marker-status.json", status)


if __name__ == "__main__":
    main()
