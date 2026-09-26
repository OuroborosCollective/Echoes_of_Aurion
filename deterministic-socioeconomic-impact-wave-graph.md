---
description: >-
  Deterministischer sozioökonomischer Impact-Wave-Graph für Echoes of Aurion:
  Decision Binding, bounded Propagation, Wolfram/CAG-Analyse und
  Causal-Tick-Evidence.
---

# Deterministic Socioeconomic Impact-Wave Graph

## Zweck

Der Impact-Wave-Graph erweitert den bestehenden Aurion World/Item Logic Graph um eine gerichtete, gewichtete und vollständig versionierte Repräsentation von Auswirkungen.

```
World facts
  -> NPC/Faction observation
  -> deterministic decision
  -> ActionIntent
  -> Impact Edge
  -> bounded Impact Wave
  -> EffectIntent
  -> Causal Tick
  -> canonical Effect / Receipt
  -> next observable world state
```

{% hint style="warning" %}
Aurion bleibt die einzige Runtime-Truth-Authority. Wolfram/CAG erhält ausschließlich bounded opaque projections und liefert Analyse-/Falsifikations-Evidence. CAG darf keine World-, NPC-, Economy-, Item- oder Receipt-Mutation auslösen.
{% endhint %}

## Architektur

```
#512 Structure Grammar
       |
#514 Observation / Materialization
       |
       +--> #484 World Pressure
       +--> #485 NPC Timescales
       +--> #486 Utility Planner
       +--> #487 Information Ecology
       +--> #488 Economy / Logistics
       |
       v
#591 Game-Theory / Decision Compiler
       |
       v
Deterministic Impact Edge Graph
       |
       v
Bounded Impact-Wave Compiler
       +--> #513 Wolfram/CAG analysis
       |
       v
Aurion Causal Tick
       |
       v
Effect / Receipt
```

Die bestehende CAG-Lane aus #513 wird wiederverwendet. Es gibt keinen zweiten Wolfram-Client, keinen parallelen Economy-Graphen und keinen alternativen Causal-Truth-Pfad.

## Kanonisches Datenmodell

```ts
export type ImpactEdgeKind =
  | "ECONOMIC" | "RESOURCE" | "SOCIAL" | "FACTION"
  | "POLITICAL" | "MILITARY" | "ECOLOGICAL" | "LOGISTIC"
  | "INFORMATION" | "COMBAT" | "QUEST" | "TEMPORAL";

export interface DeterministicImpactEdge {
  edgeId: string;
  from: string;
  to: string;
  kind: ImpactEdgeKind;
  weightQ16: number;
  sign: -1 | 1;
  delayTicks: number;
  decayQ16: number;
  thresholdQ16: number;
  capacityQ16: number;
  conditionCode: string;
  effectCode: string;
  graphVersion: string;
  rulesetVersion: string;
}

export interface ImpactWave {
  rootEventId: string;
  sourceNodeId: string;
  originTick: number;
  depth: number;
  magnitudeQ16: number;
  sign: -1 | 1;
  inputHash: string;
}

export interface ImpactPropagationReceipt {
  graphVersion: string;
  rulesetVersion: string;
  inputHash: string;
  waveHash: string;
  visitedNodeHash: string;
  candidateEffectHash: string;
  causalTick: number;
  mutationAuthority: "aurion";
}
```

Identitätsrelevante Berechnungen benutzen Integer-/Fixed-Point-Werte. Nodes/Edges werden vor Hashing kanonisch sortiert.

## Propagation

```
transferQ16 = floorQ16(magnitudeQ16 * weightQ16 / 65536)
decayedQ16 = floorQ16(transferQ16 * decayQ16 / 65536)
if Abs(decayedQ16) < thresholdQ16: stop this edge
next = clamp(current + sign * decayedQ16, -capacityQ16, +capacityQ16)
```

Deterministische Kandidatenreihenfolge:

