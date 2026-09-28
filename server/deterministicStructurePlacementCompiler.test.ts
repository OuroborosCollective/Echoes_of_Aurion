import { describe, expect, it } from "vitest";
import {
  compileDeterministicStructurePlacement,
  verifyDeterministicStructurePlacement,
} from "./deterministicStructurePlacementCompiler";
import type {
  StructurePlacementInput,
  StructurePlacementRule,
} from "@shared/deterministicStructurePlacementProtocol";

const WORLD_SEED_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RULESET_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const REVISION = "c09ba93b99738e24b9c375dec3a9cfae0806c466";

const graph = {
  nodes: [
    {
      nodeId: "settlement-node",
      layer: "settlement",
      ruleId: "settlement",
      parentId: null,
      coordinate: { x: 0, z: 0 },
      tags: [],
      streamId: "sha256:1",
      constraintHash: "sha256:2",
      nodeHash: "sha256:3",
    },
    {
      nodeId: "road-node",
      layer: "travel",
      ruleId: "road",
      parentId: null,
      coordinate: { x: 1, z: 0 },
      tags: [],
      streamId: "sha256:4",
      constraintHash: "sha256:5",
      nodeHash: "sha256:6",
    },
    {
      nodeId: "dungeon-node",
      layer: "structure",
      ruleId: "dungeon",
      parentId: null,
      coordinate: { x: 2, z: 0 },
      tags: [],
      streamId: "sha256:7",
      constraintHash: "sha256:8",
      nodeHash: "sha256:9",
    },
  ],
  edges: [
    {
      edgeId: "road-link",
      kind: "transit",
      fromNodeId: "settlement-node",
      toNodeId: "road-node",
      edgeHash: "sha256:10",
    },
  ],
} as StructurePlacementInput["graph"];

const settlementRule: StructurePlacementRule = {
  id: "settlement-rule",
  matcher: { kind: "settlement", requiredTags: ["village"] },
  replacement: {
    footprintMm: { x: 1_000, z: 2_000 },
    portIds: ["road-port"],
    orientations: [0, 1],
    scaleRangeFixed: { min: 1000, max: 1000 },
  },
  priority: 50,
  constraints: {
    minSpacingMm: 1_000,
    maxSlopeBps: 4_219,
    requireRoadConnectivity: true,
    requireEntranceReachability: false,
    boundsMm: { minX: -10_000, minZ: -10_000, maxX: 10_000, maxZ: 10_000 },
    maxFootprintAreaSqMm: 4_000_000,
  },
};

function baseInput(
  overrides: Partial<StructurePlacementInput> = {}
): StructurePlacementInput {
  return {
    worldId: "echoes-of-aurion-global",
    worldSeedHash: WORLD_SEED_HASH,
    worldGenerationRevision: REVISION,
    rulesetHash: RULESET_HASH,
    sourceRevision: REVISION,
    graph,
    rules: [settlementRule],
    candidates: [
      {
        candidateId: "settlement-1",
        kind: "settlement",
        tags: ["village"],
        graphNodeId: "settlement-node",
        positionMm: { x: 0, z: 0 },
        terrainSlopeBps: 1_000,
        roadReachable: true,
        entranceReachable: true,
      },
    ],
    ...overrides,
  };
}

