---
description: >-
  Deterministische Visual Morphology Grammar für GLB-freie, textureless und
  variantenreiche Aurion-Präsentation.
---

# Deterministic Visual Morphology Grammar

## Zweck

Aurion soll für bestätigte Items und ausgewählte World-Props nicht für jede Ausprägung ein eigenes GLB speichern müssen. Stattdessen wird die Präsentation aus einer versionierten, deterministischen Visual Grammar rekonstruiert.

Die externe Referenz ist der dokumentierte RevenBlade-Ansatz mit prozeduraler Geometrie/Geometry Nodes. Das Prinzip wird für Aurion nicht als Runtime-Abhängigkeit übernommen, sondern als Designreferenz für regelbasierte Asset-Erzeugung.

> Nicht für jedes Objekt ein Modell speichern — sondern eine kanonische Grammatik besitzen, aus der das Modell deterministisch rekonstruiert werden kann.

## Ownership

Aurion bleibt die einzige Gameplay-, Item-, Loot-, World- und Causal-Truth-Authority.

```
confirmed gameplay / loot receipt
        |
        v
VisualItemDescriptor
        |
        v
visualSeed + grammarVersion
        |
        v
Visual Morphology Recipe
        |
        +--> Geometry Compiler
        +--> Material Compiler
        +--> Equipment Fit
        +--> LOD
        |
        v
AX1 / Three.js presentation
```

CAG/Wolfram dürfen analysieren, falsifizieren und Authoring unterstützen, aber keinen Runtime-World-/Item-State mutieren.

## Bestehende Aurion-Verträge

Diese Doku ist die Integrationsklammer für:

* \#519 — Equipment Fit Compiler
* \#523 — Visual Material Grammar & Textureless Appearance
* \#524 — Visual LOD Compiler & Geometry Budget
* \#528 — End-to-End Infinite-Variant Equipment Proof
* \#591 — Deterministic NPC Game-Theory Compiler + CAG World/Item Logic Graph
* \#603 — Deterministic Visual Morphology Grammar
* bestehende Visual-Item-Contracts AIM-280–286 / #527
* World Grammar/Observation/Projection #512–#515

Kein Parallel-Renderer und keine zweite Item-/Loot-Authority.

## Kanonische Inputs

Nur bestätigte Fakten dürfen in die Grammar:

```
confirmedItemId
deterministic loot hash / receipt identity
canonicalCategory
rarity
material tags
affix tags
sourceRevision
styleGrammarVersion
visualSeed
```

Nicht zulässig:

* `Math.random()`
* Wall Clock / `Date.now()`
* Host-/Process-IDs
* GPU-Zufall
* client-authored item identity
* Runtime-LLM als Rendering-Abhängigkeit
* Rückschluss von Visuals auf Gameplaywerte

## Morphology statt statischem Recipe

Der prozedurale Fallback soll nicht nur Materialfarbe oder kosmetische Parameter verändern, sondern die Formausprägung deterministisch aus dem Seed ableiten.

Beispiel:

```
family = blade

silhouetteVariant = 11
bladeLength_q = 117
bladeWidth_q = 82
taper_q = 64
fullerVariant = 1
tipVariant = 3
guardVariant = 6
guardWidth_q = 71
gripVariant = 4
gripLength_q = 92
pommelVariant = 7
pommelScale_q = 66
ornamentVariant = 5
ornamentCount = 3
```

Die Recipe-Ebene verwendet eine stabile serialisierbare Darstellung. Fixed-point/integer oder eine äquivalente kanonische Ganzzahlrepräsentation ist für Identitätsparameter zu bevorzugen; Float-Werte bleiben Renderergebnisse.

## Variant Space

Das Ziel ist kein literal mathematisches "unendlich", sondern ein sehr großer deterministischer Ausprägungsraum.

Beispiel:

```
16 silhouettes
x 16 proportions
x 16 tapers
x 16 guards
x 16 grips
x 16 pommels
x 16 ornament patterns
= 4,294,967,296
```

Diese Zahl ist nur eine Größenordnung. Die Produktionsimplementierung muss Freiheitsgrade explizit begrenzen.

Seed-Kollisionen im begrenzten Parameterraum sind zulässig, sofern die resultierende Recipe identisch ist.

## Primitive Construction Graph

Bestehende Primitive werden wiederverwendet:

