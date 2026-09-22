import {
  type CanonicalZoneQuestInstance,
  type CanonicalZoneState,
  hashCanonicalZoneState,
  sortCanonicalZoneState,
} from "../causality/zoneCanonicalState";
import { QuestInstanceSchema, type QuestInstance } from "../../shared/aurionQuestContract";

export interface ZoneQuestSnapshotExportResult {
  snapshot: CanonicalZoneState;
  snapshotHash: string;
  json: string;
}

export interface ZoneQuestSnapshotReadbackResult {
  verifiedHash: string;
  instances: QuestInstance[];
  zoneState: CanonicalZoneState;
}

/**
 * Read-only Quest → Zone projection. It never mutates quest/domain state.
 */
export class ZoneSnapshotQuestBridge {
  public static exportZoneSnapshot(
    baseState: CanonicalZoneState,
    questInstances: readonly QuestInstance[] = [],
  ): ZoneQuestSnapshotExportResult {
    const mapped: CanonicalZoneQuestInstance[] = questInstances
      .map((instance) => ({
        instanceId: instance.id,
        templateId: instance.templateId,
        templateVersion: instance.templateVersion,
        worldId: instance.worldId,
        playerUserId: instance.playerUserId,
        giverNpcId: instance.giverNpcId,
        seedDigest: instance.seedDigest,
        planHash: instance.planHash,
        graphHash: instance.graphHash,
        currentNodeId: instance.currentNodeId,
        completedNodeIds: [...instance.completedNodeIds],
        boundRoles: instance.boundRoles.map((role) => ({ ...role })),
        state: instance.state,
        objectiveProgress: { ...instance.objectiveProgress },
        updatedAtTick: baseState.tick,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
      }))
      .sort((left, right) => left.instanceId.localeCompare(right.instanceId));

    const questSummaries = questInstances
      .map((instance) => ({
        userId: instance.playerUserId,
        questId: instance.id,
        status: instance.state === "completed" ? "completed" as const : "accepted" as const,
        updatedAtTick: baseState.tick,
      }))
      .sort((left, right) => left.userId - right.userId || left.questId.localeCompare(right.questId));

    const snapshot = sortCanonicalZoneState({
      ...baseState,
      questSummaries,
      questInstances: mapped,
    });
    return Object.freeze({
      snapshot,
      snapshotHash: hashCanonicalZoneState(snapshot),
      json: JSON.stringify(snapshot),
    });
  }

  public static readbackZoneSnapshot(
    input: string | CanonicalZoneState,
    expectedHash?: string,
  ): ZoneQuestSnapshotReadbackResult {
    let parsed: CanonicalZoneState;
    if (typeof input === "string") {
      try {
        parsed = JSON.parse(input) as CanonicalZoneState;
      } catch {
        throw new Error("ZONE_SNAPSHOT_PARSE_ERROR");
      }
    } else {
      parsed = input;
    }

    if (!parsed || parsed.schema !== "aurion.zone.state.v1") {
      throw new Error("ZONE_SNAPSHOT_INVALID_SCHEMA");
    }

    const snapshot = sortCanonicalZoneState(parsed);
    const observedHash = hashCanonicalZoneState(snapshot);
    if (expectedHash && observedHash !== expectedHash) {
      throw new Error("ZONE_SNAPSHOT_HASH_MISMATCH");
    }

    const instances = (snapshot.questInstances ?? []).map((raw) => QuestInstanceSchema.parse({
      id: raw.instanceId,
      templateId: raw.templateId,
      templateVersion: raw.templateVersion,
      worldId: raw.worldId,
      playerUserId: raw.playerUserId,
      giverNpcId: raw.giverNpcId,
      seedDigest: raw.seedDigest,
      planHash: raw.planHash,
      graphHash: raw.graphHash,
      currentNodeId: raw.currentNodeId,
      completedNodeIds: raw.completedNodeIds,
      boundRoles: raw.boundRoles,
      state: raw.state,
      objectiveProgress: raw.objectiveProgress,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }));

    return Object.freeze({ verifiedHash: observedHash, instances, zoneState: snapshot });
  }
}
