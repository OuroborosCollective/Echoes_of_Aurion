#!/usr/bin/env python3
"""Opt-in acceptance in a disposable local project; never publish its output."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[2]
EDITOR_SHA = "8d106cbe6144c2dc7e881d61d2429c1a8a76e6b22ef48bd5e48dcf934953f71e"


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
        run_godot(editor, project, ["--editor", "--import"])
        run_godot(editor, project, ["--script", "tests/test_modular_npc_private_runtime.gd"],
                  "AURION_PRIVATE_MCS_1_0_RIG_PASS")
        vendor = project / "addons/modular_character_system"
        target = vendor / "README.md"
        receipt = vendor / ".aurion-mcs-install.json"
        target.write_bytes(target.read_bytes() + b"\nprivate integrity test\n")
        data = json.loads(receipt.read_text())
        data["files"]["README.md"] = sha256(target)
        receipt.write_text(json.dumps(data, sort_keys=True))
        probe = project / "mcs_integrity_probe.gd"
        probe.write_text('extends SceneTree\nconst Visual = preload("res://actors/modular_npc_visual.gd")\n'
                         'func _init() -> void:\n print("MCS_FORGERY_REJECTED=", not Visual.available())\n quit()\n')
        run_godot(editor, project, ["--script", "res://mcs_integrity_probe.gd"],
                  "MCS_FORGERY_REJECTED=true")
    print("PRIVATE_MCS_ACCEPTANCE_PASS: rig and modified-file/receipt rejection; no Android or live evidence")


if __name__ == "__main__":
    main()
