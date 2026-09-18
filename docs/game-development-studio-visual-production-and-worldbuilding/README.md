---
description: >-
  Kanonischer Aurion-Workflow für Game Development Studio sowie menschlich
  bestätigtes World-, Quest- und Dungeon-Authoring mit revisionsgebundener
  Evidence.
---

# Game Development Studio — Visual Production & Worldbuilding

## Zweck

`game-dev` ist die feste Visual-Production- und Evidence-Lane für **Echoes of Aurion**. Seit PR #399 ist diese Lane mit einem Aurion-eigenen Human+AI-Authoring-Control-Plane verbunden.

* **Aurion** ist die einzige Gameplay-/Simulations-Authority. Aurion besitzt World-Truth, Questwirkungen, Dungeon-/Gruppenregeln, Progression, Collision, Persistenz, Plan-Validierung, Receipts, Runtime-Projektion und Publish/Apply.
* **AX1** besitzt Renderer, UI, Kamera, Animation, VFX, LOD/HLOD und Presentation Content. AX1 projiziert bestätigte Aurion-Wahrheit und autorisiert keine Gameplaymutation.
* **WASD** ist ausschließlich historische Migrations-/Provenienzquelle. Historische revisionsgebundene WASD-Belege dürfen Migrationen belegen, aber keine neue Aurion-Runtime-Wahrheit autorisieren.
* **Game Development Studio** produziert, inspiziert, validiert, paketiert und vendort Assets. GDS darf keine Quest-, Dungeon- oder World-Truth setzen.
* **Genkit** erzeugt strukturierte Entwürfe. Genkit hat in der Authoring-Lane keine Publish-, Tool- oder Gameplay-Authority.

{% hint style="warning" %}
Ein KI-Vorschlag, Asset, Screenshot, Capture oder Provider-Job darf niemals Gameplay-Wahrheit erzeugen. Produktiv wird Content erst nach Aurion-Validierung, kanonischem Plan-Hash und einer separaten menschlichen Apply-/Publish-Bestätigung.
{% endhint %}

## Produktiver Asset-Workflow

`Design → Inspect → Validate → Package → Package Verify → Vendor Dry-Run → Human Confirm → Vendor Admit → SHA-Readback → Aurion GLB Ingest → Live-Katalog-Readback`

Die produktive GDS-Lane ist providerfrei begrenzt. Sie akzeptiert keine unbekannte Lizenz, keinen `--allow-invalid`-Bypass, keine fremden Workspace-Pfade und keinen ungeprüften Provider-Spend.

Aktueller GDS-Stand: **v1.0.2**, gepinnt auf Source-Revision `96a0b4f34b979279ab983e9547af43133e85f310`.

## Human+AI Authoring Control Plane

Der gemeinsame Authoring-Ablauf ist für Welt, Nebenquests und Dungeons gleich:

1. **Design-Brief:** Der Mensch beschreibt Ziel, Stimmung, Funktion, Geometrie, Questlogik oder Dungeonstruktur.
2. **Genkit Draft:** Genkit liefert ausschließlich strukturiertes, untrusted Draft-JSON. Keine Tools, kein Publish, keine Lizenzbehauptung.
3. **Aurion Plan:** Aurion parst, validiert, bindet bestätigte GLB-IDs, prüft Graph/Layout/Referenzen und erzeugt einen kanonischen Plan-Hash.
4. **Human Review:** Änderungen am Draft invalidieren den Plan und erzwingen eine neue Validierung.
5. **Expliziter Commit:** Der Mensch bestätigt exakt eine Consequence-Grenze:
   * `APPLY_WORLD_DESIGN`
   * `PUBLISH_QUEST_TEMPLATE`
   * `PUBLISH_DUNGEON`
6. **Persistenz + Receipt:** Aurion schreibt die versionierte Definition und das Authoring-Receipt atomar nach MariaDB.
7. **Runtime-Readback:** Nur die bestätigte Aurion-Version wird in der Live-Runtime projiziert.

## Weltgestaltung

World-Authoring erzeugt ein versioniertes `aurion.world-design.v1`-Manifest. Jede Platzierung enthält ausschließlich bestätigte GLB-Asset-IDs und integerbasierte Chunk-/Millimeterkoordinaten.

Der Apply-Pfad revalidiert unmittelbar vor dem Write:

* aktuelle GLB-Katalogrevision,
* Asset-ID und SHA-256,
* erlaubten Presentation-Purpose,
* Placement-Key,
* Chunk-/Lokalkoordinaten,
* Rotation und Scale,
* exakten Plan-Hash.

Veröffentlichte World-Designs werden über `/api/game/world-design` ausgelesen und durch die bestehende `UploadedWorldCatalogProjection` in `/play` dargestellt. Diese Projektion registriert keine eigene Gameplay-Authority.

Damit kann ein Mensch gemeinsam mit KI z. B. Tempelanlagen, Dörfer, Ruinen, Landmarken, Vegetation und Props räumlich komponieren, ohne Player-`place_structure` oder andere Gameplay-Kommandos zu missbrauchen.

