# Echoes of Aurion — Build Memory

## Initial decisions

- **Format:** itch.io-ready responsive browser game, not a native Android package.
- **Genre:** cinematic stylized isometric action adventure with a human explorer and an LLM-controlled Echo Scout.
- **Visual language:** Aurion-Türkis `#2DE2CF`, honey-gold ruins, midnight-petrol void, Bronze-Glas field device UI.
- **Persistent state:** browser `localStorage` stores an exportable JSON ledger per device.
- **Safety and privacy:** no attempt is made to access a user’s ChatGPT or other private chat app. The visible gateway is local and simulated until an authorized server connector exists.

## Implementation notes

- Babylon is used with procedural meshes instead of imported GLB models to keep the first web build light and reproducible.
- The Canvas is initialized only once and disposed together with its listeners.
- The generated assets are stored as managed web assets and must not be copied into the source tree.

## Interaction verification

- The test journey was completed in the running browser: local partner link → explicit team configuration → three-slot partner deck → mission launch.
- The mission HUD rendered the human Explorer, Echo Scout, live command bridge, mobile touch bridge, active slots and ledger history.
- A generated console-overlay asset returned a failed image placeholder in the preview. It was removed from the visual layer and replaced by a CSS-only instrument grain so the gameplay canvas remains readable.

## Arena extension verification

- Die erweiterte Einstiegskette wurde erneut geprüft: Sperrbildschirm und lokale Partnerkopplung funktionieren nach der Kampf-Erweiterung weiterhin.
- Die VPS-Prüfung zeigte eine bestehende `arelogic.space`-Weiterleitung auf derselben Maschine. Der spätere Deployment-Schritt erhält deshalb eine reversible Sicherung der aktuellen Nginx-Konfiguration und des bestehenden Webroots.
- Der Arenen-Start zeigt korrekt Arena 1/3, Sentinel-Integrität, Team-Integrität, Questziel, mobilen Speerimpuls und die Fortschrittsmarken für Asterion, Archiv und Solarium.
- Die Ausrüstung `Aurion-Resonanz` senkt die Sentinel-Integrität sichtbar und die periodischen Spaltimpulse senken sichtbar die getrennten Integritätswerte von Explorer und Echo Scout.
- Die Touch-Brücke wurde auf universelle `click`-Aktivierung vereinheitlicht. Dadurch sind Explorer-Bewegung und Speerimpuls gleichermaßen über Touch, Maus und Tastaturassistenz aktivierbar.

## Produktionsbereitstellung

- `arelogic.space` zeigt nach der Umschaltung über HTTPS auf die statische Spielrelease `20260813T015600Z`; der neue TLS-Nachweis ist für `arelogic.space` bis 11. November 2026 gültig.
- Die öffentliche Prüfung bestätigte HTTP 200 und das Ausliefern der Babylon-Module. Die Produktansicht wurde zusätzlich auf die sichtbare React-Einbettung geprüft.
- Nach dem vollständigen Laden zeigt die Produktion Sperrbildschirm, CSS-Aurion-Siegel und 3D-Szene sichtbar; die Browser-Konsole meldet keine Laufzeitfehler.
- Die Expeditionseinstiegsseite wurde nach Einbindung des Operationslinks erneut visuell geprüft und bleibt auf Desktop lesbar. Die separate `/ops`-Screenshot-Erfassung schlug fehl und wird vor der Übergabe als eigene Route diagnostiziert.
- Nach dem Fullstack-Neustart wurde der frühere Gateway-Exportfehler nicht mehr im gerenderten Client reproduziert. Die Startseite erscheint nach kurzer Modulinitialisierung wieder vollständig; die globale Klangsteuerung ist sichtbar.
- Die globale Klangsteuerung wurde im Browser auf Erreichbarkeit getestet: Der Button ist im Kopf interaktiv und wechselt nach zwei direkten Klicks korrekt zwischen dem Pausieren- und Aktivieren-Zustand.
- Die korrigierte Desktopansicht zeigt statt des früheren Geometriehaufens eine zusammenhängende Aurion-Ruinenkulisse: Der Explorer ist als gerüstete Figur auf der rechten Bildhälfte deutlich erkennbar, der türkis leuchtende Echo Scout steht vollständig und kontrastreich am rechten Bildrand. Das Gate-Panel bleibt links abgesetzt. In der Mobilansicht ist die Kulisse bewusst stark zurückgenommen; Überschrift, Duo-Siegel, Providerwahl und CTA bleiben ohne Überlagerung lesbar.
- Fehlerfamilien-Run: Ein frisches Laden der Startseite blieb weiß, obwohl der dynamische Dokumenttitel gesetzt war. Die gleichzeitig abgefragte Browser-Konsole enthielt keine neue Ausnahme. Der Befund bleibt als Render-/Assetpfad-Untersuchung offen; ältere Babylon-Shaderprotokolle gelten nicht ohne erneute Reproduktion als aktuelle Ursache.

