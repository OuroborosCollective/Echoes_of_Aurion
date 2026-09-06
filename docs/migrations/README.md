---
description: Index und Regeln für aktuelle AX1/WASD/Aurion-Migrationsdokumente.
---

# Migrationsdokumentation

Alle Migrationsdokumente unterliegen [ARCHITECTURE_OWNERSHIP.md](../../ARCHITECTURE_OWNERSHIP.md).

## Verbindliche Zuordnung

- **WASD**: Gameplayregeln und Simulation.
- **AX1**: Spielruntime, UI, Renderer, Input und Presentation Content.
- **Aurion**: Host, Auth/Account, Community/Forum/Events, Assets/Ops, MariaDB-Persistenz, Transport und read-only Readmodels.

Eine Migration darf niemals „Integration“ mit „Ownership“ verwechseln. Wenn eine historische Migration eine fachliche Regel in Aurion implementiert hat, ist diese Implementierung Migrationsschuld und bei Berührung auf WASD zurückzuführen.

## Aktuelle Verträge

- `AIM252_WASD_NORMATIVE_RULESET.md` — normative Gameplayquelle.
- `AIM239_AX1_RECONCILIATION_MATRIX_2026-09-05.md` — revisionsgebundene AX1-Source-Provenienz.
- `AIM267_AX1_CONTENT_CATALOG.md` — Content-/Asset-Katalog; keine Gameplayregel.
- `AIM259_ROLE_QUEUE_GROUP_INSTANCES.md` — Group/Dungeon Ownership-Ziel.
- `AIM268_GUILD_KINGDOM_AUTHORITY.md` — Guild/Kingdom Ownership-Ziel.
- `AIM269_GUILD_BANK_ECONOMY.md` — Bank/Custody/Economy Ownership-Ziel.

## Historische Ledgers

Ältere `WASD_AURION_*`, `AIM239_*_2026-09-04`, Audit- und Automatisierungsdokumente dürfen als Provenienz im Repository bleiben. Sie sind **nicht normativ** und werden nicht in der aktuellen GitBook-Navigation veröffentlicht.

## Abschlussregel

Eine Lane endet erst nach passender Evidence, Merge, `main`-Readback und 0 offenen PRs. Danach darf die nächste Lane beginnen.
