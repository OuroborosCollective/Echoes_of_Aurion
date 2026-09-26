import { createHash } from "node:crypto";
import {
  requireWolframCagClient,
  wolframCagConfigurationStatus,
  type WolframCagClient,
  type WolframCagEvidence,
} from "./wolframCag";
import type {
  StructureGrammarCompilation,
  StructureRecipe,
  StructuralPrimitive,
} from "@shared/deterministicStructureGrammarProtocol";

// ─── Protocol constants ───────────────────────────────────────────────

export const AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL = "aurion.structure-grammar-cag.v1" as const;
export const AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION = "aurion.structure-grammar-cag-analysis.v1" as const;

export const CODEPARSER_ID = "WolframResearch/codeparser" as const;
export const CODEPARSER_REVISION = "1.4.0" as const;
export const CODEINSPECTOR_ID = "WolframResearch/codeinspector" as const;
export const CODEINSPECTOR_REVISION = "1.0.0" as const;
export const CODEFORMATTER_ID = "WolframResearch/codeformatter" as const;
export const CODEFORMATTER_REVISION = "1.0.0" as const;

// ─── Safe literal boundary ────────────────────────────────────────────

const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const MAX_WOLFRAM_EXPR_CHARS = 20_000;
const MAX_PRIMITIVES_FOR_CAG = 256;
const RECIPE_HASH_DOMAIN = "aurion.structure.recipe.v1";
const ANALYSIS_REQUEST_DOMAIN = "aurion.structure-grammar-cag-request.v1";
const ANALYSIS_FINGERPRINT_DOMAIN = "aurion.structure-grammar-cag-fingerprint.v1";
const COMPARISON_FINGERPRINT_DOMAIN = "aurion.structure-grammar-cag-comparison.v1";

function validateIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || !SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`STRUCTURE_GRAMMAR_CAG_INVALID_IDENTIFIER: ${field}`);
  }
}

function escapeWolframString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ─── Canonical serialization (replicated from compiler for verification)

function canonicalSerialize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashWithDomain(domain: string, value: string): string {
  return sha256(`${domain}::${value}`);
}

// ─── Opaque analysis projection ──────────────────────────────────────

export type OpaqueAnalysisProjection = Readonly<{
  primitiveCount: number;
  boundingBoxMm: Readonly<{ minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }>;
  centerMm: Readonly<{ x: number; y: number; z: number }>;
  footprintAreaSqMm: number;
  volumeCuMm: number;
  overlapPairs: number;
  connectedComponents: number;
  symmetryAxisX: boolean;
  symmetryAxisZ: boolean;
  rotationVariants: readonly string[];
  primitiveKindCounts: Readonly<Record<string, number>>;
}>;

function aabbOverlap(a: StructuralPrimitive, b: StructuralPrimitive): boolean {
  return (
    a.positionMm.x < b.positionMm.x + b.sizeMm.x &&
    b.positionMm.x < a.positionMm.x + a.sizeMm.x &&
    a.positionMm.y < b.positionMm.y + b.sizeMm.y &&
    b.positionMm.y < a.positionMm.y + a.sizeMm.y &&
    a.positionMm.z < b.positionMm.z + b.sizeMm.z &&
    b.positionMm.z < a.positionMm.z + a.sizeMm.z
  );
}

function withinContactThreshold(a: StructuralPrimitive, b: StructuralPrimitive, threshold: number): boolean {
  const ac = { x: a.positionMm.x + a.sizeMm.x / 2, y: a.positionMm.y + a.sizeMm.y / 2, z: a.positionMm.z + a.sizeMm.z / 2 };
  const bc = { x: b.positionMm.x + b.sizeMm.x / 2, y: b.positionMm.y + b.sizeMm.y / 2, z: b.positionMm.z + b.sizeMm.z / 2 };
  const ar = Math.max(a.sizeMm.x, a.sizeMm.y, a.sizeMm.z) / 2;
  const br = Math.max(b.sizeMm.x, b.sizeMm.y, b.sizeMm.z) / 2;
  return (
    Math.abs(ac.x - bc.x) <= ar + br + threshold &&
    Math.abs(ac.y - bc.y) <= ar + br + threshold &&
    Math.abs(ac.z - bc.z) <= ar + br + threshold
  );
}

