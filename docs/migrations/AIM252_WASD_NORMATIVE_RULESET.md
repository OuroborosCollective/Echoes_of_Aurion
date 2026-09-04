# AIM-252 — Arelorian/WASD Normative Ruleset for Aurion ↔ -ax1 migration

Status: **normative migration contract**. This document defines the gameplay and determinism source of truth for the remaining AIM-239 migration lanes. It is not a deployment gate and does not claim production parity.

## Revision binding

| Role | Repository | Exact revision |
|---|---|---|
| Normative gameplay + determinism | `OuroborosCollective/Wasd` | `7bd039bb79681d2df342abe160579f89ca3ff8ed` |
| Canonical engine implementation source | `OuroborosCollective/-ax1` | `b9a0c19cb3d2d34212075983e64891274489e32a` |
| Aurion integration baseline | `OuroborosCollective/Echoes_of_Aurion` | `0efe9efa729c922cf4255b4f190bd7093f22439b` |

Normative WASD documents:

- `docs/ISSUE_2070_DETERMINISTIC_SIMULATION_CONTRACT.md`
- `docs/ARELORIAN_GAMEPLAY_SYSTEM_CONTRACTS.md`
- `agent/ARELORIAN_SUPER_PROMPT.md`

Existing source reconciliation:

- `docs/migrations/AIM239_AX1_RECONCILIATION_MATRIX_2026-09-04.md`
- `docs/migrations/aim239-source-baseline.json`

## Authority hierarchy

1. **Arelorian/WASD** defines gameplay semantics, deterministic ordering and server-authoritative mutation rules.
2. **Echoes_of_Aurion** owns production identity, auth/session, zone tickets and movement authority, MariaDB persistence, audio, tower/housing transitions and the production runtime.
3. **-ax1** contributes engine/gameplay implementation modules only when adapted behind the first two authorities.
4. **Client/renderer** projects canonical state and emits intents. It is never a second gameplay truth.

Canonical path:

```text
client intent
  -> Aurion/WASD server canonicalization + validation
  -> ordered logical tick
  -> authoritative mutation
  -> canonical event/snapshot
  -> persistence where required
  -> read-only -ax1/Aurion rendering
```

## Normative rule mapping

| WASD normative rule | -ax1 implementation source | Aurion authoritative integration boundary | Acceptance target in follow-on migration |
|---|---|---|---|
| Client provides intent, never actor/tick/hash authority | `engine/net/MultiplayerClient.ts`, `ClientPredictionReconciliation.ts`, source multiplayer scaffolding | Aurion auth/session + `ZoneMovementClient`/zone-ticket boundary supplies identity and accepted movement context | AIM-242/AIM-244: client-supplied identity/tick/order fields rejected; server snapshot wins reconciliation |
| Tick identity is logical; wall-clock is not gameplay truth | `engine/simulation/FixedTimestepLoop.ts`, `engine/math/DeterministicPRNG.ts`, weather/economy systems | Aurion adapter exposes a server-owned logical tick/seed context to imported systems | AIM-243: same ordered intents + seed => same authoritative outcome |
| Mutation occurs after canonical server validation | MMO engine, combat, economy, crafting, NPC systems | No -ax1 client/standalone endpoint may mutate production truth directly | AIM-242–AIM-251: gameplay-changing paths terminate in Aurion/WASD-authoritative server mutation |
| Snapshot/event is the render boundary | `SyncManager.ts`, binary snapshot/delta modules, HUD/economy UI | Aurion emits canonical snapshot/event; -ax1 consumes it read-only | AIM-253: renderer cannot invent missing live state or write gameplay facts back |
| World hash/evidence describes canonical simulation state, not UI state | deterministic PRNG/simulation/debug modules | Hash inputs come from authoritative tick/state only; render telemetry is excluded | AIM-254 only: replay/property verification after migration is complete |
| Gather → process → sell → earn → equip → improve is the early-game loop | economy, trade, equipment, crafting and loot modules | Aurion/WASD validates node/station/vendor/range, inventory and resulting state | AIM-245/AIM-248/AIM-251: complete persisted loop with server-approved inventory/economy state |
| Loot and equipment are server-authoritative | `LootDropManager.ts`, equipment visuals, ascension/buff systems | -ax1 may calculate/render only behind accepted server loot/equipment state | AIM-246: no client-selected drop, set bonus, damage or equipment mutation |
| NPC/world actions are real world state, not preview simulation | NPC economy, memory, FSM, caravans, pathfinding | NPC decisions execute in ordered server simulation and publish canonical state | AIM-245: NPC trade/memory/social/politics effects persist and survive reload |
| Persistent browser MMORPG, not a prototype façade | terrain/chunks/weather/LOD/NPC/economy/multiplayer modules | Aurion remains the single hosted world/session/persistence runtime | AIM-243–AIM-253: systems integrate into one persistent world rather than parallel demos |

