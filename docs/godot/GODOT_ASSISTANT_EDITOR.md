# Aurion Godot Assistant - isolated live-editor development lane

Status: **development integration only**. This is NOT a live deployment, APK
release, an authenticated ChatGPT-to-Godot connection or an Android-device pass.

## Pinned inputs

- Aurion: `godot-client/`, Godot **4.7.2**, GL Compatibility.
- Godot Assistant: https://github.com/splatterfacegames/godot-assistant
  at **a6aed65584cf8cccd32a75e5a93e22b752a0b00a** (MIT, 0.1.0).
- Requirements on a GUI-capable Linux host: Git, Node.js 22, .NET **8 SDK/runtime**,
  Godot 4.7.2 editor, Codex CLI on PATH and `x-terminal-emulator`.
- The editor's MCP relay binds to `127.0.0.1`. Do **not** expose its port via
  public reverse proxy, Traefik, shared MCP gateway or VPS firewall forwarding.

## Start a fresh disposable editor environment

Run from an Aurion checkout whose `AGENTS.md` and `Memory.md` have been read.
The stage destination must be separate from the repository and production.

```bash
# Example on the GUI development host (not on the Android tablet).
set -euo pipefail
ROOT="$PWD"
WORK="$(mktemp -d)"
git clone https://github.com/splatterfacegames/godot-assistant.git "$WORK/godot-assistant"
git -C "$WORK/godot-assistant" checkout a6aed65584cf8cccd32a75e5a93e22b752a0b00a
node "$ROOT/scripts/godot/stage-godot-assistant.mjs" \
  --source "$WORK/godot-assistant" --target "$WORK/aurion-editor"
# Start the pinned Godot editor in a graphical desktop session:
"$ROOT/.aurion-godot/editor/Godot_v4.7.2-stable_linux.x86_64" \
  --path "$WORK/aurion-editor" --editor
```

The installer reads the exact upstream Git revision, requires a clean checkout,
checks allowed source paths and a minimal .NET 8 project, builds the relay from
an isolated patched copy, installs the add-on *only* into the disposable
project and enables its editor plugin there. It refuses a previously installed
add-on, changed sources, missing Aurion `AGENTS.md`, or the canonical target.
The target must not exist. The script creates it exclusively, copies the canonical project and its AGENTS.md/Memory.md, and rejects existing projects and symlink targets before any staging write. Do not pre-create or populate `--target`.
The launcher is prevented from overwriting `AGENTS.md` and `CLAUDE.md`.
The UI/launcher AND the .NET relay refuse `FullAuto`/YOLO and unknown modes.

In the **Godot Assistant** dock, select **Codex / Read Only** to inspect the
live editor. For a chosen local scene edit, switch to **Codex / Ask Before
Write** and accept the exact editor operation in the Godot prompt. Review the
result and UndoRedo. If Codex, .NET or a graphical desktop are unavailable, this
is **BLOCKED**, not a silently successful headless editor session.

Do not copy `addons/godot_assistant` or its compiled .NET payload into the
tracked `godot-client/`, APK export workspace or production runtime. Do not
export the disposable editor project as an Android APK. Export from a clean,
reviewed Aurion source checkout using the existing signing gates instead.
Cleanup: close Godot/Codex and delete **only the `WORK` path you created** after
preserving reviewed changes and evidence. Never run recursive cleanup on a
shared VPS workspace or production checkout.

## World changes without requiring a new APK for every tree

The editor MCP edits **local presentation**. A placed Node3D or a new material
is NOT a network event and is NOT automatically published to other players.
It cannot bypass Aurion's server-owned world, 100-ms tick, database or receipts.

The native G21 world-authoring work is in
[PR #1199](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1199),
not yet established as a production pass. Its **separate** in-game admin
worldstudio submits a validated catalog-referenced design to existing Aurion
`aurionAuthoring` methods (draft -> `worldPlan` -> explicit human confirmation
-> one `worldApply` -> independent `GET /api/game/world-design`). It compares
plan/receipt and readback identities and displays read-only placeholders, NOT
actual live GLB geometry. An editor sketch can guide its draft, but there is
currently **no automatic Node3D-to-world-design bridge** and no deployment or
connected multi-client proof. Do not describe a scene tweak as a published
world change. No retry after an uncertain apply.

A future live change can appear without an APK rebuild **only when** the
server-authoritative world-apply chain, authenticated player-session refresh,
catalog-backed asset retrieval and rendering on each client are implemented
and independently verified. GDScript, scene-structure and input code still
need a tested signed app update when embedded in the client.

## Verification and acceptance

1. `node --test scripts/godot/stage-godot-assistant.test.mjs` - static/logic
   regression including negative controls; does not claim live Godot.
2. On an isolated host with .NET 8, build and run the relay smoke test:
   `node scripts/godot/smoke-godot-assistant-relay.mjs <staged-project>`.
   It starts the **real** service on loopback and asserts unauthenticated
   session creation is rejected (401), FullAuto/unknown are rejected (403),
   and only safe session modes can be created (200).
3. On the pinned Linux Godot 4.7.2 runner, compare unmodified source project
   `--headless --editor --import` with the staged editor project. Examine error
   logs as well as exit codes. Headless import is not interactive UI proof.
4. On a real GUI host, verify the dock, local MCP Codex connection, LSP,
   read-only scene inspection, one explicitly approved scene edit, UndoRedo,
   project source diff and safe process teardown. Do not infer this from CI.
5. Separately test G21's server plan/apply/receipt/GET sequence on an authorized
   staging target, then two authenticated clients and physical Tab A9. Require
   exact SHA, asset provenance and independent runtime receipts before claiming
   a live multiplayer change. A green CI run cannot substitute for this.

Production status: **not deployed**. APK install decision: **NEIN**.
