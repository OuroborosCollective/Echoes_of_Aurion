# Fennara AI MCP — Aurion live Godot editor integration

## Identity and purpose

- Aurion repository: `OuroborosCollective/Echoes_of_Aurion`.
- Upstream: [Fennara](https://github.com/fennaraOfficial/fennara-godot-ai), MIT, release v0.4.3 source commit `0abbac3b3a1cb46bbce4f90e8cebc6a3e5d61ec6`.
- Pinned `godot-cpp` submodule: `e83fd0904c13356ed1d4c3d09f8bb9132bdc6b77`.
- Exact original release archive SHA-256: `1ba63233e74020f017af8f668d92d030425e74bb28da3514b111fb3fb30bdc04`.
- Fennara is an optional **Godot editor-only** diagnosis/authoring assistant. The Aurion TypeScript server remains the exclusive gameplay/world/NPC/quest/persistence authority, at its unchanged 100 ms/10 Hz tick.
- No Fennara runtime features may be shipped to the Android client or allowed to modify canonical Aurion world state directly.

## Real observed VPS compatibility failure (6 Nov 2026)

The real VPS Godot editor is `Godot_v4.7.2-stable_linux.x86_64`. It runs with glibc **2.35** (Ubuntu 22.04). Fennara's official v0.4.1 and v0.4.3 Linux libraries request `GLIBC_2.38` symbols. A baseline and an isolated candidate Godot headless editor import both returned exit 0; **only the candidate** logged `Can't open GDExtension dynamic library` and `GLIBC_2.38 not found`. A zero exit code alone must not be accepted as Fennara evidence.

The owner's real editor project is at `/srv/serverin/workspaces/aurion-live-3119d91-20261105/godot-client`. Its existing local `project.godot` SHA-256 is `28da6e9bbf46991afbb609270a3201cb736ca4092c57e10c5dc93219d1f81b22`; it must **not** be replaced by the different GitHub file. Existing Godot sessions and Aurion MCP/bridges remain untouched.

The initial isolated VPS copy at `/srv/serverin/staging/aurion-fennara-pilot-20261106/godot-client` demonstrated the original ABI problem. The approved live rollout that followed is documented below; the initial failure remains useful historical negative evidence.

## Safe rebuild and CI

`.github/workflows/aurion-fennara-editor-abi-proof.yml` uses an isolated GitHub Actions Ubuntu 22.04 runner with pinned Fennara upstream, pinned `godot-cpp`, and the upstream pinned CEF SDK. It rebuilds both editor native libraries and all five local Rust CLI/daemon/MCP binaries, tests the original glibc ABI incompatibilities, requires the rebuilt binaries to need no newer than glibc 2.35, imports an isolated Aurion checkout under Godot 4.7.2, runs Rust tests, and uploads real logs, hashes and binaries. No vendor binaries enter the source repo. This CI does not deploy to the VPS or modify the canonical game database.

Do **not** upgrade system glibc, change containers or restart the live editor to hide a missing ABI. A green CI workflow is a prerequisite, not proof of a running editor.

## Verified active VPS attachment (6 November 2026)

Owner explicitly authorized activating Fennara against the **existing real Aurion Godot editor**, not a demo. This rollout was performed on the running editor without restarting the editor process, its already-running game process, the Aurion server or the canonical bridge.

- Live project: `/srv/serverin/workspaces/aurion-live-3119d91-20261105/godot-client`; Godot 4.7.2, editor PID `2224728` and pre-existing game PID `2227348` at the readback time. Source `project.godot` before Fennara: SHA-256 `28da6e9bbf46991afbb609270a3201cb736ca4092c57e10c5dc93219d1f81b22`. Saved original: `/srv/serverin/staging/aurion-fennara-live-rollout-20261106/project.godot.pre-fennara`.
- Fennara v0.4.3 extension installed under `addons/fennara` in **that exact live project**. SHA-256s: `libfennara.linux.editor.x86_64.so` = `df5c55483ee21ef343977776ea7dd4340836474c7e573e53cc1f012ac090a69b`; `libfennara_linux_cef_bridge.so` = `61810812adef3a1727abcff1da6167b92a503c74f15b9320815a907e9fbaa804`. The live editor hot-loaded Fennara and added its diagnostic-only `_fennara_game_capture` autoload; resulting `project.godot` SHA-256 `26b0e957a263268ce164c5575ee99d20ebc12aede6da9be4182d0b46a06fb90e`.
- Rebuilt Rust binaries from exact PR head `98067db8021df23fed99984dd00024e310d70c2d`: [CI run 42297317703](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/42297317703), job `128165820131`, artifact `13543690689` (`fennara-ubuntu2204-proof`), artifact ZIP SHA-256 `bb730de121a50dc57e5d95e0255e61612a2f861eef0ab7c2eae0a841810f3ce2`. All five native binaries require glibc <= 2.34. Fennara's CLI, MCP and daemon binary SHAs were independently checked on the VPS before activation.
- Durable native daemon: `aurion-fennara-daemon.service` (`/etc/systemd/system/aurion-fennara-daemon.service`), user `aurion-deploy`, enabled and active, 127.0.0.1:41287, anonymous telemetry disabled. The temporary Ubuntu 24.04 Docker daemon was removed after health readback; system glibc was **not** changed. No second gameplay authority was introduced.
- Independent real MCP readback: `fennara_status` returned `Daemon: connected`, `Routing mode: bound`, `Bound editor: connected`, project identity pointing to the exact live path, session `#2224728`, `Godot plugin: connected`, editor filesystem `ready`, asset tools `ready`. A live `get_scene_tree` call returned **82 real nodes** from `res://app/main.tscn` including `Live3D`, `ConfirmedTerrain`, `Actors` and `QuestNPCs`; `script_diagnostics` read `res://net/zone_socket.gd` and reported **0 errors, 1 warning** (shadowed `ready`). After transition to the native daemon, Fennara status and scene readback succeeded again. Server `/api/health` remained HTTP 200 with runtime revision `eb025574883e56f64c8a0191b9f1ec58d9374b13` at that independent observation.

## Remaining acceptance boundaries

1. Fennara's **editor connection** to the real project is verified. `runtime_session(action=status)` returned `idle`, so Fennara has not adopted or started the previously running game process. A real scene-tree readback is **not** evidence of authenticated Aurion gameplay session or pixel-identical live-world parity. For full game-world acceptance, use the existing canonical Auth -> Zone Welcome -> Server Feed/Bridge -> Godot projection and world screenshot readbacks.
2. The optional **in-editor Linux CEF embedded chat** is not installed; Godot logged a missing `webview/cef/linux-x64` root. This does not block working MCP tools. Install the exact upstream CEF runtime separately only after verifying the official digest and without exposing any provider key in the project.
3. Check Android packaging explicitly excludes the editor-only Fennara GDExtension, its native binaries and `_fennara_game_capture` autoload. Existing gameplay, auth/JNI, GLB and release CI gates must not be disabled.
4. Fennara proposals/edits remain untrusted: Editor proposal -> Aurion validation/approval -> server ACK/receipt -> independent world readback. Never use Fennara as a gameplay server, physics/collision, NPC, DB or persistency authority.
5. Recovery: the original `project.godot` is backed up in `/srv/serverin/staging/aurion-fennara-live-rollout-20261106/`; all prebuilt native executables are in its `native-old/` subfolder. A rollback of Fennara is separate from (and must not restart) the Aurion gameplay server. Stop the dedicated Fennara daemon, remove only its editor addon after editor shutdown, and restore that exact saved project config. Do not casually restart the Godot editor systemd unit while a Godot game process shares its cgroup.

**Verified scope:** Fennara MCP + real Aurion Godot live editor. **Not verified:** an Fennara-managed running game session, actual world-pixel parity, optional embedded CEF chat, Android export exclusion or production deployment of a new GitHub gameplay revision.
