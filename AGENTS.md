# Echoes of Aurion — Agent Instructions

## Non-negotiable architecture ownership

Before editing gameplay, UI, persistence, routes, tests, issues or documentation, read [ARCHITECTURE_OWNERSHIP.md](ARCHITECTURE_OWNERSHIP.md).

The binding ownership is:

- **Aurion** = website, auth/account, community, forum, community events, asset/ops governance, MariaDB persistence, transport, receipts and read-only readmodels.
- **AX1** = `/play`, renderer, HUD, input, animation and visual/content projection.
- **WASD** = every gameplay rule and simulation decision.

Do not add, preserve as canonical, or test as desired behavior any Aurion-owned combat, quest, progression, loot, crafting, economy, group/dungeon, NPC/mob, world/chunk, housing or guild/kingdom rule.

If legacy Aurion code currently implements such a rule, treat it as migration debt. On touch, move/bind the rule to WASD, keep AX1 as runtime/UI, and reduce Aurion to transport/persistence/readmodel.

Aurion website/Admin/MCP must never mutate gameplay truth. Gameplay data shown on account/community pages is read-only.

A test that requires old Aurion gameplay authority is stale and should be rewritten rather than preserving the wrong architecture.

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