function computeConnectedComponents(primitives: readonly StructuralPrimitive[]): number {
  if (primitives.length === 0) return 0;
  const threshold = 100;
  const visited = new Set<number>();
  let components = 0;
  for (let i = 0; i < primitives.length; i++) {
    if (visited.has(i)) continue;
    components++;
    const queue = [i];
    visited.add(i);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (let j = 0; j < primitives.length; j++) {
        if (visited.has(j)) continue;
        if (aabbOverlap(primitives[cur]!, primitives[j]!) || withinContactThreshold(primitives[cur]!, primitives[j]!, threshold)) {
          visited.add(j);
          queue.push(j);
        }
      }
    }
  }
  return components;
}

function checkSymmetry(primitives: readonly StructuralPrimitive[], center: { x: number; y: number; z: number }, axis: "x" | "z"): boolean {
  if (primitives.length <= 1) return true;
  for (const p of primitives) {
    const mirror = { ...p.positionMm };
    mirror[axis] = 2 * center[axis] - p.positionMm[axis] - p.sizeMm[axis];
    const found = primitives.some(q =>
      q.primitive === p.primitive &&
      q.sizeMm.x === p.sizeMm.x &&
      q.sizeMm.y === p.sizeMm.y &&
      q.sizeMm.z === p.sizeMm.z &&
      q.rotationDiscrete.x === p.rotationDiscrete.x &&
      q.rotationDiscrete.y === p.rotationDiscrete.y &&
      q.rotationDiscrete.z === p.rotationDiscrete.z &&
      q.positionMm.x === mirror.x &&
      q.positionMm.y === mirror.y &&
      q.positionMm.z === mirror.z,
    );
    if (!found) return false;
  }
  return true;
}

function projectToOpaqueAnalysis(recipe: StructureRecipe): OpaqueAnalysisProjection {
  const primitives = recipe.primitives;
  if (primitives.length === 0) {
    return Object.freeze({
      primitiveCount: 0,
      boundingBoxMm: Object.freeze({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }),
      centerMm: Object.freeze({ x: 0, y: 0, z: 0 }),
      footprintAreaSqMm: 0,
      volumeCuMm: 0,
      overlapPairs: 0,
      connectedComponents: 0,
      symmetryAxisX: true,
      symmetryAxisZ: true,
      rotationVariants: Object.freeze([]),
      primitiveKindCounts: Object.freeze({}),
    });
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of primitives) {
    minX = Math.min(minX, p.positionMm.x);
    minY = Math.min(minY, p.positionMm.y);
    minZ = Math.min(minZ, p.positionMm.z);
    maxX = Math.max(maxX, p.positionMm.x + p.sizeMm.x);
    maxY = Math.max(maxY, p.positionMm.y + p.sizeMm.y);
    maxZ = Math.max(maxZ, p.positionMm.z + p.sizeMm.z);
  }

  const center = { x: Math.floor((minX + maxX) / 2), y: Math.floor((minY + maxY) / 2), z: Math.floor((minZ + maxZ) / 2) };
  const footprintAreaSqMm = (maxX - minX) * (maxZ - minZ);
  const volumeCuMm = (maxX - minX) * (maxY - minY) * (maxZ - minZ);

  let overlapPairs = 0;
  for (let i = 0; i < primitives.length; i++) {
    for (let j = i + 1; j < primitives.length; j++) {
      if (aabbOverlap(primitives[i]!, primitives[j]!)) overlapPairs++;
    }
  }

  const rotationSet = new Set<string>();
  const kindCounts: Record<string, number> = {};
  for (const p of primitives) {
    rotationSet.add(`${p.rotationDiscrete.x},${p.rotationDiscrete.y},${p.rotationDiscrete.z}`);
    kindCounts[p.primitive] = (kindCounts[p.primitive] ?? 0) + 1;
  }

  return Object.freeze({
    primitiveCount: primitives.length,
    boundingBoxMm: Object.freeze({ minX, minY, minZ, maxX, maxY, maxZ }),
    centerMm: Object.freeze(center),
    footprintAreaSqMm,
    volumeCuMm,
    overlapPairs,
    connectedComponents: computeConnectedComponents(primitives),
    symmetryAxisX: checkSymmetry(primitives, center, "x"),
    symmetryAxisZ: checkSymmetry(primitives, center, "z"),
    rotationVariants: Object.freeze(Array.from(rotationSet).sort()),
    primitiveKindCounts: Object.freeze(kindCounts),
  });
}

