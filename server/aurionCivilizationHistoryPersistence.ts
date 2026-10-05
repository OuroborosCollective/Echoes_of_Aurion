import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  aurionActiveCivilizations,
  aurionCivilizationHistoryEvents,
  aurionDungeonInstanceReceipts,
  aurionRuinOrigins,
  aurionSettlementRebirthCandidates,
} from "../drizzle/schema";
import { getDb } from "./db";

const id = z.string().trim().min(1).max(64);

const hash = (parts: readonly string[]) =>
  createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");

export const civilizationHistoryEventInputSchema = z
  .object({
    eventId: id,
    civilizationId: id,
    worldId: id,
    worldEpoch: z.number().int().positive(),
    eventType: id,
    sourceReceiptId: id,
    sourceRevision: id,
    eventPayloadJson: z.string().min(2).max(64_000),
    occurredSequence: z.number().int().nonnegative(),
  })
  .strict();

export type CivilizationHistoryEventInput = z.infer<typeof civilizationHistoryEventInputSchema>;

export function normalizeCivilizationHistoryEvent(input: CivilizationHistoryEventInput) {
  const parsed = civilizationHistoryEventInputSchema.parse(input);

  const eventPayloadHash = hash(["civilization-history-payload", parsed.eventPayloadJson]);
  const eventHash = hash([
    "aurion:civ-history-event:v1",
    parsed.eventId,
    parsed.civilizationId,
    parsed.worldId,
    String(parsed.worldEpoch),
    parsed.eventType,
    parsed.sourceReceiptId,
    parsed.sourceRevision,
    eventPayloadHash,
    String(parsed.occurredSequence),
  ]);

  return Object.freeze({ ...parsed, eventPayloadHash, eventHash });
}

export async function recordCivilizationHistoryEvent(input: CivilizationHistoryEventInput) {
  const normalized = normalizeCivilizationHistoryEvent(input);
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  const prior = (
    await db
      .select()
      .from(aurionCivilizationHistoryEvents)
      .where(eq(aurionCivilizationHistoryEvents.eventId, normalized.eventId))
      .limit(1)
  )[0];

  if (prior) {
    if (
      prior.civilizationId !== normalized.civilizationId ||
      prior.worldId !== normalized.worldId ||
      prior.worldEpoch !== normalized.worldEpoch ||
      prior.eventType !== normalized.eventType ||
      prior.sourceReceiptId !== normalized.sourceReceiptId ||
      prior.sourceRevision !== normalized.sourceRevision ||
      prior.occurredSequence !== normalized.occurredSequence ||
      prior.eventPayloadHash !== normalized.eventPayloadHash
    ) {
      throw new Error("CIVILIZATION_HISTORY_EVENT_IDEMPOTENCY_CONFLICT");
    }
    return Object.freeze({
      applied: false as const,
      eventId: prior.eventId,
      eventHash: normalized.eventHash,
    });
  }

  await db.insert(aurionCivilizationHistoryEvents).values({
    eventId: normalized.eventId,
    civilizationId: normalized.civilizationId,
    worldId: normalized.worldId,
    worldEpoch: normalized.worldEpoch,
    eventType: normalized.eventType,
    sourceReceiptId: normalized.sourceReceiptId,
    sourceRevision: normalized.sourceRevision,
    eventPayloadHash: normalized.eventPayloadHash,
    occurredSequence: normalized.occurredSequence,
  });

  return Object.freeze({
    applied: true as const,
    eventId: normalized.eventId,
    eventHash: normalized.eventHash,
  });
}

/** Lists history events for a world, descending by sequence. */
export async function listCivilizationHistoryEvents(worldId: string, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db
    .select()
    .from(aurionCivilizationHistoryEvents)
    .where(eq(aurionCivilizationHistoryEvents.worldId, worldId))
    .orderBy(desc(aurionCivilizationHistoryEvents.occurredSequence))
    .limit(limit);
}

export async function findCivilizationHistoryEventsBySourceReceipt(
  worldId: string,
  sourceReceiptId: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db
    .select()
    .from(aurionCivilizationHistoryEvents)
    .where(and(
      eq(aurionCivilizationHistoryEvents.worldId, worldId),
      eq(aurionCivilizationHistoryEvents.sourceReceiptId, sourceReceiptId),
    ))
    .orderBy(desc(aurionCivilizationHistoryEvents.occurredSequence));
}

