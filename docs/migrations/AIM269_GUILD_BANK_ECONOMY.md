---
description: Aktueller Ownership-Vertrag für Gildenbank und Staatsökonomie.
---

# AIM-269 — WASD Guild Bank/Economy · Aurion Custody/Ledger

Die vorhandene Migration `0030_aurion_guild_bank_economy` ist eine Persistenz-/Custody-Fläche. **Bank-, Treasury-, Resource-, Building- und Economy-Regeln gehören WASD.**

## Ownership

- **WASD**: Deposit-/Withdraw-Effekt, Treasuryregeln, Resource Consumption, Building Costs/Effects, Economy-/Sink-Regeln und alle Gameplay-Capabilities.
- **AX1**: Bank-/Guild-/Kingdom-Gameplay-UI.
- **Aurion**: Authidentität, Membership-Readback, exklusive Item-Custody, Ledger-/Receipt-Persistenz und read-only Website-Projektion.

## Target flow

```text
AX1 bank/economy intent
→ WASD capability + economy rule
→ confirmed transfer/build receipt
→ Aurion atomic custody/ledger persistence
→ AX1 gameplay projection
```

## Persistenzinvarianten

Aurion darf und muss die Speicherung technisch absichern:

- ein Item ist nie gleichzeitig Player- und Guild-Custody;
- idempotente Receipts und Revisionen;
- atomare Transaktionen/Locks;
- stale/fremde Ownership wird abgelehnt;
- Ledger und Readback stimmen mit dem bestätigten WASD-Receipt überein.

Diese Invarianten schützen Speicherung. Sie ersetzen nicht die WASD-Regel, **ob** eine Gameplayoperation zulässig ist und welche Wirkung sie besitzt.

## Website boundary

Aurion darf Gildenzugehörigkeit und bestätigte read-only Zusammenfassungen anzeigen. Website/Admin/MCP darf keine Banktransaktion, Resource Donation, Building Upgrade, Treasurywirkung oder Economyregel ausführen.

## Legacy note

Frühere Aurion-Services, die Salden, Baukosten, Bonuswirkungen oder Economyoutcomes selbst berechnen, sind Migrationsschuld. Bei Berührung werden die Regeln nach WASD verschoben; MariaDB bleibt Custody/Evidence.

## Required regressions

- kein Aurion Web/Admin/MCP gameplay bank write;
- WASD-Regel entscheidet Outcome;
- Aurion-Persistenz ist once-only und atomar;
- replay/stale/foreign item/capability mismatch fail-closed;
- AX1 ist reine Interaktions-/Darstellungsschicht;
- ein DB-Readback allein beweist keine korrekte WASD-Economyregel.
