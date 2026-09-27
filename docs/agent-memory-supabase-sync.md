# Echoes_of_Aurion Agent Memory → Supabase

`Memory.md` remains the canonical repository memory file. The Supabase project `Echoes_of_Aurion` is used only as an agent-working-memory and readback-history mirror.

## Authority boundary

- GitHub `Memory.md` is the source document.
- Supabase `memory_entries` stores append-only content snapshots.
- `agent_sessions` and `agent_events` record automated sync activity.
- `agent_readback_history` records the source revision, Git blob SHA, content SHA-256 and independent readback result.
- This Supabase memory workspace is not Aurion gameplay/world/persistence truth.

## Automation

`.github/workflows/agent-memory-supabase-sync.yml` runs on every `main` push that changes `Memory.md` and can also be started manually.

The job:

1. checks out the exact `github.sha`;
2. computes the Git blob SHA-1 and SHA-256 content hash;
3. resolves the dedicated `echoes-of-aurion-agent-memory` workspace;
4. inserts a new snapshot only when that exact `Memory.md` blob has not already been stored;
5. creates an agent session and event;
6. records a verified `agent_readback_history` row;
7. reads both the memory entry and history row back from Supabase and verifies their identities/hashes.

No Memory content or Supabase credential is printed to the workflow log.

## One-time GitHub secret

The workflow needs one repository Actions secret:

`SUPABASE_SECRET_KEY` (preferred current Supabase secret-key format).

For compatibility, it also accepts the legacy repository secret name:

`SUPABASE_SERVICE_ROLE_KEY`.

The credential is never committed to the repository and is only supplied to the workflow process through GitHub Actions secrets. Current Supabase `sb_secret_...` keys are sent only in the `apikey` header; the legacy `SUPABASE_SERVICE_ROLE_KEY` path additionally uses the JWT bearer header.
