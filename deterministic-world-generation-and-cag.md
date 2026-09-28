# Deterministic World Generation & CAG

Aurion remains the only gameplay and world-state authority. World generation derives deterministically from WorldSeed, world-generation revision, grammar revision, generator version, chunk coordinates and versioned parameters.

```
WorldSeed + WorldRevision + GrammarRevision
        ↓
Canonical World Graph
        ↓
Biome / Travel / Settlement / Dungeon Structure Graphs
        ↓
Deterministic Terrain Fields
        ↓
Structure Placement
        ↓
Chunk Projection
        ↓
Aurion Runtime
```

Wolfram CAG is an optional offline/CI/design verification oracle. It never becomes the generator, gameplay authority, persistence writer or runtime tick dependency.

## Graph Grammar

Structure rules should be an explicit serializable IR with matcher, replacement graph/subgraph, ports, orientation set, bounded scale range, priority, deterministic tie-break, constraints and named seed streams. Canonical sorting and explicit PRNG derivation make expansion reproducible.

## Terrain QA

Terrain must prove deterministic regeneration, chunk-seam equality, slope/walkability constraints, water/land continuity, deterministic biome/material classification and bounded geometry/statistical properties. No wall-clock/process randomness enters world identity.

## Wolfram / CAG

CAG receives only bounded opaque projections of already-generated Aurion data. Suitable checks include graph connectivity, reachability, cycle/recursion bounds, structure spacing, non-overlap, minimum clearance, slope limits, area/volume budgets and regeneration invariants. CAG contradiction blocks candidate ruleset promotion; it does not mutate live world state.

Wolfram provides graph tooling and integrated geometric computation suitable for these verification and research analyses.

## GLB normalization

GLB/glTF remains presentation content. The deterministic path is:

```
GLB bytes
 → geometry bounds AABB/OBB
 → declared unit/orientation metadata
 → canonical axis convention
 → target gameplay envelope
 → deterministic scale transform
 → pivot / ground normalization
 → optional grid snap
 → collision / LOD validation
 → normalized manifest + hashes
```

Scale comes from measured geometry plus explicit Aurion rules. CAG verifies the calculation; it does not choose artistic scale or change gameplay identity.

## Evidence passport

Candidate world-generation and asset-normalization revisions bind source revision, generator/normalizer revision, ruleset/grammar revision, seed/chunk identity, canonical input/output hashes, CAG request/response/result hashes, analysis version and `mutationAuthority=none`.

Promotion:

```
CANDIDATE → deterministic local tests → CAG verification → golden replay → hash parity → explicit promotion → ACTIVE
```

Existing Aurion structure grammar/CAG issues #512/#513/#514/#515 remain upstream. New #598–#602 focus the missing world-graph, terrain, structure-placement, GLB-normalization and evidence-passport slices. Existing Causal Tick, chunk-state, projection, GDS and asset-shipping contracts remain the integration boundary.

### Wolfram reference anchors

* https://resources.wolframcloud.com/FunctionRepository/resources/WolframModelGlocalMultiwaySystem
* https://resources.wolframcloud.com/FunctionRepository/resources/WolframModelGlocalBranchialGraph
* https://reference.wolfram.com/language/guide/GeometricComputation
* https://reference.wolfram.com/language/guide/SyntheticGeometry
* https://reference.wolfram.com/language/guide/SummaryOfNewFeaturesIn14
