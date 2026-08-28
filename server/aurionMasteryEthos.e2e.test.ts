import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aurionEthosEvents, aurionMasteryEvents, expeditionResultReceipts } from "../drizzle/schema";
import { getAurionEthosReadmodel, getAurionMasteryReadmodel, getDb, recordValidatedAurionEthosEvent, recordValidatedAurionMasteryEvent, recordValidatedExpeditionResult } from "./db";
import { isExplicitIsolatedWorldE2eEnvironment } from "./worldE2eGuard";

const describeWithIsolatedDatabase = isExplicitIsolatedWorldE2eEnvironment() ? describe : describe.skip;
const USER_ID = 2_146_991_025;
const PREFIX = "aurion-mastery-ethos-e2e";
const RULESET = "aurion-mastery-ethos.v1";
const CONTENT = "aurion-content.v2";

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  await db.delete(aurionEthosEvents).where(eq(aurionEthosEvents.userId, USER_ID));
  await db.delete(aurionMasteryEvents).where(eq(aurionMasteryEvents.userId, USER_ID));
  const receipts = await db.select({ id: expeditionResultReceipts.id }).from(expeditionResultReceipts).where(eq(expeditionResultReceipts.userId, USER_ID));
  for (const receipt of receipts) await db.delete(expeditionResultReceipts).where(eq(expeditionResultReceipts.id, receipt.id));
}

describeWithIsolatedDatabase("aurion mastery and ethos E2E", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("persists only receipt-bound exact mastery and derives stable cap-free readback", async () => {
    const receipt = await recordValidatedExpeditionResult({
      userId: USER_ID,
      expeditionKey: `${PREFIX}:mastery`,
      seedDigest: "a".repeat(64),
      resultDigest: "b".repeat(64),
      confirmedByUserId: USER_ID,
      idempotencyKey: `${PREFIX}:mastery:result`,
    });
    const first = await recordValidatedAurionMasteryEvent({
      userId: USER_ID,
      disciplineId: "resonance_magic",
      source: "encounter",
      amountExact: "9007199254740992",
      sourceReceiptId: receipt.receipt.id,
      resolutionIndex: 7,
      ruleSetVersion: RULESET,
      contentVersion: CONTENT,
      idempotencyKey: `${PREFIX}:mastery:event`,
    });
    const replay = await recordValidatedAurionMasteryEvent({
      userId: USER_ID,
      disciplineId: "resonance_magic",
      source: "encounter",
      amountExact: "9007199254740992",
      sourceReceiptId: receipt.receipt.id,
      resolutionIndex: 7,
      ruleSetVersion: RULESET,
      contentVersion: CONTENT,
      idempotencyKey: `${PREFIX}:mastery:event`,
    });
    expect(first.applied).toBe(true);
    expect(replay).toMatchObject({ applied: false, event: { id: first.event.id } });
    expect(await getAurionMasteryReadmodel(USER_ID, "resonance_magic")).toMatchObject({ progression: { totalXpExact: "9007199254740992", numberProjectionExact: false }, appliedReceiptIds: [receipt.receipt.id] });
  });

  it("persists bounded receipt-bound ethos and returns a visible aura only as readmodel", async () => {
    const receipt = await recordValidatedExpeditionResult({
      userId: USER_ID,
      expeditionKey: `${PREFIX}:ethos`,
      seedDigest: "c".repeat(64),
      resultDigest: "d".repeat(64),
      confirmedByUserId: USER_ID,
      idempotencyKey: `${PREFIX}:ethos:result`,
    });
    const first = await recordValidatedAurionEthosEvent({
      userId: USER_ID,
      sourceReceiptId: receipt.receipt.id,
      deltasBps: { mercy: 2_500, stewardship: 2_500, integrity: 2_500 },
      resolutionIndex: 8,
      ruleSetVersion: RULESET,
      contentVersion: CONTENT,
      idempotencyKey: `${PREFIX}:ethos:event`,
    });
    const replay = await recordValidatedAurionEthosEvent({
      userId: USER_ID,
      sourceReceiptId: receipt.receipt.id,
      deltasBps: { mercy: 2_500, stewardship: 2_500, integrity: 2_500 },
      resolutionIndex: 8,
      ruleSetVersion: RULESET,
      contentVersion: CONTENT,
      idempotencyKey: `${PREFIX}:ethos:event`,
    });
    expect(first.applied).toBe(true);
    expect(replay).toMatchObject({ applied: false, event: { id: first.event.id } });
    expect(await getAurionEthosReadmodel(USER_ID)).toMatchObject({ axesBps: { mercy: 2_500, stewardship: 2_500, integrity: 2_500 }, alignment: "good", aura: "radiant", trigger: "extreme_shift", appliedReceiptIds: [receipt.receipt.id] });
    await expect(recordValidatedAurionEthosEvent({ ...first.event, userId: USER_ID + 1, sourceReceiptId: receipt.receipt.id, deltasBps: { mercy: 1 }, idempotencyKey: `${PREFIX}:ethos:foreign` })).rejects.toThrow(/desselben Spielers/i);
  });
});
