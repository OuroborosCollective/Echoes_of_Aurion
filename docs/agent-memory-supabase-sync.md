# Echoes_of_Aurion Agent Memory → Supabase

`Memory.md` remains the canonical repository memory file. The Supabase project `Echoes_of_Aurion` is used only as an agent-working-memory and readback-history mirror.

## Authority boundary

- GitHub `Memory.md` is the source document.
- Supabase `memory_entries` stores append-only content snapshots.
- `agent_sessions` and `agent_events` record automated sync activity.
- `agent_readback_history` records the source revision, Git blob SHA, content SHA-256 and independent readback result.
- This Supabase memory workspace is not Aurion gameplay/world/persistence truth.

## Automation

The repository no longer generates an additional Memory.md entry after a completed merge. Any required entry is reviewed in the PR before merge, so the merge commit remains the production source revision.

The former `.github/workflows/post-merge-memory.yml` was removed to stop its post-merge bot commit, main-SHA churn, shared production-release concurrency and chained production dispatch. `scripts/append-post-merge-memory.mjs` remains as a historical, manually inspectable generator, but is not scheduled by GitHub Actions.

No post-merge Memory.md editing is scheduled. The merge still has to pass ordinary PR checks. The release operator reads the exact new `main` SHA and deliberately dispatches the production workflow with matching `expected_sha`. All OIDC, schema and readback guards remain in force.

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