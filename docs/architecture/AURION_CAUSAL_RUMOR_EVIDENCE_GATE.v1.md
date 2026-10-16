---
description: Evidence gate and canonical invariants for the causal rumor & investigation wave (#781–#784, umbrella #785).
---

# Causal Rumor & Investigation — Evidence Gate (v1)

This document fixes the dependency order, the shared invariants and the end-to-end evidence gate for the rumor/investigation wave. It is descriptive of the merged contracts, not a new authority.

## Dependency order

```text
#487 NPC Information Ecology (existing authority)
  -> #781 player-facing rumor projection        (shared/rumorProjectionProtocol.ts)
  -> #782 investigation graph + deductions      (shared/investigationGraphProtocol.ts)
  -> #783 rumor-to-behavior bridge              (shared/rumorBeliefBridgeProtocol.ts)   [parallel lane]
  -> #784 journal / rumor board Aurion readmodel (shared/investigationJournalProtocol.ts)
  -> existing #595 quest/opportunity + typed action gateway (unchanged)
```

## Canonical invariants

1. World truth precedes claims; claims may be false or uncertain and never mutate truth.
2. Player/NPC belief is separate from canonical fact (`claim truth status != actor belief strength`).
3. Only existing typed gameplay gateways create consequences; deductions and journals are investigation/presentation state.
4. Server is authoritative; the Aurion UI renders server-confirmed readmodels only.
5. Fixed-point (BPS/Q16) and logical-index arithmetic for all replay-critical state; no wall-clock, no unseeded randomness.
6. No runtime LLM; Wolfram/game-theory and research sources are offline falsification/design inputs only.
7. Same confirmed input graph + ruleset version ⇒ same hashes at every stage (projection, graph, journal, belief vector, decision).

## End-to-end evidence gate

`server/causalRumorInvestigationEvidence.test.ts` proves, on the exact candidate head:

- **Scenario A (player investigation):** real world event → causal receipt → witness observation → communicated claim → player-visible rumor → corroborating evidence → validated player deduction → deduction receipt.
- **Scenario B (NPC belief):** uncertain/false rumor → NPC belief weight → changed planner choice → later evidence (logical expiry / contradiction discount) corrects the belief and restores the choice — canonical truth untouched throughout.
- **Replay equality:** one fingerprint hash over every stage artifact is identical across repeated runs (restart/readback equality at contract level).
- **Stale-revision rejection:** an intent built from an older journal fails closed against a moved projection revision (`DEDUCTION_STALE_PROJECTION`).

## Completion standard per slice

Exact-head CI/regression green, runtime readback where the slice touches persistence, causal provenance preserved end-to-end, no client/world authority leak, and exactly one `Memory.md` entry per merged slice (recorded by the automated post-merge recorder).
