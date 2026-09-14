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
    "wasd:civ-history-event:v1",
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


