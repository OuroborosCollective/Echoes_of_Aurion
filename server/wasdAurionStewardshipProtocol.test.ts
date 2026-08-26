import { describe, expect, it } from "vitest";
import { resolveConstructionQueue, resolveFaith, resolveFarmPlot, resolveGate, resolveHouse, resolveStructureDamage } from "./wasdAurionStewardshipProtocol";

describe("wasdAurionStewardshipProtocol", () => {
  it("resolves crop growth from a receipt and resolution index, not wall time", () => {
    expect(resolveFarmPlot({ plotId: "windhollow-plot-1", seedId: "moonwheat", currentStage: 2, growSteps: 1, receiptId: "farm-1", resolutionIndex: 4 })).toMatchObject({ growthStage: 3 });
  });

  it("orders construction deterministically and clamps target levels", () => {
    const tasks = resolveConstructionQueue({ tasks: [{ structureId: "gate", targetLevel: 2 }, { structureId: "archive", targetLevel: 0 }], receiptId: "construction-1" });
    expect(tasks.map(task => task.structureId)).toEqual(["archive", "gate"]);
    expect(tasks[0]?.targetLevel).toBe(1);
  });

  it("keeps house upgrades monotonic and faith membership sorted", () => {
    expect(resolveHouse({ ownerId: "lyra", plotId: "observatory-1", currentUpgrades: 3, targetUpgrade: 1, receiptId: "house-1" })).toMatchObject({ upgrades: 3 });
    expect(resolveFaith({ religionId: "aurion-accord", adherents: ["orun", "lyra", "orun"], influence: 1.2, receiptId: "faith-1" })).toMatchObject({ adherents: ["lyra", "orun"], influence: 1 });
  });

  it("enforces gate access and bounded siege damage", () => {
    expect(resolveGate({ gateId: "windhollow-gate", state: "locked", actorPermissions: [], receiptId: "gate-1" }).canOpen).toBe(false);
    expect(resolveGate({ gateId: "windhollow-gate", state: "locked", actorPermissions: ["gate_access"], receiptId: "gate-2" }).canOpen).toBe(true);
    expect(resolveStructureDamage({ structureId: "windhollow-wall", currentHitpoints: 40, damage: 55, receiptId: "siege-1" })).toMatchObject({ hitpoints: 0, destroyed: true });
  });
});