* Box
* Cylinder
* Cone
* Sphere
* Octahedron
* Torus
* bestehende Three.js-Geometrie- und Instancing-Helfer

Neue Primitive nur dann, wenn sie einen realen zusätzlichen Formenraum benötigen und durch Tests/Fingerprints beherrscht werden.

Die Grammar beschreibt Formbeziehungen, nicht Rendererimplementation:

```
Morphology Recipe
 -> part graph
 -> transforms
 -> bounded deformation
 -> attachment frames
 -> region IDs
```

## Item Coverage

Zuerst die vorhandenen Familien:

```
blade
axe
mace
spear
dagger
bow
staff
wand
hammer
scythe
shield
focus
```

Armor:

```
head
chest
hands
legs
feet
```

Später können auf Basis des echten canonical item contract weitere Klassen folgen:

```
belt
ring
amulet
relic
component
```

Keine neue Gameplay-Kategorie nur für den Renderer erfinden.

## GLB / Procedural Policy

```
valid confirmed GLB
    -> confirmed GLB presentation

kein gültiges GLB
    -> deterministic procedural presentation

inkompatibler / ungültiger GLB
    -> evidence-bound reason
    -> deterministic procedural fallback
```

GLB bleibt sinnvoll für Hero Assets, Unique Assets, komplexe rigged Characters und ausdrücklich katalogisierte Spezialobjekte.

Der Fallback darf keinen fehlerhaften Asset-Contract stillschweigend verdecken.

## Textureless Presentation

Zusammen mit #523 kann die Grammar eine vollständig texturfreie Materialprojektion liefern:

```
morphology region
 -> material family
 -> baseColor
 -> roughness
 -> metalness
 -> emissive
 -> supported clearcoat / IOR
```

Image-Texturen bleiben optional. Wenn sie verwendet werden, kommen sie ausschließlich aus bestehenden Asset-/Manifest-Verträgen.

## Equipment Fit

Mit #519:

```
Visual Morphology Recipe
+
Canonical Avatar Surface Profile
+
EquipmentFitContract
=
surface-aware fitted construction
```

Die Morphology-Schicht besitzt keine eigene Avatar-Authority.

## LOD

Mit #524:

```
same descriptor
+ same visualSeed
+ same grammarVersion
        |
        v
canonical morphology recipe
        |
        +--> LOD0
        +--> LOD1
        +--> LOD2
        +--> fallback
```

LOD darf keine semantische Item-Identity verändern.

## Cache und Rebuild

Mindestens:

```
sourceRevision
grammarVersion
visualSeed
descriptorHash
avatarProfileHash   (bei Equipment)
lodClass
```

Cache eviction und erneuter Compile müssen denselben Recipe-/Geometry-Fingerprint erzeugen.

## Evidence Contract

Getrennte Ebenen:

```
descriptorHash
visualSeed
grammarVersion
recipeHash
geometryFingerprint
materialFingerprint
fitFingerprint
lodFingerprint
sourceRevision
```

Ein Geometry-Fingerprint beweist Geometriestruktur, nicht Gameplay-Identity.

Ein Unit-Test beweist nicht, dass ein Browser die Geometrie tatsächlich verwendet.

Ein statischer Descriptor beweist nicht die Runtime-Verwendung.

## World-Generalization

Das Muster soll später für ausgewählte World-Visuals wiederverwendbar sein:

```
LogicalObject
 -> canonical descriptor
 -> visual grammar
 -> construction recipe
 -> geometry/material projection
```

Mögliche Klassen:

```
tree
rock
cliff
ruin
plant
crystal
furniture
debris
architecture
prop
```

Die aktive World-Truth bleibt jedoch vollständig im bestehenden Aurion-World-/Chunk-System.

## CAG Boundary

```
canonical Aurion data
 -> bounded projection
 -> CAG/Wolfram analysis / falsification
 -> evidence
```

Aurion Runtime:

```
canonical state
 -> visual descriptor
 -> deterministic grammar
 -> presentation
```

CAG oder Wolfram dürfen kein alternatives Runtime-Recipe als zweite Truth-Quelle etablieren.

## Tests

### Determinismus

* gleiche Inputs -> gleiche Recipe
* andere Input-Reihenfolge -> gleiche Recipe
* Seed geändert -> deterministisch abgeleitete Recipe
* Grammar-Version geändert -> neue Recipe
* keine Clock-/Host-/Random-Abhängigkeit

### Bounds

