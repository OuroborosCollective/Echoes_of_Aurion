import { describe, expect, it } from "vitest";
import {
  createSpatialConstraintField,
  planDeterministic3DTraversal,
  replayDeterministic3DTraversal,
} from "../shared/spatialConstraintFieldProtocol";
import { createChunkSpatialConstraintField, resolveSpatiallyConstrainedNpcUtilityDecision, sourceStructureHashForChunk } from "./spatialConstraintField";

const REVISION = "0123456789abcdef0123456789abcdef01234567";
const NAV = "aurion.navigation.v1";
const chunk = { x: 0, z: 0 } as const;

function field(cost: number, risk: number, modes = ["ground", "climb"] as const) {
  return createSpatialConstraintField({
    worldRevision: REVISION,
    chunkKey: "0:0",
    sourceStructureHash: sourceStructureHashForChunk(chunk),
    navigationRevision: NAV,
    minAltitudeQ16: 0,
    maxAltitudeQ16: 65_536,
    traversalCostQ16: cost,
    riskQ16: risk,
    allowedModes: modes,
  });
}

function route(id: string, mode: "ground" | "climb", fields = [field(100, 50)]) {
  return {
    id,
    mode,
    waypoints: [
      { nodeId: "npc_1", xMm: 18_000, zMm: 18_000, altitudeQ16: 0 },
      { nodeId: "node_2", xMm: 20_000, zMm: 18_000, altitudeQ16: mode === "ground" ? 0 : 32_768 },
    ],
    fields,
  } as const;
}

describe("Aurion spatial constraint field", () => {
  it("is stable and binds to the existing canonical collision source", () => {
    const first = createChunkSpatialConstraintField({
      worldRevision: REVISION,
      navigationRevision: NAV,
      coordinate: chunk,
      minAltitudeQ16: 0,
      maxAltitudeQ16: 65_536,
      traversalCostQ16: 500,
      riskQ16: 125,
      allowedModes: ["fly", "ground", "climb"],
    });
    const second = createChunkSpatialConstraintField({
      worldRevision: REVISION,
      navigationRevision: NAV,
      coordinate: chunk,
      minAltitudeQ16: 0,
      maxAltitudeQ16: 65_536,
      traversalCostQ16: 500,
      riskQ16: 125,
      allowedModes: ["climb", "fly", "ground"],
    });
    expect(first).toEqual(second);
    expect(first.sourceStructureHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.fieldHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects altitude outside the authoritative field envelope", () => {
    const constrained = createSpatialConstraintField({
      worldRevision: REVISION,
      chunkKey: "0:0",
      sourceStructureHash: sourceStructureHashForChunk(chunk),
      navigationRevision: NAV,
      minAltitudeQ16: 8_000,
      maxAltitudeQ16: 24_000,
      traversalCostQ16: 100,
      riskQ16: 10,
      allowedModes: ["climb"],
    });
    expect(() => planDeterministic3DTraversal({
      worldRevision: REVISION,
      capabilities: ["climb"],
      candidates: [route("blocked", "climb", [constrained])],
    })).toThrow("SPATIAL_CONSTRAINT_MIN_ALTITUDE_BLOCKED");
  });

  it("makes candidate ordering irrelevant and replays identically", () => {
    const cheap = route("route-cheap", "climb", [field(100, 25)]);
    const expensive = route("route-expensive", "climb", [field(200, 1)]);
    const first = planDeterministic3DTraversal({
      worldRevision: REVISION,
      capabilities: ["ground", "climb"],
      candidates: [expensive, cheap],
    });
    const replay = replayDeterministic3DTraversal({
      plan: first,
      capabilities: ["climb", "ground"],
      candidates: [cheap, expensive],
    });
    expect(replay).toEqual(first);
    expect(replay.candidateId).toBe("route-cheap");
  });

  it("gates the existing NPC utility planner before utility scoring", () => {
    const needs = {
      safety: 0.5,
      resources: 0.5,
      belonging: 0.5,
      status: 0.5,
      wealth: 0.5,
      power: 0.5,
    } as const;
    const context = {
      sourceReceiptId: "receipt:spatial:0",
      resolutionIndex: 0,
      needs,
      hungerBps: 0,
      fatigueBps: 0,
      candidates: [
        {
          id: "vertical",
          action: "patrol",
          goal: "seek_safety",
          needPressureBps: 8_000,
          benefitBps: 10_000,
          riskBps: 0,
          costBps: 0,
          sourceReceiptId: "receipt:spatial:0",
          constraintStatus: "eligible",
          constraintCode: null,
        },
        {
          id: "ground",
          action: "patrol",
          goal: "seek_safety",
          needPressureBps: 1_000,
          benefitBps: 3_000,
          riskBps: 0,
          costBps: 0,
          sourceReceiptId: "receipt:spatial:0",
          constraintStatus: "eligible",
          constraintCode: null,
        },
      ],
    } as const;
    const result = resolveSpatiallyConstrainedNpcUtilityDecision(context, [
      { candidateId: "vertical", worldRevision: REVISION, capabilities: ["ground"], route: route("vertical", "climb") },
      { candidateId: "ground", worldRevision: REVISION, capabilities: ["ground"], route: route("ground", "ground") },
    ]);
    expect(result.decision.winnerId).toBe("ground");
    expect(result.routePlans.has("ground")).toBe(true);
    expect(result.routePlans.has("vertical")).toBe(false);
  });
});
