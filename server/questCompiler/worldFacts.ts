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
