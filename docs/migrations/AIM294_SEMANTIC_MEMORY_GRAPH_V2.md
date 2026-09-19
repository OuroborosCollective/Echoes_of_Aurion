# AIM-294 / Wave 2 Step 27 — Semantic Memory Graph V2

## Authority boundary

WASD revision `28ecb7aec84271bd3bcc4fa5e1e7deef530804b6` is the revision-bound authority for graph construction, evidence verification, pruning and retrieval. Aurion owns only transactional MariaDB persistence/readback plus bounded API/AX1 projections. The historical V1 Aurion graph implementation remains readable as migration history but its write/query authority fails closed.

A graph edge is never promoted from free text or LLM reflection. The merged WASD capsule proves that free-text memory is excluded from graph truth, that a lookalike/unverified graph cannot be retrieved, and that reordered evidence produces the same graph and retrieval result. Aurion additionally re-reads decision receipts, action receipts, effect readbacks and memory links from MariaDB before WASD can compile or re-verify the graph.

## Hard performance budget

The budget is defined by the exact merged WASD constants, not by an Aurion-local scoring policy:

| Surface | Hard bound |
| --- | ---: |
| serialized graph | 524,288 bytes |
| retained nodes | 160 |
| retained edges | 384 |
| provenance refs per retained element | 160 |
| performed-action evidence consumed | latest 16 eligible receipts |
| traversal depth | 4 |
| traversal candidates | 64 |
| traversal results | 32 |
| start keys | 16 |
| node/edge filter values | 16 |
| authenticated public NPC graph rows | 6 |
| public nodes per NPC | 32 |
| public relations per NPC | 64 |

The invariant is `results <= candidates <= retained nodes` (32 <= 64 <= 160). Retrieval cannot return more than 32 nodes and cannot explore more than 64 candidates to depth 4. Aurion does not add a second score function; the public `sourceResultHash` is the WASD retrieval hash.

## Persistence and rebuild cost

For one generation, Aurion persists one immutable graph receipt plus the bounded WASD node/edge/provenance set and a rebuildable index projection. The index is not graph authority: deleting the current index must not prevent canonical graph verification, and rebuilding it must reproduce the same WASD retrieval bytes/result hash.

The canonical predecessor contract is hash chained. After process recreation, verifying generation `G` re-verifies the immediately preceding persisted V2 graph until the first V2 graph for that NPC is reached. Therefore the current cold verification cost is **O(H)** in the number `H` of persisted V2 graph generations for that NPC, while each individual graph remains bounded by the table above. This is an explicit operational cost, not a hidden “PASS”. A future checkpoint optimization must be introduced in the WASD verification contract rather than by trusting an Aurion-local shortcut.

## Evidence required before merge

Step 27 is not complete until the exact PR head proves: deterministic merged-capsule reproduction; real MariaDB rollback/idempotency/predecessor/restart/index-rebuild behavior; AIM-263/292/293 regressions; schema 0054 reconciliation/apply/readback; authenticated Phone/Tablet/Desktop projection parity; runtime/container evidence; and no raw provenance/private-memory leakage. The single Step-27 `Memory.md` entry is written only after those exact-head checks succeed.
