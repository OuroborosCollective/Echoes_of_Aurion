import { eq } from "drizzle-orm";
import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aurionProgressionReceipts } from "../drizzle/schema";
import { getDb } from "./db";
import { readConfirmedProgressionTracks, recordProgressionReceipt, type ProgressionReceiptInput } from "./progressionReceiptPersistence";

const suite = process.env.AURION_CLASSLESS_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const userId = 9267001;
const characterId = "char-9267001";

function input(overrides: Partial<ProgressionReceiptInput> = {}): ProgressionReceiptInput {
  return {
    userId,
    characterId,
    actionKind: "weapon_use",
    weaponTrack: "greatsword.two_handed.v3",
    skillId: "none",
    resultReceiptId: "classless-result-weapon-0001",
    sourceReceiptId: "wasd-source-weapon-0001",
    lootReceiptId: null,
    masteryEventId: "mastery-weapon-0001",
    xpGrantedExact: "340282366920938463463374607431768211455",
    levelExact: "9007199254740993",
    ruleSetVersion: "wasd-classless-progression.v17",
    contentVersion: "aurion-content.v17",
    idempotencyKey: "classless-progression:weapon:0001",
    ...overrides,
  };
}

suite("AIM-227 classless progression on real MariaDB", () => {
  let pool: Pool;
  let isolated = false;

  async function clean() {
    if (!isolated) throw new Error("ISOLATED_CLASSLESS_TEST_DATABASE_REQUIRED");
    await pool.query("DELETE FROM aurionProgressionReceipts WHERE userId=?", [userId]);
  }

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query("SELECT DATABASE() AS name");
    if (!(rows as Array<{ name: string }>)[0]?.name.endsWith("_classless_test")) throw new Error("ISOLATED_CLASSLESS_TEST_DATABASE_REQUIRED");
    if (!/^[a-f0-9]{40}$/.test(process.env.AURION_RELEASE_SHA ?? "")) throw new Error("EXACT_TEST_REVISION_REQUIRED");
    isolated = true;
  });

  beforeEach(clean);
  afterAll(async () => {
    if (pool) {
      if (isolated) await clean();
      await pool.end();
    }
  });

  it("round-trips dynamic weapon and skill identities without truncation or numeric coercion", async () => {
    const weapon = await recordProgressionReceipt(input());
    const skill = await recordProgressionReceipt(input({
      actionKind: "skill_use",
      weaponTrack: "none",
      skillId: "chronomancy.temporal_anchor.v17",
      resultReceiptId: "classless-result-skill-0001",
      sourceReceiptId: "wasd-source-skill-0001",
      masteryEventId: "mastery-skill-0001",
      xpGrantedExact: "18446744073709551616",
      levelExact: "18446744073709551617",
      idempotencyKey: "classless-progression:skill:0001",
    }));

    expect(weapon.id).toHaveLength(64);
    expect(skill.id).toHaveLength(64);
    const projection = await readConfirmedProgressionTracks(userId);
    expect(projection.characterId).toBe(characterId);
    expect(projection.tracks).toEqual([
      expect.objectContaining({ trackKind: "skill", trackId: "chronomancy.temporal_anchor.v17", levelExact: "18446744073709551617" }),
      expect.objectContaining({ trackKind: "weapon", trackId: "greatsword.two_handed.v3", levelExact: "9007199254740993" }),
    ]);

    const [rows] = await pool.query(
      "SELECT id,weaponTrack,skillId,xpGrantedExact,levelExact FROM aurionProgressionReceipts WHERE userId=? ORDER BY id",
      [userId],
    );
    const stored = rows as Array<{ id: string; weaponTrack: string; skillId: string; xpGrantedExact: string; levelExact: string }>;
    expect(stored).toHaveLength(2);
    expect(stored.every(row => row.id.length === 64)).toBe(true);
    expect(stored.some(row => row.weaponTrack === "greatsword.two_handed.v3" && row.levelExact === "9007199254740993")).toBe(true);
    expect(stored.some(row => row.skillId === "chronomancy.temporal_anchor.v17" && row.levelExact === "18446744073709551617")).toBe(true);
    expect(stored.some(row => row.xpGrantedExact === "340282366920938463463374607431768211455")).toBe(true);
  });

  it("replays the same idempotency key unchanged and rejects changed bytes", async () => {
    const first = await recordProgressionReceipt(input());
    const replay = await recordProgressionReceipt(input());
    expect(first.applied).toBe(true);
    expect(replay).toMatchObject({ applied: false, id: first.id, receiptHash: first.receiptHash });
    await expect(recordProgressionReceipt(input({ levelExact: "9007199254740994" }))).rejects.toThrow("PROGRESSION_RECEIPT_IDEMPOTENCY_CONFLICT");
    expect(await (await getDb())!.select().from(aurionProgressionReceipts).where(eq(aurionProgressionReceipts.userId, userId))).toHaveLength(1);
  });

  it("fails closed if stored history resolves one account to more than one character", async () => {
    await recordProgressionReceipt(input());
    await pool.query(
      `INSERT INTO aurionProgressionReceipts
        (id,userId,characterId,actionKind,weaponTrack,skillId,resultReceiptId,sourceReceiptId,lootReceiptId,masteryEventId,xpGrantedExact,levelExact,ruleSetVersion,contentVersion,receiptHash,idempotencyKey)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "progression_" + "f".repeat(52), userId, "char-conflict", "skill_use", "none", "alchemy.transmutation.v2",
        "classless-result-conflict-0001", "wasd-source-conflict-0001", null, null, "1", "2",
        "wasd-classless-progression.v17", "aurion-content.v17", "e".repeat(64), "classless-progression:conflict:0001",
      ],
    );
    await expect(readConfirmedProgressionTracks(userId)).rejects.toThrow("PROGRESSION_CHARACTER_CONFLICT");
  });
});
