---
description: "Wave 2 Step 24: deterministic EffectIntent outbox with replay-safe external delivery."
---

# Effect Intent Journal — Step 24

Aurion gameplay authority never performs irreversible external effects directly. Authority produces a deterministic EffectIntent bound to a real causal receipt. Delivery is handled by a separate worker and remains side-channel evidence.

## Identity

`effectId = Hash(authorityReceiptHash, effectType, subjectId, ordinal)`

Payload content is hashed separately. Reusing the same effect identity with a different payload is an idempotency conflict.

## Delivery states

`PENDING`, `DELIVERED`, `FAILED`, `RETRYABLE`, `PERMANENT_FAILURE`.

Delivery state is never gameplay truth.

## Replay boundary

Replay recomputes the same EffectIntent identity but runs the worker in `REPLAY` mode, which performs no provider call and writes no delivery receipt.

## Exactly-once logical effect

The worker locks one persisted intent row while selecting an attempt. Every provider call receives `effectId` as its idempotency key. Duplicate workers serialize; a completed effect is skipped. Providers must honor the same key across process crashes to close the post-provider/pre-commit crash window.

## Security

Secret-like payload field names such as password, token, secret, authorization, cookie and API key are rejected before persistence. Provider receipts are stored only as SHA-256 hashes; provider payloads and credentials do not enter evidence.

## Persistence

Migration `0052_aurion_effect_intent_journal` adds:

- `aurionEffectIntents`
- append-only `aurionEffectDeliveryReceipts`

Delivery-receipt update/delete triggers preserve the historical attempt chain.

## Verification

```bash
pnpm exec vitest run server/effects/aurionEffectJournal.test.ts
NODE_ENV=test AURION_EFFECT_E2E=1 pnpm exec vitest run server/effects/aurionEffectJournalMariaDb.test.ts
pnpm exec tsx scripts/read-aurion-effect-intent.ts --effect-id <sha256:id>
```

The MariaDB suite proves duplicate-worker serialization, retry chaining, permanent failure without gameplay mutation, replay with zero provider calls and persisted readback.

The admin Causality surface exposes only `causality.explainEffectIntent`; it does not expose effect execution.
