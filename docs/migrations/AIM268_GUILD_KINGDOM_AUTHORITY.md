---
description: Aktueller Ownership-Vertrag für Gilden- und Königreichs-Gameplay.
---

# AIM-268 — WASD Guild/Kingdom Gameplay · Aurion Persistenz

Die ursprüngliche Migration normalisierte Gilden-/Kingdom-Daten in MariaDB. **Diese Persistenz macht Aurion nicht zur Gameplay-Authority.**

## Ownership

- **WASD**: Rollenwirkung, Capabilities im Gameplay, Diplomatie, Territorium, Kingdom-Konsolidierung, Hauptstadt-, Gebäude-, Treasury- und Politikregeln.
- **AX1**: Guild-/Kingdom-Spieloberfläche und Visualisierung.
- **Aurion**: Authidentität, Membership-/Receipt-Persistenz, Transport und read-only Website-/Account-Projektion.

## Target flow

```text
AX1 guild/kingdom intent
→ WASD validation + deterministic governance rule
→ confirmed governance receipt
→ Aurion MariaDB persistence
→ AX1 gameplay projection / Aurion read-only account projection
```

## Migration 0029

`0029_aurion_guild_kingdom_authority` bleibt eine Persistenz-/Evidence-Struktur. Tabellen, Locks, revisions- und idempotenzgebundene Receipts sind weiterhin sinnvoll. Fachliche Regeln wie „sechs Territorien“, Adjazenz, Hauptstadtwahl oder Rollenwirkung dürfen aber nicht als Aurion-eigene Wahrheit weitergeführt werden; sie müssen aus dem gebundenen WASD-Ruleset stammen.

## Website boundary

Aurion darf auf Konto/Community anzeigen:

- Gildenname und Kürzel;
- Mitgliedschaft und Rolle;
- bestätigte read-only Kingdom-/Territory-Zusammenfassungen, wenn eine WASD-Projektion vorhanden ist.

Aurion Website/Admin/MCP darf keine Einladung mit Gameplayfolge, Territory-Transition, Kingdom-Konsolidierung, Treasurywirkung oder Gebäuderegel ausführen.

## Required regressions

- Aurion route surface enthält keine Guild-/Kingdom-Gameplaymutation;
- WASD entscheidet gleiche Inputs deterministisch;
- Aurion persistiert exakt das bestätigte Receipt;
- stale/fremde Membership-/Territory-/Kingdom-Receipts fail-closed;
- AX1 visualisiert, erzeugt aber keine Ownership;
- DB-/Browser-Grün ersetzt keinen WASD-Regelbeleg.
