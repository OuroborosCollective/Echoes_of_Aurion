import type { CausalPersistenceAdapter, PersistedCheckpoint, RecordedTickEntry } from "./tickRecorder";
import { globalCausalPersistence } from "./persistence";
import { replayZoneTick } from "./replayZoneTick";
import { hashCanonicalZoneState, type CanonicalZoneState } from "./zoneCanonicalState";
import {
  AURION_HEADLESS_CAUSAL_ORACLE_SCHEMA,
  sealHeadlessCausalOracleResult,
  type AurionHeadlessCausalOracleResult,
  type AurionHeadlessCausalOracleUnsignedResult,
  type AurionOracleCheckpointIdentity,
} from "../../shared/aurionHeadlessCausalOracleContract";

const MAX_REQUESTED_TICKS = 250;
const MAX_TOTAL_REPLAY_TICKS = 350;

type OraclePersistence = Pick<
  CausalPersistenceAdapter,
  "getCheckpointAtOrBefore" | "getTicksInRange"
>;

type OracleContext = {
  zoneId: string;
  fromTick: number;
  toTick: number;
  checkpoint: AurionOracleCheckpointIdentity | null;
  warmupTicks: number[];
  verifiedTicks: number[];
  sourceRevision: string | null;
  rulesetVersion: string | null;
  terminalReceiptHash: string | null;
  finalStateHash: string | null;
};

function semanticCheckpoint(checkpoint: PersistedCheckpoint): AurionOracleCheckpointIdentity {
  return Object.freeze({
    worldId: checkpoint.worldId,
    zoneId: checkpoint.zoneId,
    tick: checkpoint.tick,
    snapshotHash: checkpoint.snapshotHash,
  });
}

function seal(
  context: OracleContext,
  values: Pick<
    AurionHeadlessCausalOracleUnsignedResult,
    "status" | "firstDivergence" | "reason"
  >,
): AurionHeadlessCausalOracleResult {
  return sealHeadlessCausalOracleResult({
    schema: AURION_HEADLESS_CAUSAL_ORACLE_SCHEMA,
    mutationAuthority: "none",
    status: values.status,
    zoneId: context.zoneId,
    requestedRange: { fromTick: context.fromTick, toTick: context.toTick },
    checkpoint: context.checkpoint,
    warmupTicks: context.warmupTicks,
    verifiedTicks: context.verifiedTicks,
    sourceRevision: context.sourceRevision,
    rulesetVersion: context.rulesetVersion,
    firstDivergence: values.firstDivergence,
    reason: values.reason,
    terminalReceiptHash: context.terminalReceiptHash,
    finalStateHash: context.finalStateHash,
  });
}

function unprovable(context: OracleContext, reason: string): AurionHeadlessCausalOracleResult {
  return seal(context, { status: "UNPROVABLE", firstDivergence: null, reason });
}

function divergence(
  context: OracleContext,
  tick: number,
  stage: string,
  expectedHash: string,
  observedHash: string,
): AurionHeadlessCausalOracleResult {
  return seal(context, {
    status: "FIRST_DIVERGENCE",
    firstDivergence: { tick, stage, expectedHash, observedHash },
    reason: null,
  });
}

export class AurionHeadlessCausalOracle {
  constructor(private readonly persistence: OraclePersistence = globalCausalPersistence) {}

