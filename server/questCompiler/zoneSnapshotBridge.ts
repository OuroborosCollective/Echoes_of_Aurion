import {
  type CanonicalZoneState,
  type CanonicalZoneQuestInstance,
  hashCanonicalZoneState,
  sortCanonicalZoneState,
} from "../causality/zoneCanonicalState";
import {
  type QuestInstance,
  QuestInstanceSchema,
} from "../../shared/aurionQuestContract";

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
 * AIM-298 (#462): Deterministic Zone Snapshot Export & Readback Pipeline.
 * Integrates quest state into canonical zone snapshots with SHA-256 integrity verification.
 */
export class ZoneSnapshotQuestBridge {
  /**
   * Deterministically exports a canonical zone state with embedded quest instances.
   */
  public static exportZoneSnapshot(
    baseState: CanonicalZoneState,
    questInstances: readonly QuestInstance[] = []
  ): ZoneQuestSnapshotExportResult {
    // Map to CanonicalZoneQuestInstance sorted deterministically by instanceId
    const mappedQuests: CanonicalZoneQuestInstance[] = questInstances
      .map(inst => ({
        instanceId: inst.id,
        templateId: inst.templateId,
        templateVersion: inst.templateVersion,
        worldId: inst.worldId,
        playerUserId: inst.playerUserId,
        giverNpcId: inst.giverNpcId,
        seedDigest: inst.seedDigest,
        planHash: inst.planHash,
        graphHash: inst.graphHash,
        currentNodeId: inst.currentNodeId,
        completedNodeIds: [...(inst.completedNodeIds || [])],
        boundRoles: (inst.boundRoles || []).map(r => ({ ...r })),
        state: inst.state,
        objectiveProgress: { ...inst.objectiveProgress },
        updatedAtTick: baseState.tick,
        createdAt: inst.createdAt,
        updatedAt: inst.updatedAt,
      }))
      .sort((a, b) => (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0));

    // Also populate canonical quest summaries
    const mappedSummaries = questInstances
      .map(inst => ({
        userId: inst.playerUserId,
        questId: inst.id,
        status: (inst.state === "completed" ? "completed" : "accepted") as "accepted" | "completed",
        updatedAtTick: baseState.tick,
      }))
      .sort((a, b) => a.userId - b.userId || (a.questId < b.questId ? -1 : a.questId > b.questId ? 1 : 0));

    const stateWithQuests: CanonicalZoneState = {
      ...baseState,
      questSummaries: mappedSummaries,
      questInstances: mappedQuests,
    };

    const sortedState = sortCanonicalZoneState(stateWithQuests);
    const snapshotHash = hashCanonicalZoneState(sortedState);
    const json = JSON.stringify(sortedState);

    return {
      snapshot: sortedState,
      snapshotHash,
      json,
    };
  }

  /**
   * Deterministically reads back and verifies a zone snapshot, reconstituting QuestInstance records.
   * Fails closed if the hash does not match or if structure is corrupt.
   */
  public static readbackZoneSnapshot(
    input: string | CanonicalZoneState,
    expectedHash?: string
  ): ZoneQuestSnapshotReadbackResult {
    let parsedState: CanonicalZoneState;
    if (typeof input === "string") {
      try {
        parsedState = JSON.parse(input) as CanonicalZoneState;
      } catch (err: unknown) {
        throw new Error(`ZONE_SNAPSHOT_PARSE_ERROR:${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      parsedState = input;
    }

    if (!parsedState || parsedState.schema !== "aurion.zone.state.v1") {
      throw new Error("ZONE_SNAPSHOT_INVALID_SCHEMA");
    }

    const sortedState = sortCanonicalZoneState(parsedState);
    const observedHash = hashCanonicalZoneState(sortedState);

    if (expectedHash && observedHash !== expectedHash) {
      throw new Error(`ZONE_SNAPSHOT_HASH_MISMATCH:expected ${expectedHash}, observed ${observedHash}`);
    }

    // Reconstitute QuestInstance objects
    const instances: QuestInstance[] = (sortedState.questInstances || []).map(raw => {
      const candidate: QuestInstance = {
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
        completedNodeIds: raw.completedNodeIds || [],
        boundRoles: raw.boundRoles || [],
        state: raw.state,
        objectiveProgress: raw.objectiveProgress,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      };
      return QuestInstanceSchema.parse(candidate);
    });

    return {
      verifiedHash: observedHash,
      instances,
      zoneState: sortedState,
    };
  }
}
