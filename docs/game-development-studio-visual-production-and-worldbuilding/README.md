---
description: >-
  Kanonischer Aurion-Workflow für Game Development Studio, Worldbuilding,
  Asset-Produktion und visuelle Evidence.
---

# Game Development Studio — Visual Production & Worldbuilding

## Zweck

`game-dev` ist die feste Visual-Production- und Evidence-Lane für **Echoes of Aurion**. Es ersetzt weder Gameplay-Authority noch die Engine.

* **Aurion** besitzt Gameplay-/Simulationsregeln, Questwirkungen, Progression, Collision, World-Truth, Host, Auth, Asset-Katalog, MariaDB, Persistenz, Receipts, Readbacks und Ops/Evidence.
* **AX1** besitzt sichtbare Welt, Renderer, UI, Kamera, Animation, VFX, LOD/HLOD und Presentation Content. AX1 projiziert Aurion-Wahrheit, erzeugt aber keine eigene Gameplay-Authority.
* **WASD** ist ausschließlich historische Migrations-/Provenienzquelle. Bestehende revisionsgebundene WASD-Receipts dürfen Migrationen belegen, aber keine neue Aurion-Runtime-Wahrheit autorisieren.
* **Game Development Studio** besitzt die lokale Werkzeugkette für Asset-Produktion, GLB/PBR/Blender-Prüfung, Packaging/Vendoring, reproduzierbare Captures, Visual-Diffs und begrenzte Performance-Evidence.

{% hint style="warning" %}
Ein Asset, Screenshot oder Capture darf niemals Gameplay-Wahrheit erzeugen. Provider-Job, Download, GLB-Prüfung, Blender-Normalisierung, Package-Verifikation, Project Admission, Render-Capture, Performance und menschliche Sichtprüfung bleiben getrennte Beweise.
{% endhint %}

## Gemeinsamer Arbeitsablauf

{% stepper %}
{% step %}
### Idee und Zielbild

Der Owner beschreibt Stimmung, Ort, Silhouette, Funktion und gewünschte Spielerwirkung. Beispiele: breites Tal mit Fluss, alpine Ruine, dichter Wald, Marktplatz, Quest-Mühle, Ranger-Ausrüstung.
{% endstep %}

{% step %}
### Makro-Geometrie und Spielraum

Aurion definiert die revisionsgebundene autoritative Weltprojektion: Höhenprofil, Fluss-/Straßen-Splines, Landmarken, Chunk-/LOD-Grenzen und gameplayrelevante Collision-/Traversal-Verträge. AX1 konsumiert diese Verträge für die sichtbare Projektion. Game Development Studio darf diese Grenze visualisieren und prüfen, aber nicht autorisieren.
{% endstep %}

{% step %}
### Modulare Asset-Produktion

`game-dev` produziert oder prüft kleine wiederverwendbare Bausteine: Felsen, Klippen, Brücken, Ruinen, Häuser, Vegetation, Props, Waffen, Rüstung, Sounds und PBR-Materialien. Vorhandene Bytes werden zuerst inspiziert. Blender-Normalisierung erfolgt nur bei belegtem Reparatur-/Exportbedarf und nie in-place.
{% endstep %}

{% step %}
### Canonical Package

Wiederverwendbare Assets werden als verifizierte Packages mit Hash, Provenance, Lizenz, Validation und optionaler Preview gebaut. Lose Provider-Downloads werden nicht direkt ins Spiel kopiert.
{% endstep %}

{% step %}
### Dry-run-first Admission

`vendor admit` wird zunächst gegen das exakte Projekt und Ziel geplant. Erst die bestätigte Admission schreibt ins Projekt. Das Admission-Receipt beweist Byte-/Package-Integrität, nicht Ingame-Rendering.
{% endstep %}

{% step %}
### Reproduzierbare Capture-Szenarien

Ein projekt-eigener `.game-dev/adapter.json` definiert kleine, stabile Szenarien mit festem Build, Szene, Kamera, Seed/Tick, Auflösung und Ausgabe. Baseline und Candidate müssen dieselben Kontrollen benutzen.
{% endstep %}

