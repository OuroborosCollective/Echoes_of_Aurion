# Aurion Structure Grammar CAG Analysis

## Overview

The Structure Grammar CAG Analysis pipeline provides an optional Wolfram/CAG
analysis path for the Deterministic Structure Grammar Engine (issue #512). It
examines the **already-compiled** Structure IR (recipe + fingerprint) and
produces reproducible mathematical analysis evidence.

**Aurion determines reality. CAG investigates its form. Runtime projects it.
Evidence connects both sides reproducibly.**

## Architecture Boundary

CAG/Wolfram is **never** a generator of world state and **never** a runtime
authority. The boundary is:

```
canonical Aurion data → opaque bounded analysis input → CAG
                                                        ↓
                                                  evidence only
```

### Not permitted

- CAG generates gameplay state.
- CAG decides which structure exists in the world.
- CAG replaces seed/hash/receipt evidence.
- CAG writes WorldChunk deltas.
- CAG receives live persistence rows, secrets, or unfiltered mutable state.
- A CAG result becomes automatically gameplay-effective.

### Permitted

- CAG checks recursion depth, expansion budgets, reachability, cycles,
  bounding-box invariants, rotation invariants, overlaps, degenerate
  primitives, symmetry, deterministic variant spaces, seed/grammar/anchor
  sensitivity, and structural differences between two already-generated recipes.
- A CAG result returns as analysis evidence bound to the tested recipe identity.

## Pipeline

```
#512 canonical Recipe / IR
        ↓
bounded opaque analysis projection
        ↓
safe Wolfram literal construction
        ↓
CodeParser preflight  →  parser structure/hash
        ↓
CodeInspector diagnostics  →  inspector findings/hash
        ↓
existing Wolfram CAG
        ↓
mathematical / graph analysis
        ↓
analysis evidence envelope
```

### Stage responsibilities

**Opaque analysis projection** — local, deterministic, always executed.
Projects the recipe to numeric-only structural data (positions, sizes,
rotations, bounding box, overlaps, connected components, symmetry). No
identifiers, secrets, or mutable state cross this boundary.

**Safe Wolfram literal construction** — builds a Wolfram Language expression
from the numeric projection data only. Identifiers (grammarId, anchorId, etc.)
are validated against an allowlist pattern and never interpolated into
executable Wolfram code. The expression is bounded by `MAX_WOLFRAM_EXPR_CHARS`
(20 000) and `MAX_PRIMITIVES_FOR_CAG` (256).

**CodeParser** (`WolframResearch/codeparser`) — parses the constructed Wolfram
expression for syntactic/structural integrity. Produces a reproducible parser
structure hash. Never decides world/gameplay existence.

**CodeInspector** (`WolframResearch/codeinspector`) — inspects the parsed
expression for statically detectable issues. Findings are bound as diagnostic
evidence. A warning/finding is not a gameplay mutation and not a world verdict.

**CodeFormatter** (`WolframResearch/codeformatter`) — debug/audit/review
display only. Does not influence recipeHash, analysisFingerprint, observationKey,
Causal Root, or World-Identity. A formatter hash is optional audit metadata.

**Wolfram CAG** — the existing `WolframCagClient` from `server/wolframCag.ts`.
No second provider or client is created. The same `languageCompute` endpoint
is used for all three source-intelligence stages and the mathematical analysis.

## Evidence Contract

Every analysis result binds at minimum:

| Field | Description |
|-------|-------------|
| `protocol` | `aurion.structure-grammar-cag.v1` |
| `analysisVersion` | `aurion.structure-grammar-cag-analysis.v1` |
| `inputRecipeHash` | The deterministic fingerprint from the compiler |
| `worldSeedHash` | The world seed hash (already a hash, not the seed) |
| `grammarId` | The grammar identifier (validated) |
| `grammarVersion` | The grammar version (validated) |
| `sourceRevision` | The git source revision |
| `analysisVariant` | The analysis variant identifier |
| `requestSha256` | SHA-256 of the Wolfram analysis expression |
| `responseSha256` | SHA-256 of the CAG response (or local projection) |
| `analysisFingerprint` | SHA-256 of the full analysis result |
| `mutationAuthority` | Always `none` |
| `sourceBoundary` | `opaque_structure_projection_only` |

### Extended contract (when source intelligence is executed)

| Field | Description |
|-------|-------------|
| `parserId` | `WolframResearch/codeparser` |
| `parserRevision` | CodeParser revision |
| `parserStructureHash` | Hash of the parsed expression structure |
| `inspectorId` | `WolframResearch/codeinspector` |
| `inspectorRevision` | CodeInspector revision |
| `inspectorFindingsHash` | Hash of the inspector findings |
| `formatterId` | `WolframResearch/codeformatter` |
| `formatterRevision` | CodeFormatter revision |
| `formatterHash` | Optional audit metadata hash |

When source intelligence is disabled or unavailable, the status is
`NOT_CONFIGURED` or `UNAVAILABLE`.

## Status values

| Status | Meaning |
|--------|---------|
| `MATCH` | CAG analysis succeeded; recipe fingerprint verified |
| `FALSIFIED` | Recipe fingerprint does not match the recipe data |
| `FIRST_DIVERGENCE` | First structural divergence found between two recipes |
| `NOT_CONFIGURED` | CAG not configured; local contract evidence returned |
| `UNAVAILABLE` | CAG client could not be created |
| `PROVIDER_FAILED` | CAG call failed; local analysis still available |

When CAG is not configured, the analysis still runs locally and returns
clearly-labeled local contract evidence (`localContractEvidence: true`).
Aurion can always continue to deterministically materialize regardless of
CAG availability.

## Safe Literal Boundary

Identifiers (grammarId, grammarVersion, anchorId, analysisVariant) are
validated against the pattern `^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$` before any
CAG contact. Invalid identifiers are rejected with
`STRUCTURE_GRAMMAR_CAG_INVALID_IDENTIFIER`.

The Wolfram expression contains only:
- Integer numeric data (positions, sizes, rotations from primitives)
- Wolfram built-in functions (Module, Min, Max, Mean, For, If, And, Length, etc.)
- A variant comment (`(* variant=... *)` with the validated variant name)

No string identifiers, secrets, world seed values, causal roots, asset keys,
material keys, or persistence data are interpolated into the Wolfram expression.

## API

### `analyzeStructureGrammarCag`

```typescript
async function analyzeStructureGrammarCag(
  compilation: StructureGrammarCompilation,
  options?: {
    client?: WolframCagClient;       // override client (for testing)
    environment?: NodeJS.ProcessEnv; // override environment
    analysisVariant?: string;        // default: "structural"
  },
): Promise<StructureGrammarCagAnalysisEvidence>
```

### `compareStructureGrammarRecipes`

```typescript
function compareStructureGrammarRecipes(
  left: StructureGrammarCompilation,
  right: StructureGrammarCompilation,
): StructureGrammarCagComparisonEvidence
```

Compares two already-compiled recipes field by field and returns the first
point of structural divergence. Returns `MATCH`, `FIRST_DIVERGENCE`, or
`FALSIFIED` (if either recipe fingerprint is invalid).

## Files

| File | Purpose |
|------|---------|
| `server/structureGrammarCagAnalysis.ts` | Analysis module |
| `server/structureGrammarCagAnalysis.test.ts` | Tests |
| `docs/aurion-structure-grammar-cag.md` | This document |

## Existing CAG boundary (unchanged)

- `server/wolframCag.ts` — Wolfram CAG provider client
- `server/wolframCagRuntimeReadback.ts` — Runtime readback evidence boundary
- `server/worldContext/internalGraphWolfram.ts` — Internal graph Wolfram probe

These files are not modified. The structure grammar CAG analysis extends the
existing CAG surface; it does not create a second provider or protocol.
