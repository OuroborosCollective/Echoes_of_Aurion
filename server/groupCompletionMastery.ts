import { and, eq } from "drizzle-orm";
import { aurionScopedMasteryEvents } from "../drizzle/professionPersistenceSchema";
import { GROUP_RULESET, type GroupParty, type GroupTicket } from "../shared/groupInstanceProtocol";
import { activityXpAwardExact } from "./aurionBalancingProtocol";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { getDb } from "./db";
import { groupHash } from "./groupInstanceRules";
import {
  SCOPED_MASTERY_RULESET_VERSION,
  canonicalScopedMasteryKey,
  masteryKeys,
  resolveCoupledMasteries,
  type ScopedMasteryEvent,
  type ScopedMasteryKey,
} from "./scopedMasteryProtocol";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type GroupCompletionMasteryPlan = Readonly<{
  userId: number;
  keys: readonly ScopedMasteryKey[];
  events: readonly ScopedMasteryEvent[];
}>;

function assertClearedInstance(party: GroupParty, ticket: GroupTicket) {
  if (
    party.phase !== "cleared"
    || party.ticketId !== ticket.id
    || ticket.partyId !== party.id
    || ticket.rosterHash !== party.rosterHash
    || party.bossHp !== 0
    || party.bossIndex !== ticket.bosses.length
    || party.instanceRevision < 1
  ) throw new Error("GROUP_COMPLETION_EVIDENCE_REQUIRED");
}

/**
 * v1 group instances are intentionally normalized to level one when the frozen
 * ticket is issued. Completion mastery therefore uses the existing exact level-one
 * dungeon-completion activity award and never reads a mutable player level, wall
 * clock, client reward, or a newer world snapshot.
 */
export function buildGroupCompletionMasteryPlan(party: GroupParty, ticket: GroupTicket): readonly GroupCompletionMasteryPlan[] {
  assertClearedInstance(party, ticket);
  const amountExact = activityXpAwardExact({
    levelExact: "1",
    scope: "combat_action",
    activity: "dungeon_completion",
    repetitionStreak: 0,
  });
  const activeDurationTicks = party.instanceRevision;
  const distinctContextCount = Math.max(1, ticket.affixes.length);
  const contextMetricsExact = Object.freeze({
    completions: "1",
    bosses: String(ticket.bosses.length),
    affixes: String(ticket.affixes.length),
  });

  return Object.freeze([...ticket.roster]
    .sort((left, right) => left.userId - right.userId)
    .map(member => {
      const keys = Object.freeze([
        masteryKeys.combat(ticket.dungeonId),
        masteryKeys.action(`dungeon_completion:${ticket.dungeonId}`),
      ] as const);
      const events = Object.freeze(keys.map(key => Object.freeze({
        receiptId: ticket.id,
        idempotencyKey: groupHash({
          ruleset: GROUP_RULESET,
          ticketId: ticket.id,
          userId: member.userId,
          scopeKey: canonicalScopedMasteryKey(key),
        }),
        resolutionIndex: party.instanceRevision,
        key,
        amountExact,
        useCountExact: "1",
        contextMetricsExact,
        serverValidated: true,
        activeDurationTicks,
        repetitionStreak: 0,
        distinctContextCount,
        ruleSetVersion: SCOPED_MASTERY_RULESET_VERSION,
        contentVersion: GROUP_RULESET,
      } satisfies ScopedMasteryEvent)));
      return Object.freeze({ userId: member.userId, keys, events });
    }));
}

function parsePersistedEvent(row: typeof aurionScopedMasteryEvents.$inferSelect): ScopedMasteryEvent {
  const event = JSON.parse(row.eventJson) as ScopedMasteryEvent;
  const scopeKey = canonicalScopedMasteryKey(event.key);
  if (
    row.scopeKey !== scopeKey
    || row.professionReceiptId !== event.receiptId
    || row.eventHash !== groupHash(event)
  ) throw new Error("GROUP_COMPLETION_MASTERY_EVIDENCE_CORRUPT");
  return event;
}

/**
 * Appends exactly two scoped mastery events per roster member in the caller's
 * existing group-command transaction. Any insert/readback failure therefore rolls
 * back the boss clear, party state, player revision and mastery evidence together.
 */
export async function commitGroupCompletionMastery(tx: Transaction, party: GroupParty, ticket: GroupTicket) {
  const plan = buildGroupCompletionMasteryPlan(party, ticket);
  for (const member of plan) {
    for (const event of member.events) {
      const scopeKey = canonicalScopedMasteryKey(event.key);
      await tx.insert(aurionScopedMasteryEvents).values({
        id: groupHash({ kind: "group_completion_mastery", userId: member.userId, ticketId: ticket.id, scopeKey }),
        userId: member.userId,
        scopeKey,
        professionReceiptId: ticket.id,
        eventHash: groupHash(event),
        eventJson: stableCatalogStringify(event),
      });
    }
  }

  const receiptRows = await tx.select().from(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.professionReceiptId, ticket.id));
  if (receiptRows.length !== plan.length * 2) throw new Error("GROUP_COMPLETION_MASTERY_EVIDENCE_INCOMPLETE");

  for (const member of plan) {
    const expectedScopes = new Set(member.keys.map(canonicalScopedMasteryKey));
    const memberReceiptRows = receiptRows.filter(row => row.userId === member.userId);
    if (memberReceiptRows.length !== expectedScopes.size) throw new Error("GROUP_COMPLETION_MASTERY_EVIDENCE_INCOMPLETE");
    for (const row of memberReceiptRows) {
      const event = parsePersistedEvent(row);
      if (!expectedScopes.has(canonicalScopedMasteryKey(event.key))) throw new Error("GROUP_COMPLETION_MASTERY_SCOPE_MISMATCH");
    }

    const historicalRows = await tx.select().from(aurionScopedMasteryEvents).where(and(
      eq(aurionScopedMasteryEvents.userId, member.userId),
    ));
    const historicalEvents = historicalRows
      .filter(row => expectedScopes.has(row.scopeKey))
      .map(parsePersistedEvent);
    const states = resolveCoupledMasteries({ actorId: String(member.userId), keys: member.keys, events: historicalEvents });
    if (states.length !== member.keys.length || states.some(state => !state.appliedReceiptIds.includes(ticket.id))) {
      throw new Error("GROUP_COMPLETION_MASTERY_READBACK_FAILED");
    }
  }

  return Object.freeze({ receiptId: ticket.id, eventCount: receiptRows.length });
}
