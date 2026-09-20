---
description: "Authenticated, ephemeral observations of actual AX1 client apply; never gameplay authority."
---

# Client Verification

Status: integration draft pending Step-28 merge/readback and this head's real browser/CLI evidence. The earlier pure observer is now wired to the actual authenticated zone connection and AX1 apply lifecycle.

## Source and transport

Only the ticket-authenticated zone gateway opens a registry binding. Connection IDs come from the server welcome; the registry issues an independent random, non-secret observation session ID. HTTP callers cannot create bindings by supplying an ID. Every begin/report/status request requires authenticated user ownership and reports additionally require the matching session. Socket close clears the binding and all pending observations; a reconnect creates a new session.

`gameplay.beginClientProjection` independently reads the Step-28 receipt-bound projection, then records its manifest and requested worker generation before returning the bytes. The client cannot supply the expected manifest or server receipt. Up to sixteen observations per connection tolerate concurrent/reordered chunk requests while retiring older generations; the registry admits at most 128 live bindings.

AX1 sends a receipt only after actual byte validation, worker validation and scene insertion. The logical frame is a client-side projection-update counter, never a deadline or simulation input. Hashing, transport or observation failure leaves gameplay and the applied scene untouched. A client can lie about successful apply: `CLIENT_VERIFIED` means an untrusted client reported a matching expected receipt, not independent proof of pixels.

## Status semantics

| Event | Observation |
| --- | --- |
| No expectation or bytes only delivered | CLIENT_UNOBSERVABLE |
| Matching report for expected generation before deadline | CLIENT_VERIFIED, untrusted reported match |
| Well-formed same-generation report with conflicting hashes | CLIENT_CONTRADICTED; no rollback |
| Server-owned 15-second deadline passes | CLIENT_TIMEOUT; no gameplay failure inferred |
| Wrong owner/session or malformed/extra fields | Rejected without changing observation |
| Late/duplicate/stale/future report | Cannot overwrite a terminal observation |
| Retired generation, socket close or process restart | No invented continuity |

Each expected job retains first-result-wins terminal status. Identical retries do not extend deadlines; a conflicting reuse of a generation is rejected. Logical wall-clock clamping prevents a backwards sample from resurrecting expiry. The latest-generation readback does not regress to an older record after expiry.

## Privacy and retention

Strict contracts allow only opaque connection/session IDs, hashes, generation, logical frame and named status/reason. No device fingerprint, IP, user agent, raw error, bearer ticket, cookie or arbitrary client JSON is retained or returned. The authenticated user ID is held internally only to enforce ownership, and is not included in public status.

There are no SQL writes or persistent client-observation logs. Scheduled five-minute disposal clears each idle record, in addition to lazy expiry checks; socket close clears immediately. Host event-loop scheduling can delay a timer, so this is bounded operational cleanup, not a real-time deletion guarantee. Active socket bindings remain until close and are globally bounded. Restart loses observations by design.

## Readback

`gameplay.clientVerificationStatus` is a protected owner-bound query. Every response explicitly reports `trust: untrusted-client-observation` and `mutationAuthority: none`.

```bash
# Set AURION_READBACK_ORIGIN and AURION_READBACK_SESSION privately in the environment.
node --import tsx scripts/read-aurion-client-verification.ts --connection <id> --session <id>
```

The CLI calls the live authenticated API rather than reading an empty fresh-process singleton. Credentials are accepted only through the environment, never output or passed in argv; redirects are rejected. HTTPS is required except for loopback tests. Exit 0 means a successfully decoded observational status (including timeout/unobservable), never authority approval. Missing authentication/readback exits 2; invalid invocation exits 64.

## Acceptance and evidence

| Deliverable | Implementation / required evidence |
| --- | --- |
| D1 contract | Strict domain-separated receipt and readback; extra fields rejected |
| D2 service | Owner/session registry plus immutable expected-job status transitions |
| D3 actual apply | Active AX1 post-insertion callback; failures do not mutate authority |
| D4 privacy | Allowlisted fields, ephemeral bounded storage, scheduled and disconnect cleanup |
| D5 delivery/failure | Unit coverage plus real browser delivered-but-unapplied, contradictory and timed-out observations |
| D6 readback | Protected live query and fresh authenticated CLI inside the browser lane |
| D7 Memory | One existing draft entry; add runtime evidence within that entry before final-head review |
| D8 merge | Await Step-28 merge/readback, exact-head gates and authorized merge/readback |

The AIM-290 lane creates an actual construction/epoch, verifies live client observations across real renderer losses, invokes a fresh authenticated CLI, then injects a contradictory client report and deliberately omits another apply. It must observe contradiction and real server timeout while the same persisted projection/root remains unchanged. Fault reports are untrusted test input, never manufactured authority.

Local binding/service/transport/projection checks: 4 files / 21 tests and TypeScript PASS. Local full regression: 272 files / 1,195 tests PASS, 39 files / 169 environment-gated skips; production build PASS. Exact-head CI and real browser/CLI evidence remain gated on this draft. No migration or production observation claim. Per-connection visibility authorization remains outside scope; this observes already authenticated chunk projection delivery.

Risks R1/R6 are bounded by no gameplay callbacks or rollback dependencies; R2 by owner/session/expected-job validation without trusting the client's honesty; R3 by strict fields and timed cleanup; R4 by explicit observational timeout; R5 by exact-generation matching and retirement. Reverting removes diagnostics without changing canonical receipts or gameplay.
