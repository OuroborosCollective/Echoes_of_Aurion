import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  aurionCausalTickReceipts,
  aurionCrossZoneTransferReceipts,
  aurionCrossZoneTransfers,
  aurionEntityZoneOwnership,
} from "../../drizzle/aurionCausalitySchema";
import { getDb } from "../db";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { globalTickRecorder } from "./tickRecorder";
import { AurionCrossZoneSynchronizationService } from "./crossZoneSynchronizationService";

const enabled = process.env.NODE_ENV === "test" &&
  process.env.AURION_CROSS_ZONE_E2E === "1" &&
  Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const WORLD = "echoes-of-aurion-global";
const SOURCE = "observatory_threshold";
const RELEASE = process.env.AURION_RELEASE_SHA ?? "";
const users = Array.from({ length: 12 }, (_, index) => 23_100 + index);

let sourceReceiptHash = "";
let sourceStateHash = "";
let sourceTick = 0;

function socketStub() {
  return {
    OPEN: 1,
    readyState: 1,
    send: () => undefined,
    close: () => undefined,
  } as any;
}

function input(userId: number, targetZoneId = "windhollow") {
  return {
    entityId: `player:${userId}`,
    sourceWorldId: WORLD,
    sourceZoneId: SOURCE,
    sourceTick,
    sourceReceiptHash,
    sourceStateHash,
    targetWorldId: WORLD,
    targetZoneId,
    payload: {
      schema: "aurion.transfer.payload.v1" as const,
      entityId: `player:${userId}`,
      kind: "player" as const,
      data: { userId, sourceTick, hp: 100 },
    },
  };
}

async function register(service: AurionCrossZoneSynchronizationService, userId: number) {
  return service.registerAuthoritativeOwner({
    entityId: `player:${userId}`,
    worldId: WORLD,
    zoneId: SOURCE,
  });
}

