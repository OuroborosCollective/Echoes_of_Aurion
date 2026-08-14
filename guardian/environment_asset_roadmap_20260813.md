# Aurion: kontrollierte Umgebungsasset-Roadmap

## Produktionsprinzip

Aurion benötigt keine unverbundene Sammlung großer Einzelmodelle. Die wirtschaftlichste und zugleich atmosphärisch konsistente Strategie ist ein **kleines, streng modular aufgebautes Basiskit**: wiederverwendbare Meshes auf festem Raster, wenige Materialfamilien und austauschbare Farb- beziehungsweise Oberflächenvarianten. Dieses Vorgehen folgt den glTF-Empfehlungen zu konsistenter Skalierung, Instancing und Mesh-Kompression.[1] Wiederverwendbare KTX2/Basis-Texturen sind für spätere mobile Auslieferung vorgesehen, da sie Download- und GPU-Speicherbedarf reduzieren können.[2]

> **Kontrollregel:** Kein Batch-Generieren. Erst der nachstehende Einzelauftrag „Asterion Ruin Floor Kit“ darf nach einer späteren, ausdrücklichen Freigabe erstellt werden. Alle weiteren Zeilen sind Spezifikationen, keine Erzeugungsaufträge.

## Priorisierte Baukastenfolge

| Priorität | Kit | Spielwert | Wiederverwendung | Erzeugungsstatus |
|---:|---|---|---|---|
| 0 | Aurion-Materialbibliothek | Gemeinsame visuelle Sprache für Stein, Bronze, Obsidian und Runenglimmen | Alle Welten | Spezifikation |
| 1 | Asterion Ruin Floor Kit | Lesbarer Dungeonboden für die vorhandene Sternwarte | Sternwarte, Archiv, Arenen | **einziger vorbereiteter Auftrag** |
| 2 | Archivhalle Structural Kit | Wände, Bogen, Säule, Tür- und Nischenmodule | Dungeon, Stadtarchiv, Eventräume | Spezifikation |
| 3 | Siedlungs- und Taverne Shell Kit | Hausfassade, Tür, Fenster, Dach, Tresen und Sitzbank | Housing, Taverne, Quest-Hub | Spezifikation |
| 4 | Organische Randzone | Fels, Wurzel, Kristall, trockene Vegetation | Außenbereiche und Weltenübergänge | Spezifikation |
| 5 | Set-Dressing | Banner, Kiste, Lampe, Buchstapel, Werkbank | Alle Innenräume | Spezifikation |

Die Materialbibliothek verwendet vier austauschbare, stilistisch zusammengehörende Families: `aurion_stone`, `aurion_bronze`, `aurion_obsidian` und `aurion_rune`. Jede Familie besitzt Farb-, Rauheits- und Normalinformation in einer Atlaslogik; das Emissionssignal der Rune wird über einen gekapselten Emissivkanal gesteuert. Transparenz bleibt für Umgebungsassets ausgeschlossen, weil sie Drawcalls und Sortierung unnötig verteuert.

## Verbindliche Budgets

| Ebene | Dreiecke | Materialien | Texturen | GLB-Richtwert | Regel |
|---|---:|---:|---:|---:|---|
| Einzelnes Standardmodul | ≤ 800 | 1 | 512²-Atlas | ≤ 300 KiB | Wiederholung über Instanzen |
| Hero-Modul, z. B. Torbogen | ≤ 2.500 | 2 | maximal 1024² | ≤ 900 KiB | Nur einmal pro Blickfeld |
| Erstes Bodenkit komplett | ≤ 4.500 | 2 | zwei 1024²-Atlanten | ≤ 1,5 MiB | Enthält alle Varianten |
| Sichtbare Zelle | ≤ 60.000 | ≤ 24 aktive Materialien | KTX2 nach Pipeline-Freigabe | ≤ 16 MiB nachgeladen | LOD oder Ausblendung ab Distanz |
| Aktiv geladene Umweltzone | ≤ 180.000 | ≤ 48 aktive Materialien | budgetiert und gestreamt | ≤ 48 MiB Umgebungsdaten | Kein Vollwelt-Load |

