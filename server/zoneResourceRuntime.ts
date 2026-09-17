import { AX1_ECOLOGY_SOURCE_REVISION, AX1_INITIAL_RESOURCE_NODES } from "@shared/ax1ResourceEcologyProtocol";
import {
  ZONE_RESOURCE_CONTRACT_VERSION,
  type ConfirmedZoneResourceNode,
  type ConfirmedZoneResourceSnapshot,
  validConfirmedZoneResourceSnapshot,
} from "@shared/zoneResourceContract";

export const AX1_RESOURCE_RESPAWN_TICKS = 600 as const;

type MutableResourceState = {
  nodeId: string;
  capacity: number;
  remaining: number;
  depleted: boolean;
  respawnAtTick: number | null;
};

export type ZoneResourceConsumptionResult = "accepted" | "missing" | "depleted" | "invalid_quantity";
function compareBinary(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

export class ZoneResourceRuntime {
  private readonly states = new Map<string, MutableResourceState>();
  private readonly orderedStates: MutableResourceState[];
  private revision = 1;

  public constructor() {
    for (const definition of AX1_INITIAL_RESOURCE_NODES) {
      this.states.set(definition.id, { nodeId: definition.id, capacity: definition.capacity, remaining: definition.capacity, depleted: false, respawnAtTick: null });
    }
    this.orderedStates = Array.from(this.states.values()).sort((left, right) => compareBinary(left.nodeId, right.nodeId));
  }

  public snapshot(currentTick: number): ConfirmedZoneResourceSnapshot {
    const nodes: ConfirmedZoneResourceNode[] = this.orderedStates.map(state => Object.freeze({
      nodeId: state.nodeId,
      remaining: state.remaining,
      depleted: state.depleted,
      respawnAtTick: state.respawnAtTick,
    }));
    const snapshot = Object.freeze({ contractVersion: ZONE_RESOURCE_CONTRACT_VERSION, contentSourceRevision: AX1_ECOLOGY_SOURCE_REVISION, revision: this.revision, nodes: Object.freeze(nodes) });
    if (!validConfirmedZoneResourceSnapshot(snapshot, currentTick)) throw new Error("ZONE_RESOURCE_SNAPSHOT_INVALID");
    return snapshot;
  }

  public restoreState(nodes: readonly { nodeId: string; state: "ready" | "depleted"; respawnTick: number; remainingGathers: number }[]): void {
    const byId = new Map(nodes.map(node => [node.nodeId, node] as const));
    if (byId.size !== this.states.size) throw new Error("AURION_REPLAY_RESOURCE_SET_MISMATCH");
    for (const runtime of this.orderedStates) {
      const restored = byId.get(runtime.nodeId);
      if (!restored) throw new Error(`AURION_REPLAY_RESOURCE_UNKNOWN:${runtime.nodeId}`);
      if (!Number.isSafeInteger(restored.remainingGathers) || restored.remainingGathers < 0 || restored.remainingGathers > runtime.capacity)
        throw new Error("AURION_REPLAY_RESOURCE_REMAINING_INVALID");
      runtime.remaining = restored.remainingGathers;
      runtime.depleted = restored.state === "depleted";
      runtime.respawnAtTick = runtime.depleted ? restored.respawnTick : null;
    }
  }

  public applyConfirmedConsumption(nodeId: string, currentTick: number, quantity = 1): ZoneResourceConsumptionResult {
    if (!Number.isSafeInteger(currentTick) || currentTick < 0) throw new Error("ZONE_RESOURCE_TICK_INVALID");
    if (!Number.isSafeInteger(quantity) || quantity < 1) return "invalid_quantity";
    const state = this.states.get(nodeId);
    if (!state) return "missing";
    if (state.depleted || state.remaining === 0 || quantity > state.remaining) return "depleted";
    state.remaining -= quantity;
    if (state.remaining === 0) {
      state.depleted = true;
      state.respawnAtTick = currentTick + AX1_RESOURCE_RESPAWN_TICKS;
    }
    this.revision += 1;
    return "accepted";
  }

  public tick(currentTick: number): boolean {
    if (!Number.isSafeInteger(currentTick) || currentTick < 0) throw new Error("ZONE_RESOURCE_TICK_INVALID");
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
