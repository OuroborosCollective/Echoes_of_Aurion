#!/usr/bin/env python3
"""Isolated real editor activation; synthetic credential, never live-world proof."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

godot = str(Path(sys.argv[1]).resolve())
source = Path("godot-client/addons/aurion_bridge")
credential = "/run/credentials/serverin-aurion-godot-editor.service/aurion-editor"
with tempfile.TemporaryDirectory(prefix="aurion-editor-lifecycle-") as directory:
    project = Path(directory)
    shutil.copytree(source, project / "addons/aurion_bridge")
    observer = project / "addons/lifecycle_probe"
    observer.mkdir(parents=True)
    (observer / "plugin.cfg").write_text('[plugin]\nname="Lifecycle probe"\ndescription="Isolated test"\nauthor="Aurion"\nversion="1"\nscript="probe.gd"\n')
    (observer / "probe.gd").write_text('''@tool
extends EditorPlugin

func _enter_tree() -> void:
    call_deferred("_verify")

func _verify() -> void:
    await get_tree().process_frame
    await get_tree().process_frame
    var client = Engine.get_meta("aurion_editor_client", null)
    if client == null or not client.is_node_ready():
        push_error("EDITOR_LIFECYCLE_CLIENT_NOT_READY")
        get_tree().quit(1)
        return
    if client.credential_source_path != "/run/credentials/serverin-aurion-godot-editor.service/aurion-editor" or client.token != "x".repeat(32):
        push_error("EDITOR_LIFECYCLE_CREDENTIAL_NOT_LOADED")
        get_tree().quit(1)
        return
    if client.get_parent()._dock._token.text != client.token:
        push_error("EDITOR_LIFECYCLE_DOCK_CREDENTIAL_MISSING")
        get_tree().quit(1)
        return
    if not client.want_connection:
        push_error("EDITOR_LIFECYCLE_AUTOCONNECT_MISSING")
        get_tree().quit(1)
        return
    print("AURION_EDITOR_FRESH_ACTIVATION_PASS")
    get_tree().quit(0)
''')
    (project / "project.godot").write_text('''config_version=5
[application]
config/name="Aurion isolated editor lifecycle"
[editor_plugins]
enabled=PackedStringArray("res://addons/aurion_bridge/plugin.cfg", "res://addons/lifecycle_probe/plugin.cfg")
[rendering]
renderer/rendering_method="gl_compatibility"
''')
    env = dict(os.environ, AURION_BRIDGE_TOKEN_FILE=credential, AURION_BRIDGE_URL="ws://127.0.0.1:8765/godot")
    env.pop("AURION_BRIDGE_TOKEN", None)
    run = subprocess.run([godot, "--headless", "--editor", "--path", str(project)], env=env, capture_output=True, text=True, timeout=60)
    output = run.stdout + run.stderr
    print(output)
    if run.returncode != 0 or "AURION_EDITOR_FRESH_ACTIVATION_PASS" not in output or "SCRIPT ERROR" in output or "Parse Error" in output:
        raise SystemExit(1)
