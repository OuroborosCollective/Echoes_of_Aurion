---
description: Aktuelle Source-Provenienz für WASD-, AX1- und Aurion-Integration.
---

# Aktuelle Source-Provenienz

Diese Seite ist der aktuelle Einstieg für Source-Reconciliation. Ältere `AIM239_*`, `WASD_AURION_*` und Source-Ledgers bleiben historische Provenienz ihrer jeweiligen Revision, sind aber keine aktuelle Ownership-Definition.

## Rollen

| Repository | Rolle |
| --- | --- |
| `OuroborosCollective/Wasd` | normative Gameplay-/Determinismusquelle |
| `OuroborosCollective/-ax1` | Spielruntime, UI, Renderer und Content-/Visual-Quelle |
| `OuroborosCollective/Echoes_of_Aurion` | Host, Website/Auth/Community, Persistenz, Transport und Readmodels |

## Gepinnte historische Sourcepunkte

Die bisherige Migration hat unter anderem folgende revisionsgebundene Punkte verwendet:

- AX1 finaler Source-Head: `d356881538dae23c3aa97364a5596d48b6ac3079`;
- ältere WASD-Audit-/Normativ-Pins sind in den jeweiligen Source-Ledgers dokumentiert.

Ein historischer Pin bleibt Evidence für den damaligen Import. Vor neuer Integration muss der aktuelle WASD-/AX1-Head erneut gelesen und bewusst gebunden werden.

## Reconciliation-Regel

Jedes Source-Delta wird genau einer Behandlung zugeordnet:

- **WASD rule** — fachliche Regel/Simulation gehört nach WASD;
- **AX1 direct/adapt** — Runtime/UI/Renderer/Visual Content;
- **Aurion persistence/transport** — Speicherung/Readback bereits bestätigter Evidence;
- **dev-only** — Debug/Preview ohne Production-Truth;
- **reject** — zweite Authority, clientbestimmte Mutation, unseeded Gameplayrandomness, parallele Persistenz oder sonstige Architekturverletzung.

## Keine implizite Authority

Ein Modul wird nicht zum Aurion-Owner, nur weil die Integration derzeit in `server/` oder MariaDB liegt. Wenn dort fachliche Gameplaylogik enthalten ist, ist sie Migrationsschuld und wird bei Berührung an WASD gebunden.

## Evidence

Source-Provenienz beweist:

- welche Bytes/Revision geprüft wurden;
- welche Integrationsentscheidung getroffen wurde.

Sie beweist **nicht** automatisch:

- Runtime-Aktivität;
- Production-Deployment;
- korrekte Gameplay-Semantik;
- DB-Schema-Parität;
- Browserdarstellung.

Diese Ebenen werden separat geprüft.
