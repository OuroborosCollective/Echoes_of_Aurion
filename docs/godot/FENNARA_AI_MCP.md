# Fennara AI MCP — Aurion editor-only integration (isolated)

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

An isolated copy at `/srv/serverin/staging/aurion-fennara-pilot-20261106/godot-client` has Fennara 0.4.3 staged from the exact official ZIP. No production installation was performed. The addon is not functional there until a compatible native library is provided.

## Safe rebuild and CI

`.github/workflows/aurion-fennara-editor-abi-proof.yml` uses an isolated GitHub Actions Ubuntu 22.04 runner with pinned Fennara upstream, pinned `godot-cpp`, and the upstream pinned CEF SDK. It builds both editor native libraries, checks the official prebuilt binary is incompatible with glibc 2.35, checks the rebuilt libraries require at most glibc 2.35, imports a copy of Aurion using the pinned Godot 4.7.2 editor, and uploads real logs, hashes and build artifacts. No vendor binaries enter the source repo. This CI does not deploy to the VPS or modify the canonical game database.

Do **not** upgrade system glibc, change containers or restart the live editor to hide a missing ABI. A green CI workflow is a prerequisite, not proof of a running editor.

## Follow-on acceptance gates (still require real execution)

1. Verify GitHub Actions head SHA, both rebuilt library digests, and actual native editor import without Fennara load errors. If the build fails, investigate the original failure before changing requirements.
2. Install the confirmed compatible native binaries in an **isolated editor** on VPS; require `fennara_status` bound to its exact project root and verify `fennara_status`, scene-tree inspection, and real script diagnostics or screenshot. The active/live editor remains untouched until separately checked and authorized.
3. Set `FENNARA_DISABLE_TELEMETRY=true`, `DO_NOT_TRACK=1`; do not store provider keys in repository or MCP arguments. Use project-bound MCP routing and check tool permissions.
4. Review AI edits as untrusted proposals: authoring preview → Aurion canonical validation → server ACK/receipt → independent world readback. Fennara must never write game state or MariaDB directly.
5. Validate exported Android APK contains no editor-only Fennara native libraries, no provider secrets, and preserves existing Android/GLB/Godot tests.
6. Live-world parity is not implied by any editor/plugin test; require same confirmed world, zone, tick, state receipts and authoritative feed/bridge readback.

**Latest observed status:** v0.4.3 staged in isolation; stock binary failed to load on Ubuntu 22.04; repair is submitted for CI, not yet validated or deployed.
