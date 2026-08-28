# Aurion Migration Truth Snapshot — 2026-08-28

> **Purpose:** This file is a revisions-bound evidence map for the WASD/Areloria → Echoes of Aurion migration. It is deliberately stricter than a TODO list or Linear status. A feature is not considered live because a task is marked Done, a file exists, or a test name sounds successful.

## Authoritative source point

| Role | Repository / source | Revision / state |
| --- | --- | --- |
| Aurion runtime target | `OuroborosCollective/Echoes_of_Aurion` | `main@c0ad8967046c52141cf1b5f69874a0c53117fbe2` |
| WASD semantic donor | `OuroborosCollective/Wasd` | audited source `a4d99432e47b82ce98105eadb30360cd8040ad13` |
| Migration inventory | `WASD_AURION_MIGRATION_MATRIX.md` | 906 gameplay/world server modules |
| Current truth branch | Aurion | `aurion/migration-truth-snapshot-20260828` |

The current Aurion `main` merge commit is GitHub-signature verified. The migration target remains **Aurion**. WASD is a semantic/content donor; its runtime, mandatory 10-Hz ownership, deployment stack, MSW/Lua paths, secrets, or parallel persistence are not copied wholesale.

## Inventory classification is not completion

The 906-module WASD inventory partitions exactly as follows:

| Migration classification | Modules | Share | Meaning |
| --- | ---: | ---: | --- |
| `ADAPT_TO_AURION` | 712 | 78.59% | Desired semantics are candidates for an Aurion-native contract/adapter. Not proof of implementation. |
| `REFERENCE_ONLY` | 179 | 19.76% | Lore, design, examples, or review material only unless explicitly promoted. |
| `EXCLUDED` | 15 | 1.66% | Must not be migrated under the current architecture boundary. |
| **Total** | **906** | **100%** | Inventory only. |

## Evidence state model

Every meaningful migration surface should be reported using the highest state actually proven:

1. `INVENTORIED` — donor source is identified and revision-bound.
2. `SEMANTIC_ADAPTED` — Aurion target behavior and authority boundary are specified.
3. `CODE_PRESENT` — Aurion-native implementation exists at the bound revision.
4. `UNIT_PROVEN` — deterministic/negative/contract tests have executed successfully.
5. `DB_E2E_PROVEN` — a real isolated database path executed, including replay/concurrency/readback where relevant.
6. `BROWSER_PROVEN` — real browser/Canvas behavior is observed, not inferred from code or JSON alone.
7. `MERGED` — the exact implementation is reachable from the bound `main` revision.
8. `PRODUCTION_MIGRATED` — required production schema/data migration is confirmed by authoritative DB readback.
9. `LIVE_READBACK_PROVEN` — deployed source revision/image plus public/runtime behavior are read back and match.

A later state never follows automatically from an earlier state.

## Current migration truth map