Die Grenzen sind konservative Produktionsgates und werden vor jeder Assetannahme mit dem vorhandenen GLB-Inspektor überprüft. Für die bereits integrierten Charaktermodelle gelten weiterhin die strengeren Release-Gates von höchstens 15.000 Dreiecken und 16 MiB pro Modell.

## Einzelauftrag: Asterion Ruin Floor Kit

### Asset Summary

Das `env_asterion_floor_kit_a01` ist ein statisches, rasterbasiertes Bodenkit für Sternwarte Asterion. Es liefert einen zentralen 2×2-Meter-Boden, zwei Rotationsvarianten, eine 1×2-Meter-Randplatte, eine 2-Meter-Runenintarsie und einen schmalen Bronzeabschluss. Das Kit legt die wiederverwendbare Aurion-Stein-/Bronze-Sprache fest, ohne neue Figuren, Gegner oder dekorative Einmalobjekte zu erzeugen.

### Visuelle und technische Spezifikation

Die Silhouette bleibt flach und gameplay-lesbar. Die Oberfläche ist tiefes Petrol-Obsidian, gesäumt von warmem Bronzegrat und mit sparsamem türkisfarbenem Runenschein. Der Ursprung jedes Moduls liegt in der unteren linken Rasterecke auf Weltbodenhöhe; Maße schnappen auf ein 1-Meter-Raster. Modelle nutzen Z-up-kompatible glTF-Ausrichtung, metrische Einheiten und ausschließlich Dreiecksgeometrie.[1]

| Baustein | Maße in Metern | Dreiecke | Materialslot | Kollisionsform |
|---|---:|---:|---:|---|
| `floor_core_2x2` | 2 × 0,12 × 2 | 700 | Stone | Box 2 × 0,12 × 2 |
| `floor_core_2x2_b` | 2 × 0,12 × 2 | 720 | Stone | Box 2 × 0,12 × 2 |
| `floor_edge_1x2` | 1 × 0,16 × 2 | 520 | Stone + Bronze | Box 1 × 0,16 × 2 |
| `floor_rune_2x2` | 2 × 0,13 × 2 | 900 | Stone + Rune | Box 2 × 0,13 × 2 |
| `trim_bronze_2m` | 2 × 0,08 × 0,08 | 210 | Bronze | Box 2 × 0,08 × 0,08 |

Ein gemeinsamer 1024²-PBR-Atlas ist das mobile Basisziel. Er enthält Base Color, ORM (Occlusion-Roughness-Metallic) und eine Normalmap. Das Glimmen des Runenmoduls nutzt denselben Atlas und eine niedrige Emissionsintensität, nicht eine transparente Partikelschicht. UV0 belegt die Atlasflächen ohne Überlappung; spiegelbare, rein steinerne Elemente dürfen UV-mirroring verwenden, die asymmetrische Rune nicht.

### LOD, Export und Qualitätsgates

LOD0 ist das oben spezifizierte Kit. LOD1 reduziert Kanten- und Rundungsgeometrie auf 55 Prozent, LOD2 auf 20 Prozent und darf ab 35 Metern durch eine vereinfachte, nicht interaktive Bodenfläche ersetzt werden. Es gibt kein Rig, keine Animation und keine Sockets. Das Exportformat ist ein einzelnes GLB mit dem Namen `env_asterion_floor_kit_a01.glb`; jede Mesh-ID verwendet das Präfix `aurion_floor_`.

