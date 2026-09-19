---
description: Kanonische Zuständigkeits- und Truth-Boundary für Echoes of Aurion.
---

# Architektur-Ownership: Aurion · AX1 · WASD

> **Kanonischer Vertrag nach C-Aurion End-State Integration (September 2026).** Dieses Dokument legt fest, dass **Echoes of Aurion** die alleinige kanonische Wahrheit und Gameplay-Autorität ist. WASD und AX1 sind Spender/Referenz-Systeme (Donor/Reference), deren funktionale Fähigkeiten schrittweise nativ in Aurion überführt werden mit dem Ziel: *Donor runtime dependency target = zero*.

Die Rollen und Verantwortungen:

| Fläche | Rolle | Verantwortung |
| --- | --- | --- |
| **Echoes of Aurion** | **Sole Canonical Truth & Authority** | Welt, Zonen, Tick-Boundary-Simulation, Quests, NPCs, Kampf, Loot, Progression, Persistenz, Transport und Kausal-Receipts (`aurion.causal.tick.v1`) |
| **AX1** | **Client Projection & Presentation** | 3D-Renderer, WebGL/WebGPU, Assets, HUD, Kamera, Client-Eingaben, Animation/VFX, Mobile (keine autoritative Gameplay-Wahrheit) |
| **WASD** | **Donor / Algorithmic Reference** | Mathematische Formeln, Bewegungsgesetze und Kampf-Delta-Algorithmen (vollständig als reine Funktionen in Aurion integriert) |

Verbindliche Ownership-Formel (AIM-298):
- Aurion = Sole Gameplay + Quest + World + Persistence + Host + Auth Authority
- AX1    = kanonisches Hauptspiel + Content + Runtime/UI Presentation
- WASD   = integrierte deterministische Regel- und Berechnungsreferenz

Kanonisches Architekturmodell:

```
                  ECHOES OF AURION
                 sole canonical truth
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   Authority         Projection       Evidence
        │                │                │
 gameplay/world       renderer/UI       replay
 quests/NPCs          assets/HUD         receipts
 combat/loot          WebGL/WebGPU       provenance
 progression          mobile             verification
 persistence          streaming          readback
        │                │                │
        └────────────────┴────────────────┘
```

Kausale Tick-Architektur:

```
Tick N
  ├── PRE State (Canonical Zone Hash)
  ├── Ordered Intents (Canonical Input Queue)
  │     ├── Movement
  │     ├── Skills / Player Actions
  │     ├── Combat Deltas
  │     ├── NPC / Mob FSM
  │     └── Resource Nodes
  └── POST State (Transition & Post State Hash)
        └── Causal Tick Receipt (aurion.causal.tick.v1)
```

## Kanonische Kausalkette

```
Mensch / Input
    ↓
AX1 Input + Presentation
    ↓ intent only
Aurion-Ausführung unter Aurion-Verträgen (mit nativ integrierten WASD-Berechnungsalgorithmen)
    ↓
confirmed gameplay result + receipt
    ↓
Aurion transport + MariaDB-Persistenz
    ↓
read-only projection
    ├── AX1 im Spiel (/play)
    └── Aurion auf Konto/Community-Seiten
```

Aurion Website, Admin UI, Admin MCP oder Ad-Hoc SQL dürfen niemals unbestätigte oder unvalidierte Mutationen an den typisierten Aurion-Compilern und Receipt-Ketten vorbei erzeugen.

## Was Aurion schreiben darf

Aurion darf alle autoritativen Zustände verändern, die der Aurion-Plattform und -Governance gehören:

* Registrierung, Anmeldung, Session- und Accountdaten;
* Community-Chat und Partner-/Community-Metadaten;
* Forumbeiträge, Antworten, Moderation und redaktionelle Inhalte;
* Community-Event-Metadaten und Community-Ranglisten-Snapshots;
* GLB-/Asset-Upload, Quarantäne, Review, Sichtbarkeit und **rein visuelle** Asset-Zuweisung;
* Betriebs-, Security-, Audit- und Deploymentmetadaten;
* Schema-/Migrationen über revisionsgebundene Ops-Gates;
* Quests, NPC-Entscheidungen, World-State, Chunks, Progression, Loot, Crafting und Encounter-Zustände autoritativ über typisierte Aurion-Kommandos und deterministische Receipts;
* bestätigte Receipts und daraus abgeleitete read-only Projektionen.

