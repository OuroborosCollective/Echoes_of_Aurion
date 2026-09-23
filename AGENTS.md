# Echoes of Aurion — Agent Instructions

## Non-negotiable architecture ownership

Before editing gameplay, UI, persistence, routes, tests, issues or documentation, read [ARCHITECTURE_OWNERSHIP.md](ARCHITECTURE_OWNERSHIP.md).

The binding ownership reset (AIM-298) is:

- **Aurion** = single canonical gameplay, quest, NPC, world, website, auth/account, community, asset/ops governance, MariaDB persistence, transport, receipts, and readmodels.
- **AX1** = das kanonische Hauptspiel: Gameplay-Identität und -Verträge, `/play`, Welt-/Contentstruktur, Renderer, HUD, Input und Animation.
- **WASD** = ausführende Logik-, Berechnungs- und Integrationsreferenz unter Aurion-Verträgen. WASD ist kein separater Gameplay-Owner und besitzt keine eigene Server-Wahrheit.

For migration, schema, reconciliation, production-readback, or Aurion cross-repository evidence work, also read `docs/agent-knowledgebase/skill-archive/aurion-migration-ops/SKILL.md` and use its guard/receipt contracts instead of ad-hoc SQL, SSH, or unverifiable workflow shortcuts.

All quest, world event, NPC memory, progression, loot, crafting, economy, group/dungeon, mob, world/chunk, housing, and guild/kingdom rules are authoritatively compiled, validated, persisted, and executed by **Aurion**.

Aurion is the single source of truth. AX1 renders and interacts with Aurion state, while WASD algorithms are integrated natively inside Aurion rather than running as a secondary authority sidecar.

Aurion website/Admin/MCP must perform effectful mutations through typed, validated Aurion commands and receipts.

A test that requires a second non-Aurion gameplay authority is stale and should be updated to target canonical Aurion contracts.

## Evidence Flywheel

For every non-trivial integration, use the evidence flywheel: freeze the exact revision, establish a real baseline, execute only through the existing Aurion authority, classify the first causal failure, patch the smallest canonical owner, rerun the original and neighboring regressions, and independently read back the affected boundary.

Evaluation must never be made green by lowering thresholds, skipping flaky cases, moving expected outputs solely to pass, or treating model/agent self-grading as independent verification.

For effectful actions, preserve Action Preview → authority/scope → approval where required → typed command → real effect → causal Action Receipt → independent readback. Approval is authorization, not evidence of execution; asynchronous effects must reject stale/revoked authority.
## Evidence and merge discipline

- Green is accepted only at the layer actually read back.
- Website health, DB health, AX1 visuals and WASD gameplay evidence are separate boundaries.
- No mock/stub/preview result may stand in for production truth.
- After an integration/fix, run the relevant regression and runtime/readback checks.
- Finish a migration lane by merging, reading `main`, and confirming **0 open PRs** before opening the next lane.

<!-- gitbook-agent-instructions:start -->

## GitBook Documentation Editing

This repository contains documentation synced with GitBook via Git Sync.

Before editing GitBook-synced Markdown, YAML, or asset files, make sure the GitBook skill is available and up to date in your local agent environment. Prefer installing or updating it with:

```bash
npx skills add gitbookio/gitbook-skills
```

This command may add or update local agent skill files. Use them only as local agent instructions; do not commit those installed skill files or any tool-generated agent configuration unless the user explicitly asks for it.

If `npx` is unavailable, load the skill from:

https://gitbook.com/docs/skill.md

When making changes, preserve GitBook sync metadata such as frontmatter, `SUMMARY.md`, `gitbook-docs.yaml`, `.gitbook/`, and asset links unless the requested edit explicitly requires changing them.

<!-- gitbook-agent-instructions:end -->
