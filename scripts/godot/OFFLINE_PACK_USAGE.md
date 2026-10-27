# Aurion offline workspace — manual release-independent packaging

**Run it on demand, not on every merge.** In GitHub Actions open **Aurion Local Test Pack (manual)**, choose **Run workflow**, select the target branch (normally `main` after the desired merges), and choose:

- **`godot-linux` (default):** importable `godot-client` project and public add-ons; source-pinned `scripts/godot` tooling and configuration; integrity-verified Godot 4.7.2 Linux x86-64 editor. This is the fast, small workspace for sharing with ChatGPT or local Godot.
- **`full`:** the **same** Godot Linux artifact **plus** the original heavier offline server/source/MariaDB-schema/test pack and the short-lived executable workspace artifact. The original full tests and receipts are preserved.

The `full` job requires `main`, as it did before. The Godot-only mode may run on an explicitly selected feature branch, with that commit SHA recorded in its manifest. **Neither option publishes nor signs an APK or promotes a deployment.**

## Downloadable artifacts

The Godot job uploads `aurion-godot-linux-<commit SHA>` (14-day GitHub retention); the full mode additionally uploads `aurion-local-test-pack-<commit SHA>` (14 days) and `aurion-local-workspace-<commit SHA>` (2 days). Each is a GitHub Actions artifact; downloaded ZIPs contain the files listed below.

Godot Linux workspace contents:

- `aurion-godot-project.tar.zst`: an exact-commit Git archive of `godot-client/`, `scripts/godot/` and `config/godot-toolchain.lock.json`, including **tracked public** add-ons and project settings.
- `Godot_v4.7.2-stable_linux.x86_64.zst`: verified standalone Linux editor, **not** Android templates/SDK.
- `manifest.json`, `SHA256SUMS`, `README.md` and pinned lock copy, including SHA-256 verification instructions.

The archive includes source files and checked-in assets; Godot regenerates `.godot/` caches when imported. Some SHA-pinned generated runtime assets and live server-state are intentionally absent. The package is **editor-importable**, not a proof of playable production world.

## Owner-purchased Modular Character System

**Aurion may use the purchased MCS 1.0 indefinitely under its license.** The separate vendor developer toolkit is not bundled in downloadable public GitHub artifacts. Once [PR #1194](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/1194) is integrated, the archive includes our own `scripts/godot/stage_modular_npc.py` and NPC adapter; place the owner's original purchased `ModularCharacterSystem.zip` only in the **private, local** workspace and run:

```bash
python3 scripts/godot/stage_modular_npc.py --archive /private/path/ModularCharacterSystem.zip
./Godot_v4.7.2-stable_linux.x86_64 --headless --path godot-client --editor --import
./Godot_v4.7.2-stable_linux.x86_64 --headless --path godot-client --script tests/test_modular_npc_private_runtime.gd
```

Never push the paid `godot-client/addons/modular_character_system/` source to public Git, nor upload its development toolkit as a public Actions artifact. The licensed finished-game runtime has its own downstream packaging/signing review.

## Automatic safety checks preserved

Moving the heavy offline pack to manual **does not disable** native-auth migrations or MariaDB integrity checks: `.github/workflows/aurion-core-schema-gate.yml` runs a fresh disposable MariaDB schema/test job on relevant PRs and pushes to `main`. The independent Godot, Android, and other dedicated workflows remain separate.

If a manual run fails, review its exact `run_id`/`run_attempt`, head SHA, and causal job log. A queued/skipped/in-progress run is not a successful artifact. GitHub's run artifacts expire according to retention; no background VPS directories or persistent workspaces are created by this workflow.
