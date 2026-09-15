import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { 
  aurionNpcPolicyVersions, 
  aurionNpcPolicyActivePointers, 
  aurionNpcPolicyMutationReceipts, 
  aurionNpcPolicyRollbackReceipts 
} from "../drizzle/schema";
import { 
  commitNpcPolicyMutation, 
  requestNpcPolicyRollback, 
  getConfirmedNpcPolicy, 
  type WasdMutationReceipt 
} from "./wasdNpcEvolutionPersistence";
import { npcHash } from "./wasdNpcCapsule";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };

const suite = process.env.AURION_NPC_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const npcId = "aim295:test-npc";

suite("AIM-295 NPC self-evolution policy custody & transaction-gated rollback", () => {
  let pool: Pool;
  let isolated = false;

  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    // Clean up our specific test tables
    await pool.query("DELETE FROM aurionNpcPolicyRollbackReceipts WHERE npcId = ?", [npcId]);
    await pool.query("DELETE FROM aurionNpcPolicyMutationReceipts WHERE npcId = ?", [npcId]);
    await pool.query("DELETE FROM aurionNpcPolicyActivePointers WHERE npcId = ?", [npcId]);
    await pool.query("DELETE FROM aurionNpcPolicyVersions WHERE npcId = ?", [npcId]);
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) {
      throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    }
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (rows[0]?.name !== url.pathname.slice(1)) {
      throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    }
    isolated = true;
  });

  beforeEach(cleanup);

  afterAll(async () => {
    if (pool) {
      if (isolated) await cleanup();
      await pool.end();
    }
  });

  const makeMutationReceipt = (
    receiptId: string, 
    prevVer: number | null, 
    prevHash: string | null, 
    nextVer: number, 
    nextHash: string,
    verdict: "accepted" | "rejected" = "accepted",
    payload: Record<string, any> = { woodcuttingSpeed: 1.25 }
  ): WasdMutationReceipt => ({
    mutationReceiptId: receiptId,
    npcId,
    previousVersion: prevVer,
    previousPolicyHash: prevHash,
    nextVersion: nextVer,
    nextPolicyHash: nextHash,
    rejectedCandidateHash: verdict === "rejected" ? nextHash : null,
    verdict,
    reason: "Evolved woodcutting capabilities based on high efficiency stats",
    provenanceDigest: "dec_1,dec_2",
    evidenceWindow: { startIndex: 100, endIndex: 200 },
    fitnessContract: { version: "wasd-fitness.v1", resultDigest: "0x1234abcd" },
    mutationRule: { version: "wasd-mutation-rule.v1" },
    envelopeHash: npcHash(["envelope", receiptId]),
    rollbackTargetVersion: null,
    sourceRevision: pin.sourceRevision,
    sourceSha256: pin.sourceSha256,
    payload,
  });

  it("successfully commits accepted mutation receipt and reads it back atomically", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const receiptId = `mut_${npcHash(["mutation-1"]).slice(0, 56)}`;
    const hash = npcHash(["woodcutting:1.25"]);
    const receipt = makeMutationReceipt(receiptId, null, null, 1, hash);

    await db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, receipt);
    });

    const active = await getConfirmedNpcPolicy(npcId);
    expect(active).not.toBeNull();
    expect(active!.version).toBe(1);
    expect(active!.policyHash).toBe(hash);
    expect(active!.payload.woodcuttingSpeed).toBe(1.25);
  });

  it("atomically rolls back changes if a step fails during insertion (failure before active pointer move)", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const receiptId = `mut_${npcHash(["mutation-fail-rb"]).slice(0, 56)}`;
    const hash = npcHash(["mining:1.5"]);
    const receipt = makeMutationReceipt(receiptId, null, null, 1, hash, "accepted", { miningSpeed: 1.5 });

    await expect(db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, receipt);
      throw new Error("FORCED_TRANSACTION_FAILURE");
    })).rejects.toThrow("FORCED_TRANSACTION_FAILURE");

    // Ensure absolutely nothing is persisted for this NPC
    const pointer = await db.select().from(aurionNpcPolicyActivePointers).where(eq(aurionNpcPolicyActivePointers.npcId, npcId));
    expect(pointer).toHaveLength(0);

    const versions = await db.select().from(aurionNpcPolicyVersions).where(eq(aurionNpcPolicyVersions.npcId, npcId));
    expect(versions).toHaveLength(0);

    const receipts = await db.select().from(aurionNpcPolicyMutationReceipts).where(eq(aurionNpcPolicyMutationReceipts.npcId, npcId));
    expect(receipts).toHaveLength(0);
  });

  it("rejects mutations that specify stale previous versions or incorrect previous policy hashes", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    // Commit version 1 first
    const r1 = makeMutationReceipt(`mut_${npcHash(["mut-v1"]).slice(0, 56)}`, null, null, 1, "hash-1");
    await db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r1);
    });

    // Attempting to commit version 2 with a wrong previous version (e.g. null instead of 1)
    const r2WrongVer = makeMutationReceipt(`mut_${npcHash(["mut-v2-wrong-ver"]).slice(0, 56)}`, null, null, 2, "hash-2");
    await expect(db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r2WrongVer);
    })).rejects.toThrow("MUTATION_STALE_PREVIOUS_VERSION");

    // Attempting to commit version 2 with a wrong previous hash
    const r2WrongHash = makeMutationReceipt(`mut_${npcHash(["mut-v2-wrong-hash"]).slice(0, 56)}`, 1, "wrong-hash-1", 2, "hash-2");
    await expect(db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r2WrongHash);
    })).rejects.toThrow("MUTATION_STALE_PREVIOUS_HASH");
  });

  it("permits duplicate same-receipt commits (idempotency) but rejects conflicting duplicates on version numbers", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const r1 = makeMutationReceipt(`mut_${npcHash(["idempotent-mut"]).slice(0, 56)}`, null, null, 1, "hash-1");
    
    // First commit
    await db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r1);
    });

    // Re-commit same receipt must succeed silently (idempotent)
    await db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r1);
    });

    // A different receipt trying to commit to version 1 again must fail closed
    const r1Conflicting = makeMutationReceipt(`mut_${npcHash(["conflicting-mut"]).slice(0, 56)}`, null, null, 1, "hash-different");
    await expect(db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r1Conflicting);
    })).rejects.toThrow("MUTATION_CONCURRENT_DUPLICATE_VERSION");
  });

  it("stores rejected mutations as audit logs without modifying active pointers", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    // Commit version 1 first
    const r1 = makeMutationReceipt(`mut_${npcHash(["accepted-mut"]).slice(0, 56)}`, null, null, 1, "hash-1");
    await db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r1);
    });

    // Submit a rejected mutation candidate
    const rRejected = makeMutationReceipt(`mut_${npcHash(["rejected-mut"]).slice(0, 56)}`, 1, "hash-1", 2, "hash-rejected", "rejected");
    await db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, rRejected);
    });

    // Ensure active pointer still points to version 1
    const active = await getConfirmedNpcPolicy(npcId);
    expect(active).not.toBeNull();
    expect(active!.version).toBe(1);
    expect(active!.policyHash).toBe("hash-1");

    // Ensure rejected receipt is recorded in database for auditing
    const auditRow = (await db.select().from(aurionNpcPolicyMutationReceipts)
      .where(eq(aurionNpcPolicyMutationReceipts.id, rRejected.mutationReceiptId)).limit(1))[0];
    expect(auditRow).not.toBeUndefined();
    expect(auditRow.verdict).toBe("rejected");
  });

  it("implements history-reproducing append-only rollback and restores historical values as active version N+1", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    // Commit Version 1 (woodcuttingSpeed: 1.25)
    const hash1 = npcHash(["woodcutting:1.25"]);
    const r1 = makeMutationReceipt(`mut_${npcHash(["mut-rollback-v1"]).slice(0, 56)}`, null, null, 1, hash1, "accepted", { woodcuttingSpeed: 1.25 });
    await db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r1);
    });

    // Commit Version 2 (woodcuttingSpeed: 1.8)
    const hash2 = npcHash(["woodcutting:1.8"]);
    const r2 = makeMutationReceipt(`mut_${npcHash(["mut-rollback-v2"]).slice(0, 56)}`, 1, hash1, 2, hash2, "accepted", { woodcuttingSpeed: 1.8 });
    await db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r2);
    });

    // Ensure we are at version 2 currently
    const activeBefore = await getConfirmedNpcPolicy(npcId);
    expect(activeBefore!.version).toBe(2);
    expect(activeBefore!.payload.woodcuttingSpeed).toBe(1.8);

    // Request Rollback to Version 1
    await db.transaction(async (tx) => {
      await requestNpcPolicyRollback(tx, npcId, 1, "Detected over-efficiency glitch", "admin-01");
    });

    // Rollback must advance version chain to 3, but restore Version 1 payload and hash!
    const activeAfter = await getConfirmedNpcPolicy(npcId);
    expect(activeAfter!.version).toBe(3);
    expect(activeAfter!.policyHash).toBe(hash1); // Exact hash restored!
    expect(activeAfter!.payload.woodcuttingSpeed).toBe(1.25); // Exact values restored!

    // Ensure history rows are completely intact (append-only proof)
    const versionRows = await db.select().from(aurionNpcPolicyVersions)
      .where(eq(aurionNpcPolicyVersions.npcId, npcId));
    expect(versionRows).toHaveLength(3); // Versions 1, 2, 3 all exist in history!

    const rollbackRows = await db.select().from(aurionNpcPolicyRollbackReceipts)
      .where(eq(aurionNpcPolicyRollbackReceipts.npcId, npcId));
    expect(rollbackRows).toHaveLength(1);
    expect(rollbackRows[0].reason).toBe("Verified Rollback to version 1: Detected over-efficiency glitch");
    expect(rollbackRows[0].adminUserId).toBe("admin-01");
  });

  it("fails closed on stale or invalid target version rollback requests", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const r1 = makeMutationReceipt(`mut_${npcHash(["stale-rollback-v1"]).slice(0, 56)}`, null, null, 1, "hash-1");
    await db.transaction(async (tx) => {
      await commitNpcPolicyMutation(tx, r1);
    });

    // Cannot roll back to same version
    await expect(db.transaction(async (tx) => {
      await requestNpcPolicyRollback(tx, npcId, 1, "Rollback same version", "admin-01");
    })).rejects.toThrow("ROLLBACK_INVALID_TARGET_VERSION");

    // Cannot roll back to non-existent version
    await expect(db.transaction(async (tx) => {
      await requestNpcPolicyRollback(tx, npcId, 99, "Rollback fantasy version", "admin-01");
    })).rejects.toThrow("ROLLBACK_INVALID_TARGET_VERSION");
  });
});
