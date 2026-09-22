import {
  type AurionTemporalEvent,
} from "../../shared/aurionTemporalEventContract";
import {
  type CausalExplainResult,
  type CausalExplainStep,
} from "../../shared/aurionTemporalQueryContract";
import { AurionTemporalEventIndex, globalTemporalEventIndex } from "./aurionTemporalEventIndex";

export class CausalHistoryExplainService {
  constructor(private readonly index: AurionTemporalEventIndex = globalTemporalEventIndex) {}

  /**
   * Explains why a fact/event was true at a given epoch by traversing
   * the causal provenance backward to authority receipts and predecessor world roots.
   */
  async explainFactAtEpoch(params: {
    worldId: string;
    targetFactOrEventId: string;
    epoch: number;
    maxDepth?: number;
  }): Promise<CausalExplainResult> {
    const { worldId, targetFactOrEventId, epoch, maxDepth = 50 } = params;

    // Retrieve target event or find event matching fact ID
    let event = await this.index.getEventById(targetFactOrEventId);
    if (!event) {
      // Check if targetFactOrEventId is in format "fact_eventId"
      if (targetFactOrEventId.startsWith("fact_")) {
        event = await this.index.getEventById(targetFactOrEventId.slice("fact_".length));
      }
    }

    if (!event) {
      // Check if target matches subject
      const subjectEvents = await this.index.getEventsForSubject(worldId, targetFactOrEventId);
      const active = subjectEvents.filter(
        e => e.validFromEpoch <= epoch && (e.validToEpoch === null || e.validToEpoch > epoch)
      );
      if (active.length > 0) {
        event = active[active.length - 1];
      }
    }

    if (!event) {
      return {
        status: "UNPROVABLE",
        targetFact: targetFactOrEventId,
        targetEpoch: epoch,
        chain: [],
        rootEvidenceReached: false,
        reason: "TARGET_FACT_NOT_FOUND_IN_HISTORY",
      };
    }

    // Verify epoch validity
    if (event.validFromEpoch > epoch) {
      return {
        status: "UNPROVABLE",
        targetFact: targetFactOrEventId,
        targetEpoch: epoch,
        chain: [],
        rootEvidenceReached: false,
        reason: "FACT_NOT_YET_VALID_AT_TARGET_EPOCH",
      };
    }

    if (event.validToEpoch !== null && event.validToEpoch <= epoch) {
      return {
        status: "UNPROVABLE",
        targetFact: targetFactOrEventId,
        targetEpoch: epoch,
        chain: [],
        rootEvidenceReached: false,
        reason: "FACT_SUPERSEDED_BEFORE_TARGET_EPOCH",
      };
    }

    // Traverse causal predecessor chain backward
    const chain: CausalExplainStep[] = [];
    const visited = new Set<string>();
    const queue: string[] = [event.eventId];
    let depth = 0;
    let dagCycleDetected = false;
    let missingPredecessor = false;

    while (queue.length > 0 && depth < maxDepth) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) {
        dagCycleDetected = true;
        break;
      }
      visited.add(currentId);

      const currentEvent = await this.index.getEventById(currentId);
      if (!currentEvent) {
        missingPredecessor = true;
        break;
      }

      chain.push({
        stepIndex: chain.length,
        eventId: currentEvent.eventId,
        domain: currentEvent.domain,
        epoch: currentEvent.epoch,
        subjectIds: [...currentEvent.subjectIds],
        description: `[${currentEvent.domain.toUpperCase()}] Epoch ${currentEvent.epoch} confirmed via receipt ${currentEvent.sourceReceiptHash.slice(0, 16)}...`,
        sourceReceiptHash: currentEvent.sourceReceiptHash,
        receiptHash: currentEvent.sourceReceiptHash,
        sourceWorldRoot: currentEvent.sourceWorldRoot,
        predecessorEventIds: [...currentEvent.predecessorEventIds],
        payload: { ...currentEvent.payload },
      });

      for (const predId of currentEvent.predecessorEventIds) {
        if (!visited.has(predId)) {
          queue.push(predId);
        }
      }
      depth++;
    }

    if (dagCycleDetected) {
      return {
        status: "CONTRADICTED",
        targetFact: targetFactOrEventId,
        targetEpoch: epoch,
        chain,
        rootEvidenceReached: false,
        dagCycleDetected: true,
        reason: "CAUSAL_DAG_CYCLE_DETECTED",
      };
    }

    if (missingPredecessor) {
      return {
        status: "UNPROVABLE",
        targetFact: targetFactOrEventId,
        targetEpoch: epoch,
        chain,
        rootEvidenceReached: false,
        reason: "TEMPORAL_EVIDENCE_GAP",
      };
    }

    return {
      status: "MATCH",
      targetFact: targetFactOrEventId,
      targetEpoch: epoch,
      chain,
      rootEvidenceReached: true,
    };
  }
}

export const globalCausalHistoryExplainService = new CausalHistoryExplainService();