## Explicit conflict resolution

The following -ax1 source behavior is **rejected or adapted** whenever it conflicts with WASD/Aurion:

### Identity and multiplayer

Reject source-form trust in query/client-provided player identity. Aurion session/user identity and zone authorization are mandatory. Prediction may hide latency but can never become authoritative state.

### Persistence

Reject production use of source `/api/player/save`, `/api/database/configure`, `/api/world/chunks`, raw client `DATABASE_URL`, direct browser persistence of world truth, or any parallel write-behind path fed by unvalidated client values. MariaDB state changes flow through Aurion-owned server services.

### Time and randomness

Reject `Date.now()`, frame rate, browser time or nondeterministic RNG as gameplay truth. Visual-only time is allowed only when it does not affect canonical state. Gameplay RNG must be server-owned and reproducible from the authoritative deterministic context.

### Combat

`LagCompensation.ts`, ballistics, LOS, threat and collider code are implementation material, not authority. Hits, damage, buffs, threat transitions and rewards must be accepted by the server simulation before they affect state.

### Economy and NPCs

Autonomous NPC economy, trade, quests, caravans, memory, genealogy/social/politics logic may generate candidate actions. They may not bypass the same canonical validation/mutation ordering that applies to player intents.

### UI and debug overlays

HUD, economy panels and determinism overlays are projections only. Synthetic server mirrors, preview data or local fallbacks must be visibly non-live and cannot satisfy a gameplay migration task.

### Audio

No second `AudioContext` authority is introduced by -ax1. Aurion's existing `aurion:audio-cue` surface remains the integration boundary.

## Owner-vision extensions belong inside the WASD rulespace

The following capabilities are migration requirements, not separate parallel systems:

- unbounded mastery for repeated actions;
- profession-specific mastery;
- recipe/item-specific crafting mastery;
- classless weapon mastery;
- social and political competency progression;
- long-running yield/quality learning curves;
- Diablo-like loot/set interactions without class-locking;
- regions/dungeons that remain useful through scaling rather than becoming obsolete.

They are implemented in AIM-246 through AIM-250 by extending the same authoritative progression/economy contracts. Balancing parameters may later be checked by Wolfram in AIM-249, but Wolfram does not become a runtime authority.

## Migration sequence

The remaining migration proceeds in this order:

1. **AIM-242 Authority Adapter** — connect Aurion identity/session/zone/persistence/audio/tower boundaries to the imported engine.
2. **AIM-243 Engine/World Core** — fixed tick, deterministic RNG, terrain, chunks, weather, vegetation, LOD.
3. **AIM-244 Combat/Networking** — authoritative multiplayer, FSM, threat, pathfinding, hit validation, prediction/reconciliation.
4. **AIM-245 Living World** — NPC economy, memory, caravans, social/guild/politics.
5. **AIM-246 Classless Progression & Itemization** — weapons, loot, sets, ascension.
6. **AIM-247 Infinite Mastery Kernel** — generic sparse unbounded mastery foundation.
7. **AIM-248 Professions & Recipe Mastery** — professions and per-recipe/item learning.
8. **AIM-249 Wolfram Balancing Lab** — mathematical parameter validation/tuning, no gameplay authority.
9. **AIM-250 Regions/Chunks/Dungeons** — persistent scalable world progression.
10. **AIM-251 Persistence/Event State** — durable mastery/economy/crafting/world state.
11. **AIM-253 UI/HUD Projection** — read-only client projection of the migrated authoritative world.
12. **AIM-254 Verification Gate** — only after migration features are present: property, replay, browser and visual evidence.
13. **AIM-255 Merge & Immutable Release**.
14. **AIM-256 Live VPS Deployment & Runtime Evidence**.

AIM-242 through AIM-253 should use ordinary implementation tests needed to avoid regressions, but **must not grow new release/continuity/evidence gates merely to prove unfinished migration work**. The consolidated hard evidence boundary is AIM-254 onward.

## Migration completion rule

A follow-on lane is migrated when its real implementation is attached to the authority hierarchy above and no parallel client/standalone truth remains for that subsystem. It does **not** need to prove final deployment or full replay parity before the overall migration reaches AIM-254.

This keeps the project focused on completing the world migration first and reserves production/replay/visual proof for the dedicated final verification and release lanes.
