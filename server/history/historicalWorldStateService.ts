import {
  type AurionTemporalEvent,
  type AurionTemporalDomain,
} from "../../shared/aurionTemporalEventContract";
import {
  type HistoricalStateReconstructionResult,
  type TemporalFactRecord,
  type TemporalStateQuery,
} from "../../shared/aurionTemporalQueryContract";
import { AurionTemporalEventIndex, globalTemporalEventIndex } from "./aurionTemporalEventIndex";
import { canonicalJson, canonicalSha256 } from "../../shared/aurionCanonicalHash";

export class HistoricalWorldStateService {
  constructor(private readonly index: AurionTemporalEventIndex = globalTemporalEventIndex) {}

  /**
   * Reconstruct historical state for a query at a specific logical epoch.
   * Deterministic, zero guesswork, strictly evidence-bound.
   */
  async reconstructStateAtEpoch(query: TemporalStateQuery): Promise<HistoricalStateReconstructionResult> {
    const { worldId, epoch, subjectId, domain, requiredWorldRoot } = query;

    if (!Number.isInteger(epoch) || epoch < 0) {
      return {
        status: "UNPROVABLE",
        worldId,
        epoch,
        subjectId,
        domain,
        facts: [],
        activeEventsCount: 0,
        reason: "INVALID_EPOCH_QUERY",
      };
    }

    // Retrieve candidate events
    let candidateEvents: AurionTemporalEvent[];
    if (subjectId) {
      candidateEvents = await this.index.getEventsForSubject(worldId, subjectId);
    } else {
      candidateEvents = await this.index.getEventsForWorld(worldId);
    }

    if (domain) {
      candidateEvents = candidateEvents.filter(ev => ev.domain === domain);
    }

    // Determine which events have been superseded by confirmed successors valid at or before query epoch
    const supersededEventIds = new Set<string>();
    for (const candidate of candidateEvents) {
      if (candidate.validFromEpoch <= epoch) {
        for (const predId of candidate.predecessorEventIds) {
          supersededEventIds.add(predId);
        }
      }
    }

    // Filter events valid at query epoch:
    // validFromEpoch <= epoch AND not superseded at or before epoch AND (validToEpoch === null OR validToEpoch > epoch)
    const activeEvents = candidateEvents.filter(
      ev =>
        ev.validFromEpoch <= epoch &&
        !supersededEventIds.has(ev.eventId) &&
        (ev.validToEpoch === null || ev.validToEpoch > epoch)
    );

    // If query was for a specific subject and no events exist at or before epoch
    if (activeEvents.length === 0) {
      // Check if there are future events for this subject to distinguish between never-existed vs not-yet-created
      const futureEvents = candidateEvents.filter(ev => ev.validFromEpoch > epoch);
      return {
        status: "UNPROVABLE",
        worldId,
        epoch,
        subjectId,
        domain,
        facts: [],
        activeEventsCount: 0,
        reason: futureEvents.length > 0 ? "QUERY_EPOCH_BEFORE_CREATION" : "NO_TEMPORAL_EVIDENCE_FOUND",
      };
    }

    // Check for evidence gaps / missing predecessors
    const allWorldEvents = await this.index.getEventsForWorld(worldId);
    const worldEventIds = new Set(allWorldEvents.map(e => e.eventId));
    const unprovableGaps: string[] = [];

    for (const ev of activeEvents) {
      for (const predId of ev.predecessorEventIds) {
        if (!worldEventIds.has(predId)) {
          unprovableGaps.push(`MISSING_PREDECESSOR:${predId}`);
        }
      }
    }

    if (unprovableGaps.length > 0) {
      return {
        status: "UNPROVABLE",
        worldId,
        epoch,
        subjectId,
        domain,
        facts: [],
        activeEventsCount: activeEvents.length,
        reason: "TEMPORAL_EVIDENCE_GAP",
        unprovableGaps,
      };
    }

    // Check for contradictions: mutually conflicting facts for same subject and fact key
    const factsBySubjectKey = new Map<string, { event: AurionTemporalEvent; payloadJson: string }>();
    for (const ev of activeEvents) {
      for (const subj of ev.subjectIds) {
        const key = `${ev.domain}::${subj}`;
        const payloadJson = canonicalJson(ev.payload);
        const existing = factsBySubjectKey.get(key);
        if (existing) {
          if (existing.payloadJson !== payloadJson) {
            // Two different payloads valid at the same epoch for the exact same domain & subject
            return {
              status: "CONTRADICTED",
              worldId,
              epoch,
              subjectId,
              domain,
              facts: [],
              activeEventsCount: activeEvents.length,
              reason: `CONTRADICTING_FACTS_FOR_SUBJECT:${key}`,
            };
          }
        } else {
          factsBySubjectKey.set(key, { event: ev, payloadJson });
        }
      }
    }

    // Check required world root if specified
    if (requiredWorldRoot) {
      const matchingRoots = activeEvents.filter(e => e.sourceWorldRoot === requiredWorldRoot);
      if (matchingRoots.length === 0) {
        return {
          status: "UNPROVABLE",
          worldId,
          epoch,
          subjectId,
          domain,
          facts: [],
          activeEventsCount: activeEvents.length,
          reason: "WORLD_ROOT_MISMATCH",
        };
      }
    }

    // Build fact records
    const facts: TemporalFactRecord[] = activeEvents.map(ev => ({
      factId: `fact_${ev.eventId}`,
      eventId: ev.eventId,
      subjectId: ev.subjectIds[0] ?? "world",
      domain: ev.domain,
      validFromEpoch: ev.validFromEpoch,
      validToEpoch: ev.validToEpoch,
      state: { ...ev.payload },
      payload: { ...ev.payload },
      evidenceReceiptHash: ev.sourceReceiptHash,
      sourceWorldRoot: ev.sourceWorldRoot,
      predecessorEventIds: [...ev.predecessorEventIds],
    }));

    // Deterministically compute reconstructed world root from sorted facts
    const factsDigest = canonicalSha256(
      facts.map(f => ({
        factId: f.factId,
        domain: f.domain,
        subjectId: f.subjectId,
        state: f.state,
        receipt: f.evidenceReceiptHash,
      }))
    );

    return {
      status: "MATCH",
      worldId,
      epoch,
      subjectId,
      domain,
      facts,
      activeEventsCount: activeEvents.length,
      reconstructedWorldRoot: factsDigest,
    };
  }
}

export const globalHistoricalWorldStateService = new HistoricalWorldStateService();
