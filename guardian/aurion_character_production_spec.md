# Aurion Character Production Specification

## Gemeinsamer Laufzeitvertrag

Beide Charaktere folgen `PROFILE_CHARACTER`, `PROFILE_BROWSER_MMO` und `PROFILE_ANDROID_GAME`: **GLB**, aufrechte A-Pose, metrische Skalierung, PBR Metallic-Roughness, höchstens drei Materialien, maximal 5.000 Dreiecke, maximal zwei 1024²-Texturatlanten und ein bipedales Tripo-Rig. Die Animationen werden über die Einzelkette *Generate → Rig-Check → Rig → Retarget* erzeugt: `idle`, `walk` und `run`. Der Ursprung liegt zentral zwischen den Füßen; die Blickrichtung ist positive Z-Achse. Transparente Flächen, lange lose Tücher und extreme Proportionen sind ausgeschlossen.

| Kennung | Spielrolle | Silhouette & Farbklang | Budget & Animation |
|---|---|---|---|
| `aurion-wayfinder` | Menschlicher Expeditionserkunder | schlanke, geschichtete Feldrüstung; gebrochenes Elfenbein, Bronze, dunkles Petrol; kurzer Mantel, geschlossene Kapuze, leuchtendes türkisfarbenes Brustsigil | ≤5.000 Dreiecke, ≤72 Bones, 1–3 PBR-Materialien, `idle`/`walk`/`run` |
| `aurion-veilguard` | Menschliche Sternenwächterin | kompakter, defensiver Plattenmantel; oxidiertes Bronze, Nachtteal, kleine amberfarbene Energieeinsätze; asymmetrischer Schulterpanzer, kein Umhang | ≤5.000 Dreiecke, ≤72 Bones, 1–3 PBR-Materialien, `idle`/`walk`/`run` |

## Text-to-3D-Prompt — Wayfinder

> Full-body single humanoid game character in a neutral upright A-pose, front-facing, slim human Aurion expedition wayfinder. Semi-stylized premium browser-game PBR design: layered ivory field armor, aged bronze trims, deep teal underlayers, short split mantle, closed hood, subtle cyan glowing chest sigil. Clean readable silhouette, no weapon, no floating parts, no cape, no backdrop, no scene, no base. One complete centered character only. Proportions suitable for biped rigging, separate readable arms and legs, watertight geometry, tight topology with no intersecting geometry, uniform vertex density, non-overlapping UV layout, optimized real-time topology, 5k triangles maximum, 1–3 PBR materials, 1024 texture atlas maximum. Do not include text, logos, other characters, or dramatic pose.

## Text-to-3D-Prompt — Veilguard

> Full-body single humanoid game character in a neutral upright A-pose, front-facing, compact human Aurion veilguard. Semi-stylized premium browser-game PBR design: oxidized bronze defensive plate mantle, midnight teal fabric joints, restrained amber energy insets, asymmetric left shoulder guard, segmented waist armor. No weapon, no cape, no floating parts, no backdrop, no scene, no base. One complete centered character only. Proportions suitable for biped rigging, separate readable arms and legs, watertight geometry, tight topology with no intersecting geometry, uniform vertex density, non-overlapping UV layout, optimized real-time topology, 5k triangles maximum, 1–3 PBR materials, 1024 texture atlas maximum. Do not include text, logos, other characters, or dramatic pose.

## Single-Request Safety Gate

1. Der Antrag wird mit einem stabilen lokalen Auftragsschlüssel protokolliert, **bevor** ein externer Generierungsaufruf erfolgt.
2. Vor jedem Aufruf wird der vorhandene Status abgefragt. Bei `queued` oder `running` wird niemals erneut erzeugt.
3. Erst nach `success` oder einem endgültigen `failed` wird der Folgeprozess ausgelöst. Das zweite Modell beginnt erst nach vollständiger Prüfung des ersten.
4. Jede Stufe erhält genau einen Task-Verweis; Wiederholungen erfolgen nicht automatisiert.

## Gemini Review Gate

Die Gegenprüfung hat die beiden Briefings freigegeben. Vor der Integration werden zusätzlich die 16-MiB-Gesamtgröße inklusive Texturen und Skinning, der Pivot `(0,0,0)` mit Füßen auf Bodenniveau und die bipedale Rig-Hierarchie geprüft. Bei der Veilguard ist die Deformation der asymmetrischen Schulterpanzerung besonders zu kontrollieren; beim Wayfinder gilt dies für Kapuzen- und Mantelübergang.

## Verwendete Primärquellen

- Tripo API Quick Start und Game-Ready-Character-Pipeline: <https://developers.tripo3d.ai/en/docs/quick-start>
- Tripo Task Lifecycle: <https://developers.tripo3d.ai/en/docs/task-lifecycle>
- Tripo Auto Rig: <https://developers.tripo3d.ai/en/docs/animations-rig>
- Tripo Animationsübersicht und Retargeting: <https://developers.tripo3d.ai/en/models/animation>
