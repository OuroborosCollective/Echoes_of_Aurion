#!/usr/bin/env python3
"""Validate private MCS Godot PCK structure before an explicitly private build.

PCK v4 entry MD5 is a compatibility/corruption field, not authentication.
PCK integrity is not authorization: the caller must bind the resulting digest
to a separately trusted application build and independently verify its signer.
"""
from __future__ import annotations

import hashlib
from pathlib import PurePosixPath
import re
import struct

MAX_PACK_BYTES = 512 * 1024 * 1024
MAX_ENTRIES = 1000
OVERLAY_METADATA = frozenset({
    ".godot/global_script_class_cache.cfg", ".godot/uid_cache.bin",
})


def _bad(message):
    raise ValueError(message)


def _safe_name(raw):
    try:
        name = raw.rstrip(b"\x00").decode("utf-8", errors="strict")
    except UnicodeError:
        _bad("PCK_PATH_ENCODING")
    if not name or b"\x00" in raw[:len(name.encode("utf-8"))] or "\\" in name:
        _bad("PCK_PATH_INVALID")
    parts = name.split("/")
    if any(part in ("", ".", "..") for part in parts) or PurePosixPath(name).is_absolute():
        _bad("PCK_PATH_INVALID")
    return name


def inspect_pck(data):
    """Parse the pinned Godot 4.7.2 V4 non-encrypted, non-sparse PCK format."""
    if not isinstance(data, bytes) or not 112 <= len(data) <= MAX_PACK_BYTES:
        _bad("PCK_SIZE_INVALID")
    magic, version, major, minor, patch, flags, base, directory = struct.unpack_from("<4sIIIIIQQ", data)
    if (magic, version, major, minor, patch, flags) != (b"GDPC", 4, 4, 7, 2, 2):
        _bad("PCK_HEADER_INVALID")
    if base != 112 or not base <= directory <= len(data) - 4:
        _bad("PCK_DIRECTORY_INVALID")
    count = struct.unpack_from("<I", data, directory)[0]
    if not 1 <= count <= MAX_ENTRIES:
        _bad("PCK_COUNT_INVALID")
    pos = directory + 4
    entries = {}
    folded = set()
    spans = []
    for _ in range(count):
        if pos + 4 > len(data):
            _bad("PCK_DIRECTORY_TRUNCATED")
        length = struct.unpack_from("<I", data, pos)[0]
        start = pos
        pos += 4
        if not 1 <= length <= 4096 or pos + length + 36 > len(data):
            _bad("PCK_ENTRY_TRUNCATED")
        name = _safe_name(data[pos:pos + length])
        pos += length
        offset, size, md5, entry_flags = struct.unpack_from("<QQ16sI", data, pos)
        pos += 36
        if name.casefold() in folded:
            _bad("PCK_DUPLICATE_PATH")
        folded.add(name.casefold())
        absolute = base + offset
        if entry_flags != 0 or absolute < base or absolute + size > directory:
            _bad("PCK_ENTRY_RANGE_OR_FLAGS")
        content = data[absolute:absolute + size]
        if hashlib.md5(content, usedforsecurity=False).digest() != md5:
            _bad("PCK_ENTRY_INTEGRITY")
        if size:
            spans.append((absolute, absolute + size))
        entries[name] = {"offset": absolute, "size": size, "record": data[start:pos], "content": content}
    if pos != len(data):
        _bad("PCK_TRAILING_DATA")
    spans.sort()
    if any(right[0] < left[1] for left, right in zip(spans, spans[1:])):
        _bad("PCK_OVERLAPPING_ENTRIES")
    return {"directory": directory, "entries": entries}


def strip_and_validate_vendor_pack(data):
    parsed = inspect_pck(data)
    entries = parsed["entries"]
    if "project.binary" not in entries or not OVERLAY_METADATA.issubset(entries):
        _bad("PCK_REQUIRED_METADATA_MISSING")
    for name in entries:
        if name == "project.binary" or name in OVERLAY_METADATA:
            continue
        if not name.startswith(("addons/modular_character_system/", ".godot/imported/", ".godot/exported/")):
            _bad("PCK_UNEXPECTED_NAMESPACE")
    if not any(name.startswith("addons/modular_character_system/") for name in entries):
        _bad("PCK_VENDOR_MISSING")
    kept = [entry["record"] for name, entry in entries.items() if name != "project.binary"]
    result = data[:parsed["directory"]] + struct.pack("<I", len(kept)) + b"".join(kept)
    validated = inspect_pck(result)
    if "project.binary" in validated["entries"]:
        _bad("PCK_PROJECT_BINARY_PRESENT")
    return result


def class_names(data):
    try:
        source = data.decode("utf-8", errors="strict")
    except UnicodeError:
        _bad("CLASS_CACHE_ENCODING")
    names = re.findall(r'"class"\s*:\s*&?"([A-Za-z_][A-Za-z0-9_]*)"', source)
    if len(names) != source.count('"class"') or len(names) != len(set(names)):
        _bad("CLASS_CACHE_INVALID")
    return set(names)


def uid_entries(data):
    if len(data) < 4:
        _bad("UID_CACHE_INVALID")
    count = struct.unpack_from("<I", data)[0]
    if count > 100000:
        _bad("UID_CACHE_INVALID")
    pos = 4
    values = {}
    for _ in range(count):
        if pos + 12 > len(data):
            _bad("UID_CACHE_INVALID")
        uid, length = struct.unpack_from("<QI", data, pos)
        pos += 12
        if not 1 <= length <= 4096 or pos + length > len(data) or uid in values:
            _bad("UID_CACHE_INVALID")
        try:
            path = data[pos:pos + length].decode("utf-8", errors="strict")
        except UnicodeError:
            _bad("UID_CACHE_INVALID")
        if not path.startswith("res://") or "\\" in path or ".." in path.split("/"):
            _bad("UID_CACHE_INVALID")
        values[uid] = path
        pos += length
    if pos != len(data):
        _bad("UID_CACHE_INVALID")
    return values


def assert_compatible_overlay(vendor_pack, host_pack):
    vendor = inspect_pck(vendor_pack)["entries"]
    host = inspect_pck(host_pack)["entries"]
    if "project.binary" in vendor or not OVERLAY_METADATA.issubset(vendor) or not OVERLAY_METADATA.issubset(host):
        _bad("OVERLAY_METADATA_INVALID")
    if any(name not in OVERLAY_METADATA and not name.startswith(("addons/modular_character_system/", ".godot/imported/", ".godot/exported/")) for name in vendor):
        _bad("PCK_UNEXPECTED_NAMESPACE")
    vendor_paths = {name.casefold() for name in vendor if name not in OVERLAY_METADATA}
    host_paths = {name.casefold() for name in host}
    if vendor_paths & host_paths:
        _bad("OVERLAY_PATH_COLLISION")
    classes = ".godot/global_script_class_cache.cfg"
    uids = ".godot/uid_cache.bin"
    if {name.casefold() for name in class_names(vendor[classes]["content"])} & {name.casefold() for name in class_names(host[classes]["content"])}:
        _bad("OVERLAY_CLASS_COLLISION")
    if uid_entries(vendor[uids]["content"]).keys() & uid_entries(host[uids]["content"]).keys():
        _bad("OVERLAY_UID_COLLISION")
