import { describe, expect, it } from "vitest";
import {
  AURION_STRUCTURE_GRAMMAR_COMPILER_VERSION,
  AURION_STRUCTURE_GRAMMAR_PROTOCOL,
  type DeterministicStructureGrammar,
} from "@shared/deterministicStructureGrammarProtocol";
import { compileDeterministicStructureGrammar } from "./deterministicStructureGrammarCompiler";

const grammar: DeterministicStructureGrammar = {
  grammarId: "ruin-tower",
  grammarVersion: "1.0.0",
  rootRuleId: "root",
  rules: [
    {
      id: "column",
      body: {
        kind: "transform",
        transform: {
          translateMm: { x: 0, y: 0, z: 0 },
          scaleFixed: { x: 1000, y: 1000, z: 1000 },
        },
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

describe("deterministicStructureGrammarCompiler", () => {
  it("produces a canonical, recursively expanded recipe and dependencies", () => {
    const result = compileDeterministicStructureGrammar(input);
    expect(result.recipe.protocol).toBe(AURION_STRUCTURE_GRAMMAR_PROTOCOL);
    expect(result.recipe.compilerVersion).toBe(AURION_STRUCTURE_GRAMMAR_COMPILER_VERSION);
    expect(result.recipe.primitives).toHaveLength(3);
    expect(result.recipe.primitives.map(primitive => primitive.positionMm.x)).toEqual([0, 2_000, 4_000]);
    expect(result.dependencies.ruleIds).toEqual(["column", "root"]);
    expect(result.dependencies.assetKeys).toEqual(["ruin-stone"]);
    expect(result.dependencies.materialKeys).toEqual(["stone"]);
    expect(result.stats.primitivesEmitted).toBe(3);
    expect(result.stats.nodesVisited).toBe(10);
    expect(result.canonicalRecipe).toBe(canonicalizeForAssertion(result.recipe));
  });

  it("is byte-identical when object insertion order changes and remains bound to anchor/seed/version", () => {
    const reordered = {
      ...input,
      grammar: {
        ...input.grammar,
        rules: [input.grammar.rules[1]!, input.grammar.rules[0]!],
      },
      chunkCoordinate: { z: 7, x: -3 },
    };
    const first = compileDeterministicStructureGrammar(input);
    const replay = compileDeterministicStructureGrammar(reordered);
    expect(replay.canonicalRecipe).toBe(first.canonicalRecipe);
    expect(replay.deterministicFingerprint).toBe(first.deterministicFingerprint);
    expect(replay.inputHash).toBe(first.inputHash);

    expect(compileDeterministicStructureGrammar({ ...input, worldSeedHash: "sha256:other-seed" }).deterministicFingerprint).not.toBe(first.deterministicFingerprint);
    expect(compileDeterministicStructureGrammar({ ...input, anchorId: "ruin:beta" }).deterministicFingerprint).not.toBe(first.deterministicFingerprint);
    expect(compileDeterministicStructureGrammar({ ...input, grammar: { ...input.grammar, grammarVersion: "1.0.1" } }).deterministicFingerprint).not.toBe(first.deterministicFingerprint);
  });

  it("selects seeded branches deterministically without wall-clock or ambient randomness", () => {
    const branched: DeterministicStructureGrammar = {
      grammarId: "branch-test",
      grammarVersion: "1",
      rootRuleId: "root",
      rules: [
        {
          id: "root",
          body: {
            kind: "branch",
            choices: [
              { weight: 1, node: { kind: "primitive", primitive: { kind: "box", assetKey: "a", sizeMm: { x: 500, y: 500, z: 500 } } } },
              { weight: 3, node: { kind: "primitive", primitive: { kind: "cylinder", assetKey: "b", sizeMm: { x: 700, y: 700, z: 700 } } } },
            ],
          },
        },
      ],
    };
    const a = compileDeterministicStructureGrammar({ ...input, grammar: branched });
    const b = compileDeterministicStructureGrammar({ ...input, grammar: branched });
    expect(a.canonicalRecipe).toBe(b.canonicalRecipe);
    expect(a.deterministicFingerprint).toBe(b.deterministicFingerprint);
    expect(a.recipe.primitives).toHaveLength(1);
    expect(["a", "b"]).toContain(a.recipe.primitives[0]!.assetKey);
  });

  it("fails closed and deterministically on recursion and node budgets", () => {
    const recursive: DeterministicStructureGrammar = {
      grammarId: "recursive",
      grammarVersion: "1",
      rootRuleId: "root",
      rules: [{ id: "root", body: { kind: "call", ruleId: "root" } }],
    };
    expect(() => compileDeterministicStructureGrammar({ ...input, grammar: recursive, maxDepth: 4 })).toThrow("grammar depth exceeded");

    const wide: DeterministicStructureGrammar = {
      grammarId: "wide",
      grammarVersion: "1",
      rootRuleId: "root",
      rules: [{
        id: "root",
        body: {
          kind: "repeat",
          count: 100,
          stepMm: { x: 1_000, y: 0, z: 0 },
          node: { kind: "primitive", primitive: { kind: "box", sizeMm: { x: 100, y: 100, z: 100 } } },
        },
      }],
    };
    expect(() => compileDeterministicStructureGrammar({ ...input, grammar: wide, maxNodes: 10 })).toThrow("grammar node budget exceeded");
  });

  it("supports negative chunk coordinates and discrete transforms using integer millimeters only", () => {
    const transformed: DeterministicStructureGrammar = {
      grammarId: "transform-test",
      grammarVersion: "1",
      rootRuleId: "root",
      rules: [{
        id: "root",
        body: {
          kind: "transform",
          transform: {
            translateMm: { x: -1_250, y: 750, z: 4_000 },
            rotateDiscrete: { x: 0, y: 1, z: 0 },
            scaleFixed: { x: 500, y: 1_000, z: 2_000 },
          },
          node: { kind: "primitive", primitive: { kind: "wedge", sizeMm: { x: 800, y: 1_000, z: 600 } } },
        },
      }],
    };
    const result = compileDeterministicStructureGrammar({ ...input, grammar: transformed, chunkCoordinate: { x: -1_000_000, z: 1_000_000 } });
    expect(result.recipe.primitives[0]).toMatchObject({
      positionMm: { x: -1_250, y: 750, z: 4_000 },
      rotationDiscrete: { x: 0, y: 1, z: 0 },
      sizeMm: { x: 400, y: 1_000, z: 1_200 },
    });
  });
});

function canonicalizeForAssertion(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeForAssertion).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalizeForAssertion(record[key])}`).join(",")}}`;
}
