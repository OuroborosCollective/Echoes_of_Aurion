import { describe, expect, it } from "vitest";
import { wasdAurionSceneAssetAssignments, wasdAurionSceneAssetSummary } from "./wasdAurionSceneAssets";

describe("wasdAurionSceneAssets", () => {
  it("catalogs the approved low-budget water-source candidate without activating it", () => {
    const [assignment] = wasdAurionSceneAssetAssignments;
    expect(assignment).toMatchObject({
      status: "INACTIVE",
      category: "PROP",
      rightsStatus: "VERIFIED",
      target: "emberfall_settlement_water_source",
      asset: { id: "wasd_d043b07bc436ceb2", budgetStatus: "streamable", bytes: 1911884, triangleEstimate: 10450 },
    });
    expect(assignment.requiredReadback).toEqual(["babylon_visible_mesh", "runtime_memory_budget", "no_fallback_texture"]);
    expect(wasdAurionSceneAssetSummary).toMatchObject({ mappedCandidates: 1, activeCandidates: 0, inactiveCandidates: 1 });
  });
});
