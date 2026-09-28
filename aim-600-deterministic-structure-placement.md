---
description: >-
  AIM-600: deterministisches Structure Placement mit World-Graph-Bindung und
  Wolfram-CAG-Evidence.
---

# AIM-600 — Deterministic Structure Placement

> **Status:** aktuelle Aurion-Implementierung auf `feat/600-structure-placement-grammar`, Commit `960aeb0d`, Draft-PR [#665](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/665).
>
> **Authority:** Aurion. Diese Seite beschreibt den kanonischen Placement-Compiler und seine Receipt-/Replay-Verträge. Wolfram/CAG ist ein unabhängiger Prüfkanal; sein Ergebnis wird niemals selbst zur World-Graph- oder Gameplay-Authority.

## 1. Zweck und Abgrenzung

Issue #600 ergänzt die bestehende rekursive Structure Grammar um eine eigenständige **Placement-Entscheidungsschicht**. Die Grammar beschreibt, welche Struktur aus Primitives entstehen kann; die Placement-Schicht entscheidet deterministisch, **ob, wo und mit welcher diskreten Variante** eine Struktur im bestätigten World Graph platziert werden darf.

Das Protokoll unterstützt die Strukturklassen:

```
settlement | road | ruin | dungeon | poi
```

Die Authority-Grenze ist ausdrücklich:

* World Graph, Terrain-/Slope-Evidence und Regeln liefern die Eingabe;
* Aurion kompiliert und hasht die Placement-Entscheidung;
* Renderer, UI, CAG und externe Provider dürfen keine Platzierungsentscheidung autonom verändern;
* abgelehnte Kandidaten bleiben abgelehnt, anstatt auf eine implizite Fallback-Regel auszuweichen.

## 2. Implementierungsoberfläche

Die Implementierung liegt in:

* `shared/deterministicStructurePlacementProtocol.ts`
* `server/deterministicStructurePlacementCompiler.ts`
* `server/structurePlacementCagVerifier.ts`
* `server/deterministicStructurePlacementCompiler.test.ts`
* `server/structurePlacementCagVerifier.test.ts`

Protokoll- und Stream-Kennungen:

```
aurion.structure-placement.v1
aurion.structure-placement-compiler.v1
sha256-counter-placement-stream.v1
aurion.structure-placement-cag.v1
```

Der Compiler verwendet den bestehenden kanonischen Aurion-Hash-Vertrag (`canonicalSha256` / `domainSha256`) und Node-Crypto ausschließlich auf der Server-Authority-Seite.

## 3. Deterministischer Input-Vertrag

```ts
type StructurePlacementInput = {
  worldId: string;
  worldSeedHash: string;             // sha256:<64 hex>
  worldGenerationRevision: string;  // 40 lowercase hex characters
  rulesetHash: string;               // sha256:<64 hex>
  sourceRevision: string;            // 40 lowercase hex characters
  graph: { nodes; edges };           // canonical World-Graph projection
  rules: StructurePlacementRule[];
  candidates: StructurePlacementCandidate[];
  existingPlacements?: ExistingStructurePlacement[];
  maxPlacements?: number;
};
```

Fail-closed-Regeln:

* Identitäten verwenden nur begrenzte Identifier-Zeichen (`A-Z`, `a-z`, Ziffern, `.`, `_`, `:`, `-`).
* Seeds und Ruleset-Hashes müssen `sha256:` plus 64 Kleinbuchstaben-Hexzeichen entsprechen.
* World- und Source-Revisionen müssen exakt 40 Kleinbuchstaben-Hexzeichen enthalten.
* Koordinaten, Größen, Budgets, Orientierungen und Fixed-Point-Werte müssen sichere Ganzzahlen sein.
* Maximale Bounded Inputs sind 256 Regeln, 4.096 Kandidaten und 4.096 bestehende Placements.
* Es gibt keine Verwendung von `Math.random`, Uhrzeit, Provider-Reihenfolge oder Client-State.

Ein Kandidat enthält insbesondere:

```ts
type StructurePlacementCandidate = {
  candidateId: string;
  kind: "settlement" | "road" | "ruin" | "dungeon" | "poi";
  tags: string[];
  graphNodeId: string;
  positionMm: { x: number; z: number };
  terrainSlopeBps: number;
  roadReachable: boolean;
  entranceReachable: boolean;
};
```

`graphNodeId`, Terrain-Slope und Reachability sind Eingabe-Evidence der bestehenden Aurion-World-/Terrain-Schichten. Der Placement-Compiler erfindet daraus keine zweite Weltgeometrie.

## 4. Rule-Matcher, Priorität und Replacement

Eine Regel besteht aus einem Matcher, einem Replacement, einer Priorität und Constraints:

```ts
type StructurePlacementRule = {
  id: string;
  matcher: {
    kind: StructurePlacementKind;
    requiredTags?: string[];
    forbiddenTags?: string[];
  };
  replacement: {
    footprintMm: { x: number; z: number };
    portIds: string[];
    orientations: number[];          // diskrete Quarter-Turns
    scaleRangeFixed: { min: number; max: number }; // 1000 = 1.0x
  };
  priority: number;
  constraints: StructurePlacementConstraints;
};
```

Die Normalisierung ist kanonisch:

1. Required-/Forbidden-Tags werden dedupliziert und lexikografisch sortiert.
2. Orientierungen werden auf `0..3` Quarter-Turns normalisiert, dedupliziert und numerisch sortiert.
3. Ports werden dedupliziert und lexikografisch sortiert.
4. Regeln werden nach absteigender Priorität, danach nach `rule.id` sortiert.
5. Pro Kandidat gewinnt genau die erste passende Regel. Es gibt keinen impliziten Fallback auf eine niedrigere Priorität, wenn die gewählte Regel an einer Constraint scheitert.

Damit bleiben Rule- und Candidate-Insertion-Order ohne Einfluss auf die Ausgabe.

## 5. Seeded Placement Stream

Die Variante eines akzeptierten Kandidaten wird aus einem domain-separierten SHA-256-Stream ausgewählt. Der Stream ist gebunden an:

```
sha256-counter-placement-stream.v1
worldSeedHash
worldGenerationRevision
rulesetHash
candidateId
ruleId
```

Der erste Stream-Anteil wählt deterministisch eine Orientierung aus der erlaubten Menge. Der zweite Anteil wählt deterministisch einen Integer im inklusiven Fixed-Point-Scale-Intervall.

Die Skalierung wird ausschließlich ganzzahlig berechnet:

```
scaled = floor(baseMm * scaleFixed / 1000)
```

Für ungerade Quarter-Turns werden X- und Z-Footprint vor der Skalierung vertauscht. Ein `StructurePlacement` enthält anschließend die endgültige Position, den Footprint, die Orientierung, die Fixed-Point-Skalierung, Port-IDs und einen eigenen `placementHash`.

## 6. Constraint- und Topologieprüfung

Die Constraints werden in fester Reihenfolge geprüft und erzeugen bei Verletzung eine explizite Rejection:

| Constraint                              | Rejection-Code                   |
| --------------------------------------- | -------------------------------- |
| Matcher akzeptiert keinen Kandidaten    | `CANDIDATE_RULE_NOT_MATCHED`     |
| Graph-Knoten fehlt                      | `GRAPH_NODE_MISSING`             |
| Placement-Budget erschöpft              | `PLACEMENT_BUDGET_EXCEEDED`      |
| Road-/Travel-Anbindung fehlt            | `ROAD_CONNECTIVITY_REQUIRED`     |
| Dungeon-Eingang nicht erreichbar        | `DUNGEON_ENTRANCE_UNREACHABLE`   |
| Terrain-Slope über Rule-Grenze          | `TERRAIN_SLOPE_EXCEEDED`         |
| Footprint pro Rule zu groß              | `FOOTPRINT_BUDGET_EXCEEDED`      |
| AABB außerhalb der Rule-Bounds          | `PLACEMENT_BOUNDS_EXCEEDED`      |
| Überschneidung mit bestehender Struktur | `PLACEMENT_OVERLAP`              |
| Mindestabstand nicht erfüllt            | `PLACEMENT_SPACING_INSUFFICIENT` |

Road-/Travel-Connectivity verlangt sowohl das Kandidaten-Evidence-Flag `roadReachable` als auch eine `transit`- oder `reachable`-Kante am bestätigten Graph-Knoten. Dungeon-Entrance-Reachability wird fail-closed aus dem Kandidaten-Evidence-Flag gelesen.

Footprints werden als ganzzahlige X/Z-AABBs behandelt. Overlap verwendet strikt überlappende Intervalle; Mindestabstand akzeptiert eine Trennung auf mindestens einer Achse. Dadurch sind Grenzfälle ohne Float-Rundung reproduzierbar.

## 7. Receipt und Graph-Update

Der Compiler mutiert den kanonischen World Graph nicht direkt. Für jede akzeptierte Struktur wird stattdessen ein receipt-gebundenes `supports`-Update erzeugt:

```ts
type StructurePlacementGraphUpdate = {
  updateId: string;
  placementId: string;
  graphNodeId: string;
  kind: "supports";
  updateHash: string;
};
```

Die vollständige `StructurePlacementReceipt` bindet:

* `worldId`, `worldSeedHash` und World-Generation-Revision;
* `rulesetHash` und Source-Revision;
* `inputHash` der kanonisch normalisierten Eingabe;
* `resolutionHash` über Placements, Rejections und Graph-Updates;
* `graphUpdateHash`;
* akzeptierte Placement-IDs und abgelehnte Candidate-IDs;
* den abschließenden `receiptHash`.

Die Funktion `verifyDeterministicStructurePlacement` kompiliert dieselbe Eingabe erneut und akzeptiert nur byte-identische Input-, Resolution- und Receipt-Hashes. Manipulierte Receipts oder veränderte Seeds, Rulesets, Revisionen, Kandidaten oder Graph-Evidence führen zu Replay-Divergenz.

## 8. Wolfram-CAG-Verifier

`server/structurePlacementCagVerifier.ts` erzeugt aus einer bereits kompilierten Resolution einen bounded Wolfram-Language-Probe. CAG erhält nur eine numerische Zusammenfassung:

```
{acceptedPlacementCount, rejectedCandidateCount, graphUpdateCount}
```

Der Probe enthält zusätzlich als Kommentar die Resolution- und Ruleset-Hashes. Der Kommentar ist keine Authority und wird nicht als Ergebnis geparst; er bindet die nachvollziehbare Anfrage an die konkrete Resolution.

Der Verifier liefert:

```ts
type StructurePlacementCagVerification = {
  protocol: "aurion.structure-placement-cag.v1";
  status: "MATCH" | "FALSIFIED" | "NOT_CONFIGURED" | "PROVIDER_FAILED";
  rulesetPromotion: "ELIGIBLE" | "BLOCKED";
  resolutionHash: string;
  rulesetHash: string;
  requestSha256: string;
  responseSha256: string | null;
  expectedExact: string;
  observedExact: string | null;
  cagEvidence: WolframCagEvidence | null;
  mutationAuthority: "none";
};
```

Promotion ist fail-closed:

* `MATCH` macht die Evidence für die Ruleset-Promotion **eligible**.
* `FALSIFIED` blockiert Promotion.
* `NOT_CONFIGURED` blockiert Promotion, wenn kein CAG-Key vorhanden ist.
* `PROVIDER_FAILED` blockiert Promotion bei Provider- oder Parse-Fehlern.

CAG erzeugt, ersetzt, löscht oder mutiert weder Placement-State noch World-Graph-State. Es prüft nur die begrenzte Summary erneut.

## 9. Exakte Wolfram-Nachweise

Für die Terrain-/Placement-Grenze wurde die bestehende integerbasierte Slope-Konvention mit Wolfram überprüft:

```
Ceiling[1800 * 15 * 10000 / 64000] = 4219
4219 <= 4219                             -> True
Ceiling[1801 * 15 * 10000 / 64000] > 4219 -> True
```

Damit wird `4_219 BPS` an der normativen Grenze akzeptiert, während der nächste geprüfte Höhendelta fail-closed über der Grenze liegt.

Für die AABB-Spacingsgrenze wurde ebenfalls exakt geprüft:

```
Max[0, 2000 - 1000] >= 1000 -> True
Max[0, 2000 - 1000] >= 1001 -> False
```

Ein Abstand von exakt `1_000 mm` erfüllt daher die Rule-Grenze; `1_001 mm` ist bei derselben Geometrie nicht fälschlich als erfüllt markiert. Alle Placement-Positionen, Footprints und Abstände bleiben sichere Integer-Millimeter.

## 10. Regressionen und Validierung

Die dedizierten Regressionen decken ab:

1. Replay-identische Placement- und Graph-Update-Hashes;
2. Insertion-Order-Invarianz von Regeln und Kandidaten;
3. feste Prioritäts- und Tie-Break-Regeln;
4. diskrete Orientierung und Fixed-Point-Skalierung;
5. Graph-Knoten- und Road-Connectivity-Fehler;
6. Terrain-Slope-, Bounds-, Footprint-, Overlap- und Spacing-Fehler;
7. Dungeon-Entrance-Reachability;
8. Placement-Budget und unmatched candidates;
9. Tamper-/Replay-Divergenz;
10. bounded CAG-Probe und blockierte Promotion bei fehlender Konfiguration.

Validierung des Draft-PRs:

```
Wolfram exakte Grenzen               bestanden
Fokus Placement/CAG                  7 Tests bestanden
World-Graph/Terrain/Structure/CAG    45 Tests bestanden
Serena-Diagnostik                    bestanden
pnpm check                           bestanden
pnpm build                           bestanden
pnpm test                            1.764 Tests bestanden
```

Die vollständige Suite meldete zusätzlich 51 Testdateien und 192 Tests als übersprungen. Diese Skips sind bestehende MariaDB-/Environment-Gates und keine Placement-Fehler.

## 11. Nachvollziehbarkeit

* [Issue #600](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/600)
* [Draft-PR #665](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/665)
* [Placement-Protokoll](https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/feat/600-structure-placement-grammar/shared/deterministicStructurePlacementProtocol.ts)
* [Placement-Compiler](https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/feat/600-structure-placement-grammar/server/deterministicStructurePlacementCompiler.ts)
* [Wolfram-CAG-Verifier](https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/feat/600-structure-placement-grammar/server/structurePlacementCagVerifier.ts)
* [Placement-Regressionen](https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/feat/600-structure-placement-grammar/server/deterministicStructurePlacementCompiler.test.ts)
* AIM-599 — Deterministische Terrain-Pipeline
* Aurion Single Authority
