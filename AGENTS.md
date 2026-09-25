# Echoes of Aurion — Agent Instructions

## Base44 dev environment

- `docker-compose.base44.yml` runs the app from cloned source via `pnpm dev` (single-origin: Express on port 3000 serves both the tRPC API and Vite middleware).
- The pnpm lockfile is in sync with package.json.
- Database (MySQL), Redis, and external APIs (Gemini, Wolfram, Firebase) are all **optional** — the app boots without them. DB-dependent services simply don't start if `DATABASE_URL` is unset.
- Vite middleware already sets `allowedHosts: true`, so no host/origin allowlist changes are needed.
- No external secrets are required to boot.

## Non-negotiable architecture ownership

Before editing gameplay, UI, persistence, routes, tests, issues or documentation, read [ARCHITECTURE_OWNERSHIP.md](ARCHITECTURE_OWNERSHIP.md).

The binding architecture is deliberately simple:

- **Aurion** is the single and only canonical owner of all gameplay, world, NPC, quest, combat, progression, loot, crafting, economy, group, guild, housing, persistence, database, transport, receipt, account, community, asset-governance and operations truth.
- **AX1** is a legacy donor/provenance project. Its historical source may remain for provenance or migrated code lineage, but AX1 has no active authority, no separate runtime duty and no second game-state truth.
- **WASD** is a legacy donor/provenance project. Historical algorithms may remain embedded as migrated implementation code, but WASD has no active authority, no separate runtime duty and no second gameplay truth.
- **GDS, CAG, Wolfram, LLMs and other tools** may analyze, author, inspect or propose. They never become a gameplay, world or persistence authority.

Once AX1/WASD code has been migrated into this repository, the active implementation is Aurion-owned. File names, exported identifiers and historical source hashes do not create a second owner.

Aurion is the sole source of truth. Client/rendering layers consume confirmed Aurion state; they do not create canonical state.

A test that requires a second non-Aurion gameplay authority is stale and should be rewritten to target the canonical Aurion contract.

## Evidence Flywheel

For every non-trivial integration, use the evidence flywheel: freeze the exact revision, establish a real baseline, execute through canonical Aurion authority, classify the first causal failure, patch the smallest canonical Aurion owner, rerun the original and neighboring regressions, and independently read back the affected boundary.

Evaluation must never be made green by lowering thresholds, skipping flaky cases, moving expected outputs solely to pass, or treating model/agent self-grading as independent verification.

For effectful actions, preserve Action Preview → Aurion authority/scope → approval where required → typed Aurion command → real effect → causal Action Receipt → independent readback. Approval is authorization, not evidence of execution.

## Legacy source handling

Historical AX1/WASD revisions may be pinned when they explain provenance or reproducibility. They must be labeled as historical source identity, never as an active authority.

Do not:

- wait for a legacy repository to make a gameplay decision;
- reintroduce a legacy database or service dependency;
- describe AX1/WASD as owners of active rules or runtime duties;
- create a second state machine merely because a legacy module exists;
- treat historical source hashes as live decision inputs.

## Evidence and merge discipline

- Green is accepted only at the layer actually read back.
- Aurion runtime/database/receipt evidence is canonical.
- Client visuals prove presentation of Aurion state, not independent truth.
- Legacy source hashes prove provenance only.
- No mock/stub/preview result may stand in for production truth.
- After an integration/fix, run the relevant regression and runtime/readback checks.
- Follow the repository's exact-head Memory.md → integration → evidence → merge → main-readback workflow.
