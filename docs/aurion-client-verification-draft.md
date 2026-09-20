---
description: "Step 29 dependent draft: untrusted client observations, never gameplay authority."
---

# Client Verification — Step 29 dependent draft

Status on 2026-09-20: **PARTIAL / DRAFT**. This is isolated contract/service work, not a live client-apply integration. Depends on [Step 28 corrective PR 431](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/431) and its pending authoritative chunk derivation, world-root inclusion, worker/apply wiring, merge and readback. Do not mark ready before that predecessor is complete.

## Implemented boundary

`shared/aurionClientVerificationContract.ts` strictly binds connection/session identity, server receipt hash, projection hash, applied generation and client logical frame into a domain-separated SHA-256 receipt. Extra fields, malformed counters and altered hashes are rejected. A client can compute this hash itself: **matching it does not authenticate the client or prove honest application**.

`server/causality/clientVerificationService.ts` is a non-global observer instance for one authenticated connection/session. The future transport adapter must supply the binding from its authenticated context, not the report body. No endpoint or transport handler instantiates this draft service yet.

| Observation | Status and effect |
| --- | --- |
| No expectation or projection merely delivered | `CLIENT_UNOBSERVABLE`; no apply claim |
| Matching report at expected generation before deadline | `CLIENT_VERIFIED`; untrusted client-reported match only |
| Valid same-generation report with contradictory hashes | `CLIENT_CONTRADICTED`; no rollback or authority mutation |
| Server deadline elapsed without applicable report | `CLIENT_TIMEOUT`; no gameplay failure inferred |
| Foreign connection/session or malformed report | Rejected without changing observation |
| Stale/future generation, duplicate, late or superseded async report | Does not overwrite current/terminal observation |

Terminal observations are first-result-wins for that generation. A greater generation starts a new observation; an identical expectation retry never extends its deadline. A same/older generation with a different job is rejected. The server operational clock owns deadlines and clamps backwards clock samples; the client's logical frame cannot extend them.

Every readback explicitly says `trust: untrusted-client-observation` and `mutationAuthority: none`. There are no gameplay callbacks, SQL writes, logs, rollback operations or persisted receipt collections.

## Privacy and retention

Strict allowlists exclude device/user-agent/IP/fingerprint/raw error/secret fields. Connection/session IDs must be non-secret opaque identifiers, never session cookies or tickets. That semantic property must be enforced by the authenticated adapter; a string pattern alone cannot detect a credential.

Each instance keeps only one detached expected job and at most one client receipt digest. Its five-minute readback TTL expires lazily on access; `close()` clears it immediately and disables further observation. The eventual transport must dispose disconnected/idle instances or arrange cleanup. This draft does **not** claim a physical five-minute memory deletion guarantee for an abandoned instance. No reconnect/history persistence is implemented.

## Definition of Done and next work

| Deliverable | State |
| --- | --- |
| D1 observational contract | Implemented; no trust-anchor claim |
| D2 status/validation service | Unit-tested isolated instance; no live transport binding |
| D3 actual apply/timeout/contradiction handling | Service transitions covered; actual AX1 post-apply callback still missing |
| D4 privacy/redaction | Allowlisted fields, no logging/storage; authenticated opaque IDs and idle disposal still require integration review |
| D5 delivery/failure/unobservable tests | Synthetic unit coverage only, not browser/runtime evidence |
| D6 authenticated readback and CLI | Missing; do not fabricate a live status endpoint |
| D7 Memory | One explicitly PARTIAL draft entry |
| D8 merge/post-merge | Pending predecessor completion and exact-head review/CI |

Dependencies: A1 Step 28 remains PARTIAL; A2 authenticated receipt/connection binding missing; A3 actual AX1 generation/apply lifecycle missing; A4 logical TTL specified, idle disposal pending; A5 strict-field review performed locally, integration security review pending.

## Risks

| Risk | Impact / detection | Mitigation / residual |
| --- | --- | --- |
| R1 client receipt treated as authority | False gameplay trust; inspect all consumers | Explicit untrusted/none readback and no mutation dependencies; future consumers require review |
| R2 forged or foreign data | False observation; foreign/tampered tests | Context-bound instance and strict hashes; a dishonest bound client can still lie |
| R3 unnecessary personal data | Leakage; field/readback review | Strict allowlists and no logs/DB; opaque-ID source and idle disposal pending |
| R4 timeout mistaken for gameplay error | Improper recovery; deadline tests | Timeout is observer-only, no recovery callback |
| R5 generation ordering | Stale apply overwrites current; retry/order tests | Monotone expectation, exact-generation report and async identity guard |
| R6 contradiction rolls back authority | Gameplay mutation; immutability test and dependency audit | No gameplay object or effectful service accepted; runtime consumer verification pending |

No schema migration, deployment or production write. Restart deliberately loses observational state rather than inventing continuity. Reverting the draft removes only unused modules.

## Checks

```bash
corepack pnpm exec vitest run server/causality/clientVerificationService.test.ts server/worldChunkProjectionV2.test.ts server/worldChunkProjectionProtocol.test.ts
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

Focused checks: 3 files / 25 tests PASS. Typecheck PASS. Full local regression: 268 files / 1,176 tests PASS; 39 files / 169 environment-gated tests skipped. Production build PASS (existing bundle-size warning). Exact-head CI remains pending. None substitutes for a real AX1 apply, authenticated endpoint, production readback or renderer-switch proof. The runtime readback CLI from the master handoff is not implemented yet.
