#!/usr/bin/env python3
"""Offline artifact contract tests for Aurion's vendored MCP editor plugin."""
import hashlib
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

if __name__ == "__main__":
    unittest.main()
