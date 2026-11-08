#!/usr/bin/env python3
"""Offline artifact contract tests for Aurion's vendored MCP editor plugin."""
import hashlib
import importlib.util
import tempfile
import shutil
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "tools/godot-mcp-bridge/vendor/addons/godot-mcp"

class McpEditorContract(unittest.TestCase):
    def test_export_has_no_editor_plugin(self):
        project = (ROOT / "godot-client/project.godot").read_text()
        self.assertNotIn("addons/godot-mcp/", project)
        self.assertNotIn("McpRuntime=", project)

    def test_opt_in_guarded(self):
        p = (VENDOR/"plugin.gd").read_text()
        b = (VENDOR/"mcp_bridge.gd").read_text()
        r = (VENDOR/"mcp_runtime.gd").read_text()
        self.assertIn('if OS.get_environment("AURION_GODOT_MCP_RUNTIME") == "1":', p)
        self.assertIn('_AURION_READ_TOOLS.has(tool)', b)
        self.assertIn('message in ["call", "eval", "simulate_input"]', r)
        self.assertIn('127.0.0.1', b)
        self.assertIn('AURION_GODOT_MCP_READ_ONLY', b)

    def test_license(self):
        self.assertIn('MIT License', (VENDOR/"LICENSE").read_text())

    def test_isolated_installer_preserves_other_plugins(self):
        spec = importlib.util.spec_from_file_location("aurion_mcp_installer", ROOT / "scripts/godot/install_editor_mcp_bridge.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(prefix="aurion-fennara-mcp-test-") as temp:
            project = Path(temp)
            source = """[application]
config/name="Aurion"
[editor_plugins]
enabled=PackedStringArray("res://addons/godot_mcp/plugin.cfg", "res://addons/fennara/plugin.cfg")
[autoload]
_fennara_game_capture="*res://addons/fennara/runtime/game_capture_helper.gd"
"""
            config = project / "project.godot"
            config.write_text(source)
            module.install(project)
            actual = config.read_text()
            self.assertIn('res://addons/godot_mcp/plugin.cfg', actual)
            self.assertIn('res://addons/fennara/plugin.cfg', actual)
            self.assertIn('res://addons/godot-mcp/plugin.cfg', actual)
            self.assertIn('_fennara_game_capture=', actual)
            self.assertNotIn('McpRuntime=', actual)
            self.assertTrue((project / "addons/godot-mcp/plugin.cfg").is_file())
            with self.assertRaises(ValueError):
                module.install(project)
            self.assertEqual(actual, config.read_text())

if __name__ == "__main__":
    unittest.main()