suite("Cross-Zone Handover V2 MariaDB", () => {
  beforeAll(async () => {
    expect(RELEASE).toMatch(/^[a-f0-9]{40}$/);
    const databaseUrl = new URL(process.env.DATABASE_URL!);
    expect(databaseUrl.pathname).toMatch(/_test$/);

    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) throw new Error("CROSS_ZONE_TEST_DATABASE_REQUIRED");

    // This suite is only allowed on the disposable CI/test database. Current
    // ownership/transfer rows are mutable workflow state; append-only transition
    // receipts intentionally are not deleted.
    await db.delete(aurionEntityZoneOwnership);
    await db.delete(aurionCrossZoneTransfers);
    const existingTransitions = await db.select().from(aurionCrossZoneTransferReceipts);
    expect(existingTransitions).toHaveLength(0);
    await db.delete(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.worldId, WORLD));

    const zone = new AuthoritativeMovementZone("observatory_threshold");
    zone.sourceRevisionOverride = RELEASE;
    for (const userId of users) zone.join({ userId, socket: socketStub() });
    zone.tick();
    await globalTickRecorder.flushPersistence();

    const [receipt] = await db.select().from(aurionCausalTickReceipts)
      .where(eq(aurionCausalTickReceipts.worldId, WORLD));
    expect(receipt).toBeTruthy();
    expect(receipt!.zoneId).toBe(SOURCE);
    expect(receipt!.revision).toBe(RELEASE);
    sourceReceiptHash = receipt!.receiptHash;
    sourceStateHash = receipt!.postStateHash;
    sourceTick = receipt!.tick;
  }, 30_000);

  it("normal transfer keeps one owner and commits target authority atomically", async () => {
    const service = new AurionCrossZoneSynchronizationService();
    const userId = users[0]!;
    await register(service, userId);
    const prepared = await service.prepareHandover(input(userId));
    expect((await service.readAuthoritativeOwner(prepared.entityId))?.mode).toBe("ACTIVE");
    const frozen = await service.freezeSource(prepared.transferId);
    expect(frozen.status).toBe("SOURCE_FROZEN");
    expect((await service.readAuthoritativeOwner(prepared.entityId))?.mode).toBe("FROZEN");
    const accepted = await service.acceptTarget(prepared.transferId, 501);
    expect(accepted.status).toBe("TARGET_ACCEPTED");
    expect((await service.readAuthoritativeOwner(prepared.entityId))?.zoneId).toBe(SOURCE);
    const committed = await service.finalizeAndCommit(prepared.transferId);
    expect(committed.status).toBe("COMMITTED");
    expect(await service.readAuthoritativeOwner(prepared.entityId)).toMatchObject({
      worldId: WORLD, zoneId: "windhollow", mode: "ACTIVE", activeTransferId: null, generation: 1,
    });
    const explanation = await service.explainTransfer(prepared.transferId);
    expect(explanation).toMatchObject({ chainValid: true, ownerInvariantValid: true, resumableAction: "NONE" });
    expect(explanation!.receipts.map(receipt => receipt.status)).toEqual([
      "PREPARED", "SOURCE_FROZEN", "TARGET_ACCEPTED", "SOURCE_FINALIZED", "COMMITTED",
    ]);
    const evidencePath = process.env.AURION_STEP23_TRANSFER_ID_PATH?.trim();
    if (evidencePath) writeFileSync(evidencePath, `${prepared.transferId}\n`, "utf8");
  });

  it("duplicate delivery is logically exactly once", async () => {
    const service = new AurionCrossZoneSynchronizationService();
    const userId = users[1]!;
    await register(service, userId);
    const first = await service.prepareHandover(input(userId));
    const duplicate = await service.prepareHandover(input(userId));
    expect(duplicate.transferReceiptHash).toBe(first.transferReceiptHash);
    await service.freezeSource(first.transferId);
    await service.freezeSource(first.transferId);
    await service.acceptTarget(first.transferId, 502);
    await service.acceptTarget(first.transferId, 502);
    const committed = await service.finalizeAndCommit(first.transferId);
    const duplicateCommit = await service.finalizeAndCommit(first.transferId);
    expect(duplicateCommit.transferReceiptHash).toBe(committed.transferReceiptHash);
    expect((await service.explainTransfer(first.transferId))!.receipts).toHaveLength(5);
  });

  it("target offline leaves source as the single frozen owner and can expire safely", async () => {
    const service = new AurionCrossZoneSynchronizationService();
    const userId = users[2]!;
    await register(service, userId);
    const prepared = await service.prepareHandover(input(userId));
    await service.freezeSource(prepared.transferId);
    expect(await service.explainTransfer(prepared.transferId)).toMatchObject({
      resumableAction: "AWAIT_TARGET",
      owner: { zoneId: SOURCE, mode: "FROZEN" },
      ownerInvariantValid: true,
    });
    await service.terminateHandover(prepared.transferId, "EXPIRED");
    expect(await service.readAuthoritativeOwner(prepared.entityId)).toMatchObject({
      zoneId: SOURCE, mode: "ACTIVE", activeTransferId: null,
    });
  });

  it("source restart resumes from persisted PREPARED state", async () => {
    const firstProcess = new AurionCrossZoneSynchronizationService();
    const userId = users[3]!;
    await register(firstProcess, userId);
    const prepared = await firstProcess.prepareHandover(input(userId));
    const restarted = new AurionCrossZoneSynchronizationService();
    expect(await restarted.explainTransfer(prepared.transferId)).toMatchObject({ resumableAction: "FREEZE_SOURCE" });
    await restarted.freezeSource(prepared.transferId);
    await restarted.acceptTarget(prepared.transferId, 503);
    expect((await restarted.finalizeAndCommit(prepared.transferId)).status).toBe("COMMITTED");
  });

  it("target restart resumes from persisted SOURCE_FROZEN state", async () => {
    const sourceProcess = new AurionCrossZoneSynchronizationService();
    const userId = users[4]!;
    await register(sourceProcess, userId);
    const prepared = await sourceProcess.prepareHandover(input(userId));
    await sourceProcess.freezeSource(prepared.transferId);
    const targetProcess = new AurionCrossZoneSynchronizationService();
    expect(await targetProcess.explainTransfer(prepared.transferId)).toMatchObject({ resumableAction: "AWAIT_TARGET" });
    await targetProcess.acceptTarget(prepared.transferId, 504);
    expect((await targetProcess.finalizeAndCommit(prepared.transferId)).status).toBe("COMMITTED");
  });

  it("duplicate target message is idempotent but conflicting duplicate fails closed", async () => {
    const service = new AurionCrossZoneSynchronizationService();
    const userId = users[5]!;
    await register(service, userId);
    const prepared = await service.prepareHandover(input(userId));
    await service.freezeSource(prepared.transferId);
    const accepted = await service.acceptTarget(prepared.transferId, 505);
    expect((await service.acceptTarget(prepared.transferId, 505)).transferReceiptHash).toBe(accepted.transferReceiptHash);
    await expect(service.acceptTarget(prepared.transferId, 506)).rejects.toThrow("CROSS_ZONE_DUPLICATE_ACCEPT_CONFLICT");
  });

  it("delayed source messages never regress a newer transfer state", async () => {
    const service = new AurionCrossZoneSynchronizationService();
    const userId = users[6]!;
    await register(service, userId);
    const prepared = await service.prepareHandover(input(userId));
    await service.freezeSource(prepared.transferId);
    const accepted = await service.acceptTarget(prepared.transferId, 507);
    expect((await service.freezeSource(prepared.transferId)).status).toBe("TARGET_ACCEPTED");
    await service.finalizeAndCommit(prepared.transferId);
    expect((await service.freezeSource(prepared.transferId)).status).toBe("COMMITTED");
    expect((await service.explainTransfer(prepared.transferId))!.transfer.transferReceiptHash)
      .not.toBe(accepted.transferReceiptHash);
  });

  it("rejected transfer restores the source owner without target authority", async () => {
    const service = new AurionCrossZoneSynchronizationService();
    const userId = users[7]!;
    await register(service, userId);
    const prepared = await service.prepareHandover(input(userId));
    await service.freezeSource(prepared.transferId);
    const rejected = await service.terminateHandover(prepared.transferId, "REJECTED");
    expect(rejected.status).toBe("REJECTED");
    expect(await service.readAuthoritativeOwner(prepared.entityId)).toMatchObject({
      zoneId: SOURCE, mode: "ACTIVE", activeTransferId: null, generation: 0,
    });
  });

  it("replay of the same committed transfer returns the persisted result without a second handover", async () => {
    const firstProcess = new AurionCrossZoneSynchronizationService();
    const userId = users[8]!;
    await register(firstProcess, userId);
    const values = input(userId);
    const prepared = await firstProcess.prepareHandover(values);
    await firstProcess.freezeSource(prepared.transferId);
    await firstProcess.acceptTarget(prepared.transferId, 508);
    const committed = await firstProcess.finalizeAndCommit(prepared.transferId);
    const replayProcess = new AurionCrossZoneSynchronizationService();
    const replay = await replayProcess.prepareHandover(values);
    expect(replay.status).toBe("COMMITTED");
    expect(replay.transferReceiptHash).toBe(committed.transferReceiptHash);
    expect((await replayProcess.explainTransfer(prepared.transferId))!.receipts).toHaveLength(5);
  });

  it("two concurrent transfer attempts for one entity admit at most one transfer", async () => {
    const service = new AurionCrossZoneSynchronizationService();
    const userId = users[9]!;
    await register(service, userId);
    const outcomes = await Promise.allSettled([
      service.prepareHandover(input(userId, "windhollow")),
      service.prepareHandover(input(userId, "emberfall")),
    ]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    const owner = await service.readAuthoritativeOwner(`player:${userId}`);
    expect(owner?.worldId).toBe(WORLD);
    expect(owner?.zoneId).toBe(SOURCE);
    expect(owner?.activeTransferId).toMatch(/^xfer2_/);
    const db = await getDb();
    if (!db) throw new Error("CROSS_ZONE_TEST_DATABASE_REQUIRED");
    const transfers = await db.select().from(aurionCrossZoneTransfers)
      .where(eq(aurionCrossZoneTransfers.entityId, `player:${userId}`));
    expect(transfers).toHaveLength(1);
  });
});