// ─── Safe Wolfram literal construction ────────────────────────────────

function buildWolframAnalysisExpression(recipe: StructureRecipe, variant: string): string {
  const primitives = recipe.primitives;
  const pts = primitives.map(p => `{${p.positionMm.x}, ${p.positionMm.y}, ${p.positionMm.z}}`).join(", ");
  const sizes = primitives.map(p => `{${p.sizeMm.x}, ${p.sizeMm.y}, ${p.sizeMm.z}}`).join(", ");
  const rots = primitives.map(p => `{${p.rotationDiscrete.x}, ${p.rotationDiscrete.y}, ${p.rotationDiscrete.z}}`).join(", ");

  return [
    `(* variant=${escapeWolframString(variant)} *)`,
    "Module[{pts, sizes, rots, n, bboxMin, bboxMax, center, overlapCount, i, j},",
    `  pts = {${pts}};`,
    `  sizes = {${sizes}};`,
    `  rots = {${rots}};`,
    "  n = Length[pts];",
    "  If[n == 0, Return[{0, {0, 0, 0}, {0, 0, 0}, {0, 0, 0}, 0}]];",
    "  bboxMin = {Min[pts[[All,1]]], Min[pts[[All,2]]], Min[pts[[All,3]]]};",
    "  bboxMax = {Max[pts[[All,1]] + sizes[[All,1]]], Max[pts[[All,2]] + sizes[[All,2]]], Max[pts[[All,3]] + sizes[[All,3]]]};",
    "  center = {Mean[pts[[All,1]]], Mean[pts[[All,2]]], Mean[pts[[All,3]]]};",
    "  overlapCount = 0;",
    "  For[i = 1, i <= n, i++,",
    "    For[j = i + 1, j <= n, j++,",
    "      If[And[",
    "        pts[[i,1]] < pts[[j,1]] + sizes[[j,1]] && pts[[j,1]] < pts[[i,1]] + sizes[[i,1]],",
    "        pts[[i,2]] < pts[[j,2]] + sizes[[j,2]] && pts[[j,2]] < pts[[i,2]] + sizes[[i,2]],",
    "        pts[[i,3]] < pts[[j,3]] + sizes[[j,3]] && pts[[j,3]] < pts[[i,3]] + sizes[[i,3]]",
    "      ], overlapCount++]]];",
    "  {n, bboxMin, bboxMax, center, overlapCount}",
    "]",
  ].join("\n");
}

function buildSourceIntelligenceExpression(analysisExpr: string): string {
  const escaped = escapeWolframString(analysisExpr);
  return [
    "Module[{exprStr, parsed, findings, result, formatterHash},",
    "  Needs[\"CodeParser`\"];",
    "  Needs[\"CodeInspector`\"];",
    "  Needs[\"CodeFormatter`\"];",
    `  exprStr = "${escaped}";`,
    "  parsed = CodeParse[exprStr];",
    "  findings = CodeInspect[parsed];",
    "  result = ToExpression[exprStr];",
    "  formatterHash = Hash[ToString[CodeFormat[parsed]], \"SHA256\"];",
    "  <|",
    "    \"ParserStructureHash\" -> Hash[ToString[parsed], \"SHA256\"],",
    "    \"InspectorFindingsHash\" -> Hash[ToString[findings], \"SHA256\"],",
    "    \"FormatterHash\" -> formatterHash,",
    "    \"PrimitiveCount\" -> result[[1]],",
    "    \"BBoxMin\" -> result[[2]],",
    "    \"BBoxMax\" -> result[[3]],",
    "    \"Center\" -> result[[4]],",
    "    \"OverlapCount\" -> result[[5]]",
    "  |>",
    "]",
  ].join("\n");
}

// ─── CAG result parsing ───────────────────────────────────────────────

function extractValue(result: string, key: string): string | null {
  const match = result.match(new RegExp(`"${key}"\\s*->\\s*(?:"([A-Za-z0-9]+)"|([A-Za-z0-9]+))`));
  return match ? (match[1] ?? match[2] ?? null) : null;
}

