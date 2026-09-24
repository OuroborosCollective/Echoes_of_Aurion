---
description: Historische Source-Provenienz für bereits in Aurion migrierte AX1-/WASD-Bausteine.
---

## ⚠️ Historisch — nicht normativ

Seit dem aktuellen Aurion-Endzustand gilt: **Aurion ist der einzige Owner und Wahrheitsträger.** Die in diesem Dokument genannten AX1-/WASD-Repositories, Revisionen und Rollen beschreiben ausschließlich damalige Herkunft und Migrationsstände. Sie tragen keine aktuelle Wahrheit, keine Gameplay-Pflicht und keine Runtime-Authority. Bereits migrierter Code gehört Aurion.

# Aktuelle Source-Provenienz

Diese Seite ist der aktuelle Einstieg für Source-Reconciliation. Ältere `AIM239_*`, `WASD_AURION_*` und Source-Ledgers bleiben historische Provenienz ihrer jeweiligen Revision, sind aber keine aktuelle Ownership-Definition.

## Rollen

| Repository                             | Rolle                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `OuroborosCollective/-ax1`             | kanonisches Hauptspiel, Gameplayvertrag, Welt-/Contentstruktur, Runtime, UI und Renderer |
| `OuroborosCollective/Wasd`             | ausführende deterministische Logik- und Simulationsschicht für AX1                       |
| `OuroborosCollective/Echoes_of_Aurion` | Host, Website/Auth/Community, Persistenz, Transport und Readmodels                       |

## Historischer AX1-Cutover-Pin

* vollständige sichtbare AX1-Quelle: `f24e3bbb452bd6991c8365fc7827ce6dbcc16d95`;
* AX1 NPC-/Lingua-/Economy-Engine-Basis: `cf9cd7a9e197a110724d4f517655a63168ed63e0` (in `f24e3bbb…` in diesen Modulen unverändert);
* Source-Manifest und Adaptionsentscheidungen: `client/src/xaurion/integration/ax1SourceManifest.ts`.

## Gepinnte historische Sourcepunkte

Die bisherige Migration hat unter anderem folgende revisionsgebundene Punkte verwendet:

* AX1 finaler Source-Head: `d356881538dae23c3aa97364a5596d48b6ac3079`;
* ältere WASD-Audit-/Normativ-Pins sind in den jeweiligen Source-Ledgers dokumentiert.

Ein historischer Pin bleibt Evidence für den damaligen Import. Neue Arbeit muss nicht in AX1 oder WASD ausgeführt oder von deren aktuellem Head abhängig gemacht werden.

## Reconciliation-Regel

Jedes Source-Delta wird genau einer Behandlung zugeordnet:

* **AX1 game contract** — fachliche Identität, Content und Spielvertrag gehören zu AX1;
* **WASD execution** — die deterministische Ausführung des AX1-Vertrags gehört nach WASD;
* **AX1 direct/adapt** — Runtime/UI/Renderer/Visual Content;
* **Aurion persistence/transport** — Speicherung/Readback bereits bestätigter Evidence;
* **dev-only** — Debug/Preview ohne Production-Truth;
* **reject** — zweite Authority, clientbestimmte Mutation, unseeded Gameplayrandomness, parallele Persistenz oder sonstige Architekturverletzung.

## Keine Legacy-Authority

Ein Modul wird nicht zu einem zweiten Owner, nur weil sein Dateiname `ax1*` oder `wasd*` enthält. Bereits migrierte fachliche Logik ist Aurion-Logik. Historische Source-Identität bleibt Provenienz und wird nicht zur aktuellen Authority.

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
