# Aurion deterministic World Graph Grammar Reconciliation

Issue #598 is reconciled at the world-graph boundary without introducing a second world-state engine.

WorldSeed + generation revision + ruleset + grammar are compiled into a canonical multilevel graph representation:

macro -> zone -> biome -> travel -> settlement -> structure -> chunk

Each node carries a deterministic stream identity, constraint hash and node hash. Each edge carries an edge hash. Layer hashes and explicit parent hashes make the hierarchy independently evidence-bindable.

The stream policy uses domain-separated SHA-256 identities. It is a deterministic stream partition contract, not a claim that the existing terrain/structure generator has been replaced. The current Aurion generator and observation/projection path remain authoritative.

The CAG verifier receives only a bounded constraint mask. Local validation covers parent references, edge references, duplicate/self edges and canonical ordering. Wolfram can independently return the same bounded mask; disagreement is FALSIFIED and provider failure is non-authoritative.

The canonical graph is designed to populate the existing WorldGenerationEvidencePassport canonicalGraphHash field and compose with the existing #510/#512-#515 world-generation evidence. No persistence or Causal Tick mutation is performed by this compiler.

Negative cases include invalid hashes/revisions, unknown rules, layer mismatches, missing parents, cycles, duplicate nodes/edges, self edges and node/edge budget overflow.

This first slice is intentionally a reconciliation layer. It does not claim a new WFC engine, a new terrain truth source, or runtime CAG generation.