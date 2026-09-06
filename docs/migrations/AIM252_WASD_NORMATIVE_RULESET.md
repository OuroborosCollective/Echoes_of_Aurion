---
description: Normativer WASD-Regelvertrag für die AX1/Aurion-Integration.
---

# AIM-252 — WASD Normative Ruleset

Status: **normativer Gameplay- und Determinismusvertrag**.

Dieses Dokument konkretisiert [ARCHITECTURE_OWNERSHIP.md](../../ARCHITECTURE_OWNERSHIP.md). Bei Widerspruch mit älteren Migrationsledgers oder abgeschlossenen AIM-Berichten gilt die aktuelle Ownership-Matrix.

## Regelhierarchie

1. **WASD** — alleinige normative Gameplay- und Simulationsregelquelle.
2. **AX1** — kanonische Spielruntime, UI, Rendering und Content-/Visual-Projektion.
3. **Aurion** — Produkt-/Webhost, Auth/Account, Community/Forum/Events, Asset-/Ops-Governance, MariaDB-Persistenz, Transport und read-only Readmodels.

Es gibt **keine gemeinsame WASD/Aurion-Gameplay-Authority**.

## Source binding

Die Migration bindet revisionsgenau:

- `OuroborosCollective/Wasd` für Gameplayregeln und deterministische Verträge;
- `OuroborosCollective/-ax1` für Runtime/UI/Renderer/Content;
- `OuroborosCollective/Echoes_of_Aurion` für Host/Persistenz/Integration.

Die jeweils aktuelle exakte Source-Revision steht in den Reconciliation-/Source-Manifesten. Ein älterer SHA in einem historischen Audit ist kein neuerer Normativ-Pin.

## Kanonische Kette

```text
AX1 intent
  -> WASD validation/canonicalization
  -> ordered logical tick
  -> WASD deterministic state transition
  -> canonical event/snapshot/receipt
  -> Aurion persistence/transport
  -> AX1 or Aurion read-only projection
```

Aurion darf keinen fachlichen Schritt zwischen Canonicalization und State Transition ergänzen.

## WASD-owned Bereiche

WASD besitzt mindestens:

- Actor-/Input-Validierung für Gameplay;
- Movement, Collision und kanonische Position;
- Combat, Damage, HP, Stamina, Threat, LOS, Ballistics und Buff/Debuff;
- Quests, Objectives, NPC-/Ortbindung, Completion und Rewards;
- XP, Skills, Mastery, Progression und Archetyp-/Loadoutwirkungen;
- Loot, Drop, Pity, Itemstats und Equipmentwirkungen;
- Crafting, Professions, Yield, Qualität und Ressourcenverbrauch;
- Economy, Gameplaypreise, Handel, Buyback und Sinks;
- Party, Matchmaking, Dungeon-/Boss-/Instance-Regeln;
- NPC Memory, Standing, FSM, Zielwahl, Pathfinding, Economy und Social/Politics;
- World, Chunks, Spawns, Ressourcen, Städte, Straßen, Events und Epochen;
- Housing/Homestead, Blueprints, Plot-/Placement-/Build-Regeln;
- Guild/Alliance/Territory/Kingdom/Treasury-Gameplay;
- Balancingkonstanten und ihre versionsgebundene Anwendung.

## AX1-owned Bereiche

AX1 darf diese WASD-Zustände bedienen und darstellen:

- `/play` Lifecycle;
- Renderer/Kamera;
- HUD/Modals/Controls;
- Input collection;
- Animation/VFX/Audio-Cues als Presentation;
- Content-/Asset-Projektion;
- Prediction nur zur Latenzmaskierung.

Lokale AX1-Zustände dürfen nicht zu Gameplay-Truth promoted werden.

## Aurion-owned Bereiche

Aurion besitzt:

- Website/Landing;
- Auth/Account/Session;
- Community, Forum, Community-Events;
- Asset/GLB Upload, Quarantäne, Review und visuelle Assignment-Metadaten;
- Ops, Security, Deployment und Schema-Migration;
- MariaDB-Persistenz bestätigter Evidence;
- read-only Account-/Community-/Admin-Readmodels;
- Receipt-/Provenienzspeicherung und Transport.

Aurion darf **nicht** aus Persistenz selbst eine Gameplayregel erzeugen.

## Konfliktregeln

### Client/AX1 gegen WASD

Clientbestimmte `playerId`, Tick/Sequence, HP, Level, Damage, Loot, Inventory-, Quest- oder World-State werden als Authority verworfen. AX1 sendet Intents; WASD entscheidet.

### Legacy Aurion gegen WASD

Historische Aurion-Pfade wie Arena-/Encounter-/Quest-/Progression-/Loot-/Economy-/World-Resolver sind kein Präzedenzfall. Sobald ein Produktionspfad sie als Gameplayowner nutzt, ist das Architekturdrift.

### Zeit und Zufall

Wall-clock, Renderframe oder unseeded randomness dürfen keine Gameplayentscheidung bestimmen. WASD liefert logische Zeit-/Seedsemantik. Visual-only time bleibt in AX1 erlaubt.

### Persistenz

MariaDB darf Gameplayzustände speichern, aber DB-Schema, Trigger oder Aurion-Service dürfen keine neue fachliche Regel hinzufügen. Persistierte Werte müssen ihre WASD-Herkunft belegen können.

### Assets

GLB-/Assetmetadaten sind Presentation Content. Stats, Collisionregeln, Mobverhalten, Spawn/Drop und Itemwirkung bleiben WASD.

### Admin/MCP

Aurion Admin/MCP kann Account/Community/Assets/Ops verwalten. Gameplayregeländerungen passieren als WASD-Code-/Ruleset-Änderungen, nicht als Live-Aurion-Adminmutation.

## Unbounded progression

Unbounded Mastery, Professionen, Recipe-/Item-Mastery, Weapon Mastery und Social/Political Skills werden als WASD-Regeln erweitert. Aurion darf resultierende Receipts persistieren und read-only anzeigen.

## Balancing

Wolfram/CAG kann Formeln prüfen, Sensitivität analysieren und Gegenbeispiele liefern. Ein Wolfram-Ergebnis wird erst nach expliziter Übernahme in einen WASD-Ruleset gameplaywirksam.

## Acceptance

Eine Migrationslane gilt nicht als korrekt, wenn sie nur funktional grün ist, aber Ownership vermischt.

Pflichtinvarianten:

- Aurion besitzt keinen Gameplay-write endpoint;
- AX1 besitzt keine lokale Gameplay-Truth;
- WASD-State-Transitions sind deterministisch/revisionsgebunden;
- Aurion-Readbacks sind Provenienz-gebunden;
- Visual-, DB- und Gameplay-Evidence werden getrennt ausgewiesen;
- fehlender WASD-Vertrag -> fail-closed statt Aurion-Fallback.

## Abschlusssequenz

1. WASD-Regel binden.
2. AX1 Runtime/UI anbinden.
3. Aurion Persistenz-/Transportadapter anbinden.
4. Negative Ownership-Regressionen ausführen.
5. relevante Unit/DB/Browser/Runtime-Evidence ausführen.
6. PR mergen.
7. `main` readbacken.
8. **0 offene PRs** bestätigen.
9. nächste Migrationslane beginnen.
