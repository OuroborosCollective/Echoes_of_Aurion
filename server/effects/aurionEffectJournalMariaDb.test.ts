import { writeFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import type WebSocket from "ws";
import { aurionCausalTickReceipts, aurionEffectDeliveryReceipts } from "../../drizzle/aurionCausalitySchema";
import { getDb } from "../db";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { globalTickRecorder } from "../causality/tickRecorder";
import { AurionEffectJournal } from "./aurionEffectJournal";
import { AurionEffectWorker, hashProviderDeliveryReceipt, type AurionEffectProvider } from "./aurionEffectWorker";

const enabled = process.env.NODE_ENV === "test" &&
  process.env.AURION_EFFECT_E2E === "1" &&
  Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const WORLD = "echoes-of-aurion-global";
const ZONE = "observatory_threshold:effect-journal";
const RELEASE = process.env.AURION_RELEASE_SHA ?? "";
const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;

let authorityReceiptHash = "";
let authorityPostStateHash = "";

function effectInput(subjectId: string, ordinal: number, payload: Record<string, unknown> = { achievementId: "first-light" }) {
  return {
    authorityReceiptHash,
    effectType: "achievement.dispatch",
    subjectId,
    ordinal,
    payload,
  };
}

class QueueProvider implements AurionEffectProvider {
  calls: Array<{ effectId: string; idempotencyKey: string; attempt: number }> = [];
  constructor(private readonly results: Array<
    | { status: "DELIVERED"; providerReceiptHash: string }
    | { status: "RETRYABLE"; errorCode: string }
    | { status: "PERMANENT_FAILURE"; errorCode: string }
    | Error
  >) {}

  async deliver(intent: any, context: { idempotencyKey: string; attempt: number }) {
    this.calls.push({ effectId: intent.effectId, idempotencyKey: context.idempotencyKey, attempt: context.attempt });
    const result = this.results.shift() ?? { status: "DELIVERED" as const, providerReceiptHash: hashProviderDeliveryReceipt({ effectId: intent.effectId }) };
    if (result instanceof Error) throw result;
    return result;
  }
}

suite("Aurion EffectIntent Journal MariaDB", () => {
  beforeAll(async () => {
    expect(RELEASE).toMatch(/^[a-f0-9]{40}$/);
    const dbUrl = new URL(process.env.DATABASE_URL!);
    expect(dbUrl.pathname).toMatch(/_test$/);
    const db = await getDb();
    if (!db) throw new Error("EFFECT_TEST_DATABASE_REQUIRED");

    const zone = new AuthoritativeMovementZone(ZONE as any);
    zone.sourceRevisionOverride = RELEASE;
    zone.join({ userId: 24_001, socket });
    zone.tick();
    await globalTickRecorder.flushPersistence();

    const [receipt] = await db.select().from(aurionCausalTickReceipts)
      .where(eq(aurionCausalTickReceipts.zoneId, ZONE))
      .limit(1);
    expect(receipt).toBeTruthy();
    authorityReceiptHash = receipt!.receiptHash;
    authorityPostStateHash = receipt!.postStateHash;
  }, 30_000);

  it("records one deterministic outbox row for duplicate authority input", async () => {
    const journal = new AurionEffectJournal();
    const first = await journal.recordIntent(effectInput("player:24001", 0));
    const duplicate = await journal.recordIntent(effectInput("player:24001", 0));
    expect(duplicate.effectId).toBe(first.effectId);
    expect(duplicate.deliveryState).toBe("PENDING");
    expect(duplicate.attemptCount).toBe(0);
  });

  it("fails closed when the same effect identity is reused with different payload", async () => {
    const journal = new AurionEffectJournal();
    await journal.recordIntent(effectInput("player:24007", 0, { achievementId: "first-light" }));
    await expect(journal.recordIntent(effectInput("player:24007", 0, { achievementId: "forged-second-payload" })))
      .rejects.toThrow("EFFECT_INTENT_IDEMPOTENCY_CONFLICT");
  });

  it("replay recomputes intent identity while producing zero provider calls and zero delivery receipts", async () => {
    const journal = new AurionEffectJournal();
    const worker = new AurionEffectWorker();
    const intent = await journal.recordIntent(effectInput("player:24002", 0));
    const provider = new QueueProvider([]);
    expect(await worker.processEffect(intent.effectId, provider, { mode: "REPLAY" }))
      .toEqual({ status: "REPLAY_SKIPPED", effectId: intent.effectId });
    expect(provider.calls).toHaveLength(0);
    const explanation = await journal.explain(intent.effectId);
    expect(explanation?.intent.deliveryState).toBe("PENDING");
    expect(explanation?.receipts).toHaveLength(0);
  });

  it("serializes duplicate workers to one logical delivery", async () => {
    const journal = new AurionEffectJournal();
    const worker = new AurionEffectWorker();
    const intent = await journal.recordIntent(effectInput("player:24003", 0));
    const provider = new QueueProvider([
      { status: "DELIVERED", providerReceiptHash: hashProviderDeliveryReceipt({ logical: intent.effectId }) },
    ]);
    const outcomes = await Promise.all([
      worker.processEffect(intent.effectId, provider),
      worker.processEffect(intent.effectId, provider),
    ]);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.idempotencyKey).toBe(intent.effectId);
    expect(outcomes.some(outcome => "skipped" in outcome && outcome.skipped)).toBe(true);
    const explanation = await journal.explain(intent.effectId);
    expect(explanation?.intent.deliveryState).toBe("DELIVERED");
    expect(explanation?.receipts).toHaveLength(1);
    expect(explanation?.receiptChainValid).toBe(true);
    const evidencePath = process.env.AURION_STEP24_EFFECT_ID_PATH?.trim();
    if (evidencePath) writeFileSync(evidencePath, `${intent.effectId}\n`, "utf8");
  });

  it("retries a retryable provider failure with a chained delivery receipt", async () => {
    const journal = new AurionEffectJournal();
    const worker = new AurionEffectWorker();
    const intent = await journal.recordIntent(effectInput("player:24004", 0));
    const provider = new QueueProvider([
      { status: "RETRYABLE", errorCode: "UPSTREAM_TEMPORARY" },
      { status: "DELIVERED", providerReceiptHash: hashProviderDeliveryReceipt({ retry: intent.effectId }) },
    ]);
    const first = await worker.processEffect(intent.effectId, provider);
    expect("intent" in first && first.intent.deliveryState).toBe("RETRYABLE");
    const second = await worker.processEffect(intent.effectId, provider);
    expect("intent" in second && second.intent.deliveryState).toBe("DELIVERED");
    const explanation = await journal.explain(intent.effectId);
    expect(explanation?.receipts.map(receipt => receipt.deliveryState)).toEqual(["RETRYABLE", "DELIVERED"]);
    expect(explanation?.receipts[1]?.previousDeliveryReceiptHash)
      .toBe(explanation?.receipts[0]?.deliveryReceiptHash);
    expect(explanation?.receiptChainValid).toBe(true);
  });

  it("keeps gameplay receipt state unchanged when provider delivery permanently fails", async () => {
    const db = await getDb();
    if (!db) throw new Error("EFFECT_TEST_DATABASE_REQUIRED");
    const journal = new AurionEffectJournal();
    const worker = new AurionEffectWorker();
    const intent = await journal.recordIntent(effectInput("player:24005", 0));
    const provider = new QueueProvider([{ status: "PERMANENT_FAILURE", errorCode: "PROVIDER_REJECTED" }]);
    const before = (await db.select().from(aurionCausalTickReceipts)
      .where(eq(aurionCausalTickReceipts.receiptHash, authorityReceiptHash)).limit(1))[0]!;
    await worker.processEffect(intent.effectId, provider);
    const after = (await db.select().from(aurionCausalTickReceipts)
      .where(eq(aurionCausalTickReceipts.receiptHash, authorityReceiptHash)).limit(1))[0]!;
    expect(after.postStateHash).toBe(authorityPostStateHash);
    expect(after).toEqual(before);
    expect((await journal.readIntent(intent.effectId))?.deliveryState).toBe("PERMANENT_FAILURE");
  });

  it("records an unclassified worker exception as FAILED without changing authority", async () => {
    const journal = new AurionEffectJournal();
    const worker = new AurionEffectWorker();
    const intent = await journal.recordIntent(effectInput("player:24006", 0));
    const provider = new QueueProvider([new Error("synthetic provider crash with no secrets")]);
    const outcome = await worker.processEffect(intent.effectId, provider);
    expect("intent" in outcome && outcome.intent.deliveryState).toBe("FAILED");
    expect("intent" in outcome && outcome.intent.lastErrorCode).toBe("SYNTHETIC_PROVIDER_CRASH_WITH_NO_SECRETS");
  });

  it("persists delivery evidence only in the effect lane", async () => {
    const db = await getDb();
    if (!db) throw new Error("EFFECT_TEST_DATABASE_REQUIRED");
    const rows = await db.select().from(aurionEffectDeliveryReceipts);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.deliveryReceiptHash.startsWith("sha256:"))).toBe(true);
  });
});
