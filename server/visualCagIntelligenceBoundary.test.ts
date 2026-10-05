import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AURION_VISUAL_CAG_ANALYSIS_VERSION,
  AURION_VISUAL_CAG_PROTOCOL,
  analyzeVisualRecipeCag,
  assertVisualAnalysisIsDesignEvidenceOnly,
  assertVisualAnalysisOutsideGameplayHash,
  compileVisualRecipe,
  projectVisualRecipeToOpaqueAnalysis,
} from "./visualCagIntelligenceBoundary";
import {
  AURION_VISUAL_RECIPE_COMPILER_VERSION,
  AURION_VISUAL_RECIPE_PROTOCOL,
  hashVisualRecipe,
} from "@shared/visualConstructionProtocol";
import { VISUAL_ITEM_DESCRIPTOR_VERSION } from "@shared/visualItemProtocol";
import type { VisualItemDescriptor } from "@shared/visualItemProtocol";
import type { WolframCagClient, WolframCagEvidence } from "./wolframCag";

const SOURCE_REVISION = "a6bff0c9d8e7f6050403020100000000deadbeef";

const hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

function makeDescriptor(): VisualItemDescriptor {
  const contextHash = hex("context");
  const deterministicHash = hex("loot");
  const visualSeed = hex("visual-seed");
  return Object.freeze({
    version: VISUAL_ITEM_DESCRIPTOR_VERSION,
    itemDefinitionId: "stariron-longsword",
    familyId: "longsword",
    category: "weapon" as const,
    equipmentSlot: "main_hand" as const,
    quality: "rare" as const,
    affixes: Object.freeze([
      Object.freeze({ id: "of-the-echo", slot: "suffix" as const, groupId: "echo" }),
      Object.freeze({ id: "starforged-edge", slot: "prefix" as const, groupId: "star" }),
    ]),
    setId: null,
    visual: Object.freeze({
      itemDefinitionId: "stariron-longsword",
      materialId: "star_iron" as const,
      appearanceId: "longsword-heroic",
      materialVariant: "polished",
      variantTheme: "starforged" as const,
      glbAssetId: "glb.longsword.stariron",
    }),
    source: Object.freeze({
      lootReceiptId: "loot-receipt-0001",
      contextHash,
      deterministicHash,
      visualEventIndex: 3,
    }),
    visualSeed,
  });
}

function makeEvidence(result: string): WolframCagEvidence {
  return Object.freeze({
    protocol: "aurion.wolfram-cag.v1" as const,
    provider: "wolfram-cag" as const,
    component: "language_compute" as const,
    endpoint: "/api/cag/v1/WolframLanguageCompute",
    requestSha256: hex("request"),
    responseSha256: hex(result),
    providerUuid: null,
    providerCode: 200,
    success: true as const,
    result,
    resultChars: result.length,
  });
}

function cagClientReturning(result: string): WolframCagClient {
  return Object.freeze({
    languageCompute: async () => makeEvidence(result),
    languageHints: async () => makeEvidence(result),
    alphaResults: async () => makeEvidence(result),
    alphaContext: async () => makeEvidence(result),
  });
}

function cagClientThrowing(): WolframCagClient {
  const fail = async (): Promise<WolframCagEvidence> => {
    throw new Error("WOLFRAM_CAG_HTTP_503");
  };
  return Object.freeze({
    languageCompute: fail,
    languageHints: fail,
    alphaResults: fail,
    alphaContext: fail,
  });
}

