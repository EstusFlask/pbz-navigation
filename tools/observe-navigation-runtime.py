"""Read-only, session-bound PBZ player telemetry. Never calls code in the game.

The registry is a live discovery artifact, not a reusable pointer/offset preset.
Only query/read process access is requested. Stop with <output>/stop-runtime.
"""
from __future__ import annotations

import argparse
import ctypes as C
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import struct
import time
from pbz_field_io import publish_json


def utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class Memory:
    def __init__(self, pid):
        self.kernel = C.WinDLL("kernel32", use_last_error=True)
        self.kernel.OpenProcess.argtypes = [C.c_uint32, C.c_int, C.c_uint32]
        self.kernel.OpenProcess.restype = C.c_void_p
        self.kernel.ReadProcessMemory.argtypes = [C.c_void_p, C.c_void_p, C.c_void_p,
                                                 C.c_size_t, C.POINTER(C.c_size_t)]
        self.kernel.CloseHandle.argtypes = [C.c_void_p]
        self.kernel.GetExitCodeProcess.argtypes = [C.c_void_p, C.POINTER(C.c_uint32)]
        self.handle = self.kernel.OpenProcess(0x1010, False, pid)
        if not self.handle:
            raise OSError(C.get_last_error(), "OpenProcess(query/read)")

    def read(self, address, size):
        if not 0x10000 <= address < 0x7FFFFFFFFFFF or not 0 < size <= 0x4000000:
            raise ValueError("Invalid read range")
        buffer = C.create_string_buffer(size)
        got = C.c_size_t()
        if not self.kernel.ReadProcessMemory(self.handle, address, buffer, size, C.byref(got)) or got.value != size:
            raise OSError(C.get_last_error(), "ReadProcessMemory")
        return buffer.raw

    def u64(self, address):
        return struct.unpack("<Q", self.read(address, 8))[0]

    def u32(self, address):
        return struct.unpack("<I", self.read(address, 4))[0]

    def close(self):
        self.kernel.CloseHandle(self.handle)

    def alive(self):
        code = C.c_uint32()
        return bool(self.kernel.GetExitCodeProcess(self.handle, C.byref(code))) and code.value == 259


