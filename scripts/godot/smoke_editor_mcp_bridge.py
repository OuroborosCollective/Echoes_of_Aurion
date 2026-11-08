#!/usr/bin/env python3
"""Real Godot 4.7 editor/TCP smoke for the pinned, read-only Aurion MCP bridge."""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "tools/godot-mcp-bridge/vendor/addons/godot-mcp"

def call(sock, ident, tool):
    sock.sendall((json.dumps({"type": "call", "id": ident, "tool": tool, "args": {}}) + "\n").encode())
    response = b""
    while b"\n" not in response:
        chunk = sock.recv(65536)
        if not chunk:
            raise AssertionError("Godot closed MCP socket")
        response += chunk
        if len(response) > 1000000:
            raise AssertionError("Unexpectedly large reply")
    message = json.loads(response.split(b"\n", 1)[0])
    if message.get("id") != ident:
        raise AssertionError(message)
    return message

def main(binary):
    with tempfile.TemporaryDirectory(prefix="aurion-editor-mcp-") as temp:
        project = Path(temp)
        (project / "addons").mkdir()
        shutil.copytree(VENDOR, project / "addons/godot-mcp")
        (project / "main.tscn").write_text('[gd_scene format=3]\n\n[node name="Root" type="Node"]\n')
        (project / "project.godot").write_text(
            'config_version=5\n[application]\nconfig/name="Aurion isolated MCP test"\n'
            'run/main_scene="res://main.tscn"\n[editor_plugins]\n'
            'enabled=PackedStringArray("res://addons/godot-mcp/plugin.cfg")\n'
        )
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        env = os.environ.copy()
        env.update(GODOT_MCP_BRIDGE_PORT=str(port), AURION_GODOT_MCP_WRITE="0", AURION_GODOT_MCP_RUNTIME="0")
        logpath = project / "godot.log"
        with logpath.open("w") as logfile:
            proc = subprocess.Popen(
                [str(binary), "--headless", "--path", str(project), "--editor",
                 "--rendering-method", "gl_compatibility", "--audio-driver", "Dummy"],
                stdout=logfile, stderr=subprocess.STDOUT, env=env
            )
            try:
                connection = None
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    if proc.poll() is not None:
                        break
                    try:
                        connection = socket.create_connection(("127.0.0.1", port), timeout=1)
                        break
                    except OSError:
                        time.sleep(0.2)
                if connection is None:
                    raise AssertionError("No real Godot editor bridge listener")
                with connection:
                    connection.settimeout(8)
                    offered = call(connection, 1, "list_tools")["result"]["tools"]
                    assert "get_runtime_errors" in offered and "get_scene_tree" in offered
                    assert "set_node_property" not in offered and "eval" not in offered
                    assert call(connection, 2, "set_node_property").get("error") == "AURION_GODOT_MCP_READ_ONLY"
                    assert str(project) in str(call(connection, 3, "get_project_root"))
                    assert "errors" in call(connection, 4, "get_runtime_errors")["result"]
                assert "McpRuntime=" not in (project / "project.godot").read_text()
                print("PASS: actual Godot editor TCP, read-only guard, project identity, no runtime autoload")
            except Exception:
                print(logpath.read_text(errors="replace")[-6000:])
                raise
            finally:
                proc.terminate()
                try:
                    proc.wait(timeout=7)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=7)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--godot", type=Path, required=True)
    main(parser.parse_args().godot)
