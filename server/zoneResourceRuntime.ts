import { AX1_INITIAL_RESOURCE_NODES } from "@shared/ax1ResourceEcologyProtocol";
import {
  ZONE_RESOURCE_CONTRACT_VERSION,
  type ConfirmedZoneResourceNode,
  type ConfirmedZoneResourceSnapshot,
  validConfirmedZoneResourceSnapshot,
} from "@shared/zoneResourceContract";
import { AX1_ECOLOGY_SOURCE_REVISION } from "@shared/ax1ResourceEcologyProtocol";
import type { CanonicalResourceState } from "./causality/zoneCanonicalState";

/** AX1 source semantics were a 60 second respawn. At the zone's 100 ms fixed tick this is exactly 600 ticks. */
export const AX1_RESOURCE_RESPAWN_TICKS = 600 as const;

type MutableResourceState = {
  nodeId: string;
  capacity: number;
  remaining: number;
  depleted: boolean;
  respawnAtTick: number | null;
};

export type ZoneResourceConsumptionResult =
  | "accepted"
  | "missing"
  | "depleted"
  | "invalid_quantity";

function compareBinary(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Server-owned projection of AX1 resource-node availability.
 *
 * This runtime never grants inventory, XP or profession rewards. A persistence
 * coordinator must commit those authoritative effects first and only then call
 * applyConfirmedConsumption. This keeps AX1 content separate from Aurion truth.
 */
export class ZoneResourceRuntime {
  private readonly states = new Map<string, MutableResourceState>();
  private readonly orderedStates: MutableResourceState[];
  private revision = 1;

  public constructor() {
    for (const definition of AX1_INITIAL_RESOURCE_NODES) {
      this.states.set(definition.id, {
        nodeId: definition.id,
        capacity: definition.capacity,
        remaining: definition.capacity,
        depleted: false,
        respawnAtTick: null,
      });
    }
    this.orderedStates = Array.from(this.states.values()).sort((left, right) =>
      compareBinary(left.nodeId, right.nodeId)
    );
  }

  public snapshot(currentTick: number): ConfirmedZoneResourceSnapshot {
    const nodes: ConfirmedZoneResourceNode[] = [];
    for (const state of this.orderedStates) {
      nodes.push(
        Object.freeze({
          nodeId: state.nodeId,
          remaining: state.remaining,
          depleted: state.depleted,
          respawnAtTick: state.respawnAtTick,
        })
      );
    }

    const snapshot = Object.freeze({
      contractVersion: ZONE_RESOURCE_CONTRACT_VERSION,
      contentSourceRevision: AX1_ECOLOGY_SOURCE_REVISION,
      revision: this.revision,
      nodes: Object.freeze(nodes),
    });
    if (!validConfirmedZoneResourceSnapshot(snapshot, currentTick)) {
      throw new Error("ZONE_RESOURCE_SNAPSHOT_INVALID");
    }
    return snapshot;
  }

  /**
   * Restore the resource fields already covered by CanonicalZoneState. Replay
   * fails closed on unknown/missing nodes or contradictory depletion metadata.
   */
  public restoreCanonicalStates(resources: readonly CanonicalResourceState[]): void {
    if (resources.length !== this.states.size) throw new Error("ZONE_RESOURCE_RESTORE_COUNT_INVALID");
    const seen = new Set<string>();
    for (const resource of resources) {
      const state = this.states.get(resource.nodeId);
      if (!state || seen.has(resource.nodeId)) throw new Error("ZONE_RESOURCE_RESTORE_IDENTITY_INVALID");
      seen.add(resource.nodeId);
      if (resource.resourceType !== "ecology_node") throw new Error("ZONE_RESOURCE_RESTORE_TYPE_INVALID");
      if (!Number.isSafeInteger(resource.remainingGathers) || resource.remainingGathers < 0 || resource.remainingGathers > state.capacity)
        throw new Error("ZONE_RESOURCE_RESTORE_REMAINING_INVALID");
      if (!Number.isSafeInteger(resource.respawnTick) || resource.respawnTick < 0)
        throw new Error("ZONE_RESOURCE_RESTORE_RESPAWN_INVALID");
      const depleted = resource.state === "depleted";
      if (depleted !== (resource.remainingGathers === 0))
        throw new Error("ZONE_RESOURCE_RESTORE_STATE_INVALID");
      if (depleted && resource.respawnTick === 0)
        throw new Error("ZONE_RESOURCE_RESTORE_DEPLETED_TICK_INVALID");
      if (!depleted && resource.respawnTick !== 0)
        throw new Error("ZONE_RESOURCE_RESTORE_READY_TICK_INVALID");
      state.remaining = resource.remainingGathers;
      state.depleted = depleted;
      state.respawnAtTick = depleted ? resource.respawnTick : null;
    }
  }

  /**
   * Applies a consumption that an upstream authoritative persistence operation
   * has already confirmed. This method itself intentionally creates no reward.
   */
  public applyConfirmedConsumption(
    nodeId: string,
    currentTick: number,
    quantity = 1,
  ): ZoneResourceConsumptionResult {
    if (!Number.isSafeInteger(currentTick) || currentTick < 0) {
      throw new Error("ZONE_RESOURCE_TICK_INVALID");
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) return "invalid_quantity";
    const state = this.states.get(nodeId);
    if (!state) return "missing";
    if (state.depleted || state.remaining === 0) return "depleted";
    if (quantity > state.remaining) return "depleted";

    state.remaining -= quantity;
    if (state.remaining === 0) {
      state.depleted = true;
      state.respawnAtTick = currentTick + AX1_RESOURCE_RESPAWN_TICKS;
    }
    this.revision += 1;
    return "accepted";
  }

  /** Development-only reset using the same canonical resource definitions as the live runtime. */
  public resetDevelopmentFixture(): void {
    for (const state of this.orderedStates) {
      state.remaining = state.capacity;
      state.depleted = false;
      state.respawnAtTick = null;
    }
    this.revision = 1;
  }

  /** Advances deterministic respawn state to the supplied authoritative zone tick. */
  public tick(currentTick: number): boolean {
    if (!Number.isSafeInteger(currentTick) || currentTick < 0) {
      throw new Error("ZONE_RESOURCE_TICK_INVALID");
    }
    let changed = false;
    for (const state of this.orderedStates) {
      if (!state.depleted || state.respawnAtTick === null || currentTick < state.respawnAtTick) continue;
      state.remaining = state.capacity;
      state.depleted = false;
      state.respawnAtTick = null;
      changed = true;
    }
    if (changed) this.revision += 1;
    return changed;
  }
}
