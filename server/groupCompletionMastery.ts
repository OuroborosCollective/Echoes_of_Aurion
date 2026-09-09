import { and, eq, inArray } from "drizzle-orm";
import { expeditionResultReceipts } from "../drizzle/schema";
import { aurionScopedMasteryEvents } from "../drizzle/professionPersistenceSchema";
import { GROUP_RULESET, type GroupParty, type GroupTicket } from "../shared/groupInstanceProtocol";
import { activityXpAwardExact } from "./aurionBalancingProtocol";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { getDb } from "./db";
import { groupHash } from "./groupInstanceRules";
import { recordProgressionReceipt } from "./progressionReceiptPersistence";
import { rewardReceiptIdentity } from "./rewardReceiptIdentity";
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

export type GroupCompletionResultPlan = Readonly<{
  userId: number;
  expeditionKey: string;
  seedDigest: string;
  resultDigest: string;
  confirmedByUserId: number;
  idempotencyKey: string;
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
 * Builds one canonical expedition-result authority per confirmed party member.
 * It intentionally grants no XP, gold or loot by itself: downstream reward
 * paths still require this accepted receipt plus their own server-owned rules.
 */
export function buildGroupCompletionResultPlan(
  party: GroupParty,
  ticket: GroupTicket,
): readonly GroupCompletionResultPlan[] {
  assertClearedInstance(party, ticket);
  const expeditionKey = `group-dungeon:${ticket.id}`;
  const seedDigest = groupHash({
    kind: "group_completion_seed",
    ruleset: GROUP_RULESET,
    ticketHash: ticket.hash,
    worldHash: ticket.worldHash,
    worldSnapshotSha256: ticket.worldSnapshotSha256,
    dungeonId: ticket.dungeonId,
    variant: ticket.variant,
  });

  return Object.freeze([...ticket.roster]
    .sort((left, right) => left.userId - right.userId)
    .map(member => Object.freeze({
      userId: member.userId,
      expeditionKey,
      seedDigest,
      resultDigest: groupHash({
        kind: "group_completion_result",
        ruleset: GROUP_RULESET,
        ticketHash: ticket.hash,
        partyId: party.id,
        rosterHash: party.rosterHash,
        userId: member.userId,
        dungeonId: ticket.dungeonId,
        variant: ticket.variant,
        bossIndex: party.bossIndex,
        bossHp: party.bossHp,
        instanceRevision: party.instanceRevision,
      }),
      confirmedByUserId: member.userId,
      idempotencyKey: `group-result:${ticket.id}:${member.userId}`,
    })));
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

async function commitGroupCompletionResults(tx: Transaction, party: GroupParty, ticket: GroupTicket) {
  const plan = buildGroupCompletionResultPlan(party, ticket);
  for (const result of plan) {
    const prior = (await tx.select().from(expeditionResultReceipts).where(eq(expeditionResultReceipts.idempotencyKey, result.idempotencyKey)).limit(1))[0];
    if (prior) {
      if (
        prior.userId !== result.userId
        || prior.expeditionKey !== result.expeditionKey
        || prior.seedDigest !== result.seedDigest
        || prior.resultDigest !== result.resultDigest
        || prior.confirmedByUserId !== result.confirmedByUserId
        || prior.status !== "accepted"
      ) throw new Error("GROUP_COMPLETION_RESULT_CONFLICT");
      continue;
    }
    await tx.insert(expeditionResultReceipts).values({
      id: rewardReceiptIdentity("expres", result.userId, result.idempotencyKey),
      ...result,
    });
  }

  const rows = await tx.select().from(expeditionResultReceipts).where(eq(expeditionResultReceipts.expeditionKey, plan[0]!.expeditionKey));
  if (rows.length !== plan.length) throw new Error("GROUP_COMPLETION_RESULT_EVIDENCE_INCOMPLETE");
  for (const expected of plan) {
    const row = rows.find(candidate => candidate.userId === expected.userId);
    if (
      !row
      || row.idempotencyKey !== expected.idempotencyKey
      || row.seedDigest !== expected.seedDigest
      || row.resultDigest !== expected.resultDigest
      || row.confirmedByUserId !== expected.confirmedByUserId
      || row.status !== "accepted"
    ) throw new Error("GROUP_COMPLETION_RESULT_READBACK_FAILED");
  }
  return Object.freeze({ expeditionKey: plan[0]!.expeditionKey, receiptCount: rows.length });
}

/**
 * Appends a receipt-backed classless combat-skill projection only after the
 * accepted expedition result and exact scoped-mastery state exist in the same
 * transaction. This is persistence/readmodel work: no XP or level is calculated
 * here; both values are copied from the already-confirmed mastery evidence.
 */
async function commitGroupProgressionReadmodel(
  tx: Transaction,
  ticket: GroupTicket,
  plan: readonly GroupCompletionMasteryPlan[],
  confirmedStatesByUser: Readonly<Record<string, readonly ScopedMasteryState[]>>,
) {
  for (const member of plan) {
    const combatEvent = member.events.find(event => event.key.scopeType === "combat");
    const combatState = confirmedStatesByUser[String(member.userId)]?.find(state => state.key.scopeType === "combat");
    if (!combatEvent || !combatState || !combatState.appliedReceiptIds.includes(ticket.id)) throw new Error("GROUP_COMPLETION_PROGRESSION_EVIDENCE_INCOMPLETE");
    const resultIdempotencyKey = `group-result:${ticket.id}:${member.userId}`;
    const scopeKey = canonicalScopedMasteryKey(combatEvent.key);
    await recordProgressionReceipt({
      userId: member.userId,
      characterId: actorId(member.userId),
      actionKind: "skill_use",
      weaponTrack: "none",
      skillId: "combat",
      resultReceiptId: rewardReceiptIdentity("expres", member.userId, resultIdempotencyKey),
      sourceReceiptId: ticket.id,
      lootReceiptId: null,
      masteryEventId: groupHash({ kind: "group_completion_mastery", userId: member.userId, ticketId: ticket.id, scopeKey }),
      xpGrantedExact: combatEvent.amountExact,
      levelExact: combatState.progression.levelExact,
      ruleSetVersion: combatEvent.ruleSetVersion,
      contentVersion: combatEvent.contentVersion,
      idempotencyKey: `group-progression:${ticket.id}:${member.userId}:combat`,
    }, tx);
  }
}

/**
 * Appends exactly two scoped mastery events plus one accepted expedition-result
 * receipt per roster member in the caller's existing group-command transaction.
 * Any insert/readback failure therefore rolls back boss clear, party state,
 * player revision, mastery evidence, progression projection and reward authority together.
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

  const confirmedStatesByUser: Record<string, readonly ScopedMasteryState[]> = {};
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
    confirmedStatesByUser[String(member.userId)] = states;
  }

  const results = await commitGroupCompletionResults(tx, party, ticket);
  await commitGroupProgressionReadmodel(tx, ticket, plan, confirmedStatesByUser);
  return Object.freeze({ receiptId: ticket.id, eventCount: receiptRows.length, resultReceiptCount: results.receiptCount, expeditionKey: results.expeditionKey });
}
