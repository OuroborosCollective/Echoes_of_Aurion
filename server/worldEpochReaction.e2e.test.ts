import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aurionGlobalWorldEpochReceipts, aurionGlobalWorldStates, aurionWorldEpochReactions, aurionWorldEpochRequests } from "../drizzle/schema";
import { getDb, resolveAndRecordGlobalWorldEpoch } from "./db";

const describeWithEpochDatabase = process.env.DATABASE_URL && process.env.NODE_ENV === "test" && process.env.AURION_WORLD_EPOCH_E2E === "1" ? describe : describe.skip;
const WORLD_ID = "echoes-of-aurion-global";

async function cleanupEpochState() {
  const db = await getDb();
  if (!db) return;
  await db.delete(aurionWorldEpochReactions).where(eq(aurionWorldEpochReactions.worldId, WORLD_ID));
  await db.delete(aurionWorldEpochRequests).where(eq(aurionWorldEpochRequests.worldId, WORLD_ID));
  await db.delete(aurionGlobalWorldEpochReceipts).where(eq(aurionGlobalWorldEpochReceipts.worldId, WORLD_ID));
  await db.delete(aurionGlobalWorldStates).where(eq(aurionGlobalWorldStates.worldId, WORLD_ID));
}

describeWithEpochDatabase("World epoch reaction receipts E2E", () => {
  beforeEach(cleanupEpochState);
  afterEach(cleanupEpochState);

  it("creates exactly one immutable reaction per idempotent epoch request and replays it", async () => {
    const input = { requestedByUserId: 2_146_999_970, idempotencyKey: "world-epoch-e2e:replay:0001", now: new Date("2026-01-01T00:00:00.000Z") };
    const first = await resolveAndRecordGlobalWorldEpoch(input);
    const replay = await resolveAndRecordGlobalWorldEpoch(input);
    expect(first).toMatchObject({ source: "created", plan: { epoch: 1 } });
    expect(replay).toMatchObject({ source: "persisted", plan: { epoch: 1, deterministicHash: first.plan.deterministicHash } });
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;
    const reactions = await db.select().from(aurionWorldEpochReactions).where(eq(aurionWorldEpochReactions.worldId, WORLD_ID));
    expect(reactions).toHaveLength(1);
    expect(JSON.parse(reactions[0]!.reactionJson)).toMatchObject({ resolutionIndex: 1, receiptId: reactions[0]!.receiptId, deterministicHash: reactions[0]!.reactionHash });
  }, 30_000);

  it("serializes concurrent distinct epoch requests into separate contiguous world and reaction receipts", async () => {
    const [first, second] = await Promise.all([
      resolveAndRecordGlobalWorldEpoch({ requestedByUserId: 2_146_999_970, idempotencyKey: "world-epoch-e2e:race:0001", now: new Date("2026-01-01T00:00:00.000Z") }),
      resolveAndRecordGlobalWorldEpoch({ requestedByUserId: 2_146_999_971, idempotencyKey: "world-epoch-e2e:race:0002", now: new Date("2026-01-01T00:00:00.000Z") }),
    ]);
    expect([first.plan.epoch, second.plan.epoch].sort((left, right) => left - right)).toEqual([1, 2]);
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;
    const reactions = await db.select().from(aurionWorldEpochReactions).where(eq(aurionWorldEpochReactions.worldId, WORLD_ID));
    expect(reactions.map(reaction => reaction.epoch).sort((left, right) => left - right)).toEqual([1, 2]);
  }, 30_000);
});
