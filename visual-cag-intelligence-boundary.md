# Visual CAG/Wolfram Intelligence Boundary (#527)

Extension of #513. CAG/Wolfram, CodeParser/Inspector/Formatter and external
research may **analyze** the Visual Construction, but they never author Aurion
runtime truth. Research evidence is design/review evidence only.

## Allowed flow

```
Aurion canonical descriptor (visualItemProtocol.v1, already-confirmed loot)
 -> bounded Visual Recipe/IR (shared/visualConstructionProtocol.ts)
 -> optional Wolfram / Source Intelligence / Literature analysis
     (server/visualCagIntelligenceBoundary.ts)
 -> analysis evidence only
```

## Hard rules

- The local deterministic compiler (`compileVisualRecipe`) always runs —
  with or without any provider. Provider availability never changes recipe
  or geometry identity.
- Analysis binds exclusively to `recipeHash` + `compilerVersion` +
  `sourceRevision`.
- Analysis output is outside every item/gameplay hash
  (`gameplayHashContribution: "none"`); `assertVisualAnalysisOutsideGameplayHash`
  enforces this.
- `unavailable` / `inconclusive` are explicit statuses
  (`NOT_CONFIGURED`, `UNAVAILABLE`, `INCONCLUSIVE`, `PROVIDER_FAILED`, `DIVERGED`,
  `FALSIFIED`) — never a silent `MATCH`. `MATCH` requires an actually
  executed provider call whose bounded integer result equals the local
  deterministic projection.
- The recipe IR carries no gameplay statistics (no itemPower, no affix
  stat values), so the boundary cannot become a second gameplay authority.
- `mutationAuthority: "none"` and `runtimeTruthSource: "none"` on every
  evidence record; `assertVisualAnalysisIsDesignEvidenceOnly` rejects any
  forged authority.

## Forbidden (unchanged from #513/#527)

CAG decides item existence; CAG creates loot identity; CAG mutates
equipment; provider availability silently changing geometry identity;
unvalidated generative output becoming truth.

## Evidence contract

`aurion.visual-cag.v1` / analysis version `aurion.visual-cag-analysis.v1`:

| field | meaning |
| --- | --- |
| `recipeHash` | sha256 over domain-separated canonical recipe (`aurion.visual.recipe.v1`) |
| `compilerVersion` / `sourceRevision` | revision binding |
| `requestSha256` / `responseSha256` | provider request/response hashes |
| `analysisFingerprint` | hash over recipeHash + projection + status |
| `status` | `MATCH` / `DIVERGED` / `FALSIFIED` / `NOT_CONFIGURED` / `UNAVAILABLE` / `INCONCLUSIVE` / `PROVIDER_FAILED` |
| `projection` | opaque numeric projection (affix counts, quality rank, flags) |
| `mutationAuthority` / `gameplayHashContribution` / `runtimeTruthSource` | always `"none"` |

Tests: `server/visualCagIntelligenceBoundary.test.ts`.