* keine NaN / Infinity
* part count begrenzt
* graph depth begrenzt
* dimensions bounded
* keine unendliche Rekursion
* degenerate geometry rejected

### Differential

```
seed A != seed B
```

darf zu unterschiedlichen Recipes führen, muss aber nicht zwingend zu einem unterschiedlichen Mesh führen, wenn der begrenzte Parameterraum kollidiert.

### Geometry / Material / Fit

* same recipe -> same structural fingerprint
* textureless material render
* same avatar + item + seed -> same fit fingerprint
* unsupported profile -> fail closed
* LODs aus derselben Recipe
* bestehende GLB-Projektion bleibt funktional

## End-to-End Proof

\#528 liefert den vertikalen Beweis:

```
Loot Receipt
 -> Item Identity
 -> Visual Descriptor
 -> VisualSeed
 -> Morphology Recipe
 -> Geometry
 -> Material
 -> Fit
 -> LOD
 -> Three.js runtime
 -> evidence readback
```

Mindestens ein realer Test muss zeigen:

* denselben Drop zweimal
* mehrere Seeds derselben Item-Familie
* mindestens zwei Weapon-/Armor-Slots
* einen gültigen GLB-Override
* einen procedural Fallback
* Cache eviction + Rebuild
* LOD transition
* Browser reload

## Runtime Evidence

Pflicht:

```
exact Git revision
exact descriptor inputs
exact visualSeed
exact grammarVersion
recipeHash
geometryFingerprint
materialFingerprint
fitFingerprint
lodFingerprint
browser/runtime readback
```

Zusätzlich bei betroffener Runtime:

* Container-Health
* PatchMon Health-Lane
* exakter Runtime-/Image-Revision
* tatsächliches Asset-/Projection-Readback

## Performance

Auf identischer Fixture messen:

* compile time
* geometry allocations
* triangle count
* active objects
* material count
* draw calls
* memory
* frame p50/p95/p99

Keine erfundenen Schwellenwerte. Baselines stammen aus echter Aurion-Runtime-Evidence.

## Non-Goals

* kein Ersatz für Gameplay-Truth
* keine Änderung von Loot-Chancen
* keine Änderung von ItemPower/Stats
* keine Runtime-LLM-Abhängigkeit
* kein CAG Runtime-State-Mutator
* keine Pflicht, alle Hero Assets prozedural zu ersetzen
* keine Behauptung mathematisch unendlicher Mesh-Anzahlen

## Integrationsreihenfolge

{% stepper %}
{% step %}
### 1. Main gegen bestehende Contracts prüfen

\#519, #523, #524, #528, #591 und die AIM-280–286/#527-Flächen auf aktuellen Main-Stand auflösen.
{% endstep %}

{% step %}
### 2. Morphology Recipe ergänzen

Bestehende VisualItem-Descriptor-/Geometry-Verträge erweitern. Neue Datei nur, wenn eine reine Recipe-Schicht den bestehenden Compiler sauber entlastet.
{% endstep %}

{% step %}
### 3. Deterministische Tests

Seed-Vektoren, Property Tests, Bounds, negative Tests und Structural-Fingerprint Regression ergänzen.
{% endstep %}

{% step %}
### 4. E2E Runtime

GLB- und procedural Pfad, mehrere Varianten, LOD/Fit und Browser-Readback mit exakter Revision nachweisen.
{% endstep %}

{% step %}
### 5. Regression / Evidence / Memory

Bestehende Gameplay-/World-/Inventory-/Combat-/Quest-Regressionen ausführen, Runtime-/PatchMon-Readback prüfen und exakt einen Memory.md-Eintrag mit Änderung + Erkenntnis + Evidence erzeugen.
{% endstep %}
{% endstepper %}

## GitHub

Primärer Integrationsanker: #603 — Deterministic Visual Morphology Grammar — GLB-freier Infinite-Variant Presentation Compiler

Verwandte Issues:

[#519](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/519), [#523](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/523), [#524](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/524), [#528](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/528), [#591](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/591), [#603](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/603).

Externe Designreferenz: https://www.revenblade.com/devlog

## Dauerregel

```
Memory.md lesen
 -> Integration
 -> Runtime / Regression / Evidence
 -> genau ein Memory.md-Eintrag
 -> Merge
 -> Post-Merge Readback
```

Ein grüner Test ohne Kausal-/Runtime-Readback gilt nicht als Produktionsbeweis.
