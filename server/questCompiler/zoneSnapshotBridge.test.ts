import { describe, expect, it } from "vitest";
import { ZoneSnapshotQuestBridge } from "./zoneSnapshotBridge";
import type { CanonicalZoneState } from "../causality/zoneCanonicalState";
import type { QuestInstance } from "../../shared/aurionQuestContract";

describe("ZoneSnapshotQuestBridge (AIM-298 #462)", () => {
  const baseZoneState: CanonicalZoneState = {
    schema: "aurion.zone.state.v1",
    worldId: "world_aurion_alpha",
    zoneId: "observatory_threshold",
    tick: 1200,
    ruleset: "standard.v1",
    combatSequence: 45,
    players: [],
    mobs: [],
    resources: [],
    questSummaries: [],
  };

  const sampleQuestA: QuestInstance = {
    id: "qi_alpha_001",
    templateId: "investigate_ruins",
    templateVersion: 1,
    worldId: "world_aurion_alpha",
    playerUserId: 42,
    giverNpcId: "npc_elder_alden",
    seedDigest: "a".repeat(64),
    planHash: "b".repeat(64),
    graphHash: "g".repeat(64),
    currentNodeId: "node_1",
    completedNodeIds: [],
    boundRoles: [],
    state: "active",
    objectiveProgress: { investigate: 1, report: 0 },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };

  const sampleQuestB: QuestInstance = {
    id: "qi_beta_002",
    templateId: "clear_goblins",
    templateVersion: 1,
    worldId: "world_aurion_alpha",
    playerUserId: 43,
    giverNpcId: "npc_guard_bruno",
    seedDigest: "c".repeat(64),
    planHash: "d".repeat(64),
    graphHash: "g".repeat(64),
    currentNodeId: "node_1",
    completedNodeIds: [],
    boundRoles: [],
    state: "active",
    objectiveProgress: { defeat: 3 },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };

  it("exports zone snapshot with active quests and produces valid sha256 hash", () => {
    const exported = ZoneSnapshotQuestBridge.exportZoneSnapshot(baseZoneState, [sampleQuestA, sampleQuestB]);

    expect(exported.snapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(exported.snapshot.questInstances).toHaveLength(2);
    expect(exported.snapshot.questInstances![0].instanceId).toBe("qi_alpha_001");
    expect(exported.snapshot.questInstances![1].instanceId).toBe("qi_beta_002");
    expect(exported.snapshot.questSummaries).toHaveLength(2);

    const readback = ZoneSnapshotQuestBridge.readbackZoneSnapshot(exported.json, exported.snapshotHash);
    expect(readback.verifiedHash).toBe(exported.snapshotHash);
    expect(readback.instances).toHaveLength(2);
    expect(readback.instances[0].id).toBe("qi_alpha_001");
    expect(readback.instances[0].objectiveProgress).toEqual({ investigate: 1, report: 0 });
    expect(readback.instances[1].id).toBe("qi_beta_002");
    expect(readback.instances[1].objectiveProgress).toEqual({ defeat: 3 });
  });

  it("sorts quest instances deterministically regardless of input insertion order", () => {
    const exportOrder1 = ZoneSnapshotQuestBridge.exportZoneSnapshot(baseZoneState, [sampleQuestA, sampleQuestB]);
    const exportOrder2 = ZoneSnapshotQuestBridge.exportZoneSnapshot(baseZoneState, [sampleQuestB, sampleQuestA]);

    expect(exportOrder1.snapshotHash).toBe(exportOrder2.snapshotHash);
    expect(exportOrder1.json).toBe(exportOrder2.json);
  });

  it("detects tampered quest progress and fails closed on readback", () => {
    const exported = ZoneSnapshotQuestBridge.exportZoneSnapshot(baseZoneState, [sampleQuestA]);
    const parsed = JSON.parse(exported.json);

    // Tamper with objective progress
    parsed.questInstances[0].objectiveProgress.investigate = 999;
    const tamperedJson = JSON.stringify(parsed);

    expect(() => {
      ZoneSnapshotQuestBridge.readbackZoneSnapshot(tamperedJson, exported.snapshotHash);
    }).toThrow(/ZONE_SNAPSHOT_HASH_MISMATCH/);
  });

  it("exports clean deterministic empty structure when no quests are active", () => {
    const exported = ZoneSnapshotQuestBridge.exportZoneSnapshot(baseZoneState, []);

    expect(exported.snapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(exported.snapshot.questInstances).toEqual([]);
    expect(exported.snapshot.questSummaries).toEqual([]);

    const readback = ZoneSnapshotQuestBridge.readbackZoneSnapshot(exported.json, exported.snapshotHash);
    expect(readback.verifiedHash).toBe(exported.snapshotHash);
    expect(readback.instances).toEqual([]);
  });

  it("rejects invalid or corrupted snapshot payload", () => {
    expect(() => {
      ZoneSnapshotQuestBridge.readbackZoneSnapshot("invalid json {{{");
    }).toThrow(/ZONE_SNAPSHOT_PARSE_ERROR/);

    expect(() => {
      ZoneSnapshotQuestBridge.readbackZoneSnapshot(JSON.stringify({ schema: "wrong.schema" }));
    }).toThrow(/ZONE_SNAPSHOT_INVALID_SCHEMA/);
  });
});
