import { createHash } from "node:crypto";
import {
  AURION_VISUAL_RECIPE_COMPILER_VERSION,
  AURION_VISUAL_RECIPE_PROTOCOL,
  VISUAL_ANALYSIS_FINGERPRINT_DOMAIN,
  canonicalSerializeVisual,
  hashVisualRecipe,
  visualRecipeSchema,
  type VisualRecipe,
  type VisualRecipeCompilation,
} from "@shared/visualConstructionProtocol";
import {
  visualItemDescriptorSchema,
  type VisualItemDescriptor,
} from "@shared/visualItemProtocol";
import {
  requireWolframCagClient,
  wolframCagConfigurationStatus,
  type WolframCagClient,
  type WolframCagEvidence,
} from "./wolframCag";

// ─── Protocol constants ───────────────────────────────────────────────
//
// Issue #527: CAG/Wolfram, CodeParser/Inspector/Formatter and external
// research may ANALYZE the bounded visual recipe, but never author Aurion
// runtime truth. The local deterministic compiler below runs with or
// without any provider. Provider availability never changes recipe or
// gameplay identity.

export const AURION_VISUAL_CAG_PROTOCOL = "aurion.visual-cag.v1" as const;
export const AURION_VISUAL_CAG_ANALYSIS_VERSION =
  "aurion.visual-cag-analysis.v1" as const;

const ANALYSIS_REQUEST_DOMAIN = "aurion.visual-cag-request.v1";
const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
const MAX_WOLFRAM_EXPR_CHARS = 20_000;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashWithDomain(domain: string, value: string): string {
  return sha256(`${domain}::${value}`);
}

function validateIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || !SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`VISUAL_CAG_INVALID_IDENTIFIER: ${field}`);
  }
}

const textCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

// ─── Local deterministic compiler ────────────────────────────────────
//
// Pure, deterministic projection from an already-confirmed visual item
// descriptor to the bounded visual recipe IR. No wall-clock, no process
// randomness, no provider contact — it always runs, CAG or not.

export function compileVisualRecipe(
  descriptor: VisualItemDescriptor,
  options: Readonly<{ sourceRevision: string }>
): VisualRecipeCompilation {
  validateIdentifier(options.sourceRevision, "sourceRevision");
  const parsed = visualItemDescriptorSchema.parse(descriptor);

  const affixes = parsed.affixes
    .map(affix => ({ id: affix.id, slot: affix.slot, groupId: affix.groupId }))
    .sort(
      (left, right) =>
        textCompare(left.slot, right.slot) ||
        textCompare(left.id, right.id) ||
        textCompare(left.groupId, right.groupId)
    );

  const recipe = visualRecipeSchema.parse({
    protocol: AURION_VISUAL_RECIPE_PROTOCOL,
    compilerVersion: AURION_VISUAL_RECIPE_COMPILER_VERSION,
    descriptorVersion: parsed.version,
    itemDefinitionId: parsed.itemDefinitionId,
    familyId: parsed.familyId,
    category: parsed.category,
    equipmentSlot: parsed.equipmentSlot,
    quality: parsed.quality,
    affixes,
    setId: parsed.setId,
    visual: parsed.visual,
    source: {
      lootReceiptId: parsed.source.lootReceiptId,
      contextHash: parsed.source.contextHash,
      deterministicHash: parsed.source.deterministicHash,
      visualEventIndex: parsed.source.visualEventIndex,
    },
    visualSeed: parsed.visualSeed,
    sourceRevision: options.sourceRevision,
  }) as VisualRecipe;

  return Object.freeze({
    recipe: Object.freeze({
      ...recipe,
      affixes: Object.freeze(
        recipe.affixes.map(affix => Object.freeze({ ...affix }))
      ),
      visual: recipe.visual ? Object.freeze({ ...recipe.visual }) : null,
      source: Object.freeze({ ...recipe.source }),
    }),
    recipeHash: hashVisualRecipe(recipe),
  });
}

// ─── Opaque analysis projection ───────────────────────────────────────
//
// Bounded numeric/categorical projection. This is the only shape CAG ever
// sees — never raw gameplay state, never secrets.

export type VisualOpaqueAnalysisProjection = Readonly<{
  affixCount: number;
  affixSlotCounts: Readonly<Record<string, number>>;
  distinctAffixGroups: number;
  hasSet: boolean;
  hasGlbAsset: boolean;
  hasMaterialVariant: boolean;
  qualityRank: number;
  visualEventIndex: number;
}>;

const QUALITY_RANKS: Readonly<Record<string, number>> = Object.freeze({
  normal: 0,
  magic: 1,
  rare: 2,
  set: 3,
  unique: 4,
  mythic: 5,
});

