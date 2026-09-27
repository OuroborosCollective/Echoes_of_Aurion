# Aurion Deterministic DES Validation

`#616` is a validation/evidence lane around existing Aurion authority. It does not introduce a second scheduler or simulation authority.

## Canonical execution path

```text
scenario manifest + seed + source revision
        -> Aurion AuthoritativeMovementZone
        -> existing v2 causal tick receipts
        -> RecordedTickEntry evidence
        -> existing replayZoneTick / HeadlessCausalOracle
        -> deterministic ResultSet + Trace
        -> #556 work-order partition/recombine equivalence
```

## ResultSet semantics
- `canonicalResultHash` covers only deterministic evidence.
- `observationalMetrics` contains elapsed time / throughput and is deliberately excluded from the canonical hash.
- missing or unverifiable evidence is `UNPROVABLE`, never an invented PASS.
- first divergent replay stage is retained when available.

## Existing-lane reconciliation
- #139 supplies the existing replay-oracle semantics; #616 consumes those semantics and does not create a second reducer.
- #556 owns canonical cross-phase simulation ordering; #616 only verifies that its serial and partition/recombine plans agree.
- #617 owns cross-zone delay semantics; #616 does not duplicate its network simulator.
- #267 owns high-density performance measurement; timings collected by #616 remain observational and do not authorize gameplay changes.
- #591 owns Game-Theory/CAG research; #616 treats those as upstream evidence where a scenario supplies them, not as runtime truth.

## Controlled scenario coverage
The harness deliberately starts from the real Aurion causal tick path. NPC/life, economy, structure-context and cross-zone scenario families are represented by their existing Aurion lanes rather than duplicated inside a second simulation engine. This keeps #616 a validation harness and lets each domain retain its canonical owner.

## Parallel execution invariant
`canonicalizeSimulationWork(partitionSimulationWork(work))` must equal the serial canonical work plan. Partition order and worker completion order cannot affect the plan hash.

## Negative cases
The test suite covers input-hash tampering, invalid source revision and deterministic manifest failures. Production state is never mutated by the harness.

## Real runtime gate
The dedicated workflow executes on the exact PR head with frozen dependencies. Runtime/container evidence remains separate from this offline harness; no green claim is made until the repository's existing Runtime Candidate / Container Proof lanes also pass.
