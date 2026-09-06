---
description: Kanonischer Index der aktuellen technischen Dokumentation.
---

# Technische Dokumentation

Die aktuelle Dokumentation folgt der Ownership-Matrix aus [Architektur-Ownership](../ARCHITECTURE_OWNERSHIP.md).

## Kanonisch

1. [Architektur-Ownership: Aurion · AX1 · WASD](../ARCHITECTURE_OWNERSHIP.md)
2. [AIM-252 — WASD Normative Ruleset](migrations/AIM252_WASD_NORMATIVE_RULESET.md)
3. [Finale AX1 Source Reconciliation](migrations/AIM239_AX1_RECONCILIATION_MATRIX_2026-09-05.md)
4. [AX1 Content Catalog](migrations/AIM267_AX1_CONTENT_CATALOG.md)
5. [Naturkollision und weltweite Bewegung](world-nature-collision.md)
6. [Balancing v2](balancing/AIM265_BALANCING_V2.md)

## Bereichseigentümer

### Aurion

Dokumentiert werden dürfen Auth/Account, Community/Forum/Events, Assets/Ops, Deployments, MariaDB, Receipts und read-only Readmodels. Aurion-Dokumentation darf keinen Gameplay-Owner definieren.

### AX1

Dokumentiert `/play`, Rendering, HUD, Eingaben, Animationen, Asset-/Content-Projektion und visuelle Performance.

### WASD

Dokumentiert und besitzt die normativen Regeln für Bewegung, Combat, Quests, Progression, Loot, Crafting, Economy, Gruppen/Dungeons, NPC/Mobs, Welt/Chunks, Housing, Guild/Kingdom und Balancing.

## Historical evidence

Datiertes Material in `guardian/`, `qa/` sowie ältere revisionsgebundene Audit-/Ledger-Dateien kann für Provenienz und Fehlerhistorie erhalten bleiben. Es ist **nicht normativ** und wird nicht mehr als primäre GitBook-Navigation veröffentlicht.

Bei Widerspruch gilt:

```text
current code/runtime evidence
+ ARCHITECTURE_OWNERSHIP.md
+ current WASD rule binding
> historical report / old migration note
```

## Dokumentationsregel

Neue Dokumente müssen klar sagen, ob sie

- normative Architektur,
- aktuelle Implementierung,
- revisionsgebundene Evidence oder
- historische Evidence

beschreiben. Undatierte alte Produktpläne oder TODO-Listen werden nicht als Dokumentation weitergeführt.
