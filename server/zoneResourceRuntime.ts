import { AX1_INITIAL_RESOURCE_NODES } from "@shared/ax1ResourceEcologyProtocol";
import {
  ZONE_RESOURCE_CONTRACT_VERSION,
  type ConfirmedZoneResourceNode,
  type ConfirmedZoneResourceSnapshot,
  validConfirmedZoneResourceSnapshot,
} from "@shared/zoneResourceContract";
import { AX1_ECOLOGY_SOURCE_REVISION } from "@shared/ax1ResourceEcologyProtocol";

/** AX1 source semantics were a 60 second respawn. At the zone's 100 ms fixed tick this is exactly 600 ticks. */
export const AX1_RESOURCE_RESPAWN_TICKS = 600 as const;

type MutableResourceState = {
  nodeId: string;
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
  private revision = 1;

  public constructor() {
    for (const definition of AX1_INITIAL_RESOURCE_NODES) {
      this.states.set(definition.id, {
        nodeId: definition.id,
        remaining: definition.capacity,
        depleted: false,
        respawnAtTick: null,
      });
    }
  }

  public snapshot(currentTick: number): ConfirmedZoneResourceSnapshot {
    const nodes = [...this.states.values()]
      .sort((left, right) => compareBinary(left.nodeId, right.nodeId))
      .map((state): ConfirmedZoneResourceNode =>
        Object.freeze({
          nodeId: state.nodeId,
          remaining: state.remaining,
          depleted: state.depleted,
          respawnAtTick: state.respawnAtTick,
        })
      );

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

  /** Advances deterministic respawn state to the supplied authoritative zone tick. */
  public tick(currentTick: number): boolean {
    if (!Number.isSafeInteger(currentTick) || currentTick < 0) {
      throw new Error("ZONE_RESOURCE_TICK_INVALID");
    }
    let changed = false;
    for (const definition of AX1_INITIAL_RESOURCE_NODES) {
      const state = this.states.get(definition.id);
      if (!state?.depleted || state.respawnAtTick === null || currentTick < state.respawnAtTick) continue;
      state.remaining = definition.capacity;
      state.depleted = false;
      state.respawnAtTick = null;
      changed = true;
    }
    if (changed) this.revision += 1;
    return changed;
  }
}