export const ruinOriginInputSchema = z
  .object({
    ruinId: id,
    originCivilizationId: id,
    collapseEventId: id,
    locationIdentity: z.string().trim().min(1).max(255),
    worldEpoch: z.number().int().positive(),
    historyDigest: id,
    rulesetVersion: z.string().trim().min(1).max(32),
    generationSeedDigest: id,
    state: z.enum(["ELIGIBLE", "MATERIALIZED", "DISCOVERED", "ACTIVE", "CLEARED", "HISTORICAL"]),
  })
  .strict();

export type RuinOriginInput = z.infer<typeof ruinOriginInputSchema>;

export async function recordRuinOrigin(input: RuinOriginInput) {
  const parsed = ruinOriginInputSchema.parse(input);
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  const prior = (
    await db
      .select()
      .from(aurionRuinOrigins)
      .where(eq(aurionRuinOrigins.ruinId, parsed.ruinId))
      .limit(1)
  )[0];

  if (prior) {
    if (
      prior.originCivilizationId !== parsed.originCivilizationId ||
      prior.locationIdentity !== parsed.locationIdentity ||
      prior.worldEpoch !== parsed.worldEpoch ||
      prior.historyDigest !== parsed.historyDigest
    ) {
      throw new Error("RUIN_ORIGIN_IDEMPOTENCY_CONFLICT");
    }
    return Object.freeze({ applied: false as const, ruinId: prior.ruinId });
  }

  await db.insert(aurionRuinOrigins).values(parsed);
  return Object.freeze({ applied: true as const, ruinId: parsed.ruinId });
}

/** Updates a ruin state if the transition is forward-only. */
export async function advanceRuinState(ruinId: string, newState: RuinOriginInput["state"]) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const states: RuinOriginInput["state"][] = [
    "ELIGIBLE",
    "MATERIALIZED",
    "DISCOVERED",
    "ACTIVE",
    "CLEARED",
    "HISTORICAL",
  ];
  const newIndex = states.indexOf(newState);

  return db.transaction(async (tx) => {
    const current = (
      await tx.select().from(aurionRuinOrigins).where(eq(aurionRuinOrigins.ruinId, ruinId)).limit(1)
    )[0];
    if (!current) throw new Error("RUIN_NOT_FOUND");

    const currentIndex = states.indexOf(current.state as RuinOriginInput["state"]);
    if (newIndex <= currentIndex) return { applied: false, reason: "STATE_ALREADY_REACHED" };

    await tx.update(aurionRuinOrigins).set({ state: newState }).where(eq(aurionRuinOrigins.ruinId, ruinId));
    return { applied: true, newState };
  });
}

/** Lists active or discovered ruins. */
export async function listVisibleRuins(worldId: string) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  // We don't have a direct worldId on ruins (only originCivilizationId),
  // but for Aurion Alpha, civilization is effectively the world state.
  // We join with history events to filter by worldId if needed, or assume global world.
  return db
    .select()
    .from(aurionRuinOrigins)
    .where(and(eq(aurionRuinOrigins.state, "DISCOVERED")));
}

export const dungeonInstanceReceiptInputSchema = z
  .object({
    instanceId: id,
    ruinId: id,
    entryReceipt: id,
    rulesetVersion: z.string().trim().min(1).max(32),
    contextIdentity: id,
    completionReceipt: id.optional(),
    lootReceiptSetDigest: id.optional(),
    resultHash: id.optional(),
  })
  .strict();

export type DungeonInstanceReceiptInput = z.infer<typeof dungeonInstanceReceiptInputSchema>;

