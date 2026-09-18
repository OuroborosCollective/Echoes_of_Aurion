---
description: "Wave 2 Step 22: deterministic, evidence-only World Causal Root for Aurion."
---

# World Causal Root — Step 22

The **World Causal Root** is an evidence surface. It never owns or mutates gameplay truth. Aurion remains the sole authority for world state and epoch progression.

## Evidence chain

```text
Zone Tick Receipt
  -> Zone Epoch Root
  -> World Causal Root
```

A world root contains the world id, epoch, observed source revision, ruleset version, canonically sorted zone roots, the previous world root, and the resulting SHA-256 root.

The live expected-zone set is derived from the causal runtime, not from the broader region/content catalog. At Step 22 the authoritative zone protocol exposes `observatory_threshold`; content-only regions are not silently promoted into causal runtime zones.

## Fail-closed rules

A result is `UNPROVABLE` when required evidence is missing or contradictory. In particular:

* expected zone evidence is missing;
* unexpected or duplicate zone evidence is supplied;
* a zone receipt chain is discontinuous;
* world, source revision, or ruleset identity does not match;
* the runtime source revision is not an observed 40-character Git SHA;
* the previous world root cannot itself be proven.

`UNPROVABLE` is evidence state only. It does not roll back or rewrite gameplay state.

## Persistence

No new migration is used for Step 22. The current migration journal head was read as `0050_aurion_human_ai_authoring`, and the already-shipped `aurionGlobalStateProofs` evidence table is reused. Migrations 0048–0050 remain unchanged.

The global epoch resolver writes the evidence result in the same MariaDB transaction as the world epoch receipt. This makes the evidence snapshot transaction-consistent without making evidence an authority.

## Reproducible verification

Targeted contract test:

```bash
pnpm exec vitest run server/causality/worldCausalRootService.test.ts
```

Causality regression:

```bash
pnpm exec vitest run server/causality
```

Replay regression:

```bash
pnpm exec vitest run server/causality server/replayVerdictContract.test.ts server/questCompiler/replay.test.ts server/worldContext/replay.test.ts
```

Independent deterministic fixture readback:

```bash
pnpm exec tsx scripts/read-aurion-world-root.ts --fixture fixtures/causality/aurion-world-root-step22.json
```

The fixture mode proves deterministic calculation only and is never production evidence.

Runtime/database readback:

```bash
pnpm exec tsx scripts/read-aurion-world-root.ts --world echoes-of-aurion-global --epoch <epoch>
```

Runtime mode reads persisted MariaDB evidence and independently recomputes the referenced zone ranges. Exit codes are:

* `0` — `MATCH`
* `1` — `FIRST_DIVERGENCE`
* `2` — `UNPROVABLE`
* `64` — invalid CLI arguments

## Operational boundary

Do not infer `VERIFIED` from a green CI label, from a stored hash alone, or from a fixture. A verified result requires the stored root to validate and the referenced causal zone receipt ranges to recompute to the same root.


## Step 22 dependency record

- **A1:** causal tick receipt v2 and replay contracts are the source zone evidence; no donor runtime is consulted.
- **A2:** branch base was `6ed0259076e6c261175bdae87020da70d3f2f421`; the production truth anchor `3967f3ac6161dc986bd042e17a92052dd395862f` differed only by the previously published documentation commit.
- **A3:** expected live causal zones are derived from the actual zone runtime; at this step that set is exactly `observatory_threshold`.
- **A4:** canonical hashing is `shared/aurionCanonicalHash.ts`; world, revision and ruleset identities are bound into every zone root and world root.
- **A5:** persisted readback uses `aurionCausalTickReceipts` and `aurionGlobalStateProofs`; the MariaDB E2E test independently recomputes the persisted root.

## Step 22 risk register

| Risk | Impact | Detection | Mitigation | Residual risk |
| --- | --- | --- | --- | --- |
| R1 serialization drift | different roots for identical evidence | deterministic contract + fixture tests | canonical JSON/SHA-256 and sorted zone IDs | schema-version changes require a new contract |
| R2 missing zone silently omitted | false VERIFIED world root | missing-zone negative test | expected-zone membership fails closed | future zone activation must update the live causal-zone contract |
| R3 order dependence | nondeterministic root | reversed-zone-order test | canonical zone sorting | none inside v1 inputs |
| R4 previous-root not bound | broken history chain | previous-root mutation test | previous root is part of the hashed payload | legacy proofs are ignored rather than promoted |
| R5 evidence becomes authority | gameplay mutation from observer result | code review, `mutationAuthority: "none"`, runtime tests | epoch authority remains in `resolveAndRecordGlobalWorldEpoch`; root is written as evidence only | operational consumers must keep this boundary |
| R6 migration collision | schema drift / damaged history | migration-chain CI | no migration; existing proof table reused; 0048–0050 untouched | later schema needs a fresh journal read |

## Pre-Memory exact-head evidence

Exact technical head `d18ea5a7137d266331dbb112e3e87356ba7b6191` passed:

- Aurion Local Test Pack run `35361770356`: targeted Step 22 contract/causality/replay, MariaDB root readback, typecheck/classless and full repository regression.
- Aurion PR Runtime Candidate run `35361770479`: exact-source immutable candidate build/boot and revision-bound evidence.
- Aurion PR Runtime Container Proof run `35361770193`: exact-head build, pinned-MariaDB boot, health and immutable runtime evidence.

The required Memory entry is intentionally appended only after these pre-Memory gates. Merge and post-merge readback remain separate evidence and are not inferred from this section.
