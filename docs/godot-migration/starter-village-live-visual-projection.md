# G19: server-confirmed Quaternius Starterdorf (Godot Compatibility)

Scope: Echoes of Aurion, native Godot 4.7.2, target Samsung Tab A9. **Code review integration; neither a live deployment nor installable APK by itself.**

## Authority and evidence
- Aurion owns every canonical world decision. Existing protected GET `/api/game/world-chunk-surface?x=...&z=...` authenticates the player, checks MariaDB, verifies active `observatory_threshold` presence lease and 3x3 window, and retrieves the actual world chunk.
- Only on the origin chunk (0,0), the server attaches `starterVillageVisuals`, derived by filtering the existing `shared/aurionStarterVillageContract.ts` through `worldAssetRegion`. Exactly ten canonical placements, no client-side generation, no new gameplay persistence.
- The Godot client admits the optional plan only after its current v5-zone/connection/coordinate-gated chunk response, and validates the exact identities, catalog SHA256 `94de6cf4ff05f0ccc93c9471f077972b09def8e21c42e3720215017ab7939c4f` and collision SHA256 `ba350a340de4cac8a1326af7c9d02c8704bf4fff01b0d600347cf9b4c8bb2580`. A missing/invalid/foreign plan renders **no village**, never an invented substitute.
- The native presentation maps the **existing** six catalog asset IDs to four explicitly visual-only Quaternius prefabs: three houses, one market, four gates and two walls. It does **not** replace collision definitions, add local NPC decisions, create housing gameplay, change the server's catalog, or independently place terrain.
- All scene transforms are server positions in millimetres divided by 1000; vertical anchor is read from the same confirmed 256-tile chunk. 64m chunk, partial walls; no closed village border is claimed.
- Old clients simply ignore optional JSON fields; old server responses produce terrain without village skins. The authenticated chunk endpoint is unchanged.

## Source and licenses
- Original user-provided `Aurion_Starterdorf_GLBundle_v2.zip` SHA256 `f0adafe5bcabcb17cefdf24ca6d1b4752eeaa4263baa41107336e211dfc05c70`.
- Precisely eight optimized, self-contained GLBs under `godot-client/assets/starter_village`, together ~3.5 MB. Colors max 384x384, other texture channels max 192x192; embedded images and mesh geometry preserved and source derivation recorded in `manifest.json`.
- Quaternius CC0-1.0 license notices under `QUATERNIUS_CC0_LICENSE.txt`. No Sky3D third-party textures or proprietary Ovani sound/audio is committed.
- Hashes and object bounds checked using `scripts/godot/check-starter-village-assets.mjs` + negative controls. Models have NO gameplay colliders.

## Tests and gates
- Native Godot check stage `starter-village-model-projection` loads the actual active main.tscn scene, imports all GLB PackedScenes, consumes an explicit **synthetic v5 protocol fixture** with ten matching identities and rejects counterfeit, duplicate, foreign-session or stale overlays. This is evidence for native client behavior, **not** a production lease or real player.
- Compare real pixels with the existing native G18/G19 render tests where available. Android ARM64 Terrain3D packaging, source asset manifest admission and texture performance must be measured before a Tab A9 install recommendation.
- To bring this into production requires reviewed exact-HEAD CI, merge, separate Aurion runtime promotion, HTTPS+DB+WorldLease readback, signed Android APK artifact with verified cert/DAL and a physical Tab A9 check. A PR or green test alone is not live.

## Safety status
Fail closed for missing DB lease/server state, missing visuals, source mismatch or invalid shapes. Do not lower test thresholds or invent any client game state. Keep G19 Terrain3D PR #1183 and the editor toolbox PR #1185 separate until independently proven. `APK installieren: NEIN` until the release guardian's chain is actually satisfied.