export async function recordDungeonInstanceReceipt(input: DungeonInstanceReceiptInput) {
  const parsed = dungeonInstanceReceiptInputSchema.parse(input);
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  const prior = (
    await db
      .select()
      .from(aurionDungeonInstanceReceipts)
      .where(eq(aurionDungeonInstanceReceipts.instanceId, parsed.instanceId))
      .limit(1)
  )[0];

  if (prior) {
    if (
      prior.ruinId !== parsed.ruinId ||
      prior.entryReceipt !== parsed.entryReceipt ||
      prior.rulesetVersion !== parsed.rulesetVersion
    ) {
      throw new Error("DUNGEON_INSTANCE_RECEIPT_IDEMPOTENCY_CONFLICT");
    }
    return Object.freeze({ applied: false as const, instanceId: prior.instanceId });
  }

  await db.insert(aurionDungeonInstanceReceipts).values({
    instanceId: parsed.instanceId,
    ruinId: parsed.ruinId,
    entryReceipt: parsed.entryReceipt,
    rulesetVersion: parsed.rulesetVersion,
    contextIdentity: parsed.contextIdentity,
    completionReceipt: parsed.completionReceipt ?? null,
    lootReceiptSetDigest: parsed.lootReceiptSetDigest ?? null,
    resultHash: parsed.resultHash ?? null,
  });
  return Object.freeze({ applied: true as const, instanceId: parsed.instanceId });
}

export const settlementRebirthCandidateInputSchema = z
  .object({
    candidateId: id,
    worldId: id,
    locationIdentity: z.string().trim().min(1).max(255),
    ruinId: id.optional(),
    eligibilityReceipt: id,
    candidateSeedDigest: id,
    state: z.enum(["INELIGIBLE", "ELIGIBLE", "MATERIALIZED", "REJECTED"]),
  })
  .strict();

export type SettlementRebirthCandidateInput = z.infer<typeof settlementRebirthCandidateInputSchema>;

export async function recordSettlementRebirthCandidate(input: SettlementRebirthCandidateInput) {
  const parsed = settlementRebirthCandidateInputSchema.parse(input);
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  const prior = (
    await db
      .select()
      .from(aurionSettlementRebirthCandidates)
      .where(eq(aurionSettlementRebirthCandidates.candidateId, parsed.candidateId))
      .limit(1)
  )[0];

  if (prior) {
    if (
      prior.worldId !== parsed.worldId ||
      prior.locationIdentity !== parsed.locationIdentity ||
      prior.candidateSeedDigest !== parsed.candidateSeedDigest
    ) {
      throw new Error("SETTLEMENT_REBIRTH_CANDIDATE_IDEMPOTENCY_CONFLICT");
    }
    return Object.freeze({ applied: false as const, candidateId: prior.candidateId });
  }

  await db.insert(aurionSettlementRebirthCandidates).values({
    candidateId: parsed.candidateId,
    worldId: parsed.worldId,
    locationIdentity: parsed.locationIdentity,
    ruinId: parsed.ruinId ?? null,
    eligibilityReceipt: parsed.eligibilityReceipt,
    candidateSeedDigest: parsed.candidateSeedDigest,
    state: parsed.state,
  });

  return Object.freeze({ applied: true as const, candidateId: parsed.candidateId });
}

/** Lists rebirth candidates for a world. */
export async function listRebirthCandidates(worldId: string) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db
    .select()
    .from(aurionSettlementRebirthCandidates)
    .where(eq(aurionSettlementRebirthCandidates.worldId, worldId));
}

export const activeCivilizationInputSchema = z
  .object({
    civilizationId: id,
    worldId: id,
    worldEpoch: z.number().int().nonnegative(),
    population: z.number().int().nonnegative(),
    stability: z.number().min(0).max(1),
    hazardIndex: z.number().min(0).max(1),
    scarcitySeverity: z.number().min(0).max(1),
    lastResolutionIndex: z.number().int().nonnegative(),
  })
  .strict();

export type ActiveCivilizationInput = z.infer<typeof activeCivilizationInputSchema>;

function historyInsertValues(normalized: ReturnType<typeof normalizeCivilizationHistoryEvent>) {
  return {
    eventId: normalized.eventId,
    civilizationId: normalized.civilizationId,
    worldId: normalized.worldId,
    worldEpoch: normalized.worldEpoch,
    eventType: normalized.eventType,
    sourceReceiptId: normalized.sourceReceiptId,
    sourceRevision: normalized.sourceRevision,
    eventPayloadHash: normalized.eventPayloadHash,
    occurredSequence: normalized.occurredSequence,
  };
}

