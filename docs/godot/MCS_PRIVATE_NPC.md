# Optional licensed Modular Character System 1.0 — Aurion NPC visuals

The owner-purchased **Modular Character System 1.0** is not open-source. Never push its original `addons/modular_character_system` directory, scripts, scenes, `.gltf`, `.bin`, or textures to this public repository. The included Quaternius CC0 assets are separately licensed; this integration does not redistribute them.

## Private workspace setup

The purchased archive is **ModularCharacterSystem.zip**, SHA-256:

`ac72db1a5ff6985e19f1c07e4d1404560684f07aa7b9268382be8bcd2c635788`

Run `python3 scripts/godot/stage_modular_npc.py --archive /private/path/ModularCharacterSystem.zip` to stage the official 1.0 package **locally** beneath `godot-client/addons/modular_character_system/` with the checked-in license-safe staging script, verifying the exact zip SHA-256, root, license and version before unpacking. The entire directory is gitignored. Do not use the 0.9.1 beta ZIP. The project does **not** need to enable the editor plugin in its checked-in `project.godot`; runtime scenes may be loaded from the installed package without making the Character Studio editor a required runtime dependency. For editor-only design, enable the plugin **in an isolated local workspace** and disable before sharing project sources.

After staging, use the SHA-locked Godot 4.7.2 import and headless test:

```sh
node scripts/godot/bootstrap.mjs
.aurion-godot/editor/Godot_v4.7.2-stable_linux.x86_64 --headless --path godot-client --editor --import
.aurion-godot/editor/Godot_v4.7.2-stable_linux.x86_64 --headless --path godot-client --script tests/test_modular_npc_visual.gd
```

The checked-in `godot-client/actors/modular_npc_visual.gd` is **original Aurion-owned adapter code**, not vendor code. It selects purely cosmetic appearances deterministically from validated `npc:<id>` using SHA-256 and fixed, versioned palettes. It may display confirmed **audited-standard quest NPCs** only. When the private add-on is absent, the existing independently hash-admitted standard GLB presentation remains. Approved-assignment NPCs remain rendered using their original approved assets.

**Not yet demonstrated:** physical Tab A9 FPS, Android APK containing the private runtime, live Aurion NPC placement, server receipts, or licensed source redistribution. The public CI must never imply these checks passed. No NPC spawn, movement, persistence, combat, or 10 Hz gameplay code is installed or changed. Cosmetic variants do not encode a canon profession. The public source is safe for open GitHub; embedding licensed MCS assets in an APK requires applying the vendor finished-product license and checking artifact access.
