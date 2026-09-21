import {
  type AurionTemporalEvent,
  type AurionTemporalDomain,
  createTemporalEvent,
  verifyTemporalEventIntegrity,
} from "../../shared/aurionTemporalEventContract";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";

export class AurionTemporalEventIndex {
  private eventsById: Map<string, AurionTemporalEvent> = new Map();
  private eventsByWorld: Map<string, string[]> = new Map();
  private eventsBySubject: Map<string, string[]> = new Map();
  private eventsByEpoch: Map<string, string[]> = new Map();

  constructor() {}

  /**
   * Clears the in-memory index.
   */
  clear(): void {
    this.eventsById.clear();
    this.eventsByWorld.clear();
    this.eventsBySubject.clear();
    this.eventsByEpoch.clear();
  }

  /**
   * Ingest an authoritative temporal event into the append-only index.
   * Rejects any invalid or corrupted event deterministically.
   */
  async ingestEvent(event: AurionTemporalEvent): Promise<{ accepted: boolean; eventHash: string; reason?: string }> {
    const verification = verifyTemporalEventIntegrity(event);
    if (!verification.valid) {
      return { accepted: false, eventHash: event.eventHash, reason: verification.reason };
    }

    // Idempotency: if already exists with exact same hash, accept
    const existing = this.eventsById.get(event.eventId);
    if (existing) {
      if (existing.eventHash === event.eventHash) {
        return { accepted: true, eventHash: event.eventHash };
      }
      return { accepted: false, eventHash: event.eventHash, reason: "CONTRADICTING_EVENT_ID" };
    }

    // Append-only registration
    this.eventsById.set(event.eventId, Object.freeze({ ...event }));

    // Index by world
    const worldList = this.eventsByWorld.get(event.worldId) ?? [];
    worldList.push(event.eventId);
    this.eventsByWorld.set(event.worldId, worldList);

    // Index by subjects
    for (const subject of event.subjectIds) {
      const key = `${event.worldId}::${subject}`;
      const subjectList = this.eventsBySubject.get(key) ?? [];
      subjectList.push(event.eventId);
      this.eventsBySubject.set(key, subjectList);
    }

    // Index by epoch
    const epochKey = `${event.worldId}::${event.epoch}`;
    const epochList = this.eventsByEpoch.get(epochKey) ?? [];
    epochList.push(event.eventId);
    this.eventsByEpoch.set(epochKey, epochList);

    return { accepted: true, eventHash: event.eventHash };
  }

  /**
   * Ingest multiple events in deterministic sequence.
   */
  async ingestBatch(events: readonly AurionTemporalEvent[]): Promise<{ acceptedCount: number; rejectedCount: number }> {
    let acceptedCount = 0;
    let rejectedCount = 0;
    for (const ev of events) {
      const res = await this.ingestEvent(ev);
      if (res.accepted) acceptedCount++;
      else rejectedCount++;
    }
    return { acceptedCount, rejectedCount };
  }

  /**
   * Lookup event by ID.
   */
  async getEventById(eventId: string): Promise<AurionTemporalEvent | null> {
    const ev = this.eventsById.get(eventId);
    return ev ? { ...ev } : null;
  }

  /**
   * Get all events for a given world.
   */
  async getEventsForWorld(worldId: string): Promise<AurionTemporalEvent[]> {
    const ids = this.eventsByWorld.get(worldId) ?? [];
    const events: AurionTemporalEvent[] = [];
    for (const id of ids) {
      const ev = this.eventsById.get(id);
      if (ev) events.push({ ...ev });
    }
    // Sort deterministically by epoch, then eventId
    return events.sort((a, b) => a.epoch - b.epoch || a.eventId.localeCompare(b.eventId));
  }

  /**
   * Get all events for a given subject in a world.
   */
  async getEventsForSubject(worldId: string, subjectId: string): Promise<AurionTemporalEvent[]> {
    const key = `${worldId}::${subjectId}`;
    const ids = this.eventsBySubject.get(key) ?? [];
    const events: AurionTemporalEvent[] = [];
    for (const id of ids) {
      const ev = this.eventsById.get(id);
      if (ev) events.push({ ...ev });
    }
    return events.sort((a, b) => a.epoch - b.epoch || a.eventId.localeCompare(b.eventId));
  }

  /**
   * Get events in epoch range [fromEpoch, toEpoch].
   */
  async getEventsInEpochRange(worldId: string, fromEpoch: number, toEpoch: number): Promise<AurionTemporalEvent[]> {
    const worldEvents = await this.getEventsForWorld(worldId);
    return worldEvents.filter(ev => ev.epoch >= fromEpoch && ev.epoch <= toEpoch);
  }

  /**
   * Verify append-only index integrity for a world.
   */
  async verifyIndexIntegrity(worldId: string): Promise<{ valid: boolean; gaps: string[]; totalEvents: number }> {
    const events = await this.getEventsForWorld(worldId);
    const gaps: string[] = [];

    const seenIds = new Set<string>();
    for (const ev of events) {
      seenIds.add(ev.eventId);
      const check = verifyTemporalEventIntegrity(ev);
      if (!check.valid) {
        gaps.push(`CORRUPT_EVENT:${ev.eventId}:${check.reason}`);
      }
    }

    // Check predecessor integrity
    for (const ev of events) {
      for (const predId of ev.predecessorEventIds) {
        if (!seenIds.has(predId)) {
          gaps.push(`MISSING_PREDECESSOR:${ev.eventId}->${predId}`);
        }
      }
    }

    return {
      valid: gaps.length === 0,
      gaps,
      totalEvents: events.length,
    };
  }
}

export const globalTemporalEventIndex = new AurionTemporalEventIndex();
