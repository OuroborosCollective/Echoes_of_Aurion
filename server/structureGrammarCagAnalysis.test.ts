import { describe, expect, it } from "vitest";
import {
  AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL,
  AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION,
  analyzeStructureGrammarCag,
  compareStructureGrammarRecipes,
} from "./structureGrammarCagAnalysis";
import type { DeterministicStructureGrammar } from "@shared/deterministicStructureGrammarProtocol";
import { compileDeterministicStructureGrammar } from "./deterministicStructureGrammarCompiler";
import type { WolframCagClient, WolframCagEvidence } from "./wolframCag";

const grammar: DeterministicStructureGrammar = {
  grammarId: "ruin-tower",
  grammarVersion: "1.0.0",
  rootRuleId: "root",
  rules: [
    {
      id: "column",
      body: {
        kind: "transform",
        transform: { translateMm: { x: 0, y: 0, z: 0 }, scaleFixed: { x: 1000, y: 1000, z: 1000 } },
        node: {
          kind: "primitive",
          primitive: { kind: "box", assetKey: "ruin-stone", materialKey: "stone", sizeMm: { x: 600, y: 3_000, z: 600 } },
        },
      },
    },
    {
      id: "root",
      body: {
        kind: "repeat",
        count: 3,
        stepMm: { x: 2_000, y: 0, z: 0 },
        node: { kind: "call", ruleId: "column" },
      },
    },
  ],
};

const input = {
  worldId: "echoes-of-aurion-global",
  worldSeedHash: "sha256:world-seed",
  grammar,
  chunkCoordinate: { x: -3, z: 7 },
  anchorId: "ruin:alpha",
  sourceCausalRoot: "sha256:causal-root",
  sourceRevision: "c09ba93b99738e24b9c375dec3a9cfae0806c466",
  maxDepth: 16,
  maxNodes: 64,
  minSizeMm: 100,
};

const compilation = compileDeterministicStructureGrammar(input);

const cagKey = "test-wolfram-cag-key-1234567890";

function mockCagClient(result: string): WolframCagClient {
  const evidence: WolframCagEvidence = {
    protocol: "aurion.wolfram-cag.v1",
    provider: "wolfram-cag",
    component: "language_compute",
    endpoint: "/api/cag/v1/WolframLanguageCompute",
    requestSha256: "a".repeat(64),
    responseSha256: "b".repeat(64),
    providerUuid: "test-uuid-1",
    providerCode: 200,
    success: true,
    result,
    resultChars: result.length,
  };
  return {
    languageCompute: async () => evidence,
    languageHints: async () => evidence,
    alphaResults: async () => evidence,
    alphaContext: async () => evidence,
  } as WolframCagClient;
}

function failingCagClient(): WolframCagClient {
  return {
    languageCompute: async () => { throw new Error("WOLFRAM_CAG_HTTP_503"); },
    languageHints: async () => { throw new Error("WOLFRAM_CAG_HTTP_503"); },
    alphaResults: async () => { throw new Error("WOLFRAM_CAG_HTTP_503"); },
    alphaContext: async () => { throw new Error("WOLFRAM_CAG_HTTP_503"); },
  } as WolframCagClient;
}

