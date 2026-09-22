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
    } else if (Array.isArray(event.data?.facts)) {
      for (const f of event.data.facts as Array<{ subject: string; predicate: string; value: string | number | boolean | string[] }>) {
        newFacts.push(
          this.assertFact(f.subject, f.predicate, f.value, fullEvent.id, sequence)
        );
      }
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

  public ingestCanonicalEvent(event: WorldEvent): { event: WorldEvent; newFacts: WorldFact[] } {
    if (!event.id || typeof event.sequence !== 'number' || event.sequence < 0) {
      throw new Error(`WORLD_EVENT_READBACK_UNPROVABLE: INVALID_EVENT_SEQUENCE:${event?.id}`);
    }
    const computedHash = computeCanonicalHash('aurion.world.event.v1', event.data || {});
    if (event.payloadHash && event.payloadHash !== computedHash) {
      throw new Error(`WORLD_EVENT_READBACK_UNPROVABLE: PAYLOAD_HASH_MISMATCH:${event.id}`);
    }

    if (this.currentSequence > 0 && event.sequence < this.currentSequence) {
      throw new Error(`WORLD_EVENT_READBACK_UNPROVABLE: NON_MONOTONIC_EVENT_SEQUENCE:${event.sequence} < ${this.currentSequence}`);
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
        this.assertFact(`${caravanId}.status`, 'status', 'damaged', event.id, sequence),
        this.assertFact(`${merchantId}.trust.${playerUserId}`, 'trust', 'low', event.id, sequence),
        this.assertFact(`area.caravan_road.danger`, 'level', 'high', event.id, sequence)
      );
    } else if (event.type === 'QUEST_COMPLETED_REVENGE') {
      const merchantId = (event.data?.merchantId as string) || 'merchant_kaelen';
      const playerUserId = (event.data?.playerUserId as string) || 'player_1';

      newFacts.push(
        this.assertFact(`${merchantId}.trust.${playerUserId}`, 'trust', 'restored', event.id, sequence),
        this.assertFact(`attackers.identified`, 'status', true, event.id, sequence)
      );
    } else if (event.data?.facts && Array.isArray(event.data.facts)) {
      for (const item of event.data.facts as Array<{ subject: string; predicate: string; value: any }>) {
        if (item?.subject && item?.predicate) {
          newFacts.push(this.assertFact(item.subject, item.predicate, item.value, event.id, sequence));
        }
      }
    }

    return { event, newFacts };
  }

  public static loadFromCanonicalEvents(events: readonly WorldEvent[]): WorldFactEngine {
    const engine = new WorldFactEngine();
    const sorted = [...events].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
    for (const evt of sorted) {
      engine.ingestCanonicalEvent(evt);
    }
    return engine;
  }

  public static async loadFromCanonicalHistory(worldId: string): Promise<WorldFactEngine> {
    const engine = new WorldFactEngine();
    let events: readonly import('../../shared/aurionTemporalEventContract').AurionTemporalEvent[] = [];
    try {
      const { readTemporalEventsForWorld } = await import('../history/aurionTemporalEventPersistence');
      events = await readTemporalEventsForWorld(worldId, 512);
    } catch (err: any) {
      if (err?.message?.includes("TEMPORAL_DATABASE_UNAVAILABLE")) {
        return engine;
      }
      throw new Error(`WORLD_EVENT_READBACK_UNPROVABLE:${err.message}`);
    }

    const worldEvents: WorldEvent[] = events.map(tEvent => {
      const payload = (typeof tEvent.payload === 'object' && tEvent.payload !== null
        ? tEvent.payload
        : JSON.parse(String(tEvent.payload || '{}'))) as Record<string, unknown>;
      return {
        id: tEvent.eventId,
        sequence: tEvent.epoch,
        type: String(payload.type || (tEvent.domain === 'quest' ? 'QUEST_EVENT' : 'AURION_WORLD_EVENT')),
        payloadHash: tEvent.payloadHash,
        source: tEvent.rulesetVersion || 'aurion_temporal_event',
        data: payload,
      };
    });

    return WorldFactEngine.loadFromCanonicalEvents(worldEvents);
  }
}