  async replayRange(input: {
    zoneId: string;
    fromTick: number;
    toTick: number;
  }): Promise<AurionHeadlessCausalOracleResult> {
    const { zoneId, fromTick, toTick } = input;
    if (
      !zoneId.trim() ||
      !Number.isSafeInteger(fromTick) ||
      !Number.isSafeInteger(toTick) ||
      fromTick < 1 ||
      toTick < fromTick ||
      toTick - fromTick + 1 > MAX_REQUESTED_TICKS
    ) {
      throw new Error("HEADLESS_CAUSAL_ORACLE_RANGE_INVALID");
    }

    const context: OracleContext = {
      zoneId,
      fromTick,
      toTick,
      checkpoint: null,
      warmupTicks: [],
      verifiedTicks: [],
      sourceRevision: null,
      rulesetVersion: null,
      terminalReceiptHash: null,
      finalStateHash: null,
    };

    const checkpoint = await this.persistence.getCheckpointAtOrBefore(zoneId, fromTick - 1);
    if (!checkpoint) return unprovable(context, "ORACLE_CHECKPOINT_MISSING");
    context.checkpoint = semanticCheckpoint(checkpoint);

    if (
      checkpoint.zoneId !== zoneId ||
      checkpoint.state.zoneId !== zoneId ||
      checkpoint.worldId !== checkpoint.state.worldId ||
      checkpoint.state.tick !== checkpoint.tick
    ) {
      return unprovable(context, "ORACLE_CHECKPOINT_SCOPE_INVALID");
    }

    const observedCheckpointHash = hashCanonicalZoneState(checkpoint.state);
    context.finalStateHash = observedCheckpointHash;
    if (observedCheckpointHash !== checkpoint.snapshotHash) {
      return divergence(
        context,
        checkpoint.tick,
        "CHECKPOINT_HASH",
        checkpoint.snapshotHash,
        observedCheckpointHash,
      );
    }

    const replayTickCount = toTick - checkpoint.tick;
    if (replayTickCount < 1 || replayTickCount > MAX_TOTAL_REPLAY_TICKS) {
      return unprovable(context, "ORACLE_CHECKPOINT_DISTANCE_UNBOUNDED");
    }

    const loadFromTick = checkpoint.tick > 0 ? checkpoint.tick : 1;
    const entries = await this.persistence.getTicksInRange(zoneId, loadFromTick, toTick);
    const byTick = new Map<number, RecordedTickEntry>();
    for (const entry of entries) {
      if (byTick.has(entry.receipt.tick)) return unprovable(context, `ORACLE_DUPLICATE_RECEIPT:${entry.receipt.tick}`);
      byTick.set(entry.receipt.tick, entry);
    }

    let previousReceiptHash: string | null = null;
    let currentState: CanonicalZoneState = checkpoint.state;

    if (checkpoint.tick > 0) {
      const anchorEntry = byTick.get(checkpoint.tick);
      if (!anchorEntry) return unprovable(context, "ORACLE_CHECKPOINT_RECEIPT_MISSING");
      const anchor = anchorEntry.receipt;
      context.sourceRevision = anchor.sourceRevision;
      context.rulesetVersion = anchor.rulesetVersion;
      context.terminalReceiptHash = anchor.receiptHash;
      previousReceiptHash = anchor.receiptHash;
      if (
        anchor.worldId !== checkpoint.worldId ||
        anchor.zoneId !== checkpoint.zoneId ||
        anchor.postStateHash !== checkpoint.snapshotHash
      ) {
        return divergence(
          context,
          checkpoint.tick,
          "CHECKPOINT_ANCHOR",
          checkpoint.snapshotHash,
          anchor.postStateHash,
        );
      }
    }

    for (let tick = checkpoint.tick + 1; tick <= toTick; tick += 1) {
      const entry = byTick.get(tick);
      if (!entry) return unprovable(context, `ORACLE_RECEIPT_GAP:${tick}`);
      if (!entry.intents) return unprovable(context, `ORACLE_INTENTS_MISSING:${tick}`);

      const receipt = entry.receipt;
      if (!context.sourceRevision) context.sourceRevision = receipt.sourceRevision;
      if (!context.rulesetVersion) context.rulesetVersion = receipt.rulesetVersion;

      if (receipt.worldId !== checkpoint.worldId || receipt.zoneId !== zoneId) {
        return unprovable(context, `ORACLE_SCOPE_DRIFT:${tick}`);
      }
      if (receipt.sourceRevision !== context.sourceRevision) {
        return unprovable(context, `ORACLE_SOURCE_REVISION_DRIFT:${tick}`);
      }
      if (receipt.rulesetVersion !== context.rulesetVersion || currentState.ruleset !== context.rulesetVersion) {
        return unprovable(context, `ORACLE_RULESET_DRIFT:${tick}`);
      }

      const expectedPreviousHash = tick === 1 ? null : previousReceiptHash;
      if (receipt.previousReceiptHash !== expectedPreviousHash) {
        return divergence(
          context,
          tick,
          "RECEIPT_CHAIN",
          expectedPreviousHash ?? "NULL",
          receipt.previousReceiptHash ?? "NULL",
        );
      }

      const verdict = replayZoneTick({
        preState: currentState,
        intents: entry.intents,
        expectedReceipt: receipt,
      });

      if (verdict.status === "UNPROVABLE") {
        return unprovable(context, `ORACLE_TICK_UNPROVABLE:${tick}:${verdict.reason}`);
      }
      if (verdict.status === "FIRST_DIVERGENCE") {
        return divergence(
          context,
          tick,
          verdict.firstDivergentStage,
          verdict.expectedHash,
          verdict.observedHash,
        );
      }

      if (!verdict.postState) return unprovable(context, `ORACLE_POST_STATE_MISSING:${tick}`);
      currentState = verdict.postState as CanonicalZoneState;
      previousReceiptHash = receipt.receiptHash;
      context.terminalReceiptHash = receipt.receiptHash;
      context.finalStateHash = verdict.postStateHash ?? hashCanonicalZoneState(currentState);

      if (tick < fromTick) context.warmupTicks.push(tick);
      else context.verifiedTicks.push(tick);
    }

    if (context.verifiedTicks.length !== toTick - fromTick + 1) {
      return unprovable(context, "ORACLE_REQUESTED_RANGE_INCOMPLETE");
    }

    return seal(context, { status: "MATCH", firstDivergence: null, reason: null });
  }
}

export const globalHeadlessCausalOracle = new AurionHeadlessCausalOracle();