// ─── Evidence types ───────────────────────────────────────────────────

export type StructureGrammarCagAnalysisStatus =
  | "MATCH"
  | "FALSIFIED"
  | "FIRST_DIVERGENCE"
  | "NOT_CONFIGURED"
  | "UNAVAILABLE"
  | "PROVIDER_FAILED";

export type SourceIntelligenceStatus = "EXECUTED" | "NOT_CONFIGURED" | "UNAVAILABLE";

export type StructureGrammarCagAnalysisEvidence = Readonly<{
  protocol: typeof AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL;
  analysisVersion: typeof AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION;
  inputRecipeHash: string;
  worldSeedHash: string;
  grammarId: string;
  grammarVersion: string;
  sourceRevision: string;
  analysisVariant: string;
  requestSha256: string;
  responseSha256: string;
  analysisFingerprint: string;
  mutationAuthority: "none";
  sourceBoundary: string;
  status: StructureGrammarCagAnalysisStatus;
  projection: OpaqueAnalysisProjection;
  sourceIntelligence: Readonly<{
    status: SourceIntelligenceStatus;
    parserId: string | null;
    parserRevision: string | null;
    parserStructureHash: string | null;
    inspectorId: string | null;
    inspectorRevision: string | null;
    inspectorFindingsHash: string | null;
    formatterId: string | null;
    formatterRevision: string | null;
    formatterHash: string | null;
  }>;
  cagEvidence: WolframCagEvidence | null;
  localContractEvidence: boolean;
}>;

export type StructureGrammarCagComparisonEvidence = Readonly<{
  protocol: typeof AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL;
  analysisVersion: typeof AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION;
  leftRecipeHash: string;
  rightRecipeHash: string;
  leftWorldSeedHash: string;
  rightWorldSeedHash: string;
  leftGrammarId: string;
  rightGrammarId: string;
  status: "MATCH" | "FIRST_DIVERGENCE" | "FALSIFIED";
  firstDivergenceField: string | null;
  leftProjection: OpaqueAnalysisProjection;
  rightProjection: OpaqueAnalysisProjection;
  comparisonFingerprint: string;
  mutationAuthority: "none";
  sourceBoundary: string;
}>;

// ─── Recipe fingerprint verification ──────────────────────────────────

function verifyRecipeFingerprint(compilation: StructureGrammarCompilation): boolean {
  const recomputed = sha256(`${RECIPE_HASH_DOMAIN}::${canonicalSerialize(compilation.recipe)}`);
  return recomputed === compilation.deterministicFingerprint;
}

// ─── Helper: build source intelligence block ─────────────────────────

function sourceIntelligenceNotConfigured() {
  return Object.freeze({
    status: "NOT_CONFIGURED" as const,
    parserId: null, parserRevision: null, parserStructureHash: null,
    inspectorId: null, inspectorRevision: null, inspectorFindingsHash: null,
    formatterId: null, formatterRevision: null, formatterHash: null,
  });
}

function sourceIntelligenceUnavailable() {
  return Object.freeze({
    status: "UNAVAILABLE" as const,
    parserId: null, parserRevision: null, parserStructureHash: null,
    inspectorId: null, inspectorRevision: null, inspectorFindingsHash: null,
    formatterId: null, formatterRevision: null, formatterHash: null,
  });
}

function sourceIntelligenceExecuted(cagResult: string) {
  return Object.freeze({
    status: "EXECUTED" as const,
    parserId: CODEPARSER_ID,
    parserRevision: CODEPARSER_REVISION,
    parserStructureHash: extractValue(cagResult, "ParserStructureHash"),
    inspectorId: CODEINSPECTOR_ID,
    inspectorRevision: CODEINSPECTOR_REVISION,
    inspectorFindingsHash: extractValue(cagResult, "InspectorFindingsHash"),
    formatterId: CODEFORMATTER_ID,
    formatterRevision: CODEFORMATTER_REVISION,
    formatterHash: extractValue(cagResult, "FormatterHash"),
  });
}

// ─── Main analysis function ───────────────────────────────────────────