## Nebenquests

Der Quest-Compiler unterstützt versionierte Templates mit:

* Rollen für NPC, Location, Item, Player und Faction,
* `start`, `objective`, `branch`, `subquest`, `end`,
* gerichteten Graph-Edges und Choices,
* Voraussetzungen,
* Outcomes und gebundenen Rewards,
* deterministischen Role-Bindings und Plan-/Graph-Hashes.

### Publish-Grenze

`Draft → Graph/Reward/Reference Validation → Publish Plan → PUBLISH_QUEST_TEMPLATE → MariaDB Template Version + Proposal Status + Authoring Receipt`

Neue Objective-Nodes müssen an eine bestätigte Aurion-Eventquelle gebunden sein. Der Client besitzt **keine** freie `+1`-Progress-Mutation.

Aktuell bestätigte Objective-Quellen:

* `world_chunk_delta` — z. B. Resource, Structure oder Road Receipts,
* `group_instance` — z. B. bestätigter Dungeon-Clear.

Der Spieler kann ein bestätigtes Angebot annehmen, eine echte Branch-Choice auslösen und eine End-Node abschließen. Trigger-Event, Seed und Giver-Rolle bleiben serverseitig.

Veröffentlichte Nebenquests erscheinen im Live-Questbuch über den `AuthoredQuestJournal`. Die alten Legacy-Lyra/WASD-Mutationsbuttons bleiben auf `/play` deaktiviert.

## Dungeons

Ein veröffentlichter `aurion.dungeon-design.v1`-Entwurf enthält:

* **4–9 Räume**,
* genau einen Entrance und Exit,
* gerichtete Room-Connections,
* **2–4 Bosse**,
* optionale Room-Objectives,
* bestätigte GLB-Bindings für Räume und Bosse,
* kanonischen Graph-Hash,
* Plan-Hash und Asset-Hashes,
* Party-Capability-Vertrag `[1 Tank, 1 Heiler, 3 DPS]`.

Aurion prüft Topologie, Erreichbarkeit, Boss-Room-Bindungen, reservierte Built-in-IDs und Asset-Governance vor dem Publish.

Nach `PUBLISH_DUNGEON` erscheint der Dungeon im echten Group-Finder. Das Instance-Ticket friert Design-Hash, Räume, Positionen, Ziele, Asset-Bindings, Bosse und Source-Revision ein. Die bestehende deterministische Group-/Combat-Runtime bleibt die Authority für den tatsächlichen Run.

## Consent- und Sicherheitsregeln

* Plan/Preview ist read-only.
* Kein Batch-Approve für Publish-/Apply-Aktionen.
* Die bestätigte Aktion zeigt Plan-Hash und exakte Consequence.
* Geänderte Inputs invalidieren den Plan.
* Kein Client darf World-/Quest-/Dungeon-Truth frei schreiben.
* Genkit- oder GDS-Ausgaben werden niemals direkt persistiert.
* Kein Provider-Spend in dieser Authoring-Lane.
* Jede Mutation erzeugt Revision/Hash/Receipt und einen Readback.

## Persistenz

Migration **0050 — `aurion_human_ai_authoring`** ergänzt:

* `aurionWorldDesignVersions`,
* `aurionDungeonDesignVersions`,
* `aurionAuthoringReceipts`.

Quest Templates, Proposals, Plans, Instances und Quest Receipts verwenden die bereits vorhandene Aurion-Quest-Persistenz und wurden vom alten RAM-only-Pfad auf MariaDB gebunden.

## Evidence

Repository-Integration: **PR #399**, Merge-Commit `863076bd08a15d43c631768093fe99f09c70f060`.

Technical Head vor Memory: `3030c97dfe393d1c20702eaaee436a039cf2e8eb`.

Grüne Exact-Head-Evidence:

* Game Development Studio Smoke — run `35312451045`
* Android APK / real Open-World keyframe — run `35312450465`
* Schema Reconciliation — run `35312450584`
* Root Schema Apply — run `35312450669`
* Root Reconciliation — run `35312450543`
* Runtime Container Proof — run `35312450617`
* Runtime Candidate — run `35312450509`
* Local Test Pack — run `35312450685`
* AIM-259 real Group/Browser regression — run `35312450671`

{% hint style="info" %}
Der Merge beweist Repository-/Candidate-Integration. Ein Produktions-Deploy oder tatsächlicher Live-Draw gilt erst nach einem separaten revisionsgebundenen Production-Readback des Merge-SHA als bestätigt.
{% endhint %}

## Dauerregel

Für Authoring-Integrationen gilt weiterhin:

`Memory.md lesen → Integration → Runtime/Regression/Evidence → genau ein kurzer Memory.md-Eintrag → erst dann Merge → Post-Merge-Readback`

Für Content gilt zusätzlich:

`Human Brief → Genkit Draft → Aurion Plan → Human Confirm → Persist/Receipt → Runtime Readback`
