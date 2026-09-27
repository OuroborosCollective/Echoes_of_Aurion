import { describe, expect, it } from "vitest";
import { splitWorldChunkPositionMm } from "../shared/worldChunkProtocol";
import {
  createChunkSpatialConstraintField,
} from "./spatialConstraintField";
import {
  planDeterministic3DTraversal,
  replayDeterministic3DTraversal,
  type SpatialTraversalPathCandidate,
} from "../shared/spatialConstraintFieldProtocol";
import { ZoneMobRuntime } from "./zoneMobRuntime";

const REVISION = "0123456789abcdef0123456789abcdef01234567";
const NAV = "aurion.navigation.v1";

function routeForMob(runtime: ZoneMobRuntime, mode: "ground" | "climb") {
  const mob = runtime.stateFor("mob_1");
  if (!mob) throw new Error("REAL_AURION_MOB_REQUIRED");
  const chunk = splitWorldChunkPositionMm(mob.position).coordinate;
  const field = createChunkSpatialConstraintField({
    worldRevision: REVISION,
    navigationRevision: NAV,
    coordinate: chunk,
    minAltitudeQ16: 0,
    maxAltitudeQ16: 65_536,
    traversalCostQ16: mode === "ground" ? 100 : 150,
    riskQ16: mode === "ground" ? 50 : 25,
    allowedModes: mode === "ground" ? ["ground"] : ["ground", "climb"],
  });
  const candidate: SpatialTraversalPathCandidate = {
    id: `mob_1:${mode}`,
    mode,
    waypoints: [
      { nodeId: "mob_1", xMm: mob.position.x, zMm: mob.position.z, altitudeQ16: 0 },
      { nodeId: "mob_1:next", xMm: mob.position.x + 1_000, zMm: mob.position.z, altitudeQ16: mode === "ground" ? 0 : 32_768 },
    ],
    fields: [field],
  };
  return { mob, chunk, candidate };
}

describe("Aurion spatial constraint field real NPC runtime integration", () => {
  it("binds a live Aurion-hosted NPC definition to a deterministic vertical traversal route", () => {
    const runtime = new ZoneMobRuntime();
    const { mob, candidate } = routeForMob(runtime, "climb");
    const plan = planDeterministic3DTraversal({
      worldRevision: REVISION,
      capabilities: ["ground", "climb"],
      candidates: [candidate],
    });
    expect(candidate.waypoints[0]?.nodeId).toBe(mob.definition.entityId);
    expect(plan.mode).toBe("climb");
    expect(plan.candidateId).toBe("mob_1:climb");
    expect(plan.routeHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("replays the same NPC traversal plan from a fresh runtime instance", () => {
    const beforeRestart = new ZoneMobRuntime();
    const first = routeForMob(beforeRestart, "climb");
    const plan = planDeterministic3DTraversal({
      worldRevision: REVISION,
      capabilities: ["ground", "climb"],
      candidates: [first.candidate],
    });

    const afterRestart = new ZoneMobRuntime();
    const replay = routeForMob(afterRestart, "climb");
    const restored = replayDeterministic3DTraversal({
      plan,
      capabilities: ["climb", "ground"],
      candidates: [replay.candidate],
    });

    expect(afterRestart.stateFor("mob_1")?.position).toEqual(beforeRestart.stateFor("mob_1")?.position);
    expect(afterRestart.stateFor("mob_1")?.definition.entityId).toBe("mob_1");
    expect(restored).toEqual(plan);
  });
});
