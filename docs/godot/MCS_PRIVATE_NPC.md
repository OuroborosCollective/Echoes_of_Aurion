# Optional licensed Modular Character System 1.0 — Aurion NPC visuals

The owner-purchased **Modular Character System 1.0** is not open-source. Never push its original `addons/modular_character_system` directory, scripts, scenes, `.gltf`, `.bin`, or textures to this public repository. The included Quaternius CC0 assets are separately licensed; this integration does not redistribute them.

## Private workspace setup

The purchased archive is **ModularCharacterSystem.zip**, SHA-256:

`ac72db1a5ff6985e19f1c07e4d1404560684f07aa7b9268382be8bcd2c635788`

The normal project has an empty private-pack pin. Merely copying the add-on or
its receipt into a workspace cannot activate MCS: Godot's imported files can
differ from their sources. Public Android exports exclude both the vendor
directory and `private-mcs/`. Do not use the 0.9.1 beta ZIP.

The isolated, opt-in acceptance requires a clean tracked source revision and
builds the host from its Git archive, excluding ignored workspace contents. It
builds a temporary PCK from the pinned vendor archive using the pinned Godot
4.7.2 editor. It strips the PCK's `project.binary`,
checks its paths, contents, and collisions with the exported host's paths,
global classes and UIDs, and binds the resulting PCK hash to a generated source
pin in the temporary host. It checks the real rig, GLB fallback, packed host,
tampered/missing pack, untrusted source directory and hostile imported cache.
Vendor output is withheld and the temporary tree is deleted when the test ends:

```sh
python3 scripts/godot/private_mcs_acceptance.py \
  --archive /private/path/ModularCharacterSystem.zip \
  --godot /private/path/Godot_v4.7.2-stable_linux.x86_64
```

The pin is meaningful only when the host application and builder are themselves
trusted and the delivered APK's signature and content are independently
verified. A digest proves byte identity, not purchase entitlement. This test
does not produce an Android APK or authorize redistribution. Android-specific
packing, signing and device behavior require separate verification.

The checked-in `godot-client/actors/modular_npc_visual.gd` is **original Aurion-owned adapter code**, not vendor code. It selects purely cosmetic appearances deterministically from validated `npc:<id>` using SHA-256 and fixed, versioned palettes. It may display confirmed **audited-standard quest NPCs** only. When the private add-on is absent or its rig is invalid, the existing independently hash-admitted standard GLB presentation remains. Approved-assignment NPCs remain rendered using their original approved assets.

**Not yet demonstrated:** physical Tab A9 FPS, Android APK containing the private runtime, live Aurion NPC placement, server receipts, or licensed source redistribution. The public CI must never imply these checks passed. No NPC spawn, movement, persistence, combat, or 10 Hz gameplay code is installed or changed. Cosmetic variants do not encode a canon profession. The public source is safe for open GitHub; embedding licensed MCS assets in an APK requires applying the vendor finished-product license and checking artifact access.
