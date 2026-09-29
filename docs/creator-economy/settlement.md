---
description: Trennung von World Ledger, Creator Pool und Creator Royalty Ledger.
---

# Creator Royalty Settlement

## Drei Ledger

### 1. World Ledger

Enthält AUR-Vermögen und Transfers der persistenten Spielwelt.

### 2. Creator Pool Ledger

Enthält die real monetarisierte Settlement-Basis, aus der Creator Claims bedient werden können.

### 3. Creator Royalty Ledger

Enthält die individuellen, receipt-backed Ansprüche eines Creators.

Diese Ebenen dürfen nicht als ein gemeinsamer Kontostand modelliert werden.

## Claim Identity

Ein Claim muss mindestens an folgende Identitäten gebunden sein:

- creatorId
- artifactId
- artifactRevision
- economicEventId
- causalReceiptRoot
- attributionRuleRevision
- settlementPeriod

## Idempotenz

Wiederholte Verarbeitung desselben Economic Events darf keinen doppelten Claim erzeugen.

Korrekturen erfolgen append-only als Gegenereignis bzw. Reversal und überschreiben keine historische Receipt-Evidence.

## Präzision

Geld-/Währungswerte werden als deterministische Integer-/Fixed-Point-Werte gespeichert. Rundung muss versioniert und reproduzierbar sein.

## Settlement Boundary

Die Creator Economy darf den kanonischen Weltzustand lesen und Claims ableiten, darf aber nicht über Billing/Settlement selbst Gameplay-Truth schreiben.
