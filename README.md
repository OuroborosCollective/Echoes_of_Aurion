---
description: Produktzentrale, Architektur und Betrieb für Echoes of Aurion.
---

# Aarelogic · Echoes of Aurion

## Echoes of Aurion

**Die Aarelogic-Plattform für ein persistentes 3D-MMORPG.**

Website, Spielruntime und Gameplay folgen klaren Verantwortungsgrenzen. So bleiben Produkt, Betrieb und Spielregeln nachvollziehbar.

<table data-view="cards"><thead><tr><th>Bereich</th><th data-card-target data-type="content-ref">Ziel</th></tr></thead><tbody><tr><td><strong>Technische Dokumentation</strong><br>Architektur, Verträge und aktuelle Integrationsarbeit.</td><td><a href="docs/">docs</a></td></tr><tr><td><strong>Betrieb</strong><br>Deployments, Infrastruktur und mobile Builds.</td><td><a href="CONTAINER_RUNTIME_DEPLOYMENT.md">CONTAINER_RUNTIME_DEPLOYMENT.md</a></td></tr><tr><td><strong>Patchnotes</strong><br>Nachvollziehbare Änderungen aus gemergten Pull Requests.</td><td><a href="patchnotes/">patchnotes</a></td></tr><tr><td><strong>Präsentation</strong><br>Audio, Companion Memory und Side-Channels.</td><td><a href="AURION_AUDIO_SYSTEM.md">AURION_AUDIO_SYSTEM.md</a></td></tr></tbody></table>

### Plattform

{% columns %}
{% column %}
#### Aurion

Website, Account, Community und bestätigte Persistenz.
{% endcolumn %}

{% column %}
#### AX1

`/play`, Renderer, Eingaben und visuelle Spieloberfläche.
{% endcolumn %}
{% endcolumns %}

#### WASD

Gameplay, Simulation, Balancing und bestätigte Ergebnisse.

<a href="ARCHITECTURE_OWNERSHIP.md" class="button primary" data-icon="arrow-right">Architektur ansehen</a>

***

### Technische Referenz

Seit dem Architektur-Cutover vom 6. September 2026 sind Website, Spielruntime und Gameplayregeln strikt getrennt.

{% hint style="info" %}
Die verbindliche Zuständigkeitsmatrix steht in [Architektur-Ownership: Aurion · AX1 · WASD](ARCHITECTURE_OWNERSHIP.md). Bei Widerspruch mit älteren Dokumenten gilt diese Matrix.
{% endhint %}

#### Architektur in einem Satz

**Aurion hostet Website, Auth, Community und Persistenz; AX1 betreibt `/play`, Renderer und Spieloberfläche; WASD besitzt sämtliche Gameplay- und Simulationsregeln.**

| System     | Verantwortung                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aurion** | Landing Page, Account/Auth, Community, Forum, Community-Events, Asset-/Ops-Verwaltung, MariaDB, Receipts, read-only Readmodels                      |
| **AX1**    | `/play`, 3D-Runtime, Kamera, HUD, Eingaben, Animationen, visuelle/contentbezogene Projektion                                                        |
| **WASD**   | Bewegung, Combat, Quests, Progression, Mastery, Loot, Crafting, Economy, Gruppen/Dungeons, NPC/Mobs, Welt/Chunks, Housing, Guild/Kingdom, Balancing |

Aurion ist **keine** zweite Gameplay-Engine. Ein Datenbank-Write speichert nur ein bereits bestätigtes Ergebnis; er definiert die zugrunde liegende Spielregel nicht.

#### Website

Die Aurion-Website trägt:

* Registrierung, Login, Session und Accountverwaltung;
* Community und Forum;
* Community-Events;
* Asset-/GLB-Governance und Operations;
* read-only Charakterdaten wie Level, Skill-/Masterystände, Gildenzugehörigkeit, Inventar, Ausrüstung, Achievements bei vorhandener bestätigter Projektion und Companion-Trainingsmetadaten.