describe("structureGrammarCagAnalysis", () => {
  it("produces deterministic evidence for the same recipe hash (local contract path)", async () => {
    const a = await analyzeStructureGrammarCag(compilation, { environment: {} });
    const b = await analyzeStructureGrammarCag(compilation, { environment: {} });
    expect(a.requestSha256).toBe(b.requestSha256);
    expect(a.responseSha256).toBe(b.responseSha256);
    expect(a.analysisFingerprint).toBe(b.analysisFingerprint);
    expect(a.status).toBe("NOT_CONFIGURED");
    expect(a.localContractEvidence).toBe(true);
  });

  it("distinguishes different analysis requests for the same structure", async () => {
    const structural = await analyzeStructureGrammarCag(compilation, { environment: {}, analysisVariant: "structural" });
    const symmetry = await analyzeStructureGrammarCag(compilation, { environment: {}, analysisVariant: "symmetry" });
    expect(structural.requestSha256).not.toBe(symmetry.requestSha256);
    expect(structural.analysisFingerprint).not.toBe(symmetry.analysisFingerprint);
  });

  it("detects manipulated recipe evidence as FALSIFIED", async () => {
    const tamperedRecipe = {
      ...compilation.recipe,
      primitives: compilation.recipe.primitives.map((p, i) =>
        i === 0 ? { ...p, positionMm: { x: 999_999, y: p.positionMm.y, z: p.positionMm.z } } : p,
      ),
    };
    const tamperedCompilation = { ...compilation, recipe: tamperedRecipe };
    const evidence = await analyzeStructureGrammarCag(tamperedCompilation, { environment: {} });
    expect(evidence.status).toBe("FALSIFIED");
    expect(evidence.mutationAuthority).toBe("none");
  });

  it("continues deterministically when CAG provider fails", async () => {
    const evidence = await analyzeStructureGrammarCag(compilation, { client: failingCagClient() });
    expect(evidence.status).toBe("PROVIDER_FAILED");
    expect(evidence.mutationAuthority).toBe("none");
    expect(evidence.projection.primitiveCount).toBe(3);
    // Aurion can still materialize — compilation is unaffected
    expect(compilation.recipe.primitives).toHaveLength(3);
  });

  it("never claims mutation authority", async () => {
    const local = await analyzeStructureGrammarCag(compilation, { environment: {} });
    const provider = await analyzeStructureGrammarCag(compilation, { client: mockCagClient("<|\"ParserStructureHash\" -> 123|>") });
    const failed = await analyzeStructureGrammarCag(compilation, { client: failingCagClient() });
    expect(local.mutationAuthority).toBe("none");
    expect(provider.mutationAuthority).toBe("none");
    expect(failed.mutationAuthority).toBe("none");
  });

  it("excludes secrets from all evidence", async () => {
    const client = mockCagClient("<|\"ParserStructureHash\" -> 123|>");
    const evidence = await analyzeStructureGrammarCag(compilation, { client });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(cagKey);
    // sourceCausalRoot is a hash, not a secret, but worldSeedHash should be present
    expect(evidence.worldSeedHash).toBe(input.worldSeedHash);
    // No live persistence data in evidence
    expect(serialized).not.toContain("sourceCausalRoot");
  });

  it("sends only bounded numeric data to CAG (no identifiers or secrets)", async () => {
    const capturedCode: string[] = [];
    const evidence: WolframCagEvidence = {
      protocol: "aurion.wolfram-cag.v1",
      provider: "wolfram-cag",
      component: "language_compute",
      endpoint: "/api/cag/v1/WolframLanguageCompute",
      requestSha256: "a".repeat(64),
      responseSha256: "b".repeat(64),
      providerUuid: null,
      providerCode: 200,
      success: true,
      result: "<|\"ParserStructureHash\" -> 123|>",
      resultChars: 30,
    };
    const client = {
      languageCompute: async (input: { code: string }) => {
        capturedCode.push(input.code);
        return evidence;
      },
      languageHints: async () => evidence,
      alphaResults: async () => evidence,
      alphaContext: async () => evidence,
    } as WolframCagClient;

    await analyzeStructureGrammarCag(compilation, { client });

    expect(capturedCode).toHaveLength(1);
    const code = capturedCode[0]!;
    // No identifiers leak into the Wolfram expression
    expect(code).not.toContain("ruin-tower");
    expect(code).not.toContain("ruin:alpha");
    expect(code).not.toContain("echoes-of-aurion-global");
    expect(code).not.toContain("sha256:world-seed");
    expect(code).not.toContain("sha256:causal-root");
    expect(code).not.toContain("ruin-stone");
    expect(code).not.toContain("stone");
    expect(code).not.toContain(cagKey);
    // Only numeric data and Wolfram builtins
    expect(code).toContain("Module");
    expect(code).toContain("pts");
    expect(code).toMatch(/\{0, 0, 0\}/);
  });

  it("binds evidence to the full contract", async () => {
    const evidence = await analyzeStructureGrammarCag(compilation, { environment: {} });
    expect(evidence.protocol).toBe(AURION_STRUCTURE_GRAMMAR_CAG_PROTOCOL);
    expect(evidence.analysisVersion).toBe(AURION_STRUCTURE_GRAMMAR_CAG_ANALYSIS_VERSION);
    expect(evidence.inputRecipeHash).toBe(compilation.deterministicFingerprint);
    expect(evidence.worldSeedHash).toBe(input.worldSeedHash);
    expect(evidence.grammarId).toBe(input.grammar.grammarId);
    expect(evidence.grammarVersion).toBe(input.grammar.grammarVersion);
    expect(evidence.sourceRevision).toBe(input.sourceRevision);
    expect(evidence.requestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.responseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.analysisFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.mutationAuthority).toBe("none");
    expect(evidence.sourceBoundary).toBe("opaque_structure_projection_only");
  });

  it("runs source intelligence through CAG when configured", async () => {
    const cagResult = '<|"ParserStructureHash" -> 1234567890, "InspectorFindingsHash" -> 9876543210, "FormatterHash" -> 1111111111, "PrimitiveCount" -> 3|>';
    const evidence = await analyzeStructureGrammarCag(compilation, { client: mockCagClient(cagResult) });
    expect(evidence.status).toBe("MATCH");
    expect(evidence.localContractEvidence).toBe(false);
    expect(evidence.cagEvidence).not.toBeNull();
    expect(evidence.sourceIntelligence.status).toBe("EXECUTED");
    expect(evidence.sourceIntelligence.parserStructureHash).toBe("1234567890");
    expect(evidence.sourceIntelligence.inspectorFindingsHash).toBe("9876543210");
    expect(evidence.sourceIntelligence.formatterHash).toBe("1111111111");
  });

  it("rejects invalid identifiers at the safe literal boundary", async () => {
    const badCompilation = {
      ...compilation,
      recipe: { ...compilation.recipe, grammarId: "bad id with spaces" },
    };
    await expect(analyzeStructureGrammarCag(badCompilation, { environment: {} })).rejects.toThrow("STRUCTURE_GRAMMAR_CAG_INVALID_IDENTIFIER");
  });

  it("rejects oversized primitive sets before any CAG call", async () => {
    let calls = 0;
    const client = {
      languageCompute: async () => { calls++; return {} as WolframCagEvidence; },
    } as unknown as WolframCagClient;
    const manyPrimitives = Array.from({ length: 300 }, (_, i) => ({
      ...compilation.recipe.primitives[0]!,
      id: `p${i}`,
      positionMm: { x: i * 1000, y: 0, z: 0 },
    }));
    const bigCompilation = { ...compilation, recipe: { ...compilation.recipe, primitives: manyPrimitives } };
    await expect(analyzeStructureGrammarCag(bigCompilation, { client })).rejects.toThrow("STRUCTURE_GRAMMAR_CAG_PRIMITIVES_EXCEED_BOUND");
    expect(calls).toBe(0);
  });
});