| Surface | Current code/evidence | Highest safe state at this snapshot | Remaining proof |
| --- | --- | --- | --- |
| **Faction questline story graph** | Authored faction stories, oath/decision receipts and server-confirmed journal merged through PR #77. | `MERGED` | Production DB/schema and full application runtime still require deployment-bound readback. |
| **Faction quest completion + rewards** | PR #78 merged into `main@c0ad8967…`. Server derives XP/points/victory from authored quest/faction/approach; client supplies only quest ID + idempotency key. Immutable reward receipt and progression ledger are written transactionally. | `MERGED` + exact-main verification | `0027_aurion_faction_questline_rewards.sql` is explicitly **not yet proven applied in production**. Database E2E was skipped in PR evidence. Production migration + endpoint/readback are required. |
| **Loot / item instances / mastery / ethos** | `aurionLoot*`, `aurionMasteryEthos*`, DB contracts and additive `0025_aurion_loot_mastery_ethos.sql` are present in current history. | `MERGED` + contract/unit evidence | Production migration state is not asserted by this snapshot. Existing documents explicitly treated the migration as candidate-only at their verification point. Re-read production schema before any apply. |
| **Global world / sectors** | Seed/version/resolution based `globalWorldProtocol` is present; no mandatory WASD tick ownership is imported. | `MERGED` + deterministic contract evidence | Persisted production world-state and full application runtime remain unproven at `c0ad8967…`. |
| **Fixed-point chunks / multi-chunk streaming** | Shared chunk contract, server readmodel, streaming planner and Babylon/React adapters are present. Desktop browserless evidence has shown functional WebGL2/LRU metrics in a candidate context. | `MERGED`; browser evidence is **partial** | Phone/tablet/desktop visual acceptance must be tied to the exact full application deployment. A headless free-canvas screenshot discrepancy must not be converted into a pass. |
| **Authoritative chunk delta actions** | Protected action protocol/route, server-derived sequence/actor/receipt and isolated DB E2E evidence exist in the global-world ledger. | `DB_E2E_PROVEN` in isolated test environment; `MERGED` | Production DB/runtime readback and visible player readmodel on exact full application deployment. |
| **Player presence + world epochs** | Server-observed presence and explicit idempotent epoch resolution are present; no browser authority and no implicit continuous scheduler. | `DB_E2E_PROVEN` in isolated test environment; `MERGED` | Production schema state and live epoch readback must be verified before calling it production-active. |
| **Ecology → market → migration → politics → quest offers** | `worldEpochReactionProtocol` and related readmodels implement bounded, receipt/version/resolution-bound effects; protected spaces remain guarded. | `DB_E2E_PROVEN` for isolated persistence portions; `MERGED` | Production migration/readback, public player-visible consequence and full release acceptance. |
| **Audio** | Typed `aurion:audio-cue` bridge, buses, original SFX/ambient candidates and deterministic fallbacks are merged. Audio is presentation-only and cannot grant gameplay state. | `MERGED` | Assets marked `inactive` remain inactive until decode/release review. Runtime presence is not equivalent to active asset approval. |
| **Genkit developer lane** | `@genkit-ai/google-genai` + `genkit` are current dependencies. `liveDeveloperGenkit.ts` emits structured review-only proposals with no tools/write path. | `MERGED` / side-channel contract present | The broader canonical authoring compiler (`proposal → validated content diff → content hash → reviewed game-data`) is not proven complete merely because the proposal flow exists. |
| **Gameplay MCP** | Nginx routes `/mcp` to local port `8090`; an ordinary GET returns the MCP transport's expected SSE-acceptance error instead of SPA content, and an SSE-accepting local probe reaches the stream. | `LIVE_ROUTE_PROVEN` | Tool-level authenticated/authorized gameplay behavior still needs task-specific readback. |
| **Admin MCP** | Current canonical path is `/admin-mcp` in `adminMcpProtocol.ts`; code and tests exist. Nginx currently has no `/admin-mcp` proxy route, so the public path falls through to the static SPA. | `CODE_PRESENT` | Route the full Aurion backend or add the intended backend proxy, then verify authorization and tool surface. `/mcp-admin` is not the canonical path. |
| **GLB governance** | Asset governance contracts and migration plans exist; migration policy requires provenance/hash/topology/budget gates and inactive-first status. | `SEMANTIC_ADAPTED` to `CODE_PRESENT` depending asset | No blanket-import success is claimed. Each asset needs its own provenance + browser/runtime evidence. |

## Live production boundary observed on 2026-08-28

The public `arelogic.space` origin is currently a **hybrid deployment**, not one revision-equal full Aurion server:

| Lane | Observed production behavior | Revision / authority |
| --- | --- | --- |
| Root SPA | Nginx serves `/var/www/echoes-of-aurion/current`; `.aurion-release.json` binds the current static release to `80eb075eea9cec719dc559086968e90417c5bee1` (run `32605712500`). | Static UI is older than current `main`. |
| `/api/` | Nginx proxies to `https://aurion3d-6hpapr2g.manus.space`. A public request to the current `system.health` tRPC contract through `arelogic.space/api/trpc/system.health` returned `404`, so this lane is **not accepted as the current Aurion API**. The direct Manus host also returned a maintenance response on `/healthz` during this readback. | Current full backend API is unproven / mismatched. |
| `/mcp` | Nginx proxies to `127.0.0.1:8090/mcp`; transport behavior is real and distinct from the SPA fallback. | Separate MCP lane; source revision was not exposed by the public transport probe. |
| `/_runtime/healthz` and `/v1/ws` | Nginx proxies to the root-bounded zone service on `127.0.0.1:3100`. | **Promoted and independently read back on `c0ad8967046c52141cf1b5f69874a0c53117fbe2`**, mode `authoritative-movement`. |
| Full Docker/Traefik Aurion app | Repository cutover contract and `/opt/echoes-of-aurion/.env.production` are present on the VPS. Docker is running, but the self-hosted `aurion-deploy` account has no Docker socket/general sudo access; it is intentionally limited to the zone promotion wrapper. | Prepared but **not proven active** as the public root/API runtime. |

The zone promotion used an immutable artifact built after a fresh exact-`main` checkout. The GitHub-hosted verification for `c0ad8967…` passed locked dependency install, TypeScript, the complete Vitest regression, `git diff --check`, and revision-bound runtime artifact generation. The self-hosted production job then promoted the zone through `/usr/local/sbin/promote-aurion-zone-runtime` and required the exact SHA both locally and publicly. An independent public readback returned the same SHA.

