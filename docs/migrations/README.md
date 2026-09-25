---
description: Historische AX1/WASD-Provenienz und Aurion-Migrationsnachweise.
---

# Migrationsdokumentation

Alle Migrationsdokumente unterliegen [ARCHITECTURE_OWNERSHIP.md](../../ARCHITECTURE_OWNERSHIP.md).

## Aktueller Grundsatz

**Aurion ist der einzige Owner.**

AX1 und WASD sind historische Donor-/Provenienzquellen. Bereits übernommener Code ist Bestandteil der Aurion-Runtime und folgt ausschließlich Aurion-Verträgen, Aurion-Persistenz, Aurion-Receipts und Aurion-Readback.

Eine Migration überträgt Code und Herkunft — **keine aktuelle Authority**.

## Aktive Verträge

- [Architektur: Aurion Single Authority](../../ARCHITECTURE_OWNERSHIP.md) — verbindliche Truth-Boundary.
- [Aktuelle Source-Provenienz](CURRENT_SOURCE_PROVENANCE.md) — Herkunftsnachweis für bereits migrierte Bausteine.
- Weitere AIM-Dokumente dürfen technische Migrationsdetails, historische Revisionen, Hashes und Regressionen dokumentieren.

## Historische Dokumente

AIM-252, AIM-239, AIM-259, AIM-267, AIM-268, AIM-269 und AIM-292 enthalten teilweise ältere Ownership-/Source-Formulierungen. Sie bleiben als historische Evidence erhalten, sind aber **nicht normativ**.

Wenn ein historisches Dokument beschreibt, dass WASD Gameplayregeln besitzt oder AX1 ein kanonischer Game-Owner ist, ist das lediglich der damalige Migrationsstand.

## Regel bei Widerspruch

Bei einem Widerspruch gilt in dieser Reihenfolge:

1. aktueller Aurion-Code und seine Tests,
2. [ARCHITECTURE_OWNERSHIP.md](../../ARCHITECTURE_OWNERSHIP.md),
3. aktueller Runtime-/DB-Readback,
4. erst danach historische Source-/Migrationsevidence als Provenienz.

Keine Legacy-Quelle erhält daraus neue Rechte oder Pflichten.