export function projectVisualRecipeToOpaqueAnalysis(
  recipe: VisualRecipe
): VisualOpaqueAnalysisProjection {
  const affixSlotCounts: Record<string, number> = {};
  const groups = new Set<string>();
  for (const affix of recipe.affixes) {
    affixSlotCounts[affix.slot] = (affixSlotCounts[affix.slot] ?? 0) + 1;
    groups.add(affix.groupId);
  }
  return Object.freeze({
    affixCount: recipe.affixes.length,
    affixSlotCounts: Object.freeze(affixSlotCounts),
    distinctAffixGroups: groups.size,
    hasSet: recipe.setId !== null,
    hasGlbAsset: recipe.visual?.glbAssetId != null,
    hasMaterialVariant: recipe.visual?.materialVariant != null,
    qualityRank: QUALITY_RANKS[recipe.quality] ?? 0,
    visualEventIndex: recipe.source.visualEventIndex,
  });
}

// ─── Evidence types ───────────────────────────────────────────────────
//
// "MATCH" is reachable ONLY when the provider actually executed and its
// observed integers equal the local deterministic projection. Every
// unavailable / inconclusive path is explicit and never collapses to MATCH.

export type VisualCagAnalysisStatus =
  | "MATCH"
  | "DIVERGED"
  | "FALSIFIED"
  | "NOT_CONFIGURED"
  | "UNAVAILABLE"
  | "INCONCLUSIVE"
  | "PROVIDER_FAILED";

export type VisualCagAnalysisEvidence = Readonly<{
  protocol: typeof AURION_VISUAL_CAG_PROTOCOL;
  analysisVersion: typeof AURION_VISUAL_CAG_ANALYSIS_VERSION;
  /** Binding: recipe identity the analysis inspected. */
  recipeHash: string;
  compilerVersion: typeof AURION_VISUAL_RECIPE_COMPILER_VERSION;
  sourceRevision: string;
  requestSha256: string;
  responseSha256: string;
  analysisFingerprint: string;
  status: VisualCagAnalysisStatus;
  projection: VisualOpaqueAnalysisProjection;
  cagEvidence: WolframCagEvidence | null;
  /**
   * Hard guarantees for the intelligence boundary:
   * - mutationAuthority: analysis can never mutate Aurion state
   * - gameplayHashContribution: analysis output never enters the
   *   item/gameplay deterministic hash
   * - runtimeTruthSource: analysis is design/review evidence only
   */
  mutationAuthority: "none";
  gameplayHashContribution: "none";
  runtimeTruthSource: "none";
  truthNotice: string;
}>;

const TRUTH_NOTICE =
  "Visual CAG/Wolfram analysis is design/review evidence only. It never decides item existence, loot identity or equipment state, and its output is never part of any item or gameplay hash.";

function baseEvidence(
  compilation: VisualRecipeCompilation,
  status: VisualCagAnalysisStatus,
  projection: VisualOpaqueAnalysisProjection,
  requestSha256: string,
  responseSha256: string,
  cagEvidence: WolframCagEvidence | null
): VisualCagAnalysisEvidence {
  return Object.freeze({
    protocol: AURION_VISUAL_CAG_PROTOCOL,
    analysisVersion: AURION_VISUAL_CAG_ANALYSIS_VERSION,
    recipeHash: compilation.recipeHash,
    compilerVersion: AURION_VISUAL_RECIPE_COMPILER_VERSION,
    sourceRevision: compilation.recipe.sourceRevision,
    requestSha256,
    responseSha256,
    analysisFingerprint: hashWithDomain(
      VISUAL_ANALYSIS_FINGERPRINT_DOMAIN,
      canonicalSerializeVisual({
        recipeHash: compilation.recipeHash,
        projection,
        status,
      })
    ),
    status,
    projection,
    cagEvidence,
    mutationAuthority: "none",
    gameplayHashContribution: "none",
    runtimeTruthSource: "none",
    truthNotice: TRUTH_NOTICE,
  });
}

// ─── Safe Wolfram expression (bounded integers only) ──────────────────

function buildVisualAnalysisExpression(
  projection: VisualOpaqueAnalysisProjection
): string {
  return [
    "Module[{observed},",
    `  observed = {${projection.affixCount}, ${projection.distinctAffixGroups}, ${projection.qualityRank}, ${projection.visualEventIndex}};`,
    "  {Length[observed], Total[observed], observed}",
    "]",
  ].join("\n");
}

function parseObservedIntegers(
  result: string
): readonly number[] | null {
  const trimmed = result.trim().replace(/^Out\[[0-9]{1,9}\]\s*=\s*/, "");
  const match = /^\{(-?[0-9]+),\s*(-?[0-9]+),\s*\{([^{}]*)\}\}$/.exec(
    trimmed.replace(/\s+/g, " ")
  );
  if (!match) return null;
  const inner = match[3]!.trim();
  const parts = inner.length === 0 ? [] : inner.split(",").map(p => p.trim());
  if (!parts.every(p => /^-?[0-9]+$/.test(p))) return null;
  return Object.freeze([
    Number(match[1]),
    Number(match[2]),
    ...parts.map(Number),
  ]);
}

