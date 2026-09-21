import {
  type CrossShardTransferEnvelope,
  createCrossShardTransfer,
  computeCrossShardTransferHash,
} from "../../shared/aurionCrossShardTransferContract";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { ShardRegistry, globalShardRegistry } from "./shardRegistry";

export interface HandoverStepResult {
  accepted: boolean;
  envelope: CrossShardTransferEnvelope;
  reason?: string;
}

export class CrossShardHandoverService {
  private transfersById: Map<string, CrossShardTransferEnvelope> = new Map();

  constructor(private readonly registry: ShardRegistry = globalShardRegistry) {}

  clear(): void {
    this.transfersById.clear();
  }

  /**
   * Step 1: Source shard initiates transfer and locks entity locally.
   */
  async prepareTransfer(params: {
    transferId: string;
    worldId: string;
    entityId: string;
    entityPayload: Record<string, unknown>;
    sourceShardId: string;
    targetShardId: string;
    transferEpoch: number;
    prepareReceiptHash: string;
  }): Promise<HandoverStepResult> {
    const existing = this.transfersById.get(params.transferId);
    if (existing) {
      return { accepted: false, envelope: existing, reason: "DUPLICATE_TRANSFER_ID" };
    }

    const envelope = createCrossShardTransfer(params);
    this.transfersById.set(params.transferId, Object.freeze(envelope));
    return { accepted: true, envelope };
  }

  /**
   * Step 2: Target shard verifies integrity and accepts entity.
   */
  async targetAcceptTransfer(transferId: string, currentEpoch: number): Promise<HandoverStepResult> {
    const envelope = this.transfersById.get(transferId);
    if (!envelope) {
      throw new Error(`TRANSFER_NOT_FOUND: ${transferId}`);
    }

    if (envelope.status !== "PREPARED") {
      return { accepted: false, envelope, reason: `INVALID_STATE_TRANSITION_FROM_${envelope.status}` };
    }

    // Check timeout: if currentEpoch > transferEpoch + 20
    if (currentEpoch > envelope.transferEpoch + 20) {
      const timedOut: CrossShardTransferEnvelope = {
        ...envelope,
        status: "TIMEOUT",
      };
      this.transfersById.set(transferId, Object.freeze(timedOut));
      return { accepted: false, envelope: timedOut, reason: "HANDOVER_TIMEOUT" };
    }

    const updated: CrossShardTransferEnvelope = {
      ...envelope,
      status: "ACCEPTED",
    };
    this.transfersById.set(transferId, Object.freeze(updated));
    return { accepted: true, envelope: updated };
  }

  /**
   * Step 3: Source shard receives acceptance and finalizes release.
   */
  async sourceFinalizeTransfer(transferId: string, finalizeReceiptHash: string): Promise<HandoverStepResult> {
    const envelope = this.transfersById.get(transferId);
    if (!envelope) {
      throw new Error(`TRANSFER_NOT_FOUND: ${transferId}`);
    }

    if (envelope.status !== "ACCEPTED") {
      return { accepted: false, envelope, reason: `CANNOT_FINALIZE_FROM_${envelope.status}` };
    }

    const finalized: CrossShardTransferEnvelope = {
      ...envelope,
      status: "FINALIZED",
      finalizeReceiptHash,
    };
    finalized.transferHash = computeCrossShardTransferHash(finalized);

    this.transfersById.set(transferId, Object.freeze(finalized));
    return { accepted: true, envelope: finalized };
  }

  getTransfer(transferId: string): CrossShardTransferEnvelope | null {
    const t = this.transfersById.get(transferId);
    return t ? { ...t } : null;
  }
}

export const globalCrossShardHandoverService = new CrossShardHandoverService();
