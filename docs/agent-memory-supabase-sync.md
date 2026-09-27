# Echoes_of_Aurion Agent Memory → Supabase

`Memory.md` remains the canonical repository memory file. The Supabase project `Echoes_of_Aurion` is used only as an agent-working-memory and readback-history mirror.

## Authority boundary

- GitHub `Memory.md` is the source document.
- Supabase `memory_entries` stores append-only content snapshots.
- `agent_sessions` and `agent_events` record automated sync activity.
- `agent_readback_history` records the source revision, Git blob SHA, content SHA-256 and independent readback result.
- This Supabase memory workspace is not Aurion gameplay/world/persistence truth.

## Automation

The repository now creates the one Memory.md entry for a completed merge automatically.

`.github/workflows/post-merge-memory.yml` runs only when a pull request is actually merged into `main`. It resolves the merged PR metadata and changed-file list, appends one deterministic structured entry, prevents duplicates with a PR/merge-SHA marker, commits only `Memory.md` with `[skip ci]`, and immediately runs the Supabase synchronization/readback against the resulting Memory commit.

This removes the manual post-merge Memory.md editing step. The merge still has to pass the repository's normal required checks; the Memory bookkeeping happens afterward and does not restart the large Main CI/deploy workflow set.

The existing `.github/workflows/agent-memory-supabase-sync.yml` remains the lower-level Memory-to-Supabase synchronization lane. Its automatic `main` trigger is limited to actual `Memory.md` changes, while pull requests continue to run the secret-free contract regression.

## Evidence semantics

The generated entry is repository-level merge evidence only. It records the PR URL, PR head SHA, merge commit SHA, exact changed paths and relevant `Decisions`, `Boundary`, `Learned`, `Open` and `Next safe step` sections from the merged PR body when present. It intentionally does not invent runtime/deployment/database evidence.

The generator excludes the PR body's `Secret` section and redacts common token patterns before writing to `Memory.md`.

## One-time GitHub secret

The workflows need one repository Actions secret:

`SUPABASE_SECRET_KEY` (preferred current Supabase secret-key format).

For compatibility, they also accept the legacy repository secret name:

`SUPABASE_SERVICE_ROLE_KEY`.

The credential is never committed to the repository and is only supplied to the workflow process through GitHub Actions secrets. Current Supabase `sb_secret_...` keys are sent only in the `apikey` header; the legacy `SUPABASE_SERVICE_ROLE_KEY` path additionally uses the JWT bearer header.