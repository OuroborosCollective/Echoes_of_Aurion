import { describe, expect, it } from "vitest";
import { ZoneSnapshotQuestBridge } from "./zoneSnapshotBridge";
import type { CanonicalZoneState } from "../causality/zoneCanonicalState";
import type { QuestInstance } from "../../shared/aurionQuestContract";

const zone: CanonicalZoneState = {
  schema: "aurion.zone.state.v1",
  worldId: "world_test",
  zoneId: "observatory_threshold",
  tick: 42,
  ruleset: "standard.v1",
  combatSequence: 3,
  players: [],
  mobs: [],
  resources: [],
  questSummaries: [],
};

const quest = (id: string, userId: number): QuestInstance => ({
  id,
  worldId: "world_test",
  playerUserId: userId,
  giverNpcId: "npc_kaelen",
  templateId: "tpl_caravan_investigation",
  templateVersion: 1,
  seedDigest: "a".repeat(64),
  planHash: "b".repeat(64),
  graphHash: "c".repeat(64),
  currentNodeId: "node_investigate",
  completedNodeIds: [],
  boundRoles: [],
  state: "active",
  objectiveProgress: { cargo_inspected: 1, alpha: true },
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:01.000Z",
});

describe("ZoneSnapshotQuestBridge", () => {
  it("produces a stable hash independent of quest insertion order", () => {
    const a = ZoneSnapshotQuestBridge.exportZoneSnapshot(zone, [quest("q2", 2), quest("q1", 1)]);
    const b = ZoneSnapshotQuestBridge.exportZoneSnapshot(zone, [quest("q1", 1), quest("q2", 2)]);
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(a.json).toBe(b.json);
  });

  it("round-trips through canonical hash verification", () => {
    const exported = ZoneSnapshotQuestBridge.exportZoneSnapshot(zone, [quest("q1", 1)]);
    const readback = ZoneSnapshotQuestBridge.readbackZoneSnapshot(exported.json, exported.snapshotHash);
    expect(readback.verifiedHash).toBe(exported.snapshotHash);
    expect(readback.instances[0]?.id).toBe("q1");
    expect(readback.zoneState.questInstances?.[0]?.instanceId).toBe("q1");
  });

  it("fails closed on snapshot tampering", () => {
    const exported = ZoneSnapshotQuestBridge.exportZoneSnapshot(zone, [quest("q1", 1)]);
    const tampered = JSON.parse(exported.json) as Record<string, unknown>;
    const instances = tampered.questInstances as Array<Record<string, unknown>>;
    (instances[0]!.objectiveProgress as Record<string, unknown>).cargo_inspected = 999;

    expect(() => ZoneSnapshotQuestBridge.readbackZoneSnapshot(JSON.stringify(tampered), exported.snapshotHash))
      .toThrow("ZONE_SNAPSHOT_HASH_MISMATCH");
  });
});