describe("visual recipe compiler (local, deterministic, provider-independent)", () => {
  it("compiles a bounded recipe with a stable hash and no provider contact", () => {
    const descriptor = makeDescriptor();
    const first = compileVisualRecipe(descriptor, { sourceRevision: SOURCE_REVISION });
    const second = compileVisualRecipe(descriptor, { sourceRevision: SOURCE_REVISION });
    expect(first.recipeHash).toBe(second.recipeHash);
    expect(first.recipeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.recipe.protocol).toBe(AURION_VISUAL_RECIPE_PROTOCOL);
    expect(first.recipe.compilerVersion).toBe(AURION_VISUAL_RECIPE_COMPILER_VERSION);
    expect(first.recipe.sourceRevision).toBe(SOURCE_REVISION);
    expect(hashVisualRecipe(first.recipe)).toBe(first.recipeHash);
  });

  it("canonicalizes affix order deterministically", () => {
    const descriptor = makeDescriptor();
    const reversed = {
      ...descriptor,
      affixes: Object.freeze([...descriptor.affixes].reverse()),
    };
    const a = compileVisualRecipe(descriptor, { sourceRevision: SOURCE_REVISION });
    const b = compileVisualRecipe(reversed, { sourceRevision: SOURCE_REVISION });
    expect(a.recipeHash).toBe(b.recipeHash);
    expect(a.recipe.affixes.map(x => x.slot)).toEqual(["prefix", "suffix"]);
  });

  it("canonicalizes equal slot/id affixes by groupId", () => {
    const descriptor = makeDescriptor();
    const tiedAffixes = Object.freeze([
      Object.freeze({ id: "shared-id", slot: "prefix" as const, groupId: "zeta" }),
      Object.freeze({ id: "shared-id", slot: "prefix" as const, groupId: "alpha" }),
    ]);
    const forward = { ...descriptor, affixes: tiedAffixes };
    const reversed = { ...descriptor, affixes: Object.freeze([...tiedAffixes].reverse()) };
    const a = compileVisualRecipe(forward, { sourceRevision: SOURCE_REVISION });
    const b = compileVisualRecipe(reversed, { sourceRevision: SOURCE_REVISION });
    expect(a.recipeHash).toBe(b.recipeHash);
    expect(a.recipe.affixes.map(x => x.groupId)).toEqual(["alpha", "zeta"]);
  });

  it("recipe carries no gameplay statistics", () => {
    const { recipe } = compileVisualRecipe(makeDescriptor(), { sourceRevision: SOURCE_REVISION });
    const serialized = JSON.stringify(recipe);
    expect(serialized).not.toContain("itemPower");
    expect(serialized).not.toContain("stats");
  });
});

