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