// ─── Main analysis entry point ────────────────────────────────────────
//
// Optional by construction. Every failure mode returns explicit,
// non-MATCH evidence; the local compiler is never gated on the provider.

export async function analyzeVisualRecipeCag(
  compilation: VisualRecipeCompilation,
  options: Readonly<{
    client?: WolframCagClient;
    environment?: NodeJS.ProcessEnv;
  }> = {}
): Promise<VisualCagAnalysisEvidence> {
  const environment = options.environment ?? process.env;

  // 1. Verify the recipe binds to its declared hash (tamper check) and
  //    that the recipe hash domain is disjoint from any gameplay hash.
  const projection = projectVisualRecipeToOpaqueAnalysis(compilation.recipe);
  const fingerprintValid =
    hashVisualRecipe(compilation.recipe) === compilation.recipeHash;

  const analysisExpr = buildVisualAnalysisExpression(projection);
  if (analysisExpr.length > MAX_WOLFRAM_EXPR_CHARS) {
    throw new Error(
      `VISUAL_CAG_EXPR_TOO_LARGE: ${analysisExpr.length} > ${MAX_WOLFRAM_EXPR_CHARS}`
    );
  }
  const requestSha = hashWithDomain(ANALYSIS_REQUEST_DOMAIN, analysisExpr);
  const localResponseSha = hashWithDomain(
    VISUAL_ANALYSIS_FINGERPRINT_DOMAIN,
    canonicalSerializeVisual(projection)
  );

  if (!fingerprintValid) {
    return baseEvidence(
      compilation,
      "FALSIFIED",
      projection,
      requestSha,
      localResponseSha,
      null
    );
  }

  // 2. Resolve the optional provider client.
  let client = options.client;
  if (!client) {
    const cagConfig = wolframCagConfigurationStatus(environment);
    if (!cagConfig.configured) {
      return baseEvidence(
        compilation,
        "NOT_CONFIGURED",
        projection,
        requestSha,
        localResponseSha,
        null
      );
    }
    try {
      client = requireWolframCagClient(environment);
    } catch {
      return baseEvidence(
        compilation,
        "UNAVAILABLE",
        projection,
        requestSha,
        localResponseSha,
        null
      );
    }
  }

  // 3. Optional provider analysis. Any failure is explicit evidence,
  //    never a silent identity change and never a MATCH.
  try {
    const cagEvidence = await client.languageCompute({
      code: analysisExpr,
      timeConstraint: 10,
      maxChars: 4_096,
    });
    const observed = parseObservedIntegers(cagEvidence.result);
    if (observed === null) {
      // Provider answered but the result is not bounded integers:
      // inconclusive, explicitly not a match.
      return baseEvidence(
        compilation,
        "INCONCLUSIVE",
        projection,
        requestSha,
        cagEvidence.responseSha256,
        cagEvidence
      );
    }
    const expected = [
      4,
      projection.affixCount +
        projection.distinctAffixGroups +
        projection.qualityRank +
        projection.visualEventIndex,
      projection.affixCount,
      projection.distinctAffixGroups,
      projection.qualityRank,
      projection.visualEventIndex,
    ];
    const matches =
      observed.length === expected.length &&
      observed.every((value, index) => value === expected[index]);
    return baseEvidence(
      compilation,
      matches ? "MATCH" : "DIVERGED",
      projection,
      requestSha,
      cagEvidence.responseSha256,
      cagEvidence
    );
  } catch {
    return baseEvidence(
      compilation,
      "PROVIDER_FAILED",
      projection,
      requestSha,
      localResponseSha,
      null
    );
  }
}

// ─── Boundary guards ─────────────────────────────────────────────────

/**
 * Guard: analysis evidence must never be accepted as a gameplay truth
 * source. Only MATCH evidence with a provider response hash may be cited
 * in design review, and even then it carries no mutation authority.
 */
export function assertVisualAnalysisIsDesignEvidenceOnly(
  evidence: VisualCagAnalysisEvidence
): void {
  if (
    evidence.mutationAuthority !== "none" ||
    evidence.gameplayHashContribution !== "none" ||
    evidence.runtimeTruthSource !== "none"
  ) {
    throw new Error("VISUAL_CAG_BOUNDARY_VIOLATION");
  }
}

/**
 * Guard: the gameplay deterministic hash of a confirmed item must be
 * bit-identical before and after any analysis ran. Analysis output has
 * no input path into the item/gameplay hash.
 */
export function assertVisualAnalysisOutsideGameplayHash(
  gameplayHashBeforeAnalysis: string,
  gameplayHashAfterAnalysis: string
): void {
  if (gameplayHashBeforeAnalysis !== gameplayHashAfterAnalysis) {
    throw new Error("VISUAL_CAG_GAMEPLAY_HASH_MUTATED");
  }
}