describe("CAG unavailable → local deterministic compiler keeps running", () => {
  it("reports NOT_CONFIGURED without a key, with explicit non-MATCH evidence", async () => {
    const compilation = compileVisualRecipe(makeDescriptor(), { sourceRevision: SOURCE_REVISION });
    const evidence = await analyzeVisualRecipeCag(compilation, { environment: {} as NodeJS.ProcessEnv });
    expect(evidence.status).toBe("NOT_CONFIGURED");
    expect(evidence.status).not.toBe("MATCH");
    expect(evidence.cagEvidence).toBeNull();
    expect(compilation.recipeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reports PROVIDER_FAILED when the provider throws, never MATCH", async () => {
    const compilation = compileVisualRecipe(makeDescriptor(), { sourceRevision: SOURCE_REVISION });
    const evidence = await analyzeVisualRecipeCag(compilation, { client: cagClientThrowing() });
    expect(evidence.status).toBe("PROVIDER_FAILED");
    expect(evidence.cagEvidence).toBeNull();
  });

  it("reports INCONCLUSIVE on non-integer provider output, never MATCH", async () => {
    const compilation = compileVisualRecipe(makeDescriptor(), { sourceRevision: SOURCE_REVISION });
    const evidence = await analyzeVisualRecipeCag(compilation, {
      client: cagClientReturning("{1, 2, Foo[Bar]}"),
    });
    expect(evidence.status).toBe("INCONCLUSIVE");
    expect(evidence.status).not.toBe("MATCH");
    expect(evidence.cagEvidence).not.toBeNull();
  });
});

describe("analysis binding and truth separation", () => {
  it("binds evidence to recipe hash + revision", async () => {
    const descriptor = makeDescriptor();
    const compilation = compileVisualRecipe(descriptor, { sourceRevision: SOURCE_REVISION });
    const projection = projectVisualRecipeToOpaqueAnalysis(compilation.recipe);
    const total = projection.affixCount + projection.distinctAffixGroups + projection.qualityRank + projection.visualEventIndex;
    const result = `{4, ${total}, {${projection.affixCount}, ${projection.distinctAffixGroups}, ${projection.qualityRank}, ${projection.visualEventIndex}}}`;
    const evidence = await analyzeVisualRecipeCag(compilation, { client: cagClientReturning(result) });
    expect(evidence.status).toBe("MATCH");
    expect(evidence.protocol).toBe(AURION_VISUAL_CAG_PROTOCOL);
    expect(evidence.analysisVersion).toBe(AURION_VISUAL_CAG_ANALYSIS_VERSION);
    expect(evidence.recipeHash).toBe(compilation.recipeHash);
    expect(evidence.compilerVersion).toBe(AURION_VISUAL_RECIPE_COMPILER_VERSION);
    expect(evidence.sourceRevision).toBe(SOURCE_REVISION);
  });

  it("marks provider divergence as DIVERGED, never silently MATCH", async () => {
    const compilation = compileVisualRecipe(makeDescriptor(), { sourceRevision: SOURCE_REVISION });
    const evidence = await analyzeVisualRecipeCag(compilation, {
      client: cagClientReturning("{4, 999, {1, 1, 1, 1}}"),
    });
    expect(evidence.status).toBe("DIVERGED");
  });

  it("marks a tampered recipe hash as FALSIFIED without provider contact", async () => {
    const compilation = compileVisualRecipe(makeDescriptor(), { sourceRevision: SOURCE_REVISION });
    const tampered = { ...compilation, recipeHash: hex("tampered") };
    const evidence = await analyzeVisualRecipeCag(tampered, { client: cagClientThrowing() });
    expect(evidence.status).toBe("FALSIFIED");
    expect(evidence.cagEvidence).toBeNull();
  });

  it("analysis output stays outside the item/gameplay hash", async () => {
    const descriptor = makeDescriptor();
    const gameplayHashBefore = descriptor.source.deterministicHash;
    const compilation = compileVisualRecipe(descriptor, { sourceRevision: SOURCE_REVISION });
    await analyzeVisualRecipeCag(compilation, {
      client: cagClientReturning("{4, 999, {9, 9, 9, 9}}"),
    });
    const gameplayHashAfter = makeDescriptor().source.deterministicHash;
    expect(() =>
      assertVisualAnalysisOutsideGameplayHash(gameplayHashBefore, gameplayHashAfter)
    ).not.toThrow();
    // Recipe hash domain is disjoint from the gameplay deterministic hash.
    expect(compilation.recipeHash).not.toBe(gameplayHashBefore);
  });

  it("guards reject any evidence claiming mutation authority", async () => {
    const compilation = compileVisualRecipe(makeDescriptor(), { sourceRevision: SOURCE_REVISION });
    const evidence = await analyzeVisualRecipeCag(compilation, { environment: {} as NodeJS.ProcessEnv });
    expect(evidence.mutationAuthority).toBe("none");
    expect(evidence.gameplayHashContribution).toBe("none");
    expect(evidence.runtimeTruthSource).toBe("none");
    expect(() => assertVisualAnalysisIsDesignEvidenceOnly(evidence)).not.toThrow();
    const forged = { ...evidence, mutationAuthority: "items" } as unknown as typeof evidence;
    expect(() => assertVisualAnalysisIsDesignEvidenceOnly(forged)).toThrow("VISUAL_CAG_BOUNDARY_VIOLATION");
    expect(() =>
      assertVisualAnalysisOutsideGameplayHash(hex("a"), hex("b"))
    ).toThrow("VISUAL_CAG_GAMEPLAY_HASH_MUTATED");
  });
});