Ein Persistenz-Write in MariaDB speichert bestätigte Aurion-Wahrheit. Sämtliche Gameplay-, Quest-, NPC- und World-Truth wird autoritativ von Aurion unter Verwendung deterministischer, typisierter Receipts kompiliert, validiert und persistiert.

## Was Aurion niemals schreiben oder entscheiden darf (Unzulässige Ad-Hoc Pfade & Historische Abgrenzung)

Aurion Website, Admin UI, Admin MCP, Datenbankhelper, Worker oder Service Cells dürfen nicht:

* unvalidierte oder unbestätigte Mutationen an den typisierten Aurion-Compilern und Receipt-Ketten vorbei ausführen;
* nicht-deterministische Zufallsentscheidungen (`Math.random()`) oder Wall-Clock-Drifts in kanonischen Authority-Pfaden treffen;
* aus unvalidierten GLB-/Assetmetadaten oder Telemetrie unbewiesene Gameplaysemantik ableiten;
* generische SQL-/Shell-/Admin-Kommandos als Gameplay-Abkürzung anbieten.

*(Historischer Hinweis nach AIM-298)*: Frühere Vor-Reset-Formulierungen, nach denen „Aurion niemals Questannahme, NPC-Memory, Weltregeln oder Loot entscheiden darf“ oder „WASD ein separates Server-Authority-Sidecar bildet“, sind **historisch überholt**. Nach AIM-298 ist Aurion der alleinige kanonische Eigentümer von Gameplay, Quests, NPCs, Welt und Persistenz. WASD fungiert als nativ integrierte deterministische Regel- und Berechnungsreferenz, nicht als separate Gameplay-Authority.

## AX1-Grenze

AX1 ist das kanonische Hauptspiel. Es besitzt Gameplay-Identität und -Verträge, sichtbare Welt-/Contentstruktur, Spieloberfläche, 3D-Runtime, Renderer, HUD, Eingaben und Animationen. AX1 projiziert die autoritative Aurion-Wahrheit und erfasst Spieler-Intents.

AX1 darf:

* Eingaben erfassen und als Intent an Aurion übermitteln;
* Renderer, Kamera, HUD, Animationen und visuelle Effekte betreiben;
* bestätigte Aurion-Snapshots/Events/Receipts darstellen;
* Content-/Asset-Kataloge für Darstellung verwenden;
* lokale Prediction ausschließlich zur Latenzmaskierung verwenden.

AX1 darf nicht:

* lokale `damageMob`, Quest-, Loot-, XP- oder Inventarmutationen als Wahrheit behandeln;
* `Math.random()`/Wall-Clock für kanonische Gameplayentscheidungen verwenden;
* fehlende Server-Daten mit einem scheinbar erfolgreichen Client-Fallback ersetzen.

## WASD-Grenze

WASD ist die integrierte deterministische Regel-, Berechnungs- und Simulationsreferenz unter Aurion-Verträgen. WASD ist kein separater Gameplay-Owner und besitzt keine eigene Server-Wahrheit. Seine Algorithmen und mathematischen Modelle sind nativ in Aurion eingebunden.

Neue Gameplaymechaniken werden in den kanonischen Aurion-Verträgen definiert, nutzen WASD-Algorithmen als Berechnungsreferenz und werden über AX1 projiziert sowie in MariaDB persistiert. Ein fehlender ausführbarer Vertrag führt **fail-closed** zu „nicht verfügbar/unbewiesen“.

Wolfram/CAG darf WASD-Formeln analysieren, falsifizieren und parametrisieren. Wolfram ist niemals Runtime- oder Gameplay-Authority.

## Aurion-Website: maximale Berechtigung für Gameplaydaten

Die Website darf bestätigte Gameplaydaten ausschließlich lesen und anzeigen, zum Beispiel:

* Charakterlevel und Gesamtfortschritt;
* Skill-/Mastery-Level;
* Achievements, sofern eine bestätigte persistierte WASD-Projektion existiert;
* Gildenzugehörigkeit und Rolle;
* Inventarinhalt;
* ausgerüstete Gegenstände;
* Companion-Training, Sample-/Receipt-Metadaten und Lernhistorie.

