import { and, eq, inArray } from "drizzle-orm";
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
  type ScopedMasteryState,
} from "./scopedMasteryProtocol";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const actorId = (userId: number) => `player:${userId}`;

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

function completionKeys(ticket: GroupTicket): readonly ScopedMasteryKey[] {
  return Object.freeze([
    masteryKeys.combat(ticket.dungeonId),
    masteryKeys.action(`dungeon_completion:${ticket.dungeonId}`),
  ] as const);
}

function boundedRepetition(value: string): number {
  const exact = BigInt(value);
  return exact > 1_000_000n ? 1_000_000 : Number(exact);
}

/**
 * Builds mastery from the already-persisted exact mastery state. The frozen
 * ticket owns dungeon identity and completion evidence; mutable profile level,
 * wall clock and client reward values never enter the award.
 *
 * AIM-249's versioned dungeon-completion activity weighting is applied at each
 * scope's current exact level. Prior confirmed completions drive its diminishing
 * repetition curve, while the scoped-mastery event itself records the already
 * reduced exact amount without applying a second repetition penalty.
 */
export function buildGroupCompletionMasteryPlan(
  party: GroupParty,
  ticket: GroupTicket,
  currentByUser: Readonly<Record<string, readonly ScopedMasteryState[]>> = {},
): readonly GroupCompletionMasteryPlan[] {
  assertClearedInstance(party, ticket);
  const activeDurationTicks = party.instanceRevision;
  const distinctContextCount = Math.max(1, ticket.affixes.length + 1);

  return Object.freeze([...ticket.roster]
    .sort((left, right) => left.userId - right.userId)
    .map(member => {
      const keys = completionKeys(ticket);
      const current = currentByUser[String(member.userId)] ?? resolveCoupledMasteries({ actorId: actorId(member.userId), keys, events: [] });
      const currentByKey = new Map(current.map(state => [canonicalScopedMasteryKey(state.key), state] as const));
      if (currentByKey.size !== keys.length || keys.some(key => !currentByKey.has(canonicalScopedMasteryKey(key)))) throw new Error("GROUP_COMPLETION_MASTERY_STATE_INCOMPLETE");
      const actionState = currentByKey.get(canonicalScopedMasteryKey(keys[1]!))!;
      const priorCompletions = boundedRepetition(actionState.lifetimeUsesExact);
      const contextMetricsExact = Object.freeze({
        completions: "1",
        prior_completions: String(priorCompletions),
        bosses: String(ticket.bosses.length),
        affixes: String(ticket.affixes.length),
        [`variant_${ticket.variant}`]: "1",
      });
      const events = Object.freeze(keys.map(key => {
        const state = currentByKey.get(canonicalScopedMasteryKey(key))!;
        const amountExact = activityXpAwardExact({
          levelExact: state.progression.levelExact,
          scope: "combat_action",
          activity: "dungeon_completion",
          repetitionStreak: priorCompletions,
        });
        return Object.freeze({
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
        } satisfies ScopedMasteryEvent);
      }));
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

async function currentCompletionMastery(tx: Transaction, userId: number, ticket: GroupTicket) {
  const keys = completionKeys(ticket);
  const scopeKeys = keys.map(canonicalScopedMasteryKey);
  const historicalRows = await tx.select().from(aurionScopedMasteryEvents).where(and(
    eq(aurionScopedMasteryEvents.userId, userId),
    inArray(aurionScopedMasteryEvents.scopeKey, scopeKeys),
  ));
  const historicalEvents = historicalRows.map(parsePersistedEvent);
  return resolveCoupledMasteries({ actorId: actorId(userId), keys, events: historicalEvents });
}

/**
 * Appends exactly two scoped mastery events per roster member in the caller's
 * existing group-command transaction. Any insert/readback failure therefore rolls
 * back the boss clear, party state, player revision and mastery evidence together.
 */
export async function commitGroupCompletionMastery(tx: Transaction, party: GroupParty, ticket: GroupTicket) {
  const currentByUser: Record<string, readonly ScopedMasteryState[]> = {};
  for (const member of ticket.roster) currentByUser[String(member.userId)] = await currentCompletionMastery(tx, member.userId, ticket);
  const plan = buildGroupCompletionMasteryPlan(party, ticket, currentByUser);

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

    const states = await currentCompletionMastery(tx, member.userId, ticket);
    if (states.length !== member.keys.length || states.some(state => !state.appliedReceiptIds.includes(ticket.id))) {
      throw new Error("GROUP_COMPLETION_MASTERY_READBACK_FAILED");
    }
  }

  return Object.freeze({ receiptId: ticket.id, eventCount: receiptRows.length });
}
