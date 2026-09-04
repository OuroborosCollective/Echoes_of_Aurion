# AIM-249 — Deterministic Balancing Lab (candidate pending Wolfram replay)

Status: **candidate model, not final gameplay authority**  
Ruleset: `aurion-balancing-candidate.v1`  
Normative progression source: `server/wasdAurionSkillProgressionProtocol.ts`

## Evidence status

Three independent Wolfram surfaces were invoked on **4 September 2026**:

1. Wolfram Context
2. Wolfram Language evaluator
3. Wolfram|Alpha

All three returned an external upstream **HTTP 502**. Therefore this document does **not** claim a completed Wolfram computation. The exact arithmetic and sensitivity tables below were generated deterministically from the checked-in WASD formulas and are intended as the replayable candidate input for a later Wolfram verification.

No value in this document grants XP, rolls loot, changes prices, mutates combat, or deploys a runtime. Final adoption requires a later versioned decision after the independent replay.

## 1. Unbounded WASD progression

The progression physics remains unchanged:

```text
XP_next(L) = floor(50 × L^(7/5))
```

The repository implementation evaluates the expression with arbitrary-precision integers as a fifth root of `50^5 × L^7`. No `Number` value is authoritative.

For every integer `L ≥ 1`, the unrounded function increases by more than 50 between adjacent levels; therefore flooring cannot introduce a plateau. The curve is strictly increasing. Its cumulative asymptotic growth is:

```text
XP_total(L) ~ (125 / 6) × L^(12/5)
```

### Candidate pacing layer

Pacing does not alter the XP curve. It proposes a target count of accepted, server-receipted actions:

```text
A_base(L) = 20 + 12 × floor(sqrt(max(0, L − 1)))
A_scope(L) = ceil(A_base(L) × scopePacingBps / 10000)
XP_per_action(L, scope) = ceil(XP_next(L) / A_scope(L))
```

| Level | XP next | Cumulative XP | Weapon actions | Time @ 4/min | Profession actions | Recipe actions | Social actions | Politics actions |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 50 | 0 | 20 | 5.00 min | 18 | 14 | 22 | 26 |
| 10 | 1255 | 4613 | 56 | 14.00 min | 51 | 40 | 62 | 73 |
| 25 | 4529 | 44927 | 68 | 17.00 min | 62 | 48 | 75 | 89 |
| 50 | 11954 | 243073 | 104 | 26.00 min | 94 | 73 | 115 | 136 |
| 100 | 31547 | 1298706 | 128 | 32.00 min | 116 | 90 | 141 | 167 |
| 250 | 113785 | 11795664 | 200 | 50.00 min | 180 | 140 | 220 | 260 |
| 500 | 300281 | 62408240 | 284 | 71.00 min | 256 | 199 | 313 | 370 |
| 1000 | 792446 | 329789446 | 392 | 98.00 min | 353 | 275 | 432 | 510 |
| 2500 | 2858156 | 2975816240 | 608 | 152.00 min | 548 | 426 | 669 | 791 |
| 10000 | 19905358 | 82929036461 | 1208 | 302.00 min | 1088 | 846 | 1329 | 1571 |

Interpretation: a level remains reachable at every finite value; the time per level grows approximately with `sqrt(L)` at a constant validated event rate. High-level actions grant more exact XP, but they do not bypass the same receipt and anti-farm contract.

The log-log plot is stored at [`aim249-xp-curve.svg`](./aim249-xp-curve.svg).

### Scope pacing candidates

| Scope | Basis points | Meaning |
|---|---:|---|
| weapon | 10000 | baseline |
| profession | 9000 | broad profession develops slightly faster |
| recipe | 7000 | repeated recipe familiarity is faster than broad mastery |
| item | 6500 | specific object knowledge is the narrowest/faster scope |
| social | 11000 | requires more varied validated interactions |
| politics | 13000 | slowest, because consequences affect shared world authority |
| navigation | 8500 | exploration familiarity |
| gathering | 8500 | resource skill |
| combat action | 7500 | individual technique beneath weapon mastery |

These multipliers alter target event counts only. They do not create a second XP curve.

## 2. Anti-farm and anti-AFK boundary

Only accepted server receipts are eligible. The first five same-context repetitions retain full credit. Thereafter:

```text
repeatBps(r) = max(2000, floor(250000 / (25 + 2 × (r − 5))))
```

| Repetition streak | Multiplier bps | Credit |
|---:|---:|---:|
| 0 | 10000 | 100.00% |
| 5 | 10000 | 100.00% |
| 6 | 9259 | 92.59% |
| 10 | 7142 | 71.42% |
| 20 | 4545 | 45.45% |
| 50 | 2173 | 21.73% |
| 100 | 2000 | 20.00% |
| 1000 | 2000 | 20.00% |

The 20% floor means genuine repetitive practice never becomes negative or mathematically impossible. Anti-AFK validation remains a separate causal gate: active ticks, accepted source operation, distinct context, resource/target availability, and idempotency must be proven before this multiplier is applied.

## 3. Activity XP weights

Relative to one accepted baseline action:

| Activity | Weight bps | Baseline equivalents |
|---|---:|---:|
| normal mob | 10000 | 1.0 |
| elite mob | 30000 | 3.0 |
| world boss | 120000 | 12.0 |
| quest | 80000 | 8.0 |
| dungeon completion | 250000 | 25.0 |
| exploration | 12000 | 1.2 |
| gathering | 7000 | 0.7 |
| crafting | 9000 | 0.9 |

These are candidate reward budgets, not free grants. Mob, quest, dungeon, gather and craft rewards still require their own authoritative receipt.

