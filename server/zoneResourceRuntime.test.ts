import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AX1_INITIAL_RESOURCE_NODES } from "@shared/ax1ResourceEcologyProtocol";
import {
  ZONE_RESOURCE_CONTRACT_VERSION,
  validConfirmedZoneResourceSnapshot,
} from "@shared/zoneResourceContract";
import {
  AX1_RESOURCE_RESPAWN_TICKS,
  ZoneResourceRuntime,
} from "./zoneResourceRuntime";

function node(snapshot: ReturnType<ZoneResourceRuntime["snapshot"]>, id: string) {
  const found = snapshot.nodes.find(entry => entry.nodeId === id);
  if (!found) throw new Error(`missing resource node ${id}`);
  return found;
}

describe("ZoneResourceRuntime", () => {
  it("starts from the immutable AX1 content capacities in deterministic order", () => {
    const runtime = new ZoneResourceRuntime();
    const snapshot = runtime.snapshot(0);
    expect(snapshot.contractVersion).toBe(ZONE_RESOURCE_CONTRACT_VERSION);
    expect(validConfirmedZoneResourceSnapshot(snapshot, 0)).toBe(true);
    expect(snapshot.nodes.map(entry => entry.nodeId)).toEqual(
      AX1_INITIAL_RESOURCE_NODES.map(entry => entry.id).slice().sort()
    );
    for (const definition of AX1_INITIAL_RESOURCE_NODES) {
      expect(node(snapshot, definition.id)).toEqual({
        nodeId: definition.id,
        remaining: definition.capacity,
        depleted: false,
        respawnAtTick: null,
      });
    }
  });

  it("applies only confirmed bounded consumption and advances revision", () => {
    const runtime = new ZoneResourceRuntime();
    const initial = runtime.snapshot(0);
    expect(runtime.applyConfirmedConsumption("node_copper_1", 10, 2)).toBe("accepted");
    const updated = runtime.snapshot(10);
    expect(updated.revision).toBe(initial.revision + 1);
    expect(node(updated, "node_copper_1")).toMatchObject({ remaining: 3, depleted: false, respawnAtTick: null });
    expect(runtime.applyConfirmedConsumption("node_copper_1", 10, 4)).toBe("depleted");
    expect(runtime.applyConfirmedConsumption("missing", 10, 1)).toBe("missing");
    expect(runtime.applyConfirmedConsumption("node_copper_1", 10, 0)).toBe("invalid_quantity");
    expect(runtime.snapshot(10).revision).toBe(updated.revision);
  });

  it("depletes at zero and respawns on the deterministic server tick only", () => {
    const runtime = new ZoneResourceRuntime();
    expect(runtime.applyConfirmedConsumption("node_cotton_1", 25, 5)).toBe("accepted");
    const depleted = runtime.snapshot(25);
    expect(node(depleted, "node_cotton_1")).toEqual({
      nodeId: "node_cotton_1",
      remaining: 0,
      depleted: true,
      respawnAtTick: 25 + AX1_RESOURCE_RESPAWN_TICKS,
    });
    expect(runtime.tick(25 + AX1_RESOURCE_RESPAWN_TICKS - 1)).toBe(false);
    expect(runtime.applyConfirmedConsumption("node_cotton_1", 25 + AX1_RESOURCE_RESPAWN_TICKS - 1, 1)).toBe("depleted");
    expect(runtime.tick(25 + AX1_RESOURCE_RESPAWN_TICKS)).toBe(true);
    expect(node(runtime.snapshot(25 + AX1_RESOURCE_RESPAWN_TICKS), "node_cotton_1")).toEqual({
      nodeId: "node_cotton_1",
      remaining: 5,
      depleted: false,
      respawnAtTick: null,
    });
  });

  it("rejects invalid authoritative ticks", () => {
    const runtime = new ZoneResourceRuntime();
    expect(() => runtime.tick(-1)).toThrow("ZONE_RESOURCE_TICK_INVALID");
    expect(() => runtime.applyConfirmedConsumption("node_iron_1", 1.5, 1)).toThrow("ZONE_RESOURCE_TICK_INVALID");
  });

  it("fails closed for tampered snapshots", () => {
    const runtime = new ZoneResourceRuntime();
    const snapshot = runtime.snapshot(0);
    expect(validConfirmedZoneResourceSnapshot({ ...snapshot, revision: 0 }, 0)).toBe(false);
    expect(validConfirmedZoneResourceSnapshot({ ...snapshot, contentSourceRevision: "wrong" }, 0)).toBe(false);
    expect(validConfirmedZoneResourceSnapshot({ ...snapshot, nodes: snapshot.nodes.slice(1) }, 0)).toBe(false);
    const first = snapshot.nodes[0]!;
    expect(validConfirmedZoneResourceSnapshot({
      ...snapshot,
      nodes: [{ ...first, remaining: -1 }, ...snapshot.nodes.slice(1)],
    }, 0)).toBe(false);
  });

  it("contains no random, wall-clock or timer based gameplay truth", () => {
    const source = readFileSync("server/zoneResourceRuntime.ts", "utf8");
    for (const forbidden of ["Math.random", "Date.now", "performance.now", "setTimeout", "setInterval", "randomUUID"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toContain("inventory.push");
    expect(source).not.toContain("rewardXp");
    expect(source).not.toContain("rewardGold");
  });
});
