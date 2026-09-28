---
description: >-
  AIM-599: deterministische, seam-stabile Terrain-Pipeline mit
  Wolfram-verifizierten Geometrieinvarianten.
---

# AIM-599 — Deterministische Terrain-Pipeline

> **Status:** aktuelle Aurion-Implementierung auf `feat/599-deterministic-terrain-pipeline`, Commit `d498b51d`, Draft-PR [#662](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/662).
>
> **Authority:** Aurion. Diese Seite beschreibt die aktuelle Runtime-Implementierung und ihre Regressionen. Wolfram/CAG ist ein unabhängiger Prüfkanal und niemals Owner der Weltwahrheit.

## 1. Zweck und Problemdefinition

Issue #599 schließt die Lücke zwischen deterministischer World-Graph-/Grammar-Erzeugung und einer reproduzierbaren Terrain-Materialisierung. Terrain darf nicht aus einer clientseitigen Zufallsquelle, einem Provider-Ergebnis oder einer nicht gebundenen Float-Noise-Implementierung entstehen.

Die Pipeline muss deshalb:

* aus `worldId`, `worldSeed`, World-Generation-Revision und Chunk-Koordinate exakt reproduzierbar sein;
* für dieselbe Eingabe bei beliebigen Wiederholungen denselben Terrain-Hash liefern;
* gemeinsame Chunk-Ränder identisch berechnen, einschließlich negativer Koordinaten;
* Höhen, Nachbargradienten, Begehbarkeit und Wasser-/Land-Materialien innerhalb eines festen Vertrags halten;
* die kanonische `BaseWorldChunk`-Erzeugung speisen, ohne CAG oder den Client zur Authority zu machen.

## 2. Implementierungsoberfläche

Die aktuelle Implementierung liegt in:

* `shared/deterministicTerrainPipelineProtocol.ts`
* `shared/worldChunkProtocol.ts`
* `server/deterministicTerrainPipeline.test.ts`
* `server/aurionCagDesignOracle.ts`

Protokoll- und Generator-Kennungen:

```
aurion.deterministic-terrain.v1
aurion.terrain-generator.v1
```

Die kanonische Chunk-Funktion `generateBaseWorldChunk` akzeptiert optional eine 40-stellige hexadezimale `worldGenerationRevision`. Wenn sie nicht übergeben wird, verwendet sie die stabile Default-Revision:

```
0000000000000000000000000000000000000001
```

Die Revision ist Teil der Terrain-Berechnung und damit indirekt Teil des kanonischen `BaseWorldChunk.deterministicHash`.

## 3. Deterministischer Input-Vertrag

```ts
type DeterministicTerrainChunkInput = {
  worldId: string;
  worldSeed: string;
  worldGenerationRevision: string; // /^[a-f0-9]{40}$/
  coordinate: { x: number; z: number };
};
```

Fail-closed-Regeln:

* `worldId` und `worldSeed` müssen nichtleer sein.
* `worldGenerationRevision` muss exakt 40 Kleinbuchstaben-Ziffern im Hex-Format enthalten.
* Chunk-Koordinaten müssen sichere Ganzzahlen innerhalb `±1_000_000` sein.
* Dezimalwerte, übergroße Koordinaten und fehlende Identitäten werden abgewiesen.

Es gibt keine Verwendung von `Math.random`, `Date.now`, externem Provider-State oder impliziter Zeit.

## 4. Globale Sample-Lattice und Seam-Stabilität

Jeder Chunk wird als 16×16-Terraingitter berechnet. Die 16 Samples pro Achse verwenden 15 gemeinsame Intervalle pro Chunk:

```
sampleResolution = 64_000 mm / 15
```

Der globale Sample-Index lautet:

```
globalSampleX = chunkX * 15 + localX
globalSampleZ = chunkZ * 15 + localZ
```

Damit ist der östliche Rand eines Chunks exakt derselbe globale Index wie der westliche Rand seines östlichen Nachbarn:

```
chunkX * 15 + 15 == (chunkX + 1) * 15 + 0
```

Dasselbe gilt für die Nord-/Süd-Richtung und für negative Koordinaten. Die Pipeline vergleicht die Nachbarkoordinaten vor dem Seam-Vergleich; zwei geometrisch gleiche, aber räumlich falsch übergebene Chunks gelten daher nicht als gültige Naht.

Der öffentliche Prüfhelfer ist:

```ts
verifyTerrainSeam(left, right, "north" | "south" | "west" | "east")
```

Er prüft sowohl die erwartete Nachbarkoordinate als auch die vollständige Höhe des gemeinsamen Randes.

## 5. Höhen- und Biome-Berechnung

Die Höhe wird als deterministische, ganzzahlige Kombination aus zwei domain-separierten FNV-1a-Komponenten berechnet:

1. `terrain-height-base` auf dem globalen Sample-Index mit Wertebereich `-600..600`;
2. `terrain-height-regional` auf einer gröberen, per Floor-Division gebildeten Region mit Wertebereich `-300..300`.

Damit bleibt die theoretische Höhe im Bereich `-900..900 mm`. Die Floor-Division ist insbesondere für negative Sample-Indizes wichtig; eine einfache Trunkierung Richtung Null würde die westlichen und nördlichen Regionen anders partitionieren.

Wasser wird deterministisch aus der Höhe abgeleitet:

```
heightMm <= -500  => biome = riverland, water = true, material = water
```

Nicht-Wasserflächen erhalten ein deterministisches Klima-Biome aus `forest`, `plains`, `highland`, `ashland` oder `ruins`. Die Materialklasse wird ausschließlich aus Biome und Wasserstatus abgeleitet. In die kanonische `BaseWorldChunk`-Projektion wird Wasser als `riverbank` abgebildet, weil das bestehende Chunk-Surface-Modell keine eigene Wasser-Surface-ID besitzt.

Der Chunk-Biome-Wert ist das deterministische Mehrheits-Biome der 256 Terrain-Tiles. Die einzelnen Tile-Werte bleiben dennoch vollständig im Terrain-Protokoll verfügbar.

## 6. Geometrie- und Gameplay-Invarianten

| Invariante                 |          Vertrag |
| -------------------------- | ---------------: |
| Terrain-Höhe               |   `-900..900 mm` |
| Maximale Nachbar-Differenz |       `1_800 mm` |
| Maximale Steigung          |      `4_219 BPS` |
| Minimale begehbare Tiles   |   `32` von `256` |
| Sample-Auflösung           | `64_000 / 15 mm` |
| Chunk-Koordinaten          |     `±1_000_000` |

Die Implementierung verweigert die Materialisierung mit `TERRAIN_GEOMETRY_CONSTRAINT_VIOLATION`, wenn Höhen-, Nachbar- oder Steigungsgrenzen verletzt werden. Zu wenig begehbare Fläche erzeugt `TERRAIN_WALKABLE_AREA_INSUFFICIENT`.

Wasser-/Land-Konsistenz wird ebenfalls fail-closed geprüft: jedes Wasser-Tile hat `material = "water"` und `biome = "riverland"`; kein Land-Tile besitzt das Wasser-Material; `walkableTileCount = tileCount - waterTileCount`.

## 7. Terrain-Hash und Authority Boundary

Der Terrain-Hash wird aus einer stabil sortierten Darstellung des vollständigen Terrain-Snapshots gebildet:

```
terrain-fnv1a-<8-stellige-hex-digest>
```

Die Darstellung enthält Protokollversion, Generatorversion, Weltidentität, Revision, Koordinate, Tiles und alle berechneten Invarianten. Der Hash ist browser-sicher implementiert und zieht keinen Node-only-Import in den Client-Bundle. Die kanonische `BaseWorldChunk`-Identität bleibt der bestehende Aurion-`deterministicHash`-Vertrag.

**Kanonisch** sind Aurion-Terrain- und Chunk-Generator, World-ID, Seed, Revision, Koordinate, integerbasierte Höhen, Biomes, Materialien, Hashes, Readmodels und Receipts. Renderer-Frames, Meshes, UI-Zustand, clientseitige Wasser-/Biome-Behauptungen und CAG-Ergebnisse als direkte Runtime-Wahrheit sind nicht kanonisch.

## 8. CAG-/Wolfram-Verifikation

`buildWorldChunkTerrainCagProbe` erzeugt aus dem bereits kanonischen Chunk eine begrenzte Wolfram-Language-Anfrage. CAG generiert kein zweites Terrain und wählt keinen Seed. Es berechnet nur erneut:

```
{Min[flat], Max[flat], Max[Join[dx, dz]]}
```

Der CAG-Receipt enthält `inputSha256`, `resultSha256`, `verdict` (`SUPPORTED`, `CONTRADICTED`, `INCONCLUSIVE`) und `rulesetPromotion` (`eligible`, `blocked`).

Die Promotion-Schranke ist explizit:

```ts
assertCagRulesetPromotionAllowed(receipt)
```

Nur ein exakt unterstütztes Ergebnis mit Result-Hash darf passieren. Eine Abweichung oder Provider-Unsicherheit erzeugt `CAG_RULESET_PROMOTION_BLOCKED`. CAG verändert niemals Chunk-State, Gameplay-State, Persistenz oder Assets.

## 9. Exakte Wolfram-Nachweise

Die Steigungsformel lautet:

```
Ceiling[deltaMm * 15 * 10000 / 64000]
```

Für `deltaMm = 1800` wurde mit Wolfram ausgewertet:

```
Ceiling[1800 * 15 * 10000 / 64000] = 4219
4219 <= 4219                         -> True
1800 <= 1800                         -> True
0 * 15 + 15 == 1 * 15 + 0           -> True
-1 * 15 + 15 == 0 * 15 + 0          -> True
```

Damit sind die exakte Steigungsgrenze sowie die Seam-Identitäten mathematisch reproduzierbar. Die Walkability-Grenze `32` ist ein ganzzahliger Tile-Count ohne Float- oder Rundungsregel.

## 10. Regressionen und Validierung

`server/deterministicTerrainPipeline.test.ts` deckt 100 identische Replays, Seed-/Revision-Bindung, jede Naht einer 5×5-Nachbarschaft, negative und positive Grenzkoordinaten, Geometrie-/Walkability-/Wasser-Invarianten, `BaseWorldChunk`-Integration, CAG-Hashes, Promotion/Blockierung und invalides Input ab.

Validierung des Draft-PRs:

```
Wolfram exakte Terrain-Grenzen       bestanden
Fokus-/Nachbarregressionen           28 Tests bestanden
pnpm check                           bestanden
pnpm build                           bestanden
git diff --check                     bestanden
pnpm test                            1.750 Tests bestanden
```

Die vollständige Suite meldete zusätzlich `51` Testdateien und `192` Tests als übersprungen. Diese Skips sind bestehende MariaDB-/Environment-Gates und keine Terrain-Fehler.

## 11. Nachvollziehbarkeit

* [Issue #599](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/599)
* [Draft-PR #662](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/662)
* [Terrain-Protokoll](https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/feat/599-deterministic-terrain-pipeline/shared/deterministicTerrainPipelineProtocol.ts)
* [Terrain-Regressionen](https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/feat/599-deterministic-terrain-pipeline/server/deterministicTerrainPipeline.test.ts)
* [CAG-Receipt und Promotion-Gate](https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/feat/599-deterministic-terrain-pipeline/server/aurionCagDesignOracle.ts)
* AIM-548 — Settlement Emergence
* Aurion Single Authority