```
delayTicks
-> -Abs(magnitudeQ16)
-> edgeId
```

Limits:

```
maxDepth
maxVisitedEdges
maxTotalMagnitude
cycleKey = hash(nodeId + rulesetVersion + arrivalTick)
```

Damit können positive und negative Feedback-Loops untersucht werden, ohne unbounded Runtime-Rekursion.

## Beispiel einer sozioökonomischen Welle

```
NPC_17: HOARD_COPPER
        |
        v
Copper supply pressure
        |
        +--> Copper price
                |
                +--> Blacksmith cost
                |       |
                |       +--> Weapon price
                |
                +--> Merchant margin
                        |
                        +--> Route choice
                                |
                                +--> Caravan flow
                                        |
                                        +--> Bandit opportunity
```

Jeder Schritt bleibt ein typed candidate effect. Nur Aurions bestehender Causal-Tick-/Effect-Pfad kann daraus kanonische Mutationen machen.

## Wolfram-Language-Analyse

Wolfram wird nur mit dem gebundenen Analyse-Snapshot versorgt.

### Graph

```wl
edges = {
  DirectedEdge["mine", "copper"],
  DirectedEdge["copper", "price"],
  DirectedEdge["price", "smith"],
  DirectedEdge["smith", "weaponDemand"]
};

g = Graph[edges, VertexLabels -> "Name"];
```

### Deterministische Projektionsordnung

```wl
nodes = Sort @ VertexList[g];
adj = AdjacencyMatrix[g];
```

### Bounded Referenzmodell

```wl
propagate[initial_, matrix_, steps_Integer?NonNegative] :=
  Nest[Clip[# . matrix, {-65536, 65536}] &, initial, steps];
```

Dieses Modell ist eine mathematische Referenz für CAG/Review, nicht die Aurion Runtime.

### Erreichbarkeit und Zyklen

```wl
reachable = VertexOutComponent[g, "NPC_17"];
cycles = FindCycle[g, All];
```

Geeignete Wolfram-Graphfunktionen dürfen Konnektivität, Komponenten, Pfade, Zentralität, Flaschenhälse, Zyklen, Erreichbarkeit, Sensitivität und Schwellen analysieren. Die tatsächlich eingesetzte Wolfram-Language-Syntax muss über den realen Evaluator verifiziert werden, bevor sie als Integrationsvertrag gilt.

## CAG-Evidence

Jede Analyse bindet:

```
graphHash
inputHash
graphVersion
rulesetVersion
sourceRevision
analysisVersion
requestSha256
responseSha256
analysisFingerprint
mutationAuthority = none
sourceBoundary
```

Gültige Analysezustände:

```
SUCCESS
FALSIFIED
INCONCLUSIVE
UNAVAILABLE
```

UNAVAILABLE oder INCONCLUSIVE wird niemals als MATCH oder Produktionsfreigabe behandelt.

## Guided Integration

{% stepper %}
{% step %}
### 1. Contract Audit
{% endstep %}

{% step %}
Aktuellen main-Stand und Memory.md prüfen. Bestehende Causal-Tick-, NPC-, Economy-, Graph- und Wolfram-CAG-Verträge identifizieren.
{% endstep %}

{% step %}
### 2. Impact Graph IR
{% endstep %}

{% step %}
DeterministicImpactGraph-IR kanonisch implementieren oder vorhandene Verträge erweitern.
{% endstep %}

{% step %}
### 3. Deterministic Propagator
{% endstep %}

{% step %}
Kanonische Sortierung, Q16-Arithmetik, Thresholds, Capacity, Delays und Cycle-Bounds implementieren.
{% endstep %}

{% step %}
### 4. Decision Binding
{% endstep %}

{% step %}
NpcDecision -> ActionIntent -> ImpactSeed -> ImpactWave anbinden.
{% endstep %}

{% step %}
### 5. Causal Binding
{% endstep %}

