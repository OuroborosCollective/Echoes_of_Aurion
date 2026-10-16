# Aurion monster GLB geometry: observed source properties, not a made-up art ceiling

**Status:** Measured asset geometry and structural preflight only. No production Android GPU/FPS, end-to-end material/animation frame-time or simultaneous-mob load claim is implied.

**Evidence source:** Owner's connected Google Drive `PacksMODELLE`, three `Big`, `Blob`, and `Flying` glTF directories; converted into a local SHA-256-bound 49-GLB archive with source manifest `aurion.drive-monster-gltf-import.v1`. The original user-owned GLB ZIP and raw models are **not committed to GitHub**. The CC0 1.0 `License.txt` in the Drive pack identifies Quaternius/Ultimate Platformer Pack. One source (`Flying/Demon.gltf`) was quarantined because no valid `Walk` motion could be mapped; do not invent animation clips or silently release it.

## Measured asset distribution

| Property | Observed |
| --- | ---: |
| Available glTF sources | 50 |
| Structurally validated GLB conversions | 49 |
| Quarantined sources | 1 |
| Triangle minimum / median / maximum | 1,030 / 3,696 / 8,284 |
| Mean triangles | approximately 4,233 |
| Models above former `1,600`-triangle "LOD0" art cap | 45 of 49 |
| Models at or below 10,000 triangles | 49 of 49 |
| Maximum joints in a skin | 49 |
| Maximum animation clips per model | 15 |
| Aggregate triangles across one instance of each GLB | 207,394 (not a frame-time measurement) |
| Combined GLB bytes before ZIP | approximately 17.56 MB |

The old **1,600/800/300** targets in `mobile_glb_blender_worker.py` are *static LOD-generation objectives*, not measured device draw-call ceilings. That worker explicitly exports `export_animations=False` and `export_skins=False`, so it **must not** be used to prepare these rigged monsters. For combat actors, use the independent rig-preserving GLB conversion/import lane and preserve actual animated clips with motion. Do not decimate skinned mesh weights to an unproven target.

## Engine policy

1. **Do not reject an approved enemy model solely because its geometry exceeds 1,600 triangles.** Renderer-level import uses already-approved, SHA-256-bound GLBs, and the scene graph still needs valid non-empty triangle geometry and a rig. This is a presentation decision, not gameplay authority.
2. Keep strict structural/server preflight, maximum 24 MiB GLB upload, verified storage hash, supported extensions, texture/decoder resource accounting, bounded concurrent loads, animation-pose validation, and the existing <=64-bone render compatibility gate. These are separate from geometry art-quality goals.
3. Keep the current phone/tablet/desktop resource caps as protective **engineering defaults**, not claims of established optimal hardware ceilings. Tune them only with actual device measurements.
4. Assess LOD needs by measured sustained frame time and animation motion with *several simultaneously visible monsters*, not by a single source model's triangle count. Test low/mid/high-end Android separately from desktop, and record model identities/counts, actual triangles in view, draw calls, textures, CPU/GPU frame time where available, stutter, memory and file hashes.
5. If a device is too slow, produce new **rig-preserving**, individually audited LOD variants and retest. Do not replace valid animations with guessed `Idle`, `Walk`, `Attack` or `Death` sequences.

## Current verification boundary

- Local real-asset ZIP structural validation: **49 valid, 0 invalid** (does not measure render throughput).
- Runtime regression: real Three.js `SkinnedMesh` with 8,284 indexed triangles plus valid motion clips must be accepted once catalog-approved, and its geometry/rig counts visible in evidence.
- Remaining before calling the pack production-ready: exact revision CI, real import receipts with immutable SHA readback, live 3D load and material/animation fidelity in desktop and actual Android/browser GPU scenarios, representative multi-enemy performance, and upload-path security controls.

**No global FPS or triangle ceiling has been declared from these statistics.**