export async function analyzeStructureGrammarCag(
  compilation: StructureGrammarCompilation,
  options: Readonly<{
    client?: WolframCagClient;
    environment?: NodeJS.ProcessEnv;
    analysisVariant?: string;
  }> = {},
): Promise<StructureGrammarCagAnalysisEvidence> {
  const environment = options.environment ?? process.env;
  const analysisVariant = options.analysisVariant ?? "structural";

  // 1. Safe literal boundary — validate identifiers before any CAG contact
  validateIdentifier(compilation.recipe.grammarId, "grammarId");
  validateIdentifier(compilation.recipe.grammarVersion, "grammarVersion");
  validateIdentifier(compilation.recipe.anchorId, "anchorId");
  validateIdentifier(analysisVariant, "analysisVariant");

  // 2. Bound check: too many primitives for a bounded CAG request (before any analysis)
  if (compilation.recipe.primitives.length > MAX_PRIMITIVES_FOR_CAG) {
    throw new Error(
      `STRUCTURE_GRAMMAR_CAG_PRIMITIVES_EXCEED_BOUND: ${compilation.recipe.primitives.length} > ${MAX_PRIMITIVES_FOR_CAG}`,
    );
  }

  // 3. Verify recipe fingerprint (detect manipulation)
  const fingerprintValid = verifyRecipeFingerprint(compilation);
  if (!fingerprintValid) {
    const projection = projectToOpaqueAnalysis(compilation.recipe);
    const requestSha = hashWithDomain(ANALYSIS_REQUEST_DOMAIN, `falsified:${compilation.deterministicFingerprint}:${analysisVariant}`);
    const responseSha = hashWithDomain(ANALYSIS_FINGERPRINT_DOMAIN, canonicalSerialize(projection));
    return Object.freeze({
      protocol: AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL,
      analysisVersion: AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION,
      inputRecipeHash: compilation.deterministicFingerprint,
      worldSeedHash: compilation.recipe.worldSeedHash,
      grammarId: compilation.recipe.grammarId,
      grammarVersion: compilation.recipe.grammarVersion,
      sourceRevision: compilation.recipe.sourceRevision,
      analysisVariant,
      requestSha256: requestSha,
      responseSha256: responseSha,
      analysisFingerprint: hashWithDomain(ANALYSIS_FINGERPRINT_DOMAIN, canonicalSerialize({ projection, status: "FALSIFIED", analysisVariant })),
      mutationAuthority: "none",
      sourceBoundary: "opaque_structure_projection_only",
      status: "FALSIFIED",
      projection,
      sourceIntelligence: sourceIntelligenceNotConfigured(),
      cagEvidence: null,
      localContractEvidence: true,
    });
  }

  // 4. Compute opaque analysis projection (always, local, deterministic)
  const projection = projectToOpaqueAnalysis(compilation.recipe);

  // 5. Construct safe Wolfram analysis expression (numeric data only)
  const analysisExpr = buildWolframAnalysisExpression(compilation.recipe, analysisVariant);
  if (analysisExpr.length > MAX_WOLFRAM_EXPR_CHARS) {
    throw new Error(`STRUCTURE_GRAMMAR_CAG_EXPR_TOO_LARGE: ${analysisExpr.length} > ${MAX_WOLFRAM_EXPR_CHARS}`);
  }

  const requestSha = hashWithDomain(ANALYSIS_REQUEST_DOMAIN, analysisExpr);

  // 6. Determine CAG client
  let client = options.client;
  if (!client) {
    const cagConfig = wolframCagConfigurationStatus(environment);
    if (!cagConfig.configured) {
      const localResponseSha = hashWithDomain(ANALYSIS_FINGERPRINT_DOMAIN, canonicalSerialize(projection));
      return Object.freeze({
        protocol: AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL,
        analysisVersion: AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION,
        inputRecipeHash: compilation.deterministicFingerprint,
        worldSeedHash: compilation.recipe.worldSeedHash,
        grammarId: compilation.recipe.grammarId,
        grammarVersion: compilation.recipe.grammarVersion,
        sourceRevision: compilation.recipe.sourceRevision,
        analysisVariant,
        requestSha256: requestSha,
        responseSha256: localResponseSha,
        analysisFingerprint: hashWithDomain(ANALYSIS_FINGERPRINT_DOMAIN, canonicalSerialize({ projection, status: "NOT_CONFIGURED", analysisVariant })),
        mutationAuthority: "none",
        sourceBoundary: "opaque_structure_projection_only",
        status: "NOT_CONFIGURED",
        projection,
        sourceIntelligence: sourceIntelligenceNotConfigured(),
        cagEvidence: null,
        localContractEvidence: true,
      });
    }
    try {
      client = requireWolframCagClient(environment);
    } catch {
      const localResponseSha = hashWithDomain(ANALYSIS_FINGERPRINT_DOMAIN, canonicalSerialize(projection));
      return Object.freeze({
        protocol: AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL,
        analysisVersion: AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION,
        inputRecipeHash: compilation.deterministicFingerprint,
        worldSeedHash: compilation.recipe.worldSeedHash,
        grammarId: compilation.recipe.grammarId,
        grammarVersion: compilation.recipe.grammarVersion,
        sourceRevision: compilation.recipe.sourceRevision,
        analysisVariant,
        requestSha256: requestSha,
        responseSha256: localResponseSha,
        analysisFingerprint: hashWithDomain(ANALYSIS_FINGERPRINT_DOMAIN, canonicalSerialize({ projection, status: "UNAVAILABLE", analysisVariant })),
        mutationAuthority: "none",
        sourceBoundary: "opaque_structure_projection_only",
        status: "UNAVAILABLE",
        projection,
        sourceIntelligence: sourceIntelligenceUnavailable(),
        cagEvidence: null,
        localContractEvidence: true,
      });
    }
  }

  // 7. Run analysis through CAG (CodeParser preflight + CodeInspector + analysis)
  try {
    const fullExpr = buildSourceIntelligenceExpression(analysisExpr);
    if (fullExpr.length > MAX_WOLFRAM_EXPR_CHARS) {
      throw new Error(`STRUCTURE_GRAMMAR_CAG_SOURCE_INTEL_EXPR_TOO_LARGE: ${fullExpr.length} > ${MAX_WOLFRAM_EXPR_CHARS}`);
    }

    const cagEvidence = await client.languageCompute({
      code: fullExpr,
      timeConstraint: 20,
      maxChars: 10_000,
    });

    const si = sourceIntelligenceExecuted(cagEvidence.result);

    return Object.freeze({
      protocol: AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL,
      analysisVersion: AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION,
      inputRecipeHash: compilation.deterministicFingerprint,
      worldSeedHash: compilation.recipe.worldSeedHash,
      grammarId: compilation.recipe.grammarId,
      grammarVersion: compilation.recipe.grammarVersion,
      sourceRevision: compilation.recipe.sourceRevision,
      analysisVariant,
      requestSha256: requestSha,
      responseSha256: cagEvidence.responseSha256,
      analysisFingerprint: hashWithDomain(ANALYSIS_FINGERPRINT_DOMAIN, canonicalSerialize({
        projection,
        cagResponseSha256: cagEvidence.responseSha256,
        parserStructureHash: si.parserStructureHash,
        inspectorFindingsHash: si.inspectorFindingsHash,
      })),
      mutationAuthority: "none",
      sourceBoundary: "opaque_structure_projection_only",
      status: "MATCH",
      projection,
      sourceIntelligence: si,
      cagEvidence,
      localContractEvidence: false,
    });
  } catch {
    const localResponseSha = hashWithDomain(ANALYSIS_FINGERPRINT_DOMAIN, canonicalSerialize(projection));
    return Object.freeze({
      protocol: AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL,
      analysisVersion: AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION,
      inputRecipeHash: compilation.deterministicFingerprint,
      worldSeedHash: compilation.recipe.worldSeedHash,
      grammarId: compilation.recipe.grammarId,
      grammarVersion: compilation.recipe.grammarVersion,
      sourceRevision: compilation.recipe.sourceRevision,
      analysisVariant,
      requestSha256: requestSha,
      responseSha256: localResponseSha,
      analysisFingerprint: hashWithDomain(ANALYSIS_FINGERPRINT_DOMAIN, canonicalSerialize({ projection, status: "PROVIDER_FAILED", analysisVariant })),
      mutationAuthority: "none",
      sourceBoundary: "opaque_structure_projection_only",
      status: "PROVIDER_FAILED",
      projection,
      sourceIntelligence: sourceIntelligenceUnavailable(),
      cagEvidence: null,
      localContractEvidence: true,
    });
  }
}

