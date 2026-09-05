import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGuildForFounder, getActiveGuildForUser } from "./db";
const suite = process.env.DATABASE_URL ? describe : describe.skip,
  userId = 9269111;
suite("AIM-269 atomic founder creation in isolated MariaDB", () => {
  let pool: Pool,
    isolated = false;
  async function clean() {
    if (!isolated) throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await pool.query("DROP TRIGGER IF EXISTS aim269_abort_founder");
    await pool.query("DELETE FROM guildMemberships WHERE userId=?", [userId]);
    await pool.query("DELETE FROM guilds WHERE founderUserId=?", [userId]);
    await pool.query("DELETE FROM playerProfiles WHERE userId=?", [userId]);
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test"))
      throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT DATABASE() AS name"
    );
    if (rows[0]?.name !== url.pathname.slice(1))
      throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });
  beforeEach(clean);
  afterAll(async () => {
    if (pool) {
      if (isolated) await clean();
      await pool.end();
    }
  });
  const input = { userId, name: "AIM269 Founder UI", tag: "A269UI" };
  it("concurrent identical founder requests resolve to one guild and membership", async () => {
    const [left, right] = await Promise.all([
      createGuildForFounder(input),
      createGuildForFounder(input),
    ]);
    expect(left.guildId).toBe(right.guildId);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM guildMemberships WHERE userId=? AND status='active'",
      [userId]
    );
    expect(Number(rows[0].count)).toBe(1);
    expect((await getActiveGuildForUser(userId))?.guild.id).toBe(left.guildId);
    await expect(
      createGuildForFounder({ ...input, name: "Different Guild", tag: "OTHER" })
    ).rejects.toThrow("already belongs");
  });
  it("rolls back a guild if founder membership cannot be persisted", async () => {
    await pool.query(
      `CREATE TRIGGER aim269_abort_founder BEFORE INSERT ON guildMemberships FOR EACH ROW BEGIN IF NEW.userId=${userId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AIM269_FORCED_ROLLBACK'; END IF; END`
    );
    await expect(createGuildForFounder(input)).rejects.toThrow();
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM guilds WHERE founderUserId=?",
      [userId]
    );
    expect(Number(rows[0].count)).toBe(0);
    await pool.query("DROP TRIGGER aim269_abort_founder");
    expect((await createGuildForFounder(input)).guildId).toMatch(
      /^guild_[a-f0-9]{48}$/
    );
  });
});
