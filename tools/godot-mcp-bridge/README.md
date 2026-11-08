# Godot MCP Bridge for Aurion editor (pinned v1.0.0)

Upstream: https://github.com/letsagents/godot-mcp/tree/88fe614fbbd26f1d49cb3a5905fdd1a7bc3e35c7 (MIT, LuoHan).
Owner archive `godot-mcp-bridge-1.0.0-7.zip`, SHA-256 `2f882223ea6907ea1464cec2eb0b21910553392253759444be1d9218df152a83`. All 14 original Git blobs were independently matched against this upstream revision; exactly three GDScript files carry Aurion safety guards.

The vendored addon is stored **outside** `godot-client` and remains disabled in the canonical Android project. It complements, never replaces, Fennara, the existing hybridindie `godot_mcp` plugin, and Aurion's canonical server-side world bridge. The official `@letsagents/godot-mcp` npm **MCP server is a separate component** and must be installed by its own reviewed/pinned workflow on an isolated development host. Do not expose it to the Internet.

Install in a **disposable developer/editor copy**, never directly into the active `aurion-live-*` session:

```sh
python3 scripts/godot/install_editor_mcp_bridge.py --project /absolute/path/to/isolated/godot-client
```

This stages `addons/godot-mcp` with upstream source checks and enables the editor plugin, preserving unrelated editor plugins and autoloads. Default loopback listener is `127.0.0.1:6510` (overridable by `GODOT_MCP_BRIDGE_PORT`); Fennara typically uses `41287`, and the existing hybridindie addon uses a different Godot debugger capture channel.

**Aurion guards:** `AURION_GODOT_MCP_WRITE` defaults to **off**; mutating tools such as `eval`, `set_node_property`, play/stop and debugger control are refused. `AURION_GODOT_MCP_RUNTIME` defaults to **off**; the plugin will not auto-register an Android-exportable `McpRuntime` singleton. Enabling either variable in a disposable dev process does not grant Aurion gameplay or editor-authoring authority.

Acceptance is separate for repository integration, isolated real-Godot 4.7.2 editor protocol readbacks, active Fennara status, runtime world parity, and Android artifact exclusion. Neither code presence nor local `list_tools` proves a running Aurion client, real 3D world, or Android release.