// ─── Recipe comparison ───────────────────────────────────────────────

export function compareStructureGrammarRecipes(
  left: StructureGrammarCompilation,
  right: StructureGrammarCompilation,
): StructureGrammarCagComparisonEvidence {
  const leftValid = verifyRecipeFingerprint(left);
  const rightValid = verifyRecipeFingerprint(right);
  if (!leftValid || !rightValid) {
    const leftProjection = projectToOpaqueAnalysis(left.recipe);
    const rightProjection = projectToOpaqueAnalysis(right.recipe);
    return Object.freeze({
      protocol: AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL,
      analysisVersion: AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION,
      leftRecipeHash: left.deterministicFingerprint,
      rightRecipeHash: right.deterministicFingerprint,
      leftWorldSeedHash: left.recipe.worldSeedHash,
      rightWorldSeedHash: right.recipe.worldSeedHash,
      leftGrammarId: left.recipe.grammarId,
      rightGrammarId: right.recipe.grammarId,
      status: "FALSIFIED",
      firstDivergenceField: !leftValid ? "left_fingerprint" : "right_fingerprint",
      leftProjection,
      rightProjection,
      comparisonFingerprint: hashWithDomain(COMPARISON_FINGERPRINT_DOMAIN, canonicalSerialize({
        left: left.deterministicFingerprint,
        right: right.deterministicFingerprint,
        status: "FALSIFIED",
      })),
      mutationAuthority: "none",
      sourceBoundary: "opaque_structure_projection_only",
    });
  }

  const leftProjection = projectToOpaqueAnalysis(left.recipe);
  const rightProjection = projectToOpaqueAnalysis(right.recipe);

  const fields: ReadonlyArray<[string, unknown, unknown]> = [
    ["primitiveCount", leftProjection.primitiveCount, rightProjection.primitiveCount],
    ["boundingBoxMm", leftProjection.boundingBoxMm, rightProjection.boundingBoxMm],
    ["centerMm", leftProjection.centerMm, rightProjection.centerMm],
    ["footprintAreaSqMm", leftProjection.footprintAreaSqMm, rightProjection.footprintAreaSqMm],
    ["volumeCuMm", leftProjection.volumeCuMm, rightProjection.volumeCuMm],
    ["overlapPairs", leftProjection.overlapPairs, rightProjection.overlapPairs],
    ["connectedComponents", leftProjection.connectedComponents, rightProjection.connectedComponents],
    ["symmetryAxisX", leftProjection.symmetryAxisX, rightProjection.symmetryAxisX],
    ["symmetryAxisZ", leftProjection.symmetryAxisZ, rightProjection.symmetryAxisZ],
    ["rotationVariants", leftProjection.rotationVariants, rightProjection.rotationVariants],
    ["primitiveKindCounts", leftProjection.primitiveKindCounts, rightProjection.primitiveKindCounts],
  ];

  let firstDivergenceField: string | null = null;
  for (const [field, l, r] of fields) {
    if (JSON.stringify(l) !== JSON.stringify(r)) {
      firstDivergenceField = field;
      break;
    }
  }

  const status = firstDivergenceField === null ? "MATCH" : "FIRST_DIVERGENCE";
  return Object.freeze({
    protocol: AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL,
    analysisVersion: AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION,
    leftRecipeHash: left.deterministicFingerprint,
    rightRecipeHash: right.deterministicFingerprint,
    leftWorldSeedHash: left.recipe.worldSeedHash,
    rightWorldSeedHash: right.recipe.worldSeedHash,
    leftGrammarId: left.recipe.grammarId,
    rightGrammarId: right.recipe.grammarId,
    status,
    firstDivergenceField,
    leftProjection,
    rightProjection,
    comparisonFingerprint: hashWithDomain(COMPARISON_FINGERPRINT_DOMAIN, canonicalSerialize({
      left: left.deterministicFingerprint,
      right: right.deterministicFingerprint,
      status,
      firstDivergenceField,
    })),
    mutationAuthority: "none",
    sourceBoundary: "opaque_structure_projection_only",
  });
}
