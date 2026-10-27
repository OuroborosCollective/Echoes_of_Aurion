#!/usr/bin/env python3
"""Opt-in acceptance in a disposable local project; never publish its output."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[2]
EDITOR_SHA = "8d106cbe6144c2dc7e881d61d2429c1a8a76e6b22ef48bd5e48dcf934953f71e"
STANDARD_GLB_SHA = "2f447361e6ba5e6e38d8b38c19b78773a0d62fcf80e771d34f3d94a0e64765cc"


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run_godot(editor, project, arguments, marker=None):
    result = subprocess.run(
        [str(editor), "--headless", "--path", str(project), *arguments],
        capture_output=True, text=True, timeout=300,
    )
    output = result.stdout + result.stderr
    if result.returncode != 0 or "SCRIPT ERROR:" in output or "ERROR:" in output:
        raise RuntimeError("Godot private acceptance failed; output withheld")
    if marker is not None and marker not in output:
        raise RuntimeError("Godot private acceptance marker missing; output withheld")
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--godot", required=True, type=Path)
    args = parser.parse_args()
    editor = args.godot.resolve(strict=True)
    if sha256(editor) != EDITOR_SHA:
        raise ValueError("Godot executable digest mismatch")
    spec = importlib.util.spec_from_file_location("mcs_stager", REPO / "scripts/godot/stage_modular_npc.py")
    stager = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(stager)
    with tempfile.TemporaryDirectory(prefix="aurion-private-mcs-") as directory:
        project = Path(directory) / "project"
        shutil.copytree(REPO / "godot-client", project,
                        ignore=shutil.ignore_patterns(".godot", "modular_character_system"))
        stager.install(args.archive, project)
        standard = REPO / "assets/characters/aurion-player-standard-animated.glb"
        if sha256(standard) != STANDARD_GLB_SHA:
            raise ValueError("standard GLB digest mismatch")
        generated = project / "assets/generated"
        generated.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(standard, generated / ("glb_" + STANDARD_GLB_SHA[:48] + ".glb"))
        run_godot(editor, project, ["--editor", "--import"])
        run_godot(editor, project, ["--script", "tests/test_modular_npc_private_runtime.gd"],
                  "AURION_PRIVATE_MCS_1_0_RIG_PASS")
        run_godot(editor, project, ["--script", "tests/test_modular_npc_private_fallback.gd"],
                  "PRIVATE_MCS_LATE_RIG_FALLBACK_PASS")
        vendor = project / "addons/modular_character_system"
        target = vendor / "README.md"
        receipt = vendor / ".aurion-mcs-install.json"
        original_target = target.read_bytes()
        original_receipt = receipt.read_bytes()
        probe = project / "mcs_integrity_probe.gd"
        probe.write_text('extends SceneTree\nconst Visual = preload("res://actors/modular_npc_visual.gd")\n'
                         'func _init() -> void:\n print("MCS_AVAILABLE=", Visual.available())\n quit()\n')
        target.write_bytes(original_target + b"\nprivate integrity test\n")
        data = json.loads(original_receipt)
        data["files"]["README.md"] = sha256(target)
        receipt.write_text(json.dumps(data, sort_keys=True))
        run_godot(editor, project, ["--script", "res://mcs_integrity_probe.gd"],
                  "MCS_AVAILABLE=false")
        target.write_bytes(original_target)
        receipt.write_bytes(original_receipt)
        run_godot(editor, project, ["--script", "res://mcs_integrity_probe.gd"],
                  "MCS_AVAILABLE=true")

        # Mutate the real imported scene, not an invented mock resource. The
        # original source and its pinned install receipt stay byte-identical.
        remap = (vendor / "Assets/Models/BaseMale.gltf.import").read_text()
        paths = re.findall(r'^path="(res://\.godot/imported/[^"\r\n]+)"$', remap, re.MULTILINE)
        if len(paths) != 1:
            raise RuntimeError("MCS_IMPORT_REMAP_UNAVAILABLE")
        cache_root = (project / ".godot/imported").resolve(strict=True)
        imported = (project / paths[0][len("res://"):]).resolve(strict=True)
        if not imported.is_relative_to(cache_root) or not imported.is_file():
            raise RuntimeError("MCS_IMPORT_REMAP_UNSAFE")
        original_import = imported.read_bytes()
        if not original_import:
            raise RuntimeError("MCS_IMPORTED_SCENE_EMPTY")
        changed = bytearray(original_import)
        changed[-1] ^= 1
        try:
            imported.write_bytes(changed)
            outcome = run_godot(editor, project, ["--script", "res://mcs_integrity_probe.gd"])
            if "MCS_AVAILABLE=false" not in outcome:
                raise RuntimeError("MCS_IMPORTED_CACHE_TAMPER_NOT_REJECTED")
        finally:
            imported.write_bytes(original_import)
    print("PRIVATE_MCS_ACCEPTANCE_PASS: rig, GLB fallback and source/import tamper rejection; no Android or live evidence")


if __name__ == "__main__":
    main()
