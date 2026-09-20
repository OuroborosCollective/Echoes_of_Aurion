---
description: "Step 28 corrective draft: commitment contract and explicit runtime evidence gaps."
---

# World-Chunk Projection V2 — Step 28 corrective draft

Status on 2026-09-20: **PARTIAL / DRAFT — not ready for merge**.
This describes draft implementation and acceptance work, not production evidence.

## Scope correction and baseline

Main `31989064b18c54e049c46d670bf0a326e3ba2445` contains the deployed NPC provenance work from [PR 430](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/430). Its production readback passed, but it did not implement the newly supplied master handoff's world-chunk Step 28. The earlier Memory entry remains historical; its dated continuation records this difference without inventing a second completed step.

The existing V1 manifest is only used by tests. `gameplay.worldChunk` and `worldChunkWindow` expose chunk readmodels; the AX1 `WorldChunkManager` uses a separate presentation path. `CanonicalZoneState` does not commit chunk bases or chunk deltas. Attaching the latest zone receipt to arbitrary chunk data would therefore manufacture provenance. No such adapter is enabled in this draft.

## Contract and entry points

`shared/worldChunkProjectionProtocol.ts` retains V1 byte compatibility and exports the opt-in V2 contract from `shared/worldChunkProjectionV2.ts`. V2 adds mandatory authority-receipt, authority-state and world-root references, projection schema/policy, SHA-256 payload commitment, domain-separated projection hash and manifest hash. Strict decoders reject absent, malformed and extra fields. Web Crypto keeps the implementation usable in a browser without importing Node crypto.

Worker jobs bind manifest and generation. Result validation hashes the actual supplied bytes, checks the size and rejects stale generations; an echoed digest alone is insufficient. Inputs are detached before asynchronous hashing. Output objects and coordinates are frozen. Payloads are bounded to 16 MiB.

The optional connection root commits a canonical sorted interest set and each projection. Duplicate chunk/layer entries, mixed authority references and mixed policies fail closed. The connection identifier must be an opaque non-secret ID supplied by the eventual authenticated adapter, never a bearer ticket or fingerprint. Nothing is persisted by this module.

These are **integrity commitments, not authority verification**. A self-consistent hash can be created by an untrusted party. No API here returns `VERIFIED`, changes gameplay, authorizes a view, proves world-root membership or proves that pixels were displayed.

## Plan and acceptance gates

| Deliverable | Current evidence / remaining work |
| --- | --- |
| D1 expanded contract | Implemented as opt-in V2; V1 unchanged |
| D2 deterministic builder/hash | Implemented over validated supplied references; authoritative state-to-chunk derivation still missing |
| D3 manifest/worker binding | Actual-byte validation implemented; live worker/renderer adapter still missing |
| D4 connection interest root | Implemented as a bounded pure commitment, not an authorization decision |
| D5 renderer/failure tests | Unit-level no-mutation and failure checks only; real WebGL2/WebGPU and runtime failure coverage pending |
| D6 explain/readback | Offline integrity inspector only; live authenticated readback pending |
| D7 Memory | One existing Step-28 entry, with clearly dated continuation; no retrospective completion claim |
| D8 merge/readback | Pending; keep draft until all required runtime gates close |

Dependencies: A1 receipt/state-to-chunk derivation **missing**; A2 world-root service present but no chunk membership proof; A3 V1 audited and preserved; A4 live chunk-manifest/worker integration **missing**; A5 runtime renderer evidence **pending**.

The next implementation must choose the actual canonical chunk snapshot/receipt boundary, derive the projected bytes there, verify world-root inclusion at the same revision/tick, and carry the resulting immutable envelope through the active AX1 apply path. Do not substitute an unrelated zone receipt. Step 29 may be prepared as a dependent draft, but must not become ready before these gates and Step-28 merge/readback pass.

## Risk register

| Risk | Impact and detection | Mitigation and residual |
| --- | --- | --- |
| R1 projection becomes authority | Forged source is accepted; inspect live adapter and negative tests | No mutations or VERIFIED verdict here; authenticated source binding remains open |
| R2 state/projection hash confusion | Wrong object is audited; hash-domain tests | Distinct domains and named fields; hashes are still not signatures |
| R3 unstable interest ordering | Different roots on retry; permutation/duplicate tests | Sort coordinates/layers, reject duplicates; SHA-256 is not claimed collision-free |
| R4 renderer failure mutates gameplay | Gameplay regression after failed apply; runtime fault tests pending | No callbacks or authority objects accepted; actual renderer boundary still needs proof |
| R5 manifest/payload drift | Wrong bytes accepted; tamper/stale-generation tests | Rehash actual bytes and bind generation; integration must use this validator |
| R6 connection privacy | Secrets enter observation storage; strict-field/security review | No storage, bounded opaque ID; authenticated adapter and retention policy still needed |

Schema compatibility: no migration, no changes to receipt/state schemas, and V1 remains unchanged. Retry/restart: pure commitments are deterministic, not a delivery or persistence journal. Rollback: no production enablement or recovery action in this draft; reverting it removes only an opt-in contract.

## Reproducible checks

```bash
corepack pnpm exec vitest run server/worldChunkProjectionProtocol.test.ts server/worldChunkProjectionV2.test.ts
corepack pnpm check
corepack pnpm test
corepack pnpm build
corepack pnpm exec tsx scripts/explain-aurion-projection.ts --manifest manifest.json
```

T1–T4 focused checks: 2 files / 19 tests PASS, including determinism, interest ordering, tamper, stale generation, byte substitution and local failure non-mutation. Typecheck PASS. T5 full local regression: 267 files / 1,170 tests PASS; 39 files / 169 environment-gated tests skipped. Production build PASS (existing bundle-size warning). Exact-head CI remains pending. T6 CLI execution is locally BLOCKED: the `tsx` launcher failed with `listen EPERM` for its temporary IPC socket, before executing the script; no permission workaround was attempted. The implemented offline CLI is designed to return exit 2 even for matching integrity because authority evidence is absent; malformed input returns 1 and invalid invocation 64. These exit paths still require executable CLI evidence. Runtime `--world/--tick/--connection` is deliberately unsupported, not simulated.

A Wolfram finite-model check examined all eight subsets of three chunk identifiers: canonical input was permutation-invariant, and distinct sets had distinct committed inputs. This is neither a collision-freedom proof nor runtime evidence.

No production evidence, merge SHA or post-merge readback exists for this corrective draft. Local Game Development Studio CLI is unavailable; no capture run is claimed. Steps 32–33 were not present in the supplied attachment (which defines 22–31).
