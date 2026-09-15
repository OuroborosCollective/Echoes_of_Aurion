# Contributing to Echoes of Aurion

Thank you for your interest in contributing to Echoes of Aurion!

## Canonical Architecture Ownership

Before contributing code, documentation, or tests, please review [ARCHITECTURE_OWNERSHIP.md](ARCHITECTURE_OWNERSHIP.md) and [AGENTS.md](AGENTS.md).

- **Aurion** is the single canonical gameplay, quest, NPC, world, website, auth/account, community, asset/ops governance, MariaDB persistence, transport, receipts, and readmodels authority.
- **AX1** is the canonical game product: gameplay identity and contracts, `/play`, world and content structure, renderer, HUD, input, animation, and presentation.
- **WASD** serves as the integrated deterministic calculation, algorithms, and rules reference under Aurion contracts. WASD is not a separate server authority sidecar.

## Development Principles

1. **Deterministic Authority**: All state mutations must be deterministic, typed, and verifiable via receipts. Do not introduce non-deterministic calls (`Math.random()`, unseeded wall-clock) into authority paths.
2. **No Unsolicited Restorations**: Do not restore retired legacy paths, old HUDs, or deprecated APIs unless explicitly specified.
3. **Mobile & Low-End First**: WebGL2 baseline compatibility is required. Keep memory, GLB bounds, draw calls, and asset sizes well within target budgets.
4. **Evidence-Based Merges**: Every change must be verified by concrete evidence (linting, tests, migration checks, readbacks). Stubs or mock results cannot stand in for verified truth.
5. **License Compliance**: All external assets, code, and textures must have clear attribution and compatible licensing documented in [NOTICE.md](NOTICE.md).