{% step %}
### Vergleich und Iteration

Color plus vorhandene Depth/Normal/Object-ID/Material-ID/Motion/Overdraw-Anhänge werden zusammen mit Telemetry und Metriken verglichen. Das lokalisiert technische Änderungen; die künstlerische Abnahme bleibt menschlich.
{% endstep %}
{% endstepper %}

## Weltgestaltung

### Berge und Täler

Makroformen werden deterministisch/prozedural in der Weltprojektion erzeugt. `game-dev` liefert modulare Klippen, Felsgruppen, Schnee-/Fels-/Grasmaterialien, Landmarken und Capture-Evidence. Große monolithische Welt-GLBs sind keine Gameplay-Truth.

### Flüsse und Wasser

Der Flussverlauf gehört in eine deterministische Spline-/Hydrologie-Projektion. Visuelle Bausteine sind Uferfelsen, Wasserfallsegmente, Treibholz, Pflanzen, Brücken, Schaum-/Wasser-Materialien und Ruinen. Die visuelle Lane verändert keine World-State-Regel.

### Städte und Dörfer

Städte werden aus modularen Kits aufgebaut: Häuser, Schmiede, Taverne, Brunnen, Marktstände, Tore, Mauern, Türme, Laternen und Props. Wiederverwendung + Instancing + LOD/HLOD sind bevorzugt gegenüber einem einzigen riesigen Stadtmodell.

## Charaktere, Waffen und Rüstung

`Design → Inspect → Triangle/Material/Rig/Anchor-Budgets → Blender-Normalisierung bei Bedarf → Validate → Package → Admission → Ingame-Capture → Tablet/Desktop-Vergleich`

Die sichtbare Qualität zählt; Triangle-Budgets sind Grenzwerte, keine Zielwerte. Attachment-Origins und Rig-/Socket-Namen werden als eigene Integrationsverträge geprüft.

## Quests

Questlogik und Belohnungen bleiben Aurion-owned. Game Development Studio inszeniert die Quest:

* Ort und Landmarke,
* Props und Questgegenstände,
* NPC-/Gegneroptik,
* Licht, Wetter und Sound,
* visuelle Spuren und Umgebungsgeschichte,
* reproduzierbare Capture-Szenarien für die Abnahme.

Damit wird aus `Text + Marker + Reward` ein räumlich inszenierter Quest-Ort, ohne die Authority-Grenze zu verwischen.

## Forschung und Mathematik

Wolfram/Research dürfen Formeln und Candidate-Geometrie für Höhenfelder, Flussnetze, Sampling, Abstände, Dichte, LOD-Budgets und Vergleichsmetriken liefern. Die Ergebnisse werden erst durch revisionsgebundene Aurion-Authority- und AX1-Presentation-Verträge produktiv. Historische WASD-Belege bleiben dabei ausschließlich Provenienz.

## Installationsvertrag

Aktueller unterstützter Stand: **Game Development Studio v1.0.2**, gepinnt auf Upstream-Revision `96a0b4f34b979279ab983e9547af43133e85f310`.

Der historische MCP-Server aus v0.4.0 ist retired. Aktueller Vertrag: **`game-dev` CLI + Skills + JSON/JSONL**.

Aurion PR #318 führt einen providerfreien Smoke aus: Source-Build, CLI-Installation, `game-dev --version`, `capabilities` und `doctor`.

## Dauerregel

Bei zukünftigen Welt-/Asset-/Visual-Aufträgen gilt:

`Idee → Authority-Grenze → Asset-/World-Spezifikation → game-dev Inspect/Produce → Validate → Package → Admission → deterministic Capture → Visual/Metric Diff → menschliche Abnahme → Runtime/Regression/Evidence`

Diese Lane ergänzt die allgemeine Integrationsregel:

`Memory.md lesen → Integration → Runtime/Regression/Evidence → genau ein kurzer Memory.md-Eintrag → erst dann Merge`.
