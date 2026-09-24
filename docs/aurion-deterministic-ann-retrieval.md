# Aurion Deterministic ANN Retrieval V1

## Purpose

Aurion now has a rebuildable semantic retrieval acceleration layer for canonical World Context sources.

The design intentionally borrows the useful production pattern from HNSW/ScaNN without making the index a source of truth:

`canonical sources -> deterministic feature vector -> Int8 quantized HNSW candidate routing -> exact cosine re-score -> canonical source readback`

## Authority boundary

MariaDB/runtime receipts and the existing canonical World Context source adapters remain authoritative.

The ANN index is:
- rebuildable;
- in-memory;
- derived only from already hash-verified canonical sources;
- incapable of mutating gameplay, world state, quests, NPC state or persistence;
- discarded/rebuilt after process restart;
- identified by source-root and index hashes.

## Internal-only boundary

This capability is intentionally **not an external API**.

There is no public tRPC route, public HTTP endpoint, external MCP tool, provider callback or cloud vector-store write for ANN retrieval. The internal service entrypoint is named `internalSemanticSearch` and is not registered in `server/routes/aurionContextRouter.ts`.

Wolfram is treated only as an optional analysis aid for synthetic/opaque graph structure. Live canonical WorldContext text, runtime state, secrets and persistence rows are never sent to Wolfram by this integration.

A candidate is never returned from the ANN layer unless its source ID and source hash still match the canonical source set used to build the index.

## Determinism

The vectorizer uses Unicode NFKC normalization, deterministic token/bigram feature hashing and L2 normalization. HNSW levels are derived from SHA-256 of the stable source ID rather than runtime RNG.

Approximate routing uses symmetric Int8 scalar quantization. Final ranking uses exact floating-point cosine similarity over the same deterministic feature vectors.

The receipt exposes:
- source root hash;
- index version/hash;
- query hash;
- ANN candidate-set hash;
- exact result hash;
- exact-rescore flag.

The existing World Context capsule selection path is intentionally unchanged by this first integration. This keeps the new acceleration surface additive until live workload measurements establish acceptable recall/latency.

## Operational limits

This is a first deterministic local ANN layer, not a claim of billion-scale production performance. It does not yet implement trained ScaNN anisotropic codebooks, external vector storage, distributed sharding or persistent index snapshots.

Those capabilities can be added later behind the same truth boundary once actual Aurion workloads justify them.

## Safety and evidence

No runtime state is inferred from the index itself. A source-hash mismatch fails closed. No mock database, external embedding provider or wall-clock randomness is involved in the retrieval path.


## WorldContext structural diagnostics

The same internal graph projection now has a deterministic structural-health layer. It reports measurements instead of a composite score:

- node/relation counts and unique undirected connectivity;
- connected-component count, isolated nodes, leaf count and maximum/average degree;
- graph density, articulation-node count and finite graph distance;
- self-loop and duplicate-undirected-pair integrity observations.

`compareInternalSemanticGraphGenerations(...)` compares two verified graph generations by exact node/relation identity and emits reproducible change signals for node/edge churn, fragmentation, isolation growth, density shifts, articulation changes and distance changes. Thresholds are fixed constants and are evidence signals, not gameplay decisions.

The WorldContext service returns the structural snapshot alongside its existing internal graph diagnostics. The comparison primitive remains server-internal and has no public route or MCP registration.

This layer is rebuildable and read-only. It does not write graph truth, gameplay state or persistence and does not replace the existing semantic-graph verification/readback path.

The Wolfram CAG integration remains optional and explicit: `toWolframLanguageGraph(...)` supplies only the opaque graph topology to Wolfram-compatible analysis. No live source text, provider secrets, persistence rows or mutable gameplay state are transported by the structural diagnostics layer.
