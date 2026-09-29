---
description: Aurion Creator Economy — Shared World, deterministische Attribution und reales Creator-Settlement.
---

# Aurion Creator Economy

Aurion ist eine einzige persistente Shared World. Creator erzeugen Inhalte und autonome Charaktere, die Teil dieser gemeinsamen Welt werden können. Der Creator erhält dadurch keine Eigentumsrechte an Königreichen, Territorien, NPC-Populationen, Spielercharakteren oder Weltvermögen.

Stattdessen kann ein Creator einen Creator Royalty Right an einem konkreten, versionierten Content Artifact erhalten. Ein solcher Anspruch entsteht ausschließlich aus nachweisbarer kausaler Beteiligung an eligible Economic Events.

## Wirtschaftliche Trennung

```
WORLD WEALTH
  Spieler / NPC / Gilde / Staat / Treasury
             |
             | Economic Events
             v
       Causal Receipts
             |
             v
       Attribution Engine
             |
             v
CREATOR POOL  ---> CREATOR ROYALTY LEDGER ---> SETTLEMENT
```

World Wealth und Creator Settlement sind getrennte ökonomische Ebenen.

## Shared World Canonicality

**ACCOUNT ENTITLEMENT != WORLD TRUTH**

Accountrechte können Zugriff, Lizenzierung oder persönliche Präsentation steuern. Sobald ein Content Artifact den kanonischen Weltzustand beeinflusst, existiert dieser Zustand einmal und gilt für alle Spieler.

## Creator-NPC

Ein Creator Artifact kann einen autonomen NPC mit deterministischen Persönlichkeit-, Ziel- und Entscheidungsregeln beschreiben. Der NPC kann im Laufe der Weltgeschichte handeln, wirtschaften, Organisationen gründen, Gefolgsleute gewinnen oder politische Macht aufbauen.

Auch bei emergenter Herrschaft bleibt die Welt-Authority bei Aurion. Der Creator besitzt nicht automatisch das entstandene Königreich oder dessen Treasury.

## Kausale Chain

```
Creator Definition
 -> Character Compiler
 -> Canonical Character Artifact
 -> Activation
 -> NPC / World Action
 -> Economic Event
 -> Causal Receipt
 -> Replay / Readback
 -> Deterministic Attribution
 -> Creator Pool Allocation
 -> Royalty Claim
 -> Settlement
```

## Grundsätze

- deterministische Inputs und versionierte Rules
- stabile Sortierung und Tie-Breaks
- Receipt-/Replay-Bindung
- Conservation der Attribution
- Append-only Provenance
- Idempotenz
- Fail-Closed bei fehlender Evidenz
- keine neue Gameplay- oder World-Authority durch Billing

## AUR und reales Geld

AUR ist die In-Game-Währung. Reales Geld, z. B. EUR, ist Settlement-Mittel. Ein Gameplay-Multiplikator darf nicht automatisch eine höhere Fiat-Verbindlichkeit erzeugen.

Eine konkrete Auszahlung setzt eine separat definierte, verifizierte Settlement-Policy voraus.

## Assurance States

Creator-Attribution kann mindestens folgende Zustände verwenden:

- VERIFIED
- DEGRADED
- UNVERIFIED
- CONTRADICTED
- UNPROVABLE

Ein Assurance-Score ersetzt keine fehlende Evidenz.
