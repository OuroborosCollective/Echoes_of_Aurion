# Causal chaos — Step 30 dependent draft

Aurion's existing replay, worker-byte, effect, observation and schema verifiers must reject individually damaged evidence at the correct boundary. The harness runs an isolated in-memory zone with persistence and broadcast disabled. It generates real V2 tick receipts and first verifies an unchanged two-tick baseline through the existing headless oracle. It then changes one evidence field at a time. Synthetic chunk payloads and schema observations are explicitly test fixtures; this is not production gameplay or database evidence.

| Fault | Expected boundary | Native rejection |
| --- | --- | --- |
| SOURCE_REVISION_MISMATCH | SOURCE_REVISION | UNPROVABLE, revision drift at tick 2 |
| SNAPSHOT_MISMATCH | CHECKPOINT_HASH | FIRST_DIVERGENCE |
| INPUT_DIGEST_MISMATCH | INPUT_ORDER | FIRST_DIVERGENCE |
| RNG_DIVERGENCE | RNG_ROOT | FIRST_DIVERGENCE |
| MOVEMENT_DIVERGENCE | MOVEMENT | FIRST_DIVERGENCE |
| PLAYER_ACTION_DIVERGENCE | PLAYER_ACTION | FIRST_DIVERGENCE |
| MOB_FSM_DIVERGENCE | MOB_FSM | FIRST_DIVERGENCE |
| MOB_COMBAT_DIVERGENCE | MOB_COMBAT | FIRST_DIVERGENCE |
| EFFECT_INTENT_DIVERGENCE | EFFECT_INTENT | FIRST_DIVERGENCE |
| PROJECTION_DIVERGENCE | PROJECTION_PAYLOAD | FIRST_DIVERGENCE |
| CLIENT_VERIFICATION_FAILURE | CLIENT_OBSERVATION | CLIENT_CONTRADICTED, untrusted |
| ATTESTATION_TAMPER | ATTESTATION_SUBJECT | Real GitHub/Sigstore digest rejection |
| SCHEMA_DRIFT | SCHEMA_CONTRACT | Required append-only trigger missing |

Reports retain native status instead of converting a source-revision refusal or client observation into an authority verdict. `detected` is true only for the expected status and boundary. V2 replay now compares RNG commitment separately after phase/post-state checks and before the final receipt comparison. V1's stages and every authoritative hash remain unchanged.

For mob combat corruption, PRE_STATE, INPUT_ORDER, MEMBERSHIP_REVIVAL, MOVEMENT, PLAYER_ACTION, RESOURCE and MOB_FSM must match before MOB_COMBAT diverges. The fixture and baseline hash remain unchanged after injection; fresh runs produce the same semantic report despite random transport identities.

## Execution and report

```bash
NODE_ENV=test node --import tsx scripts/run-aurion-causal-chaos.mjs --fault MOB_COMBAT_DIVERGENCE
NODE_ENV=test node --import tsx scripts/run-aurion-causal-chaos.mjs --all
pnpm exec vitest run server/causality/causalFaultInjection.test.ts
```

CLI exit 0 means every requested fault was correctly rejected, not that corrupted evidence was VERIFIED. Exit 1 means failed detection or isolation, 2 means required evidence is unavailable, and 64 means invalid arguments. Local `--all` deliberately returns 2 without a real attestation bundle. Reports include baseline hash, observed boundary, matching earlier stages and fixture immutability. No credentials or raw verification stderr are returned.

The CI workflow signs an explicitly test-only immutable subject through GitHub OIDC, then invokes the real `gh attestation verify` with repository, workflow, source SHA/ref and predicate bindings. It verifies the original bytes, appends one NUL byte to a temporary copy, requires a digest-related rejection, restores the original copy and verifies again. Neither a transport error nor a missing bundle counts as detection. The signed test subject is not a production release attestation. Bundle, subject and report are retained for independent readback.

## Production exclusion and limits

The harness lives only under test/scripts paths and has no router, MCP, admin or production fault switch. It refuses production mode and configured database URLs. The isolated zone disables persistence and broadcasts before joining a player; its network sink throws if used. Safety tests compile the actual server, browser and chunk-worker import graphs and reject a harness import. The runtime artifact has an explicit copy allowlist and ships compiled `dist`, not the source harness. No production data is changed.

The local isolated suite initially passed 17 tests; twelve faults were detected and the absent attestation correctly remained UNPROVABLE. Full regression, actual CI signature tamper proof, exact-head merge and production readback are still required. This draft depends on Step 29 (#433); it will be promoted after its predecessor is merged and read back. The one Step-30 Memory entry will be added after actual runtime/CI evidence is read, before final-head review.
