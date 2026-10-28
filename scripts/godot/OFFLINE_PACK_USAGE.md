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
- `manifest.json`, `SHA256SUMS`, `README.md`, `LICENSE-Godot-4.7.2.txt` (upstream MIT notice) and pinned lock copy, including SHA-256 verification instructions.

The archive includes source files and checked-in assets; Godot regenerates `.godot/` caches when imported. Some SHA-pinned generated runtime assets and live server-state are intentionally absent. The package is **editor-importable**, not a proof of playable production world.

## Owner-purchased Modular Character System

The vendor developer toolkit is not bundled in downloadable public GitHub artifacts. Copying the original archive into the project does not activate MCS. The optional private acceptance builds a disposable, digest-bound pack from the purchased archive and requires the full repository checkout, including the audited standard GLB; this smaller offline archive alone does not contain that source asset:

```bash
python3 scripts/godot/private_mcs_acceptance.py \
  --archive /private/path/ModularCharacterSystem.zip \
  --godot /private/path/Godot_v4.7.2-stable_linux.x86_64
```

Never push the paid `godot-client/addons/modular_character_system/` source or `godot-client/private-mcs/` package to public Git, nor upload the developer toolkit or private pack as public artifacts. The finished-game runtime requires separate license, Android packaging, signing and device review.

## Automatic safety checks preserved

Moving the heavy offline pack to manual **does not disable** native-auth migrations or MariaDB integrity checks: `.github/workflows/aurion-core-schema-gate.yml` runs a fresh disposable MariaDB schema/test job on relevant PRs and pushes to `main`. The independent Godot, Android, and other dedicated workflows remain separate.

If a manual run fails, review its exact `run_id`/`run_attempt`, head SHA, and causal job log. A queued/skipped/in-progress run is not a successful artifact. GitHub's run artifacts expire according to retention; no background VPS directories or persistent workspaces are created by this workflow.
