# Headless Causal Oracle V2 — Step 25

## Zweck

Der Headless Causal Oracle V2 beantwortet eine einzige Frage: **Kann Aurion einen aufgezeichneten Tick-Bereich aus persistierter kausaler Evidence deterministisch reproduzieren?**

Der Oracle ist ausschließlich Evidence. Er besitzt keine Gameplay-Authority, schreibt keine World-State-Mutation und darf weder Recovery noch External Effects auslösen.

## Warum V2

Die kausale Persistenz speichert bewusst keine vollständige Snapshot-Kopie für jeden Tick. Ein Checkpoint existiert am Anfang und anschließend nur an gebundenen Intervallen. Der ältere Range-Replay-Pfad versuchte dagegen für jeden Tick einen Checkpoint bei `tick - 1` zu lesen. Ein fehlender Zwischencheckpoint machte deshalb auch dann einen Bereich nicht beweisbar, wenn ein älterer Checkpoint plus die vollständige Receipt-/Intent-Kette vorhanden waren.

V2 rekonstruiert stattdessen vorwärts:

```text
latest checkpoint <= fromTick - 1
        ↓
checkpoint hash verification
        ↓
optional anchor receipt
        ↓
warm-up ticks
        ↓
requested ticks
        ↓
MATCH | FIRST_DIVERGENCE | UNPROVABLE
```

## Evidence-Grenzen

Der Oracle prüft:

- Checkpoint-Scope und Snapshot-Hash;
- lückenlose Tick-Sequenz;
- `previousReceiptHash`-Kette;
- konstante Source-Revision und Ruleset-Version;
- persistierte Intents für jeden re-executierten Tick;
- Receipt-v2 Authority-Stages in ihrer bestehenden kanonischen Reihenfolge;
- Post-State und Receipt-Hash;
- einen deterministischen Oracle-Result-Hash.

Er prüft **nicht** Projection, Transport, Provider-Delivery oder Clientdarstellung.

Eine Evidence-Lücke wird nicht interpoliert. Fehlender Checkpoint, fehlendes Receipt, fehlende Intents oder gemischte Revisionen ergeben `UNPROVABLE`. Eine belegte Hash-/Stage-Abweichung ergibt `FIRST_DIVERGENCE`.

## Read-only-Vertrag

`AurionHeadlessCausalOracle.replayRange(...)` verwendet ausschließlich:

- `getCheckpointAtOrBefore`;
- `getTicksInRange`;
- den bestehenden reinen `replayZoneTick`.

Der Oracle ruft keine Save-/Update-Methode auf. Der MariaDB-Step-25-Test zählt Causal Receipts, Checkpoints und Replay-Run-Zeilen vor und nach dem Oracle-Aufruf und verlangt identische Bestände.

## Bounded Replay

Ein Request darf maximal 250 Ziel-Ticks umfassen. Einschließlich Warm-up sind maximal 350 re-executierte Ticks erlaubt. Ein zu alter Checkpoint erzeugt `UNPROVABLE` statt ungebundener Arbeit.

## Readback

CLI:

```bash
pnpm exec tsx scripts/oracle-aurion-zone.ts \
  --zone observatory_threshold \
  --from-tick 3 \
  --to-tick 4
```

Exit Codes:

- `0` — MATCH
- `1` — FIRST_DIVERGENCE
- `2` — UNPROVABLE / Evidence nicht lesbar
- `64` — ungültiger Aufruf

Admin/API und ChatGPT erhalten dieselbe read-only Oracle-Semantik. `mutationAuthority` bleibt immer `none`.

## Donor-Grenze

Historische WASD-Oracle-Dateien bleiben ausschließlich Provenienz-/Research-Material. Step 25 importiert keine WASD-Runtime und baut keine zweite Authority auf. Die Ausführung erfolgt vollständig aus Aurions eigenen persistierten Receipts, Intents, Checkpoints und Replay-Verträgen.

## Migration

Step 25 benötigt keine neue Datenbankmigration. Journal-Head bleibt `0052_aurion_effect_intent_journal`.
