import { createPool } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { createExperiencedNpcInformation } from "../shared/npcInformationEcologyProtocol";
import { appRouter } from "./routers";
import { readPersistedInvestigationDeductionReceipt } from "./investigationJournalPersistence";
import { AURION_WORLD_CHECKPOINT_WORLD_ID } from "./worldCheckpointProtocol";
import type { TrpcContext } from "./_core/context";

const suite = process.env.AURION_INVESTIGATION_JOURNAL_E2E === "1" && process.env.DATABASE_URL
  ? describe
  : describe.skip;

const informationColumns = [
  "id", "factId", "worldId", "ownerNpcId", "subjectId", "predicate", "value", "claimKey",
  "status", "confidenceBps", "witnessNpcId", "communicatedByNpcId", "communicationReceiptId",
  "relatedFactId", "sourceKind", "sourceReceiptId", "sourceReceiptHash", "sourceRevision",
  "sourceSha256", "sourceCausalRoot", "logicalIndex", "expiresAtIndex", "previousReceiptId", "receiptHash",
] as const;

function source(receiptNumber: number) {
  const hex = receiptNumber.toString(16).padStart(64, "0");
  return {
    evidenceClass: "verified" as const,
    sourceKind: "world_receipt" as const,
    sourceReceiptId: "world-source-" + receiptNumber,
    sourceReceiptHash: "sha256:" + hex,
    sourceRevision: receiptNumber.toString(16).padStart(40, "0"),
    sourceSha256: "sha256:" + hex,
    sourceCausalRoot: "sha256:" + hex,
  };
}

function context(userId: number): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: { id: userId, role: "user" } as NonNullable<TrpcContext["user"]>,
  };
}

async function seedInformation(pool: Awaited<ReturnType<typeof createPool>>, input: {
  witnessNpcId: string;
  subjectId: string;
  predicate: string;
  value: string;
  logicalIndex: number;
  receiptNumber: number;
}) {
  const receipt = createExperiencedNpcInformation({
    worldId: AURION_WORLD_CHECKPOINT_WORLD_ID,
    witnessNpcId: input.witnessNpcId,
    subjectId: input.subjectId,
    predicate: input.predicate,
    value: input.value,
    logicalIndex: input.logicalIndex,
    confidenceBps: 9_000,
    source: source(input.receiptNumber),
  });
  const names = [...informationColumns];
  await pool.execute(
    "INSERT INTO aurionNpcInformationReceipts (" + names.join(",") + ") VALUES (" + names.map(() => "?").join(",") + ")",
    names.map(name => receipt[name]),
  );
  return receipt;
}

async function rowCount(pool: Awaited<ReturnType<typeof createPool>>, table: "aurionNpcInformationReceipts" | "aurionInvestigationDeductionReceipts") {
  const [rows]: any = await pool.query("SELECT COUNT(*) AS count FROM " + table);
  return Number(rows[0].count);
}

suite("real authenticated investigation journal + MariaDB readback (isolated, not production)", () => {
  it("hides private claims, rejects stale intents, and persists only a verified deduction receipt", async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    const database = url.pathname.slice(1);
    if (!/^aurion_.*test$/.test(database) || !["127.0.0.1", "localhost", "mariadb"].includes(url.hostname)) {
      throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    }
    const pool = createPool(url.href);
    const userId = 918271;
    const caller = appRouter.createCaller(context(userId));

    try {
      await pool.execute("TRUNCATE TABLE aurionInvestigationDeductionReceipts");
      await pool.execute("TRUNCATE TABLE aurionNpcInformationReceipts");

      await seedInformation(pool, {
        witnessNpcId: "witness-a", subjectId: "gate", predicate: "opened_by",
        value: "Sable", logicalIndex: 100, receiptNumber: 1,
      });
      await seedInformation(pool, {
        witnessNpcId: "witness-b", subjectId: "gate", predicate: "opened_by",
        value: "Sable", logicalIndex: 101, receiptNumber: 2,
      });
      await seedInformation(pool, {
        witnessNpcId: "witness-secret", subjectId: "hidden-cache", predicate: "contains",
        value: "buried crown", logicalIndex: 100, receiptNumber: 3,
      });

      const before = await caller.investigationJournal.read({ viewerUserId: userId, guidance: "plot" });
      const conspiracy = await caller.investigationJournal.read({ viewerUserId: userId, guidance: "conspiracy" });
      const entries = before.investigations.flatMap(investigation => investigation.entries);
      expect(entries).toHaveLength(2);
      expect(entries.every(entry => entry.value === "Sable")).toBe(true);
      expect(before.sourceProjectionHash).toBe(conspiracy.sourceProjectionHash);
      expect(conspiracy.investigations.flatMap(investigation => investigation.entries)).toEqual(entries);

      const staleRequest = {
        sourceProjectionHash: before.sourceProjectionHash,
        selectedClaimIds: entries.map(entry => entry.claimId),
        deductionType: "affirm" as const,
      };
      await seedInformation(pool, {
        witnessNpcId: "witness-c", subjectId: "gate", predicate: "opened_by",
        value: "Sable", logicalIndex: 102, receiptNumber: 4,
      });
      await expect(caller.investigationJournal.submitDeduction(staleRequest))
        .rejects.toMatchObject({ code: "CONFLICT", message: "DEDUCTION_STALE_PROJECTION" });
      expect(await rowCount(pool, "aurionInvestigationDeductionReceipts")).toBe(0);

      const current = await caller.investigationJournal.read({ viewerUserId: userId, guidance: "plot" });
      const currentEntries = current.investigations.flatMap(investigation => investigation.entries);
      const request = {
        sourceProjectionHash: current.sourceProjectionHash,
        selectedClaimIds: currentEntries.slice(0, 2).map(entry => entry.claimId),
        deductionType: "affirm" as const,
      };
      const persisted = await caller.investigationJournal.submitDeduction(request);
      expect(persisted.result).toBe("validated");
      expect(await readPersistedInvestigationDeductionReceipt(persisted.id)).toEqual(persisted);
      const after = await caller.investigationJournal.read({ viewerUserId: userId, guidance: "plot" });
      expect(after.journalHash).toBe(current.journalHash);

      const retried = await caller.investigationJournal.submitDeduction(request);
      expect(retried.receiptHash).toBe(persisted.receiptHash);
      expect(await rowCount(pool, "aurionInvestigationDeductionReceipts")).toBe(1);
      expect(await rowCount(pool, "aurionNpcInformationReceipts")).toBe(4);
    } finally {
      await pool.execute("TRUNCATE TABLE aurionInvestigationDeductionReceipts");
      await pool.execute("TRUNCATE TABLE aurionNpcInformationReceipts");
      await pool.end();
    }
  }, 30_000);
});