class Reflection:
    def __init__(self, memory, registry):
        self.m = memory
        self.pool = registry["pool"]
        self.objects = registry["objects"]
        self.names, self.schemas = {}, {}

    def name(self, index):
        if index not in self.names:
            block = index >> 16
            if block > self.m.u32(self.pool + 8) or block > 8191:
                raise ValueError("Name pool mismatch")
            address = self.m.u64(self.pool + 0x10 + block * 8) + (index & 0xFFFF) * 2
            header = struct.unpack("<H", self.m.read(address, 2))[0]
            size = header >> 6
            if not 0 < size <= 1024:
                raise ValueError("Invalid name length")
            wide = header & 1
            self.names[index] = self.m.read(address + 2, size * (2 if wide else 1)).decode(
                "utf-16le" if wide else "utf-8", errors="replace")
        return self.names[index]

    def object_name(self, address):
        index, number = struct.unpack("<II", self.m.read(address + 0x18, 8))
        return self.name(index) + (f"_{number - 1}" if number else "")

    def schema(self, cls):
        if cls in self.schemas:
            return self.schemas[cls]
        result, base, visited = {}, cls, set()
        while base and base not in visited and len(visited) < 32:
            visited.add(base)
            field = self.m.u64(base + 0x50)
            for _ in range(2048):
                if not field:
                    break
                raw = self.m.read(field, 0x80)
                name = self.name(struct.unpack_from("<I", raw, 0x20)[0])
                offset = struct.unpack_from("<I", raw, 0x44)[0]
                size = struct.unpack_from("<I", raw, 0x34)[0]
                if offset > 0x100000 or size > 0x100000:
                    raise ValueError("Property layout mismatch")
                result.setdefault(name, {"offset": offset, "size": size,
                                        "bool": list(raw[0x70:0x74]),
                                        "typePointer": struct.unpack_from("<Q", raw, 0x70)[0]})
                field = struct.unpack_from("<Q", raw, 0x10)[0]
            base = self.m.u64(base + 0x40)
        self.schemas[cls] = result
        return result

    def fields(self, obj):
        return self.schema(self.m.u64(obj + 0x10))

    def raw(self, obj, fields, name, expected=None):
        field = fields[name]
        if expected is not None and field["size"] != expected:
            raise ValueError(f"Unexpected size: {name}")
        return self.m.read(obj + field["offset"], field["size"])

    def pointer(self, obj, fields, name):
        return struct.unpack("<Q", self.raw(obj, fields, name, 8))[0]

    def boolean(self, obj, field):
        size, byte, mask, field_mask = field["bool"]
        if size != 1 or not field_mask:
            raise ValueError("Invalid bool metadata")
        return bool(self.m.read(obj + field["offset"] + byte, 1)[0] & field_mask)

    def vector(self, obj, fields, name):
        values = struct.unpack("<ddd", self.raw(obj, fields, name, 24))
        if not all(math.isfinite(v) and abs(v) < 1e9 for v in values):
            raise ValueError("Invalid vector")
        return [round(v, 3) for v in values]

    def outer_world(self, obj):
        for _ in range(8):
            if not obj:
                break
            if self.object_name(self.m.u64(obj + 0x10)) == "World":
                return self.object_name(obj)
            obj = self.m.u64(obj + 0x20)
        return None

    def discover_controller(self, class_pointer):
        chunks, count = self.m.u64(self.objects + 0x18), self.m.u32(self.objects + 0x20)
        if not 0 < count < 5_000_000:
            raise ValueError("Object registry mismatch")
        for i in range((count + 0xFFFF) // 0x10000):
            chunk = self.m.u64(chunks + i * 8)
            raw = self.m.read(chunk, min(0x10000, count - i * 0x10000) * 24)
            for at in range(8, len(raw), 24):
                ptr = struct.unpack_from("<Q", raw, at)[0]
                if not ptr:
                    continue
                try:
                    if self.m.u64(ptr + 0x10) != class_pointer:
                        continue
                    fields = self.schema(class_pointer)
                    player = self.pointer(ptr, fields, "Player")
                    # Only the live local player's controller, never a CDO/NPC.
                    if player and not self.object_name(ptr).startswith("Default__"):
                        return ptr
                except (OSError, ValueError):
                    pass
        raise ValueError("Local player controller not resident")


class Observer:
    def __init__(self, reflection, registry):
        self.ue, self.m = reflection, reflection.m
        controllers = [t for t in registry["targets"] if "PlayerController" in t["class"]]
        if len(controllers) != 1:
            raise ValueError("Expected one discovered local controller")
        self.controller = controllers[0]["ptr"]
        self.controller_class = controllers[0]["classPtr"]
        if self.m.u64(self.controller + 0x10) != self.controller_class:
            self.controller = self.ue.discover_controller(self.controller_class)
        self.player = self.ue.pointer(self.controller, self.ue.fields(self.controller), "Player")
        self.player_class = self.m.u64(self.player + 0x10)
        self.current = None

    def sample(self):
        ue, m = self.ue, self.m
        if m.u64(self.player + 0x10) != self.player_class:
            raise ValueError("Local player identity changed; rediscovery required")
        self.controller = ue.pointer(self.player, ue.fields(self.player), "PlayerController")
        if not self.controller or m.u64(self.controller + 0x10) != self.controller_class:
            raise ValueError("Player controller changing during map load")
        cf = ue.fields(self.controller)
        pawn = ue.pointer(self.controller, cf, "Pawn")
        if not pawn:
            raise ValueError("Player pawn not resident")
        identity = m.read(pawn + 0xC, 20)
        pf = ue.fields(pawn)
        capsule = ue.pointer(pawn, pf, "CapsuleComponent")
        movement = ue.pointer(pawn, pf, "CharacterMovement")
        capf, mf = ue.fields(capsule), ue.fields(movement)
        location = ue.vector(capsule, capf, "RelativeLocation")
        scale = ue.vector(capsule, capf, "RelativeScale3D")
        half = struct.unpack("<f", ue.raw(capsule, capf, "CapsuleHalfHeight", 4))[0]
        radius = struct.unpack("<f", ue.raw(capsule, capf, "CapsuleRadius", 4))[0]
        parent = ue.pointer(capsule, capf, "AttachParent")
        absolute = ue.boolean(capsule, capf["bAbsoluteLocation"])
        world_location = not parent or absolute
        floor_field = mf["CurrentFloor"]
        floor_fields = ue.schema(floor_field["typePointer"])
        floor_base = movement + floor_field["offset"]
        floor = {}
        for name in ["bBlockingHit", "bWalkableFloor", "bLineTrace"]:
            if name in floor_fields:
                floor[name] = ue.boolean(floor_base, floor_fields[name])
        if "HitResult" in floor_fields:
            hit = floor_fields["HitResult"]
            hit_fields = ue.schema(hit["typePointer"])
            for name in ["ImpactPoint", "ImpactNormal", "Location", "Normal"]:
                if name in hit_fields:
                    floor[name] = ue.vector(floor_base + hit["offset"], hit_fields, name)
        for name in ["FloorDist", "LineDist"]:
            if name in floor_fields and floor_fields[name]["size"] == 4:
                value = struct.unpack("<f", ue.raw(floor_base, floor_fields, name, 4))[0]
                if math.isfinite(value):
                    floor[name] = round(value, 4)
        actions = {}
        for component in ["SpecialMove", "ASM_SpecialMoveComponent", "Actor State Component"]:
            if component not in pf:
                continue
            ptr = ue.pointer(pawn, pf, component)
            if not ptr:
                continue
            fields, state = ue.fields(ptr), {}
            for name, field in fields.items():
                if not any(k in name.lower() for k in ["current", "active", "volume", "state", "targetactor"]):
                    continue
                if field["size"] <= 32:
                    raw = m.read(ptr + field["offset"], field["size"])
                    state[name] = {"raw": raw.hex()}
                    # Preserve raw data; resolve only valid-looking UObject pointers.
                    if field["size"] == 8:
                        value = struct.unpack("<Q", raw)[0]
                        if 0x10000 <= value < 0x7FFFFFFFFFFF:
                            try:
                                state[name]["object"] = ue.object_name(value)
                            except (ValueError, OSError, UnicodeError):
                                pass
            actions[component] = {"name": ue.object_name(ptr), "fields": state}
        if m.read(pawn + 0xC, 20) != identity:
            raise ValueError("Pawn changed during sample")
        row = {"capturedAt": utc(), "world": ue.outer_world(pawn), "pawn": ue.object_name(pawn),
               "positionSource": "capsule-relative" if parent and not absolute else "unattached-or-absolute-capsule",
               "capsuleLocation": location, "capsuleScale": scale, "attachParent": parent,
               "halfHeight": round(half * abs(scale[2]), 3), "radius": round(radius * max(abs(scale[0]), abs(scale[1])), 3),
               "feet": [location[0], location[1], round(location[2] - half * abs(scale[2]), 3)] if world_location else None,
               "movementMode": ue.raw(movement, mf, "MovementMode", 1)[0],
               "customMode": ue.raw(movement, mf, "CustomMovementMode", 1)[0],
               "velocity": ue.vector(movement, mf, "Velocity"), "floor": floor, "actions": actions}
        return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--duration", type=float, default=14400)
    args = parser.parse_args()
    registry = json.loads(args.registry.read_text("utf-8"))
    memory = Memory(registry["pid"])
    ue = Reflection(memory, registry)
    observer = Observer(ue, registry)
    args.output.mkdir(parents=True, exist_ok=True)
    status = {"protocol": "PBZReadOnlyRuntime", "version": 1, "active": True,
              "pid": registry["pid"], "startedAt": utc(), "samples": 0, "failures": 0}
    started, last_status, last_error = time.monotonic(), 0., None
    try:
        with (args.output / "player.jsonl").open("a", encoding="utf-8", buffering=1) as out:
            while time.monotonic() - started < args.duration and not (args.output / "stop-runtime").exists():
                tick = time.monotonic()
                try:
                    row = observer.sample()
                    out.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                    status.update(samples=status["samples"] + 1, lastSample=row, error=None)
                    last_error = None
                except (OSError, ValueError, KeyError, struct.error, UnicodeError) as exc:
                    status.update(failures=status["failures"] + 1, error=str(exc))
                    if not memory.alive():
                        status["reason"] = "game-exited"
                        break
                    if str(exc) != last_error:
                        out.write(json.dumps({"capturedAt": utc(), "kind": "read-gap", "error": str(exc)}) + "\n")
                        last_error = str(exc)
                    # No data is inferred across map changes, GC or unreadable samples.
                    time.sleep(.5)
                status["updatedAt"] = utc()
                if tick - last_status >= .5:
                    publish_json(args.output / "runtime-status.json", status)
                    last_status = tick
                if out.tell() > 200 * 1024 * 1024:
                    status["reason"] = "size-limit"
                    break
                time.sleep(max(0, .1 - (time.monotonic() - tick)))
    finally:
        memory.close()
        status.update(active=False, updatedAt=utc())
        publish_json(args.output / "runtime-status.json", status)


if __name__ == "__main__":
    main()
