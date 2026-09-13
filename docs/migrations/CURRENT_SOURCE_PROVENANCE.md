---
description: Aktuelle Source-Provenienz für WASD-, AX1- und Aurion-Integration.
---

# Aktuelle Source-Provenienz

Diese Seite ist der aktuelle Einstieg für Source-Reconciliation. Ältere `AIM239_*`, `WASD_AURION_*` und Source-Ledgers bleiben historische Provenienz ihrer jeweiligen Revision, sind aber keine aktuelle Ownership-Definition.

## Rollen

| Repository                             | Rolle                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `OuroborosCollective/-ax1`             | kanonisches Hauptspiel, Gameplayvertrag, Welt-/Contentstruktur, Runtime, UI und Renderer |
| `OuroborosCollective/Wasd`             | ausführende deterministische Logik- und Simulationsschicht für AX1                       |
| `OuroborosCollective/Echoes_of_Aurion` | Host, Website/Auth/Community, Persistenz, Transport und Readmodels                       |

## Aktueller AX1-Cutover-Pin

* vollständige sichtbare AX1-Quelle: `f24e3bbb452bd6991c8365fc7827ce6dbcc16d95`;
* AX1 NPC-/Lingua-/Economy-Engine-Basis: `cf9cd7a9e197a110724d4f517655a63168ed63e0` (in `f24e3bbb…` in diesen Modulen unverändert);
* Source-Manifest und Adaptionsentscheidungen: `client/src/xaurion/integration/ax1SourceManifest.ts`.

## Gepinnte historische Sourcepunkte

Die bisherige Migration hat unter anderem folgende revisionsgebundene Punkte verwendet:

* AX1 finaler Source-Head: `d356881538dae23c3aa97364a5596d48b6ac3079`;
* ältere WASD-Audit-/Normativ-Pins sind in den jeweiligen Source-Ledgers dokumentiert.

Ein historischer Pin bleibt Evidence für den damaligen Import. Vor neuer Integration muss der aktuelle WASD-/AX1-Head erneut gelesen und bewusst gebunden werden.

## Reconciliation-Regel

Jedes Source-Delta wird genau einer Behandlung zugeordnet:

* **AX1 game contract** — fachliche Identität, Content und Spielvertrag gehören zu AX1;
* **WASD execution** — die deterministische Ausführung des AX1-Vertrags gehört nach WASD;
* **AX1 direct/adapt** — Runtime/UI/Renderer/Visual Content;
* **Aurion persistence/transport** — Speicherung/Readback bereits bestätigter Evidence;
* **dev-only** — Debug/Preview ohne Production-Truth;
* **reject** — zweite Authority, clientbestimmte Mutation, unseeded Gameplayrandomness, parallele Persistenz oder sonstige Architekturverletzung.

## Keine implizite Authority

Ein Modul wird nicht zum Aurion-Owner, nur weil die Integration derzeit in `server/` oder MariaDB liegt. Wenn dort fachliche Gameplaylogik enthalten ist, ist sie Migrationsschuld und wird bei Berührung an den AX1-Spielvertrag und seine WASD-Ausführung gebunden.

## Evidence

Source-Provenienz beweist:

* welche Bytes/Revision geprüft wurden;
* welche Integrationsentscheidung getroffen wurde.

Sie beweist **nicht** automatisch:

* Runtime-Aktivität;
* Production-Deployment;
* korrekte Gameplay-Semantik;
* DB-Schema-Parität;
* Browserdarstellung.

Diese Ebenen werden separat geprüft.
