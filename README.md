---
description: Aktueller technischer Projektüberblick für Echoes of Aurion.
---

# Echoes of Aurion

**Echoes of Aurion** ist der Produkt- und Hostingrahmen für ein persistentes 3D-MMORPG. Seit dem Architektur-Cutover vom 6. September 2026 sind Website, Spielruntime und Gameplayregeln strikt getrennt.

{% hint style="info" %}
Die verbindliche Zuständigkeitsmatrix steht in [Architektur-Ownership: Aurion · AX1 · WASD](ARCHITECTURE_OWNERSHIP.md). Bei Widerspruch mit älteren Dokumenten gilt diese Matrix.
{% endhint %}

## Architektur in einem Satz

**Aurion hostet Website, Auth, Community und Persistenz; AX1 betreibt `/play`, Renderer und Spieloberfläche; WASD besitzt sämtliche Gameplay- und Simulationsregeln.**

| System | Verantwortung |
| --- | --- |
| **Aurion** | Landing Page, Account/Auth, Community, Forum, Community-Events, Asset-/Ops-Verwaltung, MariaDB, Receipts, read-only Readmodels |
| **AX1** | `/play`, 3D-Runtime, Kamera, HUD, Eingaben, Animationen, visuelle/contentbezogene Projektion |
| **WASD** | Bewegung, Combat, Quests, Progression, Mastery, Loot, Crafting, Economy, Gruppen/Dungeons, NPC/Mobs, Welt/Chunks, Housing, Guild/Kingdom, Balancing |

Aurion ist **keine** zweite Gameplay-Engine. Ein Datenbank-Write speichert nur ein bereits bestätigtes Ergebnis; er definiert die zugrunde liegende Spielregel nicht.

## Website

Die Aurion-Website trägt:

- Registrierung, Login, Session und Accountverwaltung;
- Community und Forum;
- Community-Events;
- Asset-/GLB-Governance und Operations;
- read-only Charakterdaten wie Level, Skill-/Masterystände, Gildenzugehörigkeit, Inventar, Ausrüstung, Achievements bei vorhandener bestätigter Projektion und Companion-Trainingsmetadaten.

Die Website darf diese Gameplaydaten **nicht verändern**. Es gibt dort keine Quest-, Combat-, Loot-, Crafting-, Progressions-, Equipment-, Economy-, Dungeon-, Housing- oder Guild-/Kingdom-Gameplay-Authority.

## Spiel

`/play` gehört AX1. AX1 nimmt Eingaben an und rendert bestätigte Zustände. Lokale Animation, Prediction oder UI-Zustand ist niemals alleinige Gameplay-Evidence.

Gameplayänderungen folgen der Kette:

```text
AX1 intent
→ WASD deterministic rule / logical tick
→ confirmed result + receipt
→ Aurion persistence/transport
→ AX1 read-only projection
```

Wo ein WASD-Vertrag noch nicht vollständig migriert ist, gilt fail-closed: keine Aurion-Ersatzregel.

## Persistenz

MariaDB hält Account-/Communitydaten sowie bestätigte Gameplay-Evidence und Readmodels. Kritische Gameplay-Outcomes müssen ihre Herkunft über WASD-Receipt, Source-/Ruleset-Version oder eine gleichwertige revisionsgebundene Provenienz belegen.

Persistenz ist nicht Gameplay-Ownership.

## Assets

Aurion verwaltet Upload, Quarantäne, Review, SHA-256/Bytes, Sichtbarkeit und visuelle Asset-Zuweisungen. AX1 rendert freigegebene Assets. WASD bestimmt Stats, Collision-, Spawn-, Item-, Mob- und sonstige Gameplaysemantik.

Ein GLB kann deshalb niemals durch seine Metadaten Schaden, HP, Drops oder Regeln festlegen.

## Companion Learning

Companion-Lernvorgänge dürfen im Spiel über AX1 aufgezeichnet und als Evidence gespeichert werden. Die Aurion-Accountseite darf Trainings-/Sample-/Receipt-Metadaten anzeigen, aber keinen Companion steuern und kein Gameplay aus Trainingsdaten erzeugen.

## Determinismus und Balancing

WASD ist die normative Regelquelle. Reproduzierbare Simulation, Tick-/Sequence-Semantik, RNG, Progressionskurven und Gameplay-Balancing werden dort versioniert.

Wolfram/CAG kann Formeln analysieren und falsifizieren. Es ist ein Analysewerkzeug, keine Runtime-Authority.

## Evidence

Eine grüne Ebene beweist nur sich selbst:

- Website-Health beweist den Aurion-Host;
- DB-Readback beweist Persistenz;
- AX1-Animation beweist Präsentation;
- WASD-Receipt/Reducer beweist Gameplayregel/-zustand;
- Browser-E2E beweist die sichtbare Zusammenschaltung, wenn alle Quellen revisionsgleich gebunden sind.

Dateiexistenz, PR-Status, Linear-Status oder ein gesunder Container allein sind kein vollständiger Produktionsnachweis.

## Aktuelle Arbeitsregeln

- Keine Fake-/Mock-Wahrheit in Production-Pfaden.
- Keine Aurion-Gameplay-Abkürzungen über Website, Admin, MCP oder SQL.
- Alte Arena-/Encounter-/Aurion-Quest-/Aurion-Progressionspfade gelten als Legacy-Migrationsschuld.
- Nach jeder Integration: relevante Regressionen + Runtime-/DB-/Browser-Readback.
- Jede Migrationslane endet mit Merge, `main`-Readback und **0 offenen PRs**, bevor die nächste beginnt.

## Dokumentation

- [Architektur-Ownership](ARCHITECTURE_OWNERSHIP.md) — normative Grenze.
- [Dokumentationsindex](docs/README.md) — aktuelle technische Dokumente.
- [WASD Normative Ruleset](docs/migrations/AIM252_WASD_NORMATIVE_RULESET.md) — Gameplay-Quellenbindung.
- [AX1 Source Reconciliation](docs/migrations/AIM239_AX1_RECONCILIATION_MATRIX_2026-09-05.md) — revisionsgebundene Engine-/Content-Provenienz.

Datiertes `guardian/`- und `qa/`-Material ist historische Evidence. Es beschreibt den Stand seiner jeweiligen Revision und ist keine aktuelle Architekturdefinition.