Die Website darf diese Gameplaydaten **nicht verändern**. Es gibt dort keine Quest-, Combat-, Loot-, Crafting-, Progressions-, Equipment-, Economy-, Dungeon-, Housing- oder Guild-/Kingdom-Gameplay-Authority.

#### Spiel

`/play` gehört AX1. AX1 nimmt Eingaben an und rendert bestätigte Zustände. Lokale Animation, Prediction oder UI-Zustand ist niemals alleinige Gameplay-Evidence.

Gameplayänderungen folgen der Kette:

```
AX1 intent
→ WASD deterministic rule / logical tick
→ confirmed result + receipt
→ Aurion persistence/transport
→ AX1 read-only projection
```

Wo ein WASD-Vertrag noch nicht vollständig migriert ist, gilt fail-closed: keine Aurion-Ersatzregel.

#### Persistenz

MariaDB hält Account-/Communitydaten sowie bestätigte Gameplay-Evidence und Readmodels. Kritische Gameplay-Outcomes müssen ihre Herkunft über WASD-Receipt, Source-/Ruleset-Version oder eine gleichwertige revisionsgebundene Provenienz belegen.

Persistenz ist nicht Gameplay-Ownership.

#### Assets

Aurion verwaltet Upload, Quarantäne, Review, SHA-256/Bytes, Sichtbarkeit und visuelle Asset-Zuweisungen. AX1 rendert freigegebene Assets. WASD bestimmt Stats, Collision-, Spawn-, Item-, Mob- und sonstige Gameplaysemantik.

Ein GLB kann deshalb niemals durch seine Metadaten Schaden, HP, Drops oder Regeln festlegen.

#### Companion Learning

Companion-Lernvorgänge dürfen im Spiel über AX1 aufgezeichnet und als Evidence gespeichert werden. Die Aurion-Accountseite darf Trainings-/Sample-/Receipt-Metadaten anzeigen, aber keinen Companion steuern und kein Gameplay aus Trainingsdaten erzeugen.

#### Determinismus und Balancing

WASD ist die normative Regelquelle. Reproduzierbare Simulation, Tick-/Sequence-Semantik, RNG, Progressionskurven und Gameplay-Balancing werden dort versioniert.

Wolfram/CAG kann Formeln analysieren und falsifizieren. Es ist ein Analysewerkzeug, keine Runtime-Authority.

#### Evidence

Eine grüne Ebene beweist nur sich selbst:

* Website-Health beweist den Aurion-Host;
* DB-Readback beweist Persistenz;
* AX1-Animation beweist Präsentation;
* WASD-Receipt/Reducer beweist Gameplayregel/-zustand;
* Browser-E2E beweist die sichtbare Zusammenschaltung, wenn alle Quellen revisionsgleich gebunden sind.

Dateiexistenz, PR-Status, Linear-Status oder ein gesunder Container allein sind kein vollständiger Produktionsnachweis.

#### Aktuelle Arbeitsregeln

* Keine Fake-/Mock-Wahrheit in Production-Pfaden.
* Keine Aurion-Gameplay-Abkürzungen über Website, Admin, MCP oder SQL.
* Alte Arena-/Encounter-/Aurion-Quest-/Aurion-Progressionspfade gelten als Legacy-Migrationsschuld.
* Nach jeder Integration: relevante Regressionen + Runtime-/DB-/Browser-Readback.
* Jede Migrationslane endet mit Merge, `main`-Readback und **0 offenen PRs**, bevor die nächste beginnt.

#### Dokumentation

* [Architektur-Ownership](ARCHITECTURE_OWNERSHIP.md) — normative Grenze.
* [Dokumentationsindex](docs/) — aktuelle technische Dokumente.
* [WASD Normative Ruleset](docs/migrations/AIM252_WASD_NORMATIVE_RULESET.md) — Gameplay-Quellenbindung.
* [AX1 Source Reconciliation](docs/migrations/AIM239_AX1_RECONCILIATION_MATRIX_2026-09-05.md) — revisionsgebundene Engine-/Content-Provenienz.

Datiertes `guardian/`- und `qa/`-Material ist historische Evidence. Es beschreibt den Stand seiner jeweiligen Revision und ist keine aktuelle Architekturdefinition.