describe("compareStructureGrammarRecipes", () => {
  it("returns MATCH for identical recipes", () => {
    const result = compareStructureGrammarRecipes(compilation, compilation);
    expect(result.status).toBe("MATCH");
    expect(result.firstDivergenceField).toBeNull();
    expect(result.mutationAuthority).toBe("none");
  });

  it("returns FIRST_DIVERGENCE for different recipes", () => {
    const otherGrammar: DeterministicStructureGrammar = {
      grammarId: "ruin-tower-wide",
      grammarVersion: "1.0.0",
      rootRuleId: "root",
      rules: [
        grammar.rules[0]!,
        {
          id: "root",
          body: {
            kind: "repeat" as const,
            count: 5,
            stepMm: { x: 2_000, y: 0, z: 0 },
            node: { kind: "call" as const, ruleId: "column" },
          },
        },
      ],
    };
    const other = compileDeterministicStructureGrammar({ ...input, grammar: otherGrammar });
    const result = compareStructureGrammarRecipes(compilation, other);
    expect(result.status).toBe("FIRST_DIVERGENCE");
    expect(result.firstDivergenceField).not.toBeNull();
    expect(result.mutationAuthority).toBe("none");
  });

  it("returns FALSIFIED for tampered recipes", () => {
    const tamperedRecipe = {
      ...compilation.recipe,
      primitives: [{ ...compilation.recipe.primitives[0]!, positionMm: { x: 999_999, y: 0, z: 0 } }],
    };
    const tampered = { ...compilation, recipe: tamperedRecipe };
    const result = compareStructureGrammarRecipes(compilation, tampered);
    expect(result.status).toBe("FALSIFIED");
    expect(result.firstDivergenceField).toBe("right_fingerprint");
  });
});
