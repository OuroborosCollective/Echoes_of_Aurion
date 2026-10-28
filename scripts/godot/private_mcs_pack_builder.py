#!/usr/bin/env python3
"""Build an isolated MCS PCK and verify its overlay in a disposable host.

The generated pin must be compiled into a separately authenticated private
application. This helper does not sign, publish, or authorize distribution.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import re
import sys
import tarfile

sys.dont_write_bytecode = True
from private_mcs_pack_guard import assert_compatible_overlay, inspect_pck, strip_and_validate_vendor_pack

REPO = Path(__file__).resolve().parents[2]
EDITOR_SHA = "8d106cbe6144c2dc7e881d61d2429c1a8a76e6b22ef48bd5e48dcf934953f71e"
PIN_EMPTY = 'const SHA256 := ""'
PATHS_EMPTY = 'const RESOURCE_PATHS := []'
STANDARD_GLB_SHA = "2f447361e6ba5e6e38d8b38c19b78773a0d62fcf80e771d34f3d94a0e64765cc"


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def godot(editor, project, arguments, timeout=300):
    result = subprocess.run([str(editor), "--headless", "--path", str(project), *arguments],
                            capture_output=True, text=True, timeout=timeout)
    output = result.stdout + result.stderr
    if result.returncode != 0 or "SCRIPT ERROR:" in output or "ERROR:" in output:
        raise RuntimeError("PRIVATE_GODOT_BUILD_FAILED: vendor output withheld")
    return output


def verified_source_revision():
    """Do not build a private pack from modified or untracked project code."""
    def git(*args):
        result = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise ValueError("PRIVATE_SOURCE_GIT_CHECK_FAILED")
        return result.stdout.strip()
    revision = git("rev-parse", "HEAD")
    if re.fullmatch(r"[0-9a-f]{40}", revision) is None:
        raise ValueError("PRIVATE_SOURCE_REVISION_INVALID")
    git("diff", "--exit-code", "HEAD", "--", "godot-client", "scripts/godot", "config/godot-toolchain.lock.json")
    untracked = git("ls-files", "--others", "--exclude-standard", "--", "godot-client", "scripts/godot")
    if untracked:
        raise ValueError("PRIVATE_SOURCE_UNTRACKED_FILES")
    if git("ls-files", "--", "godot-client/addons/modular_character_system/", "godot-client/private-mcs/"):
        raise ValueError("PRIVATE_VENDOR_FILES_TRACKED")
    return revision


def build_vendor_pack(archive, editor, private_root):
    revision = verified_source_revision()
    editor = Path(editor).resolve(strict=True)
    if sha256(editor) != EDITOR_SHA:
        raise ValueError("GODOT_EDITOR_DIGEST_MISMATCH")
    private_root = Path(private_root)
    vendor = private_root / "vendor-project"
    vendor.mkdir(mode=0o700)
    (vendor / "project.godot").write_text(
        'config_version=5\n[application]\nconfig/name="Private MCS pack"\n'
        '[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
    (vendor / "export_presets.cfg").write_text(
        '[preset.0]\nname="PrivatePack"\nplatform="Android"\nrunnable=true\n'
        'export_filter="all_resources"\n'
        'include_filter="addons/modular_character_system/.aurion-mcs-install.json"\n'
        'exclude_filter=""\nexport_path=""\nscript_export_mode=2\n\n'
        '[preset.0.options]\npackage/unique_name="org.aurion.privatepack"\n')
    spec = importlib.util.spec_from_file_location("private_mcs_stager", REPO / "scripts/godot/stage_modular_npc.py")
    stager = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(stager)
    receipt = stager.install(archive, vendor)
    godot(editor, vendor, ["--editor", "--import"])
    original = private_root / "vendor-original.pck"
    godot(editor, vendor, ["--export-pack", "PrivatePack", str(original)])
    clean = strip_and_validate_vendor_pack(original.read_bytes())
    if verified_source_revision() != revision:
        raise ValueError("PRIVATE_SOURCE_REVISION_CHANGED")
    return clean, receipt["sha256"], revision


def prepare_host(editor, private_root, pack_bytes, revision):
    private_root = Path(private_root)
    host = private_root / "host-project"
    if verified_source_revision() != revision:
        raise ValueError("PRIVATE_SOURCE_REVISION_CHANGED")
    source_tar = private_root / "host-source.tar"
    with source_tar.open("wb") as output:
        result = subprocess.run(["git", "-C", str(REPO), "archive", "--format=tar", revision, "godot-client"],
                                stdout=output, stderr=subprocess.PIPE, timeout=120)
    if result.returncode:
        raise ValueError("PRIVATE_SOURCE_ARCHIVE_FAILED")
    source_dir = private_root / "host-source"
    source_dir.mkdir(mode=0o700)
    with tarfile.open(source_tar, "r:") as archive:
        for member in archive.getmembers():
            parts = Path(member.name).parts
            if not parts or parts[0] != "godot-client" or ".." in parts or not (member.isdir() or member.isfile()):
                raise ValueError("PRIVATE_SOURCE_ARCHIVE_UNSAFE")
        archive.extractall(source_dir, filter="data")
    (source_dir / "godot-client").rename(host)
    pin = host / "actors/private_mcs_pack_pin.gd"
    content = pin.read_text()
    if content.count(PIN_EMPTY) != 1 or content.count(PATHS_EMPTY) != 1:
        raise ValueError("PRIVATE_PACK_PIN_TEMPLATE_INVALID")
    digest = hashlib.sha256(pack_bytes).hexdigest()
    names = inspect_pck(pack_bytes)["entries"]
    paths = set()
    for name in names:
        if name.startswith((".godot/imported/", ".godot/exported/", "addons/modular_character_system/")):
            paths.add("res://" + name)
            if name.endswith(".remap"):
                paths.add("res://" + name[:-len(".remap")])
    paths = sorted(paths)
    pin.write_text(content.replace(PIN_EMPTY, 'const SHA256 := "' + digest + '"')
                   .replace(PATHS_EMPTY, 'const RESOURCE_PATHS := ' + json.dumps(paths)))
    private_dir = host / "private-mcs"
    private_dir.mkdir(mode=0o700)
    (private_dir / "aurion-mcs.pck").write_bytes(pack_bytes)
    standard = REPO / "assets/characters/aurion-player-standard-animated.glb"
    if sha256(standard) != STANDARD_GLB_SHA:
        raise ValueError("STANDARD_GLB_DIGEST_MISMATCH")
    generated = host / "assets/generated"
    generated.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(standard, generated / ("glb_" + STANDARD_GLB_SHA[:48] + ".glb"))
    preset = host / "export_presets.cfg"
    original = preset.read_text()
    marker = 'include_filter="net/contracts/*.json,override.cfg"'
    if marker not in original:
        raise ValueError("PRIVATE_PACK_PRESET_CHANGED")
    preset.write_text(original.replace(marker, 'include_filter="net/contracts/*.json,override.cfg,private-mcs/*.pck"'))
    (host / "mcs_host_class_probe.gd").write_text('extends RefCounted\nvar config: AurionRuntimeConfig\n')
    (host / "mcs_pck_export_probe.gd").write_text(
        'extends SceneTree\nconst Visual = preload("res://actors/modular_npc_visual.gd")\n'
        'func _init() -> void:\n call_deferred("probe")\n'
        'func probe() -> void:\n var actor: Node3D = Visual.create("npc:smith", "fixture")\n'
        ' if actor == null:\n  push_error("PRIVATE_PCK_ACTOR_MISSING")\n  quit(2)\n  return\n'
        ' root.add_child(actor)\n await process_frame\n'
        ' if not actor.has_method("is_character_valid") or not actor.call("is_character_valid") or actor.find_children("*", "MeshInstance3D", true, false).is_empty():\n'
        '  push_error("PRIVATE_PCK_RIG_INVALID")\n  quit(3)\n  return\n'
        ' if load("res://mcs_host_class_probe.gd") == null or load("res://app/main.tscn") == null:\n'
        '  push_error("PRIVATE_PCK_HOST_RESOURCES_INVALID")\n  quit(4)\n  return\n'
        ' actor.queue_free()\n await process_frame\n print("PRIVATE_PCK_EXPORTED_RIG_PASS")\n quit()\n')
    godot(editor, host, ["--editor", "--import"])
    outer = private_root / "host-check.pck"
    godot(editor, host, ["--export-pack", "Android Preview", str(outer)])
    outer_bytes = outer.read_bytes()
    assert_compatible_overlay(pack_bytes, outer_bytes)
    embedded = inspect_pck(outer_bytes)["entries"].get("private-mcs/aurion-mcs.pck")
    if embedded is None or hashlib.sha256(embedded["content"]).hexdigest() != digest:
        raise ValueError("PRIVATE_PACK_EXPORT_MISMATCH")
    if verified_source_revision() != revision:
        raise ValueError("PRIVATE_SOURCE_REVISION_CHANGED")
    return host, outer, digest
