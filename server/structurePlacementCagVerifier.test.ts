import { describe, expect, it } from "vitest";
import { compileDeterministicStructurePlacement } from "./deterministicStructurePlacementCompiler";
import {
  buildStructurePlacementCagProbe,
  verifyStructurePlacementWithCag,
} from "./structurePlacementCagVerifier";
import type { StructurePlacementInput } from "@shared/deterministicStructurePlacementProtocol";

const input: StructurePlacementInput = {
  worldId: "echoes-of-aurion-global",
  worldSeedHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  worldGenerationRevision: "c09ba93b99738e24b9c375dec3a9cfae0806c466",
  rulesetHash:
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  sourceRevision: "c09ba93b99738e24b9c375dec3a9cfae0806c466",
  graph: {
    nodes: [
      {
        nodeId: "poi-node",
        layer: "structure",
        ruleId: "poi",
        parentId: null,
        coordinate: { x: 0, z: 0 },
        tags: [],
        streamId: "sha256:1",
        constraintHash: "sha256:2",
        nodeHash: "sha256:3",
      },
    ],
    edges: [],
  },
  rules: [
    {
      id: "poi-rule",
      matcher: { kind: "poi", requiredTags: ["marker"] },
      replacement: {
        footprintMm: { x: 100, z: 100 },
        portIds: [],
        orientations: [0],
        scaleRangeFixed: { min: 1000, max: 1000 },
      },
      priority: 1,
      constraints: {
        minSpacingMm: 0,
        maxSlopeBps: 4219,
        requireRoadConnectivity: false,
        requireEntranceReachability: false,
      },
    },
  ],
  candidates: [
    {
      candidateId: "poi-1",
      kind: "poi",
      tags: ["marker"],
      graphNodeId: "poi-node",
      positionMm: { x: 0, z: 0 },
      terrainSlopeBps: 0,
      roadReachable: false,
      entranceReachable: false,
    },
  ],
};

describe("structurePlacementCagVerifier", () => {
  it("builds a bounded exact probe bound to the placement resolution", () => {
    const resolution = compileDeterministicStructurePlacement(input);
    const probe = buildStructurePlacementCagProbe(resolution);
    expect(probe.expectedExact).toBe("{1,0,1}");
    expect(probe.code).toContain("accepted = 1");
    expect(probe.code.length).toBeLessThan(20_000);
    expect(probe.requestSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("blocks ruleset promotion when the Wolfram connector is not configured", async () => {
    const resolution = compileDeterministicStructurePlacement(input);
    const verification = await verifyStructurePlacementWithCag(resolution, {
      environment: {},
    });
    expect(verification).toMatchObject({
      status: "NOT_CONFIGURED",
      rulesetPromotion: "BLOCKED",
      mutationAuthority: "none",
    });
    expect(verification.resolutionHash).toBe(resolution.resolutionHash);
    expect(verification.rulesetHash).toBe(resolution.receipt.rulesetHash);
  });
});
