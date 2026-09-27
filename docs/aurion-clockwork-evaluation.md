# Aurion Clockwork-Inspired Deterministic Execution Evaluation

Issue #615 evaluates Stack AV's Clockwork as an architectural reference only. The upstream project describes deterministic offline/simulated-time execution, explicit system composition, IPC/message passing, scheduling, schema-oriented interfaces, and bounded CPU/memory/network resource management. It is explicitly alpha-stage and is implemented as Linux-oriented C++/Python infrastructure with Bazel tooling.

## Decision

Clockwork concepts are useful as design references, but Aurion does not adopt the Clockwork runtime as a second scheduler, simulation engine, gameplay authority, persistence authority, or time authority.

The canonical rule remains:

`Aurion logical tick + confirmed inputs + deterministic work order + causal receipts -> authoritative world/gameplay state`

Clockwork is an offline architectural reference. The concrete upstream runtime is not imported into the Aurion production dependency graph.

## Concept mapping

| Clockwork concept | Aurion-native surface | Boundary |
|---|---|---|
| Simulated/deterministic time | logical Causal Tick and receipt tick fields | No wall clock in gameplay truth |
| Cogs / explicit input-output compute | pure shared contracts and deterministic validation functions | No hidden persistent state |
| Message passing / IPC | canonical zone intents, Effect Intent Journal, ordered work items | Transport is not gameplay truth |
| Scheduling / execution requirements | #485 NPC cadence + #556 Simulation Work Order | No second scheduler |
| Bounded resource utilization | #596 causal catch-up caps, #616 trace/tick bounds, #556 work-item caps | Overflow is explicit/fail-closed |
| Deterministic offline playback | #139 replay semantics + #616 DES validation harness | Replay is side-effect-free |
| Schema/interface discipline | strict Zod contracts, causal receipt schemas, migration gates | Canonical identity is hash-bound |
| Multi-node / transport concerns | #617 deterministic zone-delay validation | Network timing remains a validation side channel |

## Exact equivalence boundary

The experiment is considered equivalent only at the canonical evidence layer:

`same scenario + same seed + same source revision`
must produce the same:
- canonical ResultSet hash
- trace hash
- receipt-chain hash
- terminal canonical-state hash
- partition/recombine work-plan hash

Elapsed time and throughput remain observational metrics and are excluded from the canonical result hash.

The test lane exercises the real Aurion causal tick path through `AuthoritativeMovementZone`, `AurionTickRecorder`, `replayZoneTick` and the headless causal oracle. It does not introduce a Clockwork reducer or mutate production persistence.

## Resource policy

Clockwork's bounded-resource idea maps to explicit Aurion bounds:
- #616 maximum trace/event and tick bounds
- #556 bounded simulation work items
- #596 bounded NPC catch-up steps
- existing receipt/evidence schemas with fixed canonical serialization

Budget exhaustion is a deterministic FAIL/CAP condition, never an implicit slowdown or dropped truth update.

## Production rule

No Clockwork binary, scheduler, DSL or runtime component is a production dependency of Aurion as a result of this evaluation. A future external execution experiment would have to bind its exact upstream revision/toolchain, emit non-authoritative evidence, compare against existing #139/#616 replay evidence, and pass the same exact-revision runtime gates before any additional adoption decision.

## Verification

The companion boundary test proves:
1. the mapping points to existing Aurion-owned authority surfaces;
2. the repository has no Clockwork runtime dependency;
3. the same deterministic DES scenario is hash-equivalent under reordered submission;
4. the authoritative runtime path remains receipt/replay based;
5. no presentation-only or wall-clock signal participates in canonical truth.