function assertHistoryMatches(
  prior: typeof aurionCivilizationHistoryEvents.$inferSelect,
  normalized: ReturnType<typeof normalizeCivilizationHistoryEvent>,
) {
  if (
    prior.civilizationId !== normalized.civilizationId ||
    prior.worldId !== normalized.worldId ||
    prior.worldEpoch !== normalized.worldEpoch ||
    prior.eventType !== normalized.eventType ||
    prior.sourceReceiptId !== normalized.sourceReceiptId ||
    prior.sourceRevision !== normalized.sourceRevision ||
    prior.occurredSequence !== normalized.occurredSequence ||
    prior.eventPayloadHash !== normalized.eventPayloadHash
  ) throw new Error("CIVILIZATION_HISTORY_EVENT_IDEMPOTENCY_CONFLICT");
}

function activeCivilizationMatches(
  row: typeof aurionActiveCivilizations.$inferSelect,
  expected: ActiveCivilizationInput,
) {
  return row.civilizationId === expected.civilizationId &&
    row.worldId === expected.worldId &&
    row.worldEpoch === expected.worldEpoch &&
    row.population === expected.population &&
    Math.abs(row.stability - expected.stability) < 0.000001 &&
    Math.abs(row.hazardIndex - expected.hazardIndex) < 0.000001 &&
    Math.abs(row.scarcitySeverity - expected.scarcitySeverity) < 0.000001 &&
    row.lastResolutionIndex === expected.lastResolutionIndex;
}

/**
 * Atomically advances canonical civilization state and its causal history.
 * A transition receipt and its state projection either commit together or not at all.
 */
export async function recordCivilizationAdvance(input: Readonly<{
  state: ActiveCivilizationInput;
  transitionEvent: CivilizationHistoryEventInput;
  economicEvent?: CivilizationHistoryEventInput | null;
}>) {
  const state = activeCivilizationInputSchema.parse(input.state);
  const transition = normalizeCivilizationHistoryEvent(input.transitionEvent);
  const economic = input.economicEvent ? normalizeCivilizationHistoryEvent(input.economicEvent) : null;
  if (
    transition.eventType !== "EPOCH_ADVANCE" ||
    transition.civilizationId !== state.civilizationId ||
    transition.worldId !== state.worldId ||
    transition.occurredSequence !== state.lastResolutionIndex
  ) throw new Error("CIVILIZATION_ADVANCE_EVENT_BINDING_INVALID");
  if (economic && (
    economic.eventType !== "ECONOMIC_MARKET_DEVELOPMENT" ||
    economic.civilizationId !== state.civilizationId ||
    economic.worldId !== state.worldId ||
    economic.sourceReceiptId !== transition.sourceReceiptId ||
    economic.occurredSequence !== state.lastResolutionIndex
  )) throw new Error("CIVILIZATION_ECONOMIC_EVENT_BINDING_INVALID");

  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  return db.transaction(async tx => {
    const priorTransition = (
      await tx.select().from(aurionCivilizationHistoryEvents)
        .where(eq(aurionCivilizationHistoryEvents.eventId, transition.eventId))
        .limit(1)
        .for("update")
    )[0];
    const activeRows = await tx.select().from(aurionActiveCivilizations)
      .where(eq(aurionActiveCivilizations.worldId, state.worldId))
      .limit(2)
      .for("update");
    if (activeRows.length > 1) throw new Error("CIVILIZATION_ACTIVE_WORLD_AMBIGUOUS");
    const current = activeRows[0];

    if (priorTransition) {
      assertHistoryMatches(priorTransition, transition);
      if (!current || !activeCivilizationMatches(current, state)) throw new Error("CIVILIZATION_ADVANCE_READBACK_MISMATCH");
      if (economic) {
        const priorEconomic = (
          await tx.select().from(aurionCivilizationHistoryEvents)
            .where(eq(aurionCivilizationHistoryEvents.eventId, economic.eventId))
            .limit(1)
            .for("update")
        )[0];
        if (!priorEconomic) throw new Error("CIVILIZATION_ECONOMIC_EVENT_READBACK_REQUIRED");
        assertHistoryMatches(priorEconomic, economic);
      }
      return Object.freeze({ applied: false as const, civilizationId: state.civilizationId });
    }

    if (!current || current.civilizationId !== state.civilizationId) throw new Error("CIVILIZATION_ACTIVE_STATE_REQUIRED");
    if (state.lastResolutionIndex !== current.lastResolutionIndex + 1) throw new Error("CIVILIZATION_ADVANCE_REVISION_CONFLICT");

    await tx.update(aurionActiveCivilizations).set({
      worldEpoch: state.worldEpoch,
      population: state.population,
      stability: state.stability,
      hazardIndex: state.hazardIndex,
      scarcitySeverity: state.scarcitySeverity,
      lastResolutionIndex: state.lastResolutionIndex,
    }).where(and(
      eq(aurionActiveCivilizations.worldId, state.worldId),
      eq(aurionActiveCivilizations.civilizationId, state.civilizationId),
    ));
    await tx.insert(aurionCivilizationHistoryEvents).values(historyInsertValues(transition));
    if (economic) await tx.insert(aurionCivilizationHistoryEvents).values(historyInsertValues(economic));

    const readback = (
      await tx.select().from(aurionActiveCivilizations)
        .where(eq(aurionActiveCivilizations.worldId, state.worldId))
        .limit(1)
    )[0];
    if (!readback || !activeCivilizationMatches(readback, state)) throw new Error("CIVILIZATION_ADVANCE_READBACK_MISMATCH");
    return Object.freeze({ applied: true as const, civilizationId: state.civilizationId });
  });
}

