#!/usr/bin/env python3
"""Install pinned editor-only Godot MCP Bridge in a separate development project."""
import argparse
import hashlib
from pathlib import Path
import shutil

SOURCE = Path(__file__).resolve().parents[2] / "tools/godot-mcp-bridge/vendor/addons/godot-mcp"
BLOBS = {
    "LICENSE": "75914bd3d983e10bbe63e0ce0bec7670b054b415",
    "README.md": "dbee4fde74229a82231aa4e9efbc52ea928b18df",
    "README_CN.md": "f9dfb302be2640ba4fa08efdd24737357f788291",
    "error_collector.gd": "a33e0c89556c5ef59460caf3f866181fca92c353",
    "icon.png": "dbfd3ac1f8dad649c1e5a41e3414a8b3e0e2baa7",
    "mcp_assets.gd": "9a216c3094afc4297f86275e574544495681d104",
    "mcp_bridge.gd": "9f72b89b64e057089735f3234f137de2d17521e7",
    "mcp_debugger.gd": "397634eb66d6338a5d0c88ad5d4a28e3067e1fa4",
    "mcp_log.gd": "2b288813bec2e8dc33e04168b709b426c5bb69f6",
    "mcp_runtime.gd": "d7a483eec987842500e2032905b7f65109812d43",
    "mcp_wire.gd": "2011fc636bf900822b4439b1fad74883001b9770",
    "output_collector.gd": "847bb26224fb5b7208f74b1e4fd65143a48b5a6a",
    "plugin.cfg": "30aab57f56f83035ba72528a2c14b9213f35e563",
    "plugin.gd": "96ff36854bcb19192cbc16e7c30f3c329959841b"
}

def gitblob(b):
    return hashlib.sha1(b"blob " + str(len(b)).encode() + b"\\0" + b).hexdigest()

def install(project):
    project = project.resolve(strict=True)
    config = project / "project.godot"
    if not config.is_file():
        raise ValueError("missing project.godot")
    if "aurion-live-" in str(project) or project == Path("/srv/serverin/workspaces/echoes-of-aurion/godot-client"):
        raise ValueError("refusing active Aurion workspace; use an isolated copy")
    for name, sha in BLOBS.items():
        if gitblob((SOURCE/name).read_bytes()) != sha:
            raise ValueError("vendor digest mismatch: " + name)
    target = project/"addons/godot-mcp"
    if target.exists():
        raise ValueError("refusing to overwrite existing plugin")
    settings = config.read_text()
    marker = 'res://addons/godot-mcp/plugin.cfg'
    if marker in settings or "McpRuntime=" in settings:
        raise ValueError("plugin already configured")
    if "[editor_plugins]" not in settings:
        settings += '\\n[editor_plugins]\\nenabled=PackedStringArray("' + marker + '")\\n'
    else:
        import re
        match = re.search(r'^enabled=PackedStringArray\\(([^\\n]*)\\)$', settings, re.M)
        if not match:
            raise ValueError("ambiguous editor plugin list")
        new = match.group(1)
        new = new + (", " if new.strip() else "") + '"' + marker + '"'
        settings = settings[:match.start()] + "enabled=PackedStringArray(" + new + ")" + settings[match.end():]
    target.parent.mkdir(exist_ok=True)
    shutil.copytree(SOURCE, target)
    try:
        config.write_text(settings)
    except Exception:
        shutil.rmtree(target)
        raise
    print("STAGED isolated Godot editor addon; no live editor/Android runtime activated")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, required=True)
    install(parser.parse_args().project)