Diese Flächen dürfen keine Buttons oder Mutationen anbieten, die den angezeigten Gameplayzustand verändern. Eine Accountseite ist kein zweites Game HUD.

## Community, Forum und Events

Communityfunktionen sind echte Aurion-Ownership. Aurion darf soziale Inhalte schreiben und moderieren. Ein Community-Event darf aber nicht still eine WASD-Spielregel überschreiben. Gameplayrelevante Eventfolgen benötigen einen eigenen WASD-Vertrag; Aurion verwaltet dazu nur Metadaten/Evidence.

## Assets und GLB

Aurion besitzt Asset-Governance: Upload, Bytes, SHA-256, Review, Quarantäne, Sichtbarkeit und visuelle Assignment-Metadaten.

Gameplaystats, Mobverhalten, Attackrange, Collisionregeln, Itemwirkung oder Spawnlogik dürfen nicht aus einem freigegebenen GLB entstehen. AX1 rendert Assets; WASD definiert ihre Gameplaysemantik.

## Admin und MCP

Der Aurion Admin MCP bleibt read-only. Administrative Aurion-Effekte dürfen ausschließlich Account-, Community-, Asset-, Ops- und Persistenzwartung betreffen.

Gameplay-Änderungen gehören nicht in einen generischen Aurion Admin Control Plane. Ein LLM, Admin oder Owner kann WASD-Regeländerungen beauftragen, aber die Änderung erfolgt als revisionsgebundener WASD-Code-/Regelprozess, nicht als Live-Aurion-Datenbankkommando.

## Observability

Telemetry, Logs, Amplitude, OpenTelemetry und ähnliche Systeme sind Side-Channels. Sie dürfen Gameplay beobachten, aber niemals Gameplay-Input oder Gameplay-Truth werden.

```
telemetry outage ≠ gameplay outage
telemetry green  ≠ gameplay proven
```

## Evidence-Regel

Ein Zustand ist nur auf seiner eigenen Grenze belegt:

| Beobachtung                          | Belegt                          |
| ------------------------------------ | ------------------------------- |
| Aurion Website antwortet             | Website/Host                    |
| MariaDB Readback stimmt              | Persistenz                      |
| AX1 Animation läuft                  | Präsentation                    |
| WASD Reducer/Receipt stimmt          | Gameplayregel/-zustand          |
| Container ist healthy                | Containerhealth                 |
| Browser zeigt bestätigten WASD-State | sichtbare End-to-End-Projektion |

Keines dieser Signale ersetzt automatisch ein anderes.

## Migrationsregel für Legacy-Code

Bekannte historische Aurion-Gameplayflächen wie Arena-/Encounter-/Quest-/Progressionspfade sind nicht der Zielzustand. Bei jeder Berührung gilt:

1. feststellen, ob die Fläche Gameplayregel enthält;
2. fachliche Identität und Vertrag an AX1 binden;
3. Ausführungslogik zu WASD verschieben oder an den vorhandenen WASD-Vertrag binden;
4. AX1 als Hauptspiel/UI/Runtime verwenden;
5. Aurion auf Community/Auth/Host/Transport/Persistenz/Readmodel reduzieren;
6. Regression ergänzen, die den Rückfall verhindert;
7. erst nach Exact-Head-Evidence mergen.

## Arbeits- und Merge-Gate

Für jede Migrationslane:

1. aktuellen `main` lesen;
2. Ownership vor der Implementierung prüfen;
3. Runtime/Tests/DB/Browser auf der relevanten Grenze prüfen;
4. keine falsche Green-Behauptung bei fehlender Evidence;
5. PR mergen, sobald die erforderlichen Checks belegt sind;
6. `main` readbacken;
7. **0 offene PRs** bestätigen;
8. erst dann in den nächsten Migrationsbereich wechseln.

## Historische Dokumente

Datiertes Guardian-/QA-Material darf als historische Evidence erhalten bleiben, sofern es eindeutig eine damalige Revision dokumentiert. Es ist **nicht normativ**. Bei Widerspruch gewinnt immer dieses Dokument zusammen mit dem aktuellen Code- und Runtime-Readback.
