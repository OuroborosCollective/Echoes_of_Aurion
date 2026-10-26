# Aurion Godot toolbox: engine-first policy (26.10.2026)

Aurion owns gameplay, persistence, NPC logic, quests, world edits, security and receipts. Godot 4.7.2 Android Compatibility is a renderer/editor, not another authority. These are evaluated candidates, not proven shipped or installed features.

## First use Godot itself

- Scene tree, inherited PackedScenes, @tool and EditorUndoRedoManager: scene/house/prop editor, with changes emitted only as Aurion typed proposals.
- Godot advanced GLB import, EditorScenePostImport, SkeletonProfileHumanoid, BoneMap, AnimationTree and BoneAttachment3D: rig retargeting, attack/walk/idle animation and equipment anchors instead of custom bone handling.
- MultiMeshInstance3D, visibility ranges, Godot LOD and occlusion: large numbers of trees/props, but only confirmed world geometry and with measured Tab A9 performance.
- NavigationServer3D, NavigationMesh and AStar3D: editor visualization or client presentation only; NPC decisions stay server-authoritative.
- Built-in debugger, remote scene tree, profiler and performance monitors: real device evidence; a successful headless import does not prove tablet FPS or visuals.
- Control, Theme, anchors and InputMap: native HUD and touch rather than a rebuilt menu system.

## Evaluated add-ons

| Tool / URL | Use | Decision |
| --- | --- | --- |
| [Asset Placer](https://github.com/levinzonr/godot-asset-placer) | Visual placing of GLB scenes/props directly on Terrain3D, editor palette, undo | First **isolated editor-only** pilot. v1.6.0 commit 1dbf9fd782566780d6a6c52bd4197f448622f0aa, MIT. Neither player client nor Android APK includes it. |
| [GdUnit4](https://github.com/godot-gdunit-labs/gdUnit4) | GDScript scene/signal/touch regression, JUnit | Next test pilot; pin version; retain all existing native tests. |
| [Script-IDE](https://github.com/Maran23/script-ide) | Better editor script navigation | Editor-only optional. |
| [Godot Editor MCP](https://github.com/eezstreet/godot-mcp) | Interactive editor/scene inspection and automated smoke tests | Security-gated workstation-only experiment, isolated, localhost read-only first, no token, no open VPS listener. Exact project implementation and scope require verification. |
| [ProtonScatter](https://github.com/HungryProton/scatter) | Vegetation/prop scattering | Authoring proposals only; budget and renderer compatibility gate. |
| [Phantom Camera](https://github.com/ramokz/phantom-camera) | Camera follow / smoothing | Client presentation trial after G19, verify performance. |
| [Dialogue Manager](https://github.com/nathanhoad/godot_dialogue_manager) | UI dialogue flow, localization | Visual-only, no client-owned outcome or quest rules. |
| [Godot Git Plugin](https://github.com/godotengine/godot-git-plugin) | Editor Git integration | Optional; SHA-based GitHub workflow remains authoritative. |
| [GDToolkit](https://github.com/Scony/godot-gdscript-toolkit) | Format/parser/lint GDScript | CI check-only trial, never auto-reformat unrelated scripts. |
| [Beehave](https://github.com/bitbrain/beehave) | NPC behavior-tree visual authoring | Never local NPC decision authority; optional authoring UI only. |
| [Orchestrator](https://github.com/CraterCrash/godot-orchestrator) | Visual graph editing | Version 2.5.x for Godot 4.7, GDExtension trial only. |
| [Pandora](https://github.com/bitbrain/pandora) | RPG content editing | Upstream alpha: no new canonical item/quest database. |
| [Godot Rapier Physics](https://github.com/appsinacup/godot-rapier-physics) | Alternative physics | Defer; adds native library and world-simulation risk. |
| [GodotEnv](https://github.com/chickensoft-games/GodotEnv) | Editor version/addon manager | Optional; existing Aurion SHA-pinned bootstrap remains primary. |
| [Beehive](https://github.com/storozhenko98/beehive) | Multi-repo agent workspaces | Not a Godot addon; do not duplicate repos on the capacity-limited VPS. |

## Plugin admission tests

1. License and immutable upstream SHA/digest, tested version, Godot ABI, editor-only vs Android ARM64 runtime distinction.
2. A temporary isolated editor stage: stage-editor-tools.mjs; real Godot 4.7.2 editor import in aurion-godot-editor-toolbox-proof.yml; inspect original logs. No changes to production godot-client source or main Android export.
3. Only recognized authored proposals may reach Aurion; source change -> reviewed PR -> actual focused CI -> independent readback. NEVER copy an entire demo app into canonical gameplay code.
4. Keep evidence for red failing tests, true render pixels, native packaging readback, signed APK, physical Tab A9 FPS separately.
5. Existing G19 PR #1183 remains separate. At head 31b9a4033719a96229699eccc4267437c2327d09, native rendered synthetic test run 40319340743 PASS, but Android Terrain3D ARM64 packaged binary and physical Tab A9 are still UNVERIFIED. Godot reported resource leaks at shutdown.