/** Atomically creates the first active civilization together with its seed receipt. */
export async function recordInitialCivilizationSeed(input: Readonly<{
  state: ActiveCivilizationInput;
  event: CivilizationHistoryEventInput;
}>) {
  const state = activeCivilizationInputSchema.parse(input.state);
  const event = normalizeCivilizationHistoryEvent(input.event);
  if (
    state.lastResolutionIndex !== 0 ||
    event.eventType !== "INITIAL_CIV_SEEDED" ||
    event.civilizationId !== state.civilizationId ||
    event.worldId !== state.worldId ||
    event.occurredSequence !== 0
  ) throw new Error("CIVILIZATION_INITIAL_SEED_BINDING_INVALID");

  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const priorEvent = (
      await tx.select().from(aurionCivilizationHistoryEvents)
        .where(eq(aurionCivilizationHistoryEvents.eventId, event.eventId))
        .limit(1)
        .for("update")
    )[0];
    const activeRows = await tx.select().from(aurionActiveCivilizations)
      .where(eq(aurionActiveCivilizations.worldId, state.worldId))
      .limit(2)
      .for("update");
    if (activeRows.length > 1) throw new Error("CIVILIZATION_ACTIVE_WORLD_AMBIGUOUS");
    const current = activeRows[0];

    if (priorEvent) {
      assertHistoryMatches(priorEvent, event);
      if (!current || !activeCivilizationMatches(current, state)) throw new Error("CIVILIZATION_INITIAL_SEED_READBACK_MISMATCH");
      return Object.freeze({ applied: false as const, civilizationId: state.civilizationId });
    }
    if (current) throw new Error("CIVILIZATION_ACTIVE_STATE_ALREADY_EXISTS");

    await tx.insert(aurionActiveCivilizations).values(state);
    await tx.insert(aurionCivilizationHistoryEvents).values(historyInsertValues(event));
    return Object.freeze({ applied: true as const, civilizationId: state.civilizationId });
  });
}

