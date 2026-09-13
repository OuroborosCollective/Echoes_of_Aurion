# Lokale Blender-Arbeit — GLB/GDS Referenz

Diese Seite ist die kurze Arbeitsreferenz für lokale 3D-Arbeit an Echoes of Aurion. Sie ergänzt den kanonischen Game-Development-Studio-Workflow und ändert keine Gameplay-Authority.

## Unterstützte Werkzeugbasis

* Blender 4.5 LTS für lokale GLB-/Rig-/Animationsarbeit.
* Game Development Studio `game-dev` v1.0.2, gepinnt auf `theisegoria/game-development-studio` Revision `96a0b4f34b979279ab983e9547af43133e85f310`.
* Aurion bleibt Zielprojekt; WASD besitzt Gameplay-Wahrheit, AX1 die sichtbare Projektion.

## Lokale Reihenfolge

`unveränderte Quelle → Arbeitskopie/.blend → Transform/Origin/Rig/Material/Animation prüfen → GLB exportieren → game-dev inspect → game-dev validate → Khronos glTF validation → Ingame-Capture → Runtime/Regression/Evidence`

Nie die einzige Quelldatei in-place überschreiben. Triangle-Budgets sind Grenzwerte, keine Qualitätsziele. Vegetation und wiederholte Props bevorzugen Instancing + LOD/HLOD + Culling statt brute-force Geometrie.

## Sichere providerfreie Checks

```bash
game-dev --version
game-dev capabilities --json
game-dev doctor --json
game-dev assets inspect <asset.glb> --json
game-dev assets validate <asset.glb> --policy <policy.json> --json
```

Provider-Aufrufe bleiben davon getrennt und erfordern ihre eigene Freigabe/Spend-Grenze.

## Aurion-Pfade

* `scripts/install-game-development-studio.mjs`
* `shared/glbImportContract.ts`
* `assets/policies/lyra-first-quest-npc.game-dev.json`
* `assets/fantasy-v1/manifest.json`
* `scripts/fantasy_assets/build_stalker.py`
* `scripts/fantasy_assets/verify_animation.py`
* `scripts/fantasy_assets/verify_render.py`
* `client/src/xaurion/integration/MobCatalogProjection.ts`

## Offizielle Referenzen

* Blender 4.5 LTS glTF 2.0: https://docs.blender.org/manual/en/4.5/addons/import\_export/scene\_gltf2.html
* Blender 4.5 LTS Apply Transform: https://docs.blender.org/manual/en/4.5/scene\_layout/object/editing/apply.html
* Blender 4.5 LTS Decimate Modifier: https://docs.blender.org/manual/en/4.5/modeling/modifiers/generate/decimate.html
* Blender 4.5 LTS Actions: https://docs.blender.org/manual/en/4.5/animation/actions.html
* Khronos glTF Validator: https://github.com/KhronosGroup/glTF-Validator
* Game Development Studio: https://github.com/theisegoria/game-development-studio
* GDS Pin: https://github.com/theisegoria/game-development-studio/commit/96a0b4f34b979279ab983e9547af43133e85f310
* Echoes of Aurion: https://github.com/OuroborosCollective/Echoes\_of\_Aurion

## Integrationsregel

`Memory.md lesen → Integration → Runtime/Regression/Evidence → genau ein kurzer Memory.md-Eintrag mit Änderung + Erkenntnis + Evidence → erst dann Merge`