## AIM-298 Integration & Evidence Ledger (Issues #459 – #465)

- **Architecture Ownership Contract (AIM-298):**
  - Aurion is the single canonical source of truth for all gameplay, quest, NPC, world, auth, persistence, transport, and receipts.
  - AX1 is the canonical game client (`/play`, HUD, 3D renderer, animation, controls) consuming Aurion contracts with zero secondary server authority.
  - WASD logic functions strictly as an execution/algorithmic reference under Aurion contracts; never runs as a secondary authority sidecar.

- **Issue #459 (WASD-NPC Vendor Synchronization & Build Integrity):**
  - Verified `vendor/wasd-npc` artifacts using `scripts/verify-wasd-npc.mjs`.
  - Confirmed SHA-256 digests for `wasd-npc.js`, `wasd-npc.d.ts`, and `manifest.json`.
  - Zero vendor drift; deterministic packaging verified against canonical hashes.

- **Issue #460 (MariaDB Schema & Migration Provenance):**
  - MariaDB migrations governed strictly via `aurion_migrations` ledger.
  - Deterministic fallback: when `DATABASE_URL` is omitted or empty, `QuestPersistenceEngine` operates in-memory/ephemeral mode, maintaining fail-closed integrity without establishing shadow authority.

- **Issue #461 (Zone Snapshot & Spatial Fact Materialization Bridge):**
  - `WorldFactEngine` materializes world events (`CARAVAN_ATTACKED`, `QUEST_COMPLETED_REVENGE`, `GAMEPLAY_QUEST_TRIGGERED`, and structured fact payloads).
  - `zoneSnapshotBridge` aligns spatial chunk entities with quest prerequisites, eliminating side-channel state drift.

- **Issue #463 (Admin Quest Studio Service & Authoring Workflow):**
  - `AdminQuestStudioService` orchestrates template registration, quarantine lifecycles, and proposal publish plans.
  - All authoring operations generate immutable, hash-chained `AuthoringReceipt` and `QuestReceipt` records.

- **Issue #462 (Deterministic Replay & Temporal Clock Contract):**
  - OperationalClock abstraction enforced (`hostOperationalClock`, `fixedOperationalClock`).
  - Zero non-deterministic inputs (`Date.now()`, `Math.random()`) in quest compiler pathways.
  - `QuestReplayEngine` implements 9-stage causal verification (`SOURCE_SCOPE`, `TEMPLATE_SET`, `CANDIDATE_SET` with scoped fallback, `TEMPLATE_SELECTION`, `SEED_DIGEST`, `ROLE_BINDING`, `PLAN_HASH`, `RUNTIME_EVENTS`, `SEMANTIC_OUTCOME`), emitting canonical fail-closed `ReplayVerdict` under `aurion.quest.compiler.v1`.

- **Issue #464 (Architecture Drift Reconciliation):**
  - Full local repository synchronized byte-for-byte with canonical GitHub `main` branch.
  - Engine accessors (`getPersistenceEngine`, `getWorldFactEngine`, `getTemplateRegistry`) exposed cleanly on `AdminQuestStudioService` to guarantee single-source truth inspection.

- **Issue #465 (Canonical Runtime Authority Bridge & World Event Readback):**
  - Implemented `bridgeGameplayAcceptQuest` and `bridgeGameplayCompleteQuest` in `AdminQuestStudioService`.
  - Funnels gameplay quest lifecycle commands directly through `QuestRuntimeEngine`.
  - Emits canonical receipts (`QuestReceipt`) and persisted world events (`WorldEvent`), validated via persistent readback in `QuestPersistenceEngine.getEmittedWorldEvents()`.
  - Replay verification produces exact `MATCH` verdict.

- **Evidence & Verification Suite:**
  - `server/questCompiler/runtimeAuthorityBridge.test.ts` (2 tests) PASSED.
  - All 13 test files in `server/questCompiler/` (45 tests) PASSED.
  - Build verification via `scripts/verify-wasd-npc.mjs` PASSED.