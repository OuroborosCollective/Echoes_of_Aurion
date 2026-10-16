---
description: >-
  Deterministic player-facing information, investigation and belief architecture
  for Echoes of Aurion.
---

# Causal Rumor & Investigation Gameplay

This architecture turns Aurion's existing NPC Information Ecology into player-visible gameplay without creating a second world, quest, NPC, economy or narrative authority.

## Ownership

```
canonical world truth
  -> causal receipt
  -> witness / observation
  -> information claim
  -> trust / propagation / contradiction / logical expiry
  -> player rumor projection
  -> investigation graph
  -> deduction intent
  -> existing typed gameplay gateway
  -> causal consequence + receipt
```

{% hint style="warning" %}
A rumor is never world truth. A player or NPC may act on a rumor, but only an accepted typed action can change canonical state.
{% endhint %}

## Implementation lanes

| Lane        | Contract                                                                                |
| ----------- | --------------------------------------------------------------------------------------- |
| GitHub #781 | Player-facing causal rumor projection: claims, provenance, trust, disclosure and expiry |
| GitHub #782 | Investigation graph: clues, prerequisites, contradictions, corroboration and deductions |
| GitHub #783 | Rumor-to-behavior bridge: bounded belief inputs for existing NPC/economy planners       |
| GitHub #784 | Investigation journal/rumor board: read-only Aurion client projection                             |
| GitHub #785 | Umbrella dependency and evidence gate                                                   |

Existing foundations remain authoritative: #487 Information Ecology, #595 Systemic Quest Generation, #486 NPC planner, #544 Emergent Life and #558 Emergent World Master Integration.

## Claim model

A projected claim carries stable identity, causal source receipts, witness/transmission provenance, evidence class, Q16 confidence, logical freshness, contradiction/corroboration edges and disclosure scope.

Deterministic rules:

* fixed-point confidence/trust arithmetic;
* canonical ordering of receipts, witnesses and transmissions;
* logical index/tick expiry, never wall-clock expiry;
* duplicate propagation is idempotent;
* identical input graph + ruleset version produces the same projection hash;
* contradictory claims remain separate claims until evidence resolves them.

## Investigation graph

The player may know claims without those claims being true. The investigation state therefore records **knowledge and belief**, not canonical fact.

```
visible claims
  -> prerequisite / corroboration / contradiction relations
  -> selected evidence
  -> deduction intent + source projection hash
  -> server validation
  -> deduction receipt
```

Hidden/private claims cannot be referenced. Stale projection revisions are rejected.

## NPC belief bridge

```
claim
 + source trust
 + evidence class
 + freshness
 + corroboration
 -> bounded beliefQ16
 -> existing utility planner
 -> typed action
 -> gateway
 -> consequence
```

False information is allowed to change an actor's decision. It is not allowed to rewrite route danger, prices, faction state or any other canonical truth directly.

## Presentation boundary

The Aurion client in the browser receives a server-confirmed Aurion readmodel. The journal may group clues, display confidence/source classes, show discovered relations and submit deduction intents. It cannot invent clues, mark truth, grant rewards or complete investigations locally.

## Research basis

**Commercial signal:** ESO Update 51 Rumors demonstrates clue-led investigation with less explicit handholding. Aurion adopts the player-experience principle, not ESO's authored truth architecture.

**Structured epistemic progression:** arXiv:2609.23043 reports a Structured Knowledge Tree using explicit prerequisites and contradiction links to constrain investigative progression. Aurion uses the deterministic structural idea and does not require the paper's runtime LLM pipeline.

**Rumor propagation:** arXiv:2604.25258 provides a formal large-population rumor-propagation/control reference. It is an offline modeling input, not runtime authority.

**Trust-aware disclosure:** arXiv:2609.05340 models trust from reliability/consistency and trust-dependent disclosure. Aurion may test analogous deterministic disclosure hypotheses, but must not import stochastic noise into replay-critical gameplay.

**Game theory:** Wolfram TreeGame / FindTreeGameStrategies / VerifyTreeGameStrategy can be used offline to falsify signaling and incomplete-information policies. Counterexamples become regression fixtures; Wolfram never becomes gameplay authority.

## Required vertical evidence

```
real event
 -> receipt
 -> witness
 -> communicated claim
 -> player rumor
 -> second evidence
 -> contradiction/corroboration
 -> validated deduction
 -> typed action
 -> real consequence
 -> receipt/readback
```

A second scenario must prove an uncertain or false rumor can alter an NPC planner choice, while later evidence can correct that belief without ever mutating truth directly.

## Completion standard

Every merged slice requires exact-head CI/regression evidence, runtime readback, restart/replay equality where relevant, causal provenance, no client authority leak, and exactly one `Memory.md` entry containing the change, learned architectural insight and evidence.