## 4. Combat and region difficulty

Enemy health derives from a server-owned reference build:

```text
enemyHP = ceil(referenceDPS × targetTTK_ms / 1000)
enemyDPS = ceil(referenceEffectiveHP × 1000 / targetSurvival_ms)
```

Reference example below uses `100 DPS` and `9000 effective HP`.

| Tier | Target TTK | Target player survival | Armor bps | Pack | Example HP | Example outgoing DPS |
|---|---:|---:|---:|---:|---:|---:|
| normal | 8s | 90s | 500 | 1–4 | 800 | 100 |
| elite | 35s | 60s | 1500 | 1–2 | 3500 | 150 |
| boss | 180s | 45s | 2500 | 1–1 | 18000 | 200 |
| dungeon_boss | 300s | 35s | 3500 | 1–1 | 30000 | 258 |

### Weapon risk profiles

| Profile | DPS bps | Range | Resource cost bps | Risk bps | Mastery XP bps |
|---|---:|---:|---:|---:|---:|
| blade | 10000 | 2.5m | 10000 | 10000 | 10000 |
| arcane | 10500 | 18.0m | 12500 | 9000 | 9500 |
| marksmanship | 9800 | 24.0m | 10500 | 8500 | 10000 |
| heavy_tech | 11500 | 12.0m | 14000 | 12500 | 11000 |

DPS differences are deliberately narrow. Range, resource cost, exposure and mastery pacing carry the identity of each style; no class lock is introduced.

## 5. Profession and item mastery

AIM-248's exact owner rule is preserved:

```text
E = max(0, L − 49) / 1000 bonus batches
```

| Item mastery | Guaranteed bonus batches | Additional chance |
|---:|---:|---:|
| 49 | 0 | 0.0% |
| 50 | 0 | 0.1% |
| 1049 | 1 | 0.0% |
| 1050 | 1 | 0.1% |
| 2049 | 2 | 0.0% |

The carry never exceeds 100% because complete thousands become guaranteed batches and only the remainder is a probability.

Unbounded quality/mastery remains exact. Economy-facing projections use bounded diminishing returns already introduced in AIM-248:

- efficiency: at most +20%, half-saturation level 200;
- speed: at most +40%, half-saturation level 250;
- rare find: at most +5%, half-saturation level 200;
- quality combat/economy power: at most +30%, half-saturation quality 10000.

## 6. Diablo-style loot and bad-luck protection

Base eligible-roll distribution:

| Quality | Chance bps | Chance |
|---|---:|---:|
| normal | 7000 | 70.00% |
| magic | 2200 | 22.00% |
| rare | 700 | 7.00% |
| set | 80 | 0.80% |
| unique | 20 | 0.20% |

Total: exactly 10000 bps.

Bad-luck protection increases the relevant tier only after a miss threshold and forces a result at the hard attempt:

| Tier | Base bps | Starts after misses | Increment/attempt | Hard attempt | Expected eligible attempts |
|---|---:|---:|---:|---:|---:|
| rare | 700 | 15 | 250 | 45 | 11.363 |
| set | 80 | 40 | 80 | 160 | 43.624 |
| unique | 20 | 100 | 25 | 500 | 110.347 |

With duplicate protection for a three-piece set, the candidate model yields:

- expected eligible events: **130.872**
- hard maximum: **480**
- at six minutes per eligible set event: **13.09 h expected**, **48 h hard maximum**

The deterministic server roll still chooses the outcome. Pity state cannot be supplied by the browser.

## 7. Economy and old-region relevance

Candidate safety corridor:

```text
9200 ≤ sink/faucet bps ≤ 10800
net issuance ≤ 1000 bps of faucet
5000 ≤ price multiplier bps ≤ 25000
7500 ≤ old-region reward bps ≤ 25000
```

A region may become temporarily more valuable through scarcity, events, politics and mastery demand. It may not collapse below 75% solely because later regions exist, and its combined dynamic reward multiplier is capped at 250%.

## 8. Sensitivity and exploit boundaries

- **Overflow:** progression, quantities and cumulative XP remain canonical decimal/BigInt values.
- **AFK/replay:** no receipt or a repeated idempotency identity means no eligible award.
- **Same-target farming:** repetition converges to a nonzero 20% learning floor; economic output remains independently resource- and sink-bound.
- **Craft multiplication:** bonus batches retain the source operation and grant no recursive mastery XP.
- **Loot manipulation:** quality, pity counter, region, enemy tier and evidence digest are server-owned.
- **Politics spam:** the 13000-bps pacing plus causal world receipts makes political mastery slower than local item mastery.
- **Power explosion:** visible mastery is unbounded; combat/economy projections use saturating basis-point functions.
- **Old-area abandonment:** a bounded relevance floor plus dynamic scarcity/events keeps early materials and politics useful.

## 9. Machine-readable source

`shared/aurionBalancingCandidate.json` contains the exact representative table and all candidate constants. `server/aurionBalancingProtocol.ts` implements the deterministic analysis helpers. `server/aim249BalancingModel.test.ts` binds the JSON, formulas and existing AIM-248 carry checkpoints.

## 10. Completion boundary

This candidate is suitable for implementation discussion and deterministic replay. AIM-249 remains **not final** while the independent Wolfram surfaces return 502. A later update must either:

1. attach a successful Wolfram replay and reconcile any numerical disagreement; or
2. record an explicit owner-approved equivalent independent formal proof.

Until then the model remains versioned `candidate_pending_wolfram_replay` and cannot silently become production truth.
