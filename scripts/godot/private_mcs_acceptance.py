#!/usr/bin/env python3
"""Opt-in private MCS acceptance; all purchased files stay in a temporary tree."""
import argparse
import hashlib
import importlib.util
from pathlib import Path
import re
import shutil
import sys
import tempfile

sys.dont_write_bytecode = True
from private_mcs_pack_builder import REPO, STANDARD_GLB_SHA, build_vendor_pack, godot, prepare_host
from private_mcs_pack_guard import inspect_pck


def require_marker(output, marker):
    if marker not in output:
        raise RuntimeError("PRIVATE_MCS_EXPECTED_MARKER_MISSING: " + marker)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--godot", required=True, type=Path)
    args = parser.parse_args()
    editor = args.godot.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="aurion-private-mcs-") as directory:
        temp = Path(directory)
        invalid_archive = temp / "invalid-archive.zip"
        shutil.copyfile(args.archive, invalid_archive)
        with invalid_archive.open("r+b") as stream:
            stream.seek(0)
            first = stream.read(1)
            if not first:
                raise RuntimeError("MCS_ARCHIVE_EMPTY")
            stream.seek(0)
            stream.write(bytes([first[0] ^ 1]))
        invalid_project = temp / "invalid-project"
        invalid_project.mkdir(mode=0o700)
        (invalid_project / "project.godot").write_text("config_version=5\n")
        spec = importlib.util.spec_from_file_location("acceptance_mcs_stager", REPO / "scripts/godot/stage_modular_npc.py")
        stager = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stager)
        try:
            stager.install(invalid_archive, invalid_project)
        except ValueError as exc:
            if str(exc) != "archive hash mismatch":
                raise
        else:
            raise RuntimeError("MCS_ALTERED_ARCHIVE_ACCEPTED")
        invalid_archive.unlink()
        pack_bytes, _archive_sha, revision = build_vendor_pack(args.archive, editor, temp)
        host, outer, _pack_sha = prepare_host(editor, temp, pack_bytes, revision)
        output = godot(editor, host, ["--script", "tests/test_modular_npc_private_runtime.gd"])
        require_marker(output, "AURION_PRIVATE_MCS_1_0_RIG_PASS")
        output = godot(editor, host, ["--script", "tests/test_modular_npc_private_fallback.gd"])
        require_marker(output, "PRIVATE_MCS_LATE_RIG_FALLBACK_PASS")
        output = godot(editor, host, ["--main-pack", str(outer), "--script", "res://mcs_pck_export_probe.gd"])
        require_marker(output, "PRIVATE_PCK_EXPORTED_RIG_PASS")

        # Recreate the original hostile host-cache scenario: the exact source
        # remap names a modified local scene. The mounted pack must win and its
        # byte digest, not the untrusted disk cache, must be read by Godot.
        remap = (temp / "vendor-project/addons/modular_character_system/Assets/Models/BaseMale.gltf.import").read_text()
        refs = re.findall(r'^path="(res://\.godot/imported/[^"\r\n]+)"$', remap, re.MULTILINE)
        if len(refs) != 1:
            raise RuntimeError("MCS_IMPORT_REMAP_UNAVAILABLE")
        name = refs[0][len("res://"):]
        entries = inspect_pck(pack_bytes)["entries"]
        if name not in entries:
            raise RuntimeError("MCS_IMPORTED_SCENE_NOT_IN_PACK")
        correct = entries[name]["content"]
        impostor = bytearray(correct)
        if not impostor:
            raise RuntimeError("MCS_IMPORTED_SCENE_EMPTY")
        impostor[-1] ^= 1
        hostile = host / name
        if hostile.exists():
            raise RuntimeError("MCS_TEST_CACHE_ALREADY_EXISTS")
        hostile.parent.mkdir(parents=True, exist_ok=True)
        hostile.write_bytes(impostor)
        cache_probe = host / "mcs_cache_probe.gd"
        digest = hashlib.sha256(correct).hexdigest()
        cache_probe.write_text('extends SceneTree\nconst Visual = preload("res://actors/modular_npc_visual.gd")\n'
                               'func _init() -> void:\n var ok := Visual.available()\n'
                               ' print("MCS_VERIFIED_CACHE_USED=", ok and FileAccess.get_sha256('
                               + repr(refs[0]) + ') == ' + repr(digest) + ')\n quit()\n')
        try:
            output = godot(editor, host, ["--script", "res://mcs_cache_probe.gd"])
            require_marker(output, "MCS_VERIFIED_CACHE_USED=true")
        finally:
            hostile.unlink()
        # A resource cached under the vendor import path before mounting must
        # also be rejected; overlaying files cannot evict a cached resource.
        candidates = list((host / ".godot/imported").glob("glb_" + STANDARD_GLB_SHA[:48] + "*.scn"))
        if len(candidates) != 1:
            raise RuntimeError("STANDARD_GLB_IMPORT_NOT_UNIQUE")
        shutil.copyfile(candidates[0], hostile)
        cached_probe = host / "mcs_precache_probe.gd"
        cached_probe.write_text('extends SceneTree\nconst Visual = preload("res://actors/modular_npc_visual.gd")\n'
                                'func _init() -> void:\n var poisoned = load(' + repr(refs[0]) + ')\n'
                                ' print("MCS_PRELOADED_CACHE_REJECTED=", poisoned != null and not Visual.available())\n quit()\n')
        try:
            output = godot(editor, host, ["--script", "res://mcs_precache_probe.gd"])
            require_marker(output, "MCS_PRELOADED_CACHE_REJECTED=true")
        finally:
            hostile.unlink()

        probe = host / "mcs_availability_probe.gd"
        probe.write_text('extends SceneTree\nconst Visual = preload("res://actors/modular_npc_visual.gd")\n'
                         'func _init() -> void:\n print("MCS_AVAILABLE=", Visual.available())\n quit()\n')
        pack = host / "private-mcs/aurion-mcs.pck"
        original = pack.read_bytes()
        if len(original) < 100001:
            raise RuntimeError("MCS_PACK_TOO_SMALL")
        altered = bytearray(original)
        altered[100000] ^= 1
        try:
            pack.write_bytes(altered)
            output = godot(editor, host, ["--script", "res://mcs_availability_probe.gd"])
            require_marker(output, "MCS_AVAILABLE=false")
            output = godot(editor, host, ["--script", "tests/test_mcs_invalid_pack_fallback.gd"])
            require_marker(output, "INVALID_MCS_PACK_GLB_FALLBACK_PASS")
        finally:
            pack.write_bytes(original)
        pack.unlink()
        try:
            output = godot(editor, host, ["--script", "tests/test_mcs_invalid_pack_fallback.gd"])
            require_marker(output, "INVALID_MCS_PACK_GLB_FALLBACK_PASS")
        finally:
            pack.write_bytes(original)
        output = godot(editor, host, ["--script", "res://mcs_availability_probe.gd"])
        require_marker(output, "MCS_AVAILABLE=true")

        # A copied vendor directory must not bypass the verified private pack.
        source = temp / "vendor-project/addons/modular_character_system"
        target = host / "addons/modular_character_system"
        shutil.copytree(source, target)
        try:
            output = godot(editor, host, ["--script", "res://mcs_availability_probe.gd"])
            require_marker(output, "MCS_AVAILABLE=false")
        finally:
            shutil.rmtree(target)
        print("PRIVATE_MCS_ACCEPTANCE_PASS source=" + revision + ": real rig, GLB fallback, exported PCK, cache/PCK tamper and untrusted source; Android unverified")


if __name__ == "__main__":
    main()