| QA-Gate | Abnahmekriterium |
|---|---|
| 1 | GLB öffnet ohne glTF-Validator-Fehler |
| 2 | Einheit ist Meter |
| 3 | Ursprung aller Module liegt auf dem Raster |
| 4 | Keine N-Gons im Export |
| 5 | LOD0 bleibt ≤ 4.500 Dreiecke |
| 6 | Kein Modul überschreitet 2.500 Dreiecke |
| 7 | Maximal zwei Materialien im gesamten Kit |
| 8 | Kein alpha-blended Material |
| 9 | Maximal zwei 1024²-Atlanten |
| 10 | Base Color, ORM und Normal sind korrekt verknüpft |
| 11 | Emission nutzt keine separate Transparenztextur |
| 12 | UV0 enthält keine ungewollten Überlappungen |
| 13 | Asymmetrische Rune wird nicht gespiegelt |
| 14 | Alle Kollisionen sind einfache Boxen |
| 15 | Keine versteckten Innenflächen |
| 16 | Normals zeigen nach außen |
| 17 | Hartkantige Bronze besitzt saubere Bevel-Normals |
| 18 | Naht zwischen 2×2-Modulen ist bei 90°-Drehung dicht |
| 19 | LOD1 und LOD2 behalten Rastermaß und Pivot |
| 20 | Gesamtes GLB bleibt ≤ 1,5 MiB vor optionaler Mesh-Kompression |
| 21 | Dateiname und Mesh-Präfix erfüllen die Namenskonvention |
| 22 | Vorschau in Babylon zeigt keine fehlenden Texturen |
| 23 | Zwei Instanzen teilen Geometrie und Material |
| 24 | Release-Asset-Gate läuft vor Annahme erfolgreich |

## AUTO-DECISIONS MADE

Die erste Umgebungsinvestition ist ein Bodenkit, weil es sofort Atmosphäre liefert und sich in jeder kommenden Welt wiederverwenden lässt. Häuser, Taverne und organische Biome folgen erst, wenn dieses Kit im Browser und auf Android budgetkonform gerendert wurde. Keine Textur- oder GLB-Generierung wird durch diese Roadmap ausgelöst.

## FINAL MACHINE OUTPUT

```json
{
  "assetName": "env_asterion_floor_kit_a01",
  "assetClass": "modular_environment",
  "usage": "Dungeonboden und Randabschluss für Sternwarte Asterion; instanziert in späteren Innenräumen wiederverwendbar",
  "style": "semi-stylized realtime PBR, Petrol-Obsidian, Bronze und zurückhaltende Aurion-Runenemission",
  "platformProfiles": {
    "mobile": {"triangles": 4500, "materials": 2, "textureAtlas": "2x 1024 KTX2-ready"},
    "mid": {"triangles": 4500, "materials": 2, "textureAtlas": "2x 1024"},
    "high": {"triangles": 4500, "materials": 2, "textureAtlas": "2x 2048 optional only"}
  },
  "dimensions": {"unit": "meters", "height": 0.16, "width": 2, "depth": 2},
  "topology": {"meshType": "static grid modular hard-surface", "triangleBudget": {"mobile": 4500, "mid": 4500, "high": 4500}, "deformationZones": [], "hardSurfaceRules": ["triangulated export", "beveled bronze edges", "no hidden interiors"], "organicRules": []},
  "uv": {"uvSets": 1, "mirroringAllowed": true, "texelDensity": "shared 1024 atlas, rune excluded from mirrored UVs", "seamRules": ["raster edges are seam-aligned", "rune gets unique island"]},
  "materials": {"count": 2, "workflow": "PBR metallic-roughness", "maps": ["baseColor", "normal", "occlusionRoughnessMetallic", "emissive in shared atlas"], "channels": {"stone": "base PBR", "bronze": "metallic PBR", "rune": "low emissive mask"}},
  "rig": {"required": false, "type": "none", "boneCountTargets": {"mobile": 0, "mid": 0, "high": 0}, "bones": [], "constraints": [], "facial": {}},
  "animations": {"required": false, "clips": [], "looping": [], "oneShots": []},
  "lods": {"count": 3, "strategy": "LOD0 100%, LOD1 55%, LOD2 20% then distance replacement", "budgets": [4500, 2475, 900]},
  "collision": {"type": "primitive boxes", "parts": ["2x2 core", "1x2 edge", "2x2 rune", "2m trim"]},
  "attachments": {"sockets": []},
  "export": {"primary": "glb", "secondary": [], "naming": "env_asterion_floor_kit_a01.glb"}
}
```

## References

[1] [Khronos: Asset Creation Guidelines 2.0](https://www.khronos.org/blog/introducing-asset-creation-guidelines-2.0-siggraph-2025)

[2] [Khronos: KTX 2.0 textures for compact glTF assets](https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets)