/** Atomically records an eligible rebirth candidate and its causal history event. */
export async function recordSettlementRebirthTransition(input: Readonly<{
  candidate: SettlementRebirthCandidateInput;
  event: CivilizationHistoryEventInput;
}>) {
  const candidate = settlementRebirthCandidateInputSchema.parse(input.candidate);
  const event = normalizeCivilizationHistoryEvent(input.event);
  if (
    event.eventType !== "REBIRTH_CANDIDATE_CREATED" ||
    event.eventId !== candidate.candidateId ||
    event.worldId !== candidate.worldId
  ) throw new Error("SETTLEMENT_REBIRTH_EVENT_BINDING_INVALID");

  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const priorCandidate = (
      await tx.select().from(aurionSettlementRebirthCandidates)
        .where(eq(aurionSettlementRebirthCandidates.candidateId, candidate.candidateId))
        .limit(1)
        .for("update")
    )[0];
    const priorEvent = (
      await tx.select().from(aurionCivilizationHistoryEvents)
        .where(eq(aurionCivilizationHistoryEvents.eventId, event.eventId))
        .limit(1)
        .for("update")
    )[0];

    if (priorCandidate || priorEvent) {
      if (!priorCandidate || !priorEvent) throw new Error("SETTLEMENT_REBIRTH_PARTIAL_COMMIT_DETECTED");
      if (
        priorCandidate.worldId !== candidate.worldId ||
        priorCandidate.locationIdentity !== candidate.locationIdentity ||
        priorCandidate.candidateSeedDigest !== candidate.candidateSeedDigest
      ) throw new Error("SETTLEMENT_REBIRTH_CANDIDATE_IDEMPOTENCY_CONFLICT");
      assertHistoryMatches(priorEvent, event);
      return Object.freeze({ applied: false as const, candidateId: candidate.candidateId });
    }

    await tx.insert(aurionSettlementRebirthCandidates).values({
      candidateId: candidate.candidateId,
      worldId: candidate.worldId,
      locationIdentity: candidate.locationIdentity,
      ruinId: candidate.ruinId ?? null,
      eligibilityReceipt: candidate.eligibilityReceipt,
      candidateSeedDigest: candidate.candidateSeedDigest,
      state: candidate.state,
    });
    await tx.insert(aurionCivilizationHistoryEvents).values(historyInsertValues(event));
    return Object.freeze({ applied: true as const, candidateId: candidate.candidateId });
  });
}

export async function getActiveCivilization(worldId: string) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return (
    await db
      .select()
      .from(aurionActiveCivilizations)
      .where(eq(aurionActiveCivilizations.worldId, worldId))
      .limit(1)
  )[0];
}

export async function upsertActiveCivilization(input: ActiveCivilizationInput) {
  const parsed = activeCivilizationInputSchema.parse(input);
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  await db
    .insert(aurionActiveCivilizations)
    .values(parsed)
    .onDuplicateKeyUpdate({
      set: {
        worldEpoch: parsed.worldEpoch,
        population: parsed.population,
        stability: parsed.stability,
        hazardIndex: parsed.hazardIndex,
        scarcitySeverity: parsed.scarcitySeverity,
        lastResolutionIndex: parsed.lastResolutionIndex,
      },
    });

  return Object.freeze({ success: true, civilizationId: parsed.civilizationId });
}

export async function recordCivilizationCollapse(input: {
  worldId: string;
  civilizationId: string;
  collapseEventId: string;
  sourceReceiptId: string;
  sourceRevision: string;
  worldEpoch: number;
  locationIdentity: string;
  historyDigest: string;
  rulesetVersion: string;
  generationSeedDigest: string;
  occurredSequence: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  return db.transaction(async (tx) => {
    // 1. Record History Event
    await tx.insert(aurionCivilizationHistoryEvents).values({
      eventId: input.collapseEventId,
      civilizationId: input.civilizationId,
      worldId: input.worldId,
      worldEpoch: input.worldEpoch,
      eventType: "CIVILIZATION_COLLAPSE",
      sourceReceiptId: input.sourceReceiptId,
      sourceRevision: input.sourceRevision,
      eventPayloadHash: hash(["civilization-collapse", input.civilizationId]),
      occurredSequence: input.occurredSequence,
    });

    // 2. Create Ruin Origin
    await tx.insert(aurionRuinOrigins).values({
      ruinId: `ruin_${input.collapseEventId}`,
      originCivilizationId: input.civilizationId,
      collapseEventId: input.collapseEventId,
      locationIdentity: input.locationIdentity,
      worldEpoch: input.worldEpoch,
      historyDigest: input.historyDigest,
      rulesetVersion: input.rulesetVersion,
      generationSeedDigest: input.generationSeedDigest,
      state: "ELIGIBLE",
    });

    // 3. Remove Active Civilization
    await tx
      .delete(aurionActiveCivilizations)
      .where(eq(aurionActiveCivilizations.civilizationId, input.civilizationId));

    return { success: true, ruinId: `ruin_${input.collapseEventId}` };
  });
}


