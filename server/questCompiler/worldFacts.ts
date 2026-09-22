import { WorldEvent, WorldFact } from '../../shared/aurionQuestContract';
import { computeCanonicalHash } from '../../shared/aurionQuestCanonicalHash';

/**
 * AIM-298: Aurion Canonical World Event & Fact Reduction Engine.
 * Transforms raw canonical WorldEvents into versioned WorldFacts with full sequence provenance.
 */
export class WorldFactEngine {
  private facts: Map<string, WorldFact> = new Map();
  private eventHistory: WorldEvent[] = [];
  private currentSequence = 0;

  constructor(initialFacts: WorldFact[] = []) {
    for (const fact of initialFacts) {
      this.facts.set(fact.id, fact);
      if (fact.provenance.sequence > this.currentSequence) {
        this.currentSequence = fact.provenance.sequence;
      }
    }
  }

  public recordEvent(event: Omit<WorldEvent, 'sequence' | 'payloadHash'>): { event: WorldEvent; newFacts: WorldFact[] } {
    const existing = this.eventHistory.find(candidate => candidate.id === event.id);
    if (existing) {
      const payloadHash = computeCanonicalHash('aurion.world.event.v1', event.data || {});
      if (
        existing.type !== event.type ||
        existing.source !== event.source ||
        existing.payloadHash !== payloadHash
      ) {
        throw new Error('WORLD_EVENT_ID_CONFLICT:' + event.id);
      }
      return { event: existing, newFacts: [] };
    }
    this.currentSequence += 1;
    const sequence = this.currentSequence;
    const payloadHash = computeCanonicalHash('aurion.world.event.v1', event.data || {});

    const fullEvent: WorldEvent = {
      ...event,
      sequence,
      payloadHash,
    };
    this.eventHistory.push(fullEvent);

    const newFacts: WorldFact[] = [];

    // Reduce standard event types into WorldFacts
    if (event.type === 'CARAVAN_ATTACKED') {
      const caravanId = (event.data?.caravanId as string) || 'caravan_default';
      const merchantId = (event.data?.merchantId as string) || 'merchant_kaelen';
      const playerUserId = (event.data?.playerUserId as string) || 'player_1';

      newFacts.push(
        this.assertFact(`${caravanId}.status`, 'status', 'damaged', fullEvent.id, sequence),
        this.assertFact(`${merchantId}.trust.${playerUserId}`, 'trust', 'low', fullEvent.id, sequence),
        this.assertFact(`area.caravan_road.danger`, 'level', 'high', fullEvent.id, sequence)
      );
    } else if (event.type === 'QUEST_COMPLETED_REVENGE') {
      const merchantId = (event.data?.merchantId as string) || 'merchant_kaelen';
      const playerUserId = (event.data?.playerUserId as string) || 'player_1';

      newFacts.push(
        this.assertFact(`${merchantId}.trust.${playerUserId}`, 'trust', 'restored', fullEvent.id, sequence),
        this.assertFact(`attackers.identified`, 'status', true, fullEvent.id, sequence)
      );
    }

    return { event: fullEvent, newFacts };
  }

  public assertFact(
    subject: string,
    predicate: string,
    value: string | number | boolean | string[],
    sourceEventId: string,
    sequence: number
  ): WorldFact {
    const factId = `fact_${subject}_${predicate}`;
    const fact: WorldFact = {
      id: factId,
      subject,
      predicate,
      value,
      validityRange: { fromSequence: sequence },
      provenance: { sourceEventId, sequence, source: 'aurion_world_event' },
    };
    this.facts.set(factId, fact);
    return fact;
  }

  public ingestCanonicalEvent(event: WorldEvent): { event: WorldEvent; newFacts: WorldFact[] } {
    const existing = this.eventHistory.find(candidate => candidate.id === event.id);
    if (existing) {
      if (
        existing.sequence !== event.sequence ||
        existing.type !== event.type ||
        existing.source !== event.source ||
        existing.payloadHash !== event.payloadHash
      ) {
        throw new Error('WORLD_EVENT_ID_CONFLICT:' + event.id);
      }
      return { event: existing, newFacts: [] };
    }
    if (!event.id || !Number.isSafeInteger(event.sequence) || event.sequence < 0) {
      throw new Error('WORLD_EVENT_READBACK_UNPROVABLE:INVALID_EVENT_SEQUENCE:' + event?.id);
    }
    const computedHash = computeCanonicalHash('aurion.world.event.v1', event.data || {});
    if (event.payloadHash !== computedHash) {
      throw new Error('WORLD_EVENT_READBACK_UNPROVABLE:PAYLOAD_HASH_MISMATCH:' + event.id);
    }
    if (this.currentSequence > 0 && event.sequence < this.currentSequence) {
      throw new Error('WORLD_EVENT_READBACK_UNPROVABLE:NON_MONOTONIC_EVENT_SEQUENCE:' + event.sequence + '<' + this.currentSequence);
    }
    this.currentSequence = Math.max(this.currentSequence, event.sequence);
    this.eventHistory.push(event);
    const newFacts: WorldFact[] = [];
    const sequence = event.sequence;
    if (event.type === 'CARAVAN_ATTACKED') {
      const caravanId = (event.data?.caravanId as string) || 'caravan_default';
      const merchantId = (event.data?.merchantId as string) || 'merchant_kaelen';
      const playerUserId = (event.data?.playerUserId as string) || 'player_1';
      newFacts.push(
        this.assertFact(caravanId + '.status', 'status', 'damaged', event.id, sequence),
        this.assertFact(merchantId + '.trust.' + playerUserId, 'trust', 'low', event.id, sequence),
        this.assertFact('area.caravan_road.danger', 'level', 'high', event.id, sequence)
      );
    } else if (event.type === 'QUEST_COMPLETED_REVENGE') {
      const merchantId = (event.data?.merchantId as string) || 'merchant_kaelen';
      const playerUserId = (event.data?.playerUserId as string) || 'player_1';
      newFacts.push(
        this.assertFact(merchantId + '.trust.' + playerUserId, 'trust', 'restored', event.id, sequence),
        this.assertFact('attackers.identified', 'status', true, event.id, sequence)
      );
    } else if (Array.isArray(event.data?.facts)) {
      for (const fact of event.data.facts as Array<{ subject?: unknown; predicate?: unknown; value?: unknown }>) {
        if (typeof fact.subject !== 'string' || typeof fact.predicate !== 'string') {
          throw new Error('WORLD_EVENT_READBACK_UNPROVABLE:INVALID_FACT:' + event.id);
        }
        if (!['string', 'number', 'boolean'].includes(typeof fact.value)) {
          throw new Error('WORLD_EVENT_READBACK_UNPROVABLE:INVALID_FACT_VALUE:' + event.id);
        }
        newFacts.push(this.assertFact(fact.subject, fact.predicate, fact.value as string | number | boolean, event.id, sequence));
      }
    }
    return { event, newFacts };
  }

  public getEvents(): WorldEvent[] {
    return this.eventHistory.slice().sort((a, b) => a.sequence - b.sequence);
  }

  public getFacts(): WorldFact[] {
    return Array.from(this.facts.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  public getFactsHash(): string {
    return computeCanonicalHash('aurion.world.fact.v1', this.getFacts());
  }

  public getLatestSequence(): number {
    return this.currentSequence;
  }
}