{% step %}
ImpactWave -> EffectIntent\[] -> existing Causal Tick -> real Receipt. Kein direkter SQL-Write.
{% endstep %}

{% step %}
### 6. Wolfram Bridge
{% endstep %}

{% step %}
Den bestehenden #513-CAG-Adapter erweitern. Nur bounded opaque graph projections senden.
{% endstep %}

{% step %}
### 7. Economy Slice
{% endstep %}

{% step %}
Resource shortage -> NPC decision -> price pressure -> merchant reaction -> route effect -> Causal Tick -> receipt nachweisen.
{% endstep %}

{% step %}
### 8. Feedback Slice
{% endstep %}

{% step %}
Mindestens einen kontrollierten Cycle mit maxDepth und cycleKey real ausführen und dessen Begrenzung nachweisen.
{% endstep %}

{% step %}
### 9. Read-only Presentation
{% endstep %}

{% step %}
Impact-Wellen darstellen, ohne Simulation oder World-Truth zu verändern.
{% endstep %}

{% step %}
### 10. Evidence Gate
{% endstep %}

{% step %}
Exact Git SHA, Build, Tests, Runtime Revision, relevante Container-Digest-/Health-Evidence, graphHash, waveHash, Causal Tick, Receipt Readback, CAG request/response evidence und Replay-Gleichheit sammeln.
{% endstep %}
{% endstepper %}

## Code-Flächen

Zuerst bestehende Flächen erweitern:

```
server/wolframCag.ts
server/wolframCagRuntimeReadback.ts
server/aurionCagDesignOracle.ts
server/worldContext/internalGraphAnalysis.ts
server/worldContext/internalGraphWolfram.ts
server/causality/*
```

Nur falls erforderlich:

```
shared/deterministicImpactGraph.ts
server/impactWaveCompiler.ts
server/impactWaveCagAnalysis.ts
Tests für deterministische Hashes, Bounds, Cycles und Replay
```

## Testmatrix

| Bereich           | Nachweis                                                   |
| ----------------- | ---------------------------------------------------------- |
| Graph determinism | gleiche kanonische Inputs -> gleicher graphHash            |
| Order invariance  | unterschiedliche Input-/DB-Reihenfolge -> gleicher Output  |
| Wave determinism  | gleicher Root + Graph + Tick -> gleicher waveHash          |
| Bounds            | depth/edge/magnitude/overflow Grenzen werden eingehalten   |
| Cycles            | Self-loop, 2-cycle, lange und konvergierende Zyklen        |
| Causal binding    | ActionIntent -> ImpactWave -> EffectIntent -> Receipt      |
| CAG isolation     | CAG-Ausfall blockiert nicht die Runtime und mutiert nichts |
| Replay            | identische Inputs -> identische Output- und Receipt-Kette  |

## Expected End State

```
Seed + WorldRevision + Ruleset
          |
          v
Canonical World Graph
          |
          +--> Decision Compiler
          +--> Economy / Resource Facts
          |
          v
Decision-triggered Impact Edges
          |
          v
Bounded Socioeconomic Impact Waves
          |
          v
Typed Effect Intents
          |
          v
Aurion Causal Tick
          |
          v
Canonical Effects / Receipts
          |
          v
Observable next-world state
```

Das Ergebnis ist eine rechenbare sozioökonomische Wirkungsschicht, die mit NPC-Spieltheorie, World Graph, Economy, Information Ecology, Faction Logic und Causal Receipts verbunden werden kann, ohne eine zweite Wahrheit einzuführen.

## Zugehörige Issues

* GitHub #591 — Decision/Game-Theory + CAG World/Item Logic Graph
* GitHub #513 — CAG/Wolfram Structure-Grammar Falsification
* GitHub #490 — Deterministic Living World Research Wave
* GitHub #527 — Visual CAG/Wolfram Intelligence Boundary
* Consumer-Lanes: #484, #485, #486, #487, #488, #489