This does **not** make the whole application `LIVE_READBACK_PROVEN`: the root UI, `/api`, DB schema and full container are separate authority surfaces and remain independently classified above.

## Migration-chain drift discovered on 2026-08-28

`drizzle/meta/_journal.json` currently ends at migration **`0020_wasd_aurion_dialogue_quest_intents`**, while SQL files `0021` through `0027` exist in the repository. With the Drizzle migration mechanism used by this repository, the journal determines which tagged SQL files are executed. Therefore file presence alone is not migration reachability.

The unjournaled files are:

- `0021_aurion_global_world_state`
- `0022_aurion_world_chunk_deltas`
- `0023_aurion_world_presence_epochs`
- `0024_aurion_world_epoch_reactions`
- `0025_aurion_loot_mastery_ethos`
- `0026_aurion_faction_questline_state`
- `0027_aurion_faction_questline_rewards`

A separate repair branch `fix/aurion-migration-chain-truth-20260828` adds a fail-closed migration-chain inspector and places it in front of `db:push`. The production DB is **not** being guessed from repository state: the VPS environment file is root-owned mode `0600`, and the current deployment runner is deliberately not permitted to read it. Production schema reconciliation therefore remains a privileged release step, not a credential bypass.

The late SQL files contain no `ALTER TABLE` operations; they add tables/indices. Nevertheless they must not simply be journaled and replayed against production before authoritative schema readback because several use ordinary non-idempotent `CREATE TABLE` statements. Existing manually applied tables, if any, must first be recognized and validated.

## Known plan/evidence drift corrected on 2026-08-28

Linear issues `AIM-214` through `AIM-218` had been marked `Done` although the repository world ledger continued to state that the slices remained open pending release/GPU/production evidence. They were reopened to `Backlog` during this truth pass. This is a status correction, not a rollback of implemented code.

The older `WASD_AURION_UNIFICATION_TODO.md` remains useful historical context but is not the current completion ledger: it is bound to the older Aurion base `80eb075eea9cec719dc559086968e90417c5bee1` and still presents work now partly implemented on later revisions as unchecked.

## Golden Slice — required end-to-end causal proof

The canonical playable acceptance path remains:

```text
private observatory / world entry
→ Lyra / authored NPC interaction
→ authored quest decision receipt
→ confirmed world/reaction state
→ server-authoritative encounter
→ confirmed victory
→ deterministic loot receipt + item instance
→ mastery / XP / faction progression receipt
→ NPC/world/progression readmodels
→ reload / replay without duplicate reward
→ Babylon/React renders only confirmed state
```

A Golden Slice is not complete until the same input contract produces reproducible resolver output, replay cannot double-award, DB state survives reload, and the browser visibly reflects the server-confirmed result on the same deployed revision.

## Current release candidate after PR #78

**Candidate source:** `main@c0ad8967046c52141cf1b5f69874a0c53117fbe2`.

Before full application production promotion:

1. Reconcile the production DB schema against migrations through `0027` without exposing credentials and record the rollback/backup point.
2. Repair the repository migration chain so fresh and existing environments cannot silently diverge.
3. Run the required DB E2E for the faction reward path against an isolated database with the same reconciled schema chain.
4. Preserve the already successful exact-main verification (`pnpm check`, full `pnpm test`, `git diff --check`, revision-bound runtime build).
5. If production migration is needed, apply **only missing and preflight-validated** additive schema changes, then read tables, columns, keys and migration evidence back.
6. Build `dist/.aurion-runtime-build.json` bound to the 40-character source SHA outside the VPS Vite path, build the runtime image with the same `AURION_RELEASE_SHA`, then verify image identity before promotion.
7. Promote the Docker/Traefik Aurion service through a root-bounded promotion surface; do not grant the CI runner general Docker/root authority merely to accomplish the cutover.
8. Replace/disable the stale `/api/` Manus proxy only after local container health and route checks pass. Verify public `/healthz`, tRPC `system.health`, TLS/OIDC, `/admin-mcp`, `/mcp`, active image digest and exact source revision.
9. Exercise the authenticated faction quest read/decision/completion/reward path, verify one immutable reward receipt + corresponding progression entries, and prove replay does not pay twice.
10. Repeat the Golden Slice browser smoke and multi-device Canvas evidence against the deployed full-application revision.
11. Only then advance relevant Linear surfaces from Backlog to Done and record the exact evidence links/SHAs.

## Truth boundary

No Mock, stub, UI projection, Linear state, PR description, generated documentation, LLM answer, local-only test result, or candidate asset may stand in for missing runtime evidence. If a layer cannot be read back at its authoritative boundary, its state remains `UNPROVEN` or the highest earlier evidence state.