describe("deterministicStructurePlacementCompiler", () => {
  it("creates a replay-stable placement and graph update from the canonical candidate", () => {
    const result = compileDeterministicStructurePlacement(baseInput());
    const replay = compileDeterministicStructurePlacement(
      baseInput({
        candidates: [...baseInput().candidates].reverse(),
        rules: [settlementRule],
      })
    );
    expect(result.placements).toHaveLength(1);
    expect(result.graphUpdates).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({
      candidateId: "settlement-1",
      ruleId: "settlement-rule",
      positionMm: { x: 0, z: 0 },
    });
    expect(result.resolutionHash).toBe(replay.resolutionHash);
    expect(result.receipt.receiptHash).toBe(replay.receipt.receiptHash);
    expect(verifyDeterministicStructurePlacement(baseInput(), result)).toBe(
      true
    );
  });

  it("uses fixed priority and canonical candidate tie-breaks", () => {
    const lower: StructurePlacementRule = {
      ...settlementRule,
      id: "lower",
      priority: 1,
      replacement: {
        ...settlementRule.replacement,
        scaleRangeFixed: { min: 2000, max: 2000 },
      },
    };
    const result = compileDeterministicStructurePlacement(
      baseInput({ rules: [lower, settlementRule] })
    );
    expect(result.placements[0]?.ruleId).toBe("settlement-rule");
    expect(result.placements[0]?.scaleFixed).toBe(1000);
  });

  it("rejects each authoritative geometry and topology constraint fail-closed", () => {
    expect(
      compileDeterministicStructurePlacement(
        baseInput({
          candidates: [
            { ...baseInput().candidates[0]!, terrainSlopeBps: 4_220 },
          ],
        })
      ).rejections[0]?.code
    ).toBe("TERRAIN_SLOPE_EXCEEDED");
    expect(
      compileDeterministicStructurePlacement(
        baseInput({
          candidates: [{ ...baseInput().candidates[0]!, roadReachable: false }],
        })
      ).rejections[0]?.code
    ).toBe("ROAD_CONNECTIVITY_REQUIRED");
    expect(
      compileDeterministicStructurePlacement(
        baseInput({
          candidates: [
            { ...baseInput().candidates[0]!, graphNodeId: "missing" },
          ],
        })
      ).rejections[0]?.code
    ).toBe("GRAPH_NODE_MISSING");
    expect(
      compileDeterministicStructurePlacement(
        baseInput({
          rules: [
            {
              ...settlementRule,
              constraints: {
                ...settlementRule.constraints,
                boundsMm: { minX: 1, minZ: 1, maxX: 10, maxZ: 10 },
              },
            },
          ],
        })
      ).rejections[0]?.code
    ).toBe("PLACEMENT_BOUNDS_EXCEEDED");
    expect(
      compileDeterministicStructurePlacement(
        baseInput({
          rules: [
            {
              ...settlementRule,
              constraints: {
                ...settlementRule.constraints,
                maxFootprintAreaSqMm: 100,
              },
            },
          ],
        })
      ).rejections[0]?.code
    ).toBe("FOOTPRINT_BUDGET_EXCEEDED");
    expect(
      compileDeterministicStructurePlacement(
        baseInput({
          existingPlacements: [
            {
              placementId: "existing",
              kind: "ruin",
              positionMm: { x: 0, z: 0 },
              footprintMm: { x: 2_000, z: 2_000 },
            },
          ],
        })
      ).rejections[0]?.code
    ).toBe("PLACEMENT_OVERLAP");
    expect(
      compileDeterministicStructurePlacement(
        baseInput({
          existingPlacements: [
            {
              placementId: "existing",
              kind: "ruin",
              positionMm: { x: 2_001, z: 0 },
              footprintMm: { x: 1_000, z: 1_000 },
            },
          ],
        })
      ).rejections[0]?.code
    ).toBe("PLACEMENT_SPACING_INSUFFICIENT");
  });

  it("requires dungeon entrance reachability and verifies tamper divergence", () => {
    const dungeonRule: StructurePlacementRule = {
      ...settlementRule,
      id: "dungeon-rule",
      matcher: { kind: "dungeon", requiredTags: ["entrance"] },
      replacement: {
        ...settlementRule.replacement,
        footprintMm: { x: 2_000, z: 2_000 },
      },
      constraints: {
        ...settlementRule.constraints,
        requireRoadConnectivity: false,
        requireEntranceReachability: true,
      },
    };
    const input = baseInput({
      rules: [dungeonRule],
      candidates: [
        {
          ...baseInput().candidates[0]!,
          candidateId: "dungeon-1",
          kind: "dungeon",
          tags: ["entrance"],
          graphNodeId: "dungeon-node",
          entranceReachable: false,
        },
      ],
    });
    const result = compileDeterministicStructurePlacement(input);
    expect(result.rejections[0]?.code).toBe("DUNGEON_ENTRANCE_UNREACHABLE");
    const valid = compileDeterministicStructurePlacement({
      ...input,
      candidates: [{ ...input.candidates[0]!, entranceReachable: true }],
    });
    expect(valid.placements).toHaveLength(1);
    expect(
      verifyDeterministicStructurePlacement(input, {
        ...valid,
        resolutionHash: "sha256:" + "0".repeat(64),
      })
    ).toBe(false);
  });

  it("rejects unmatched candidates without inventing a fallback rule", () => {
    const result = compileDeterministicStructurePlacement(
      baseInput({
        candidates: [
          { ...baseInput().candidates[0]!, kind: "poi", tags: ["marker"] },
        ],
      })
    );
    expect(result.placements).toHaveLength(0);
    expect(result.rejections[0]).toMatchObject({
      code: "CANDIDATE_RULE_NOT_MATCHED",
      ruleId: null,
    });
  });
});
