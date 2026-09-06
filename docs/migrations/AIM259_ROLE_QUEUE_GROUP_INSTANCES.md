---
description: Aktueller Ownership-Vertrag für Party-, Queue- und Dungeon-Instanzen.
---

# AIM-259 — WASD Party/Queue/Dungeon · AX1 UI · Aurion Persistenz

Dieses Dokument ersetzt die frühere Beschreibung, nach der Aurion selbst Gruppen matcht, Heal/Strike berechnet oder Instanzen simuliert.

## Ownership

| Teil | Eigentümer |
| --- | --- |
| Queue-, Rollen-, Matching-, Ready-, Rejoin- und Instance-Regeln | **WASD** |
| Boss-/Player-HP, Strike, Heal, Dungeonablauf und Rewards | **WASD** |
| Dungeon-/Group-HUD, Finder, Ready-/Rejoin-UI | **AX1** |
| Authidentität, Transport, Ticket-/Receipt-Persistenz, read-only Account/Community-Anzeige | **Aurion** |

## Zielzustand

```text
AX1 queue/group intent
→ WASD qualification + deterministic matching/instance rule
→ confirmed party/instance receipt
→ Aurion persistence/transport
→ AX1 read-only group/instance projection
```

Aurion darf keinen Spieler wegen eigener Regeln einer Rolle zuordnen, keine Gruppe matchen und keinen Dungeonzustand verändern.

## Heilerregel

Die fachliche Regel, dass ein ausgerüsteter Heil-Skill die Heilerrolle unabhängig von Klasse/Waffe ermöglicht, gehört in WASD. Aurion darf das bestätigte Ergebnis speichern und anzeigen.

## Legacy-Persistenz

Die vorhandenen `0032`-Tabellen und bisherigen Group-Readmodels sind als Persistenz-/Evidence-Fläche nutzbar, soweit sie keine fachlichen Regeln enthalten. Alte Aurion-Helper, die Matching, Combat oder Dungeon-Transitions selbst berechnen, sind bei der nächsten Berührung zu WASD zu migrieren.

## Required regressions

- Aurion Website/Admin/MCP besitzt keine Group-/Dungeon-Mutation;
- AX1 sendet nur Intents;
- WASD bestimmt Rollenqualifikation, Matching und Instance-State;
- identischer WASD-Input/Seed/Sequence -> identischer Party-/Instance-State;
- Aurion-Receipt-Readback stimmt mit WASD-Output überein;
- stale/fremde/malformed receipts fail-closed;
- Browserdarstellung und DB-Persistenz ersetzen keinen WASD-Regelbeleg.

## Evidence

Ältere AIM-259 CI-/MariaDB-/Browserberichte bleiben historische Evidence ihrer Revision. Sie belegen nicht automatisch den neuen Ownership-Zielzustand, wenn der getestete Code Aurion selbst fachliche Group-/Dungeon-Regeln ausführen ließ.
