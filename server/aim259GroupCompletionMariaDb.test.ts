import { eq } from "drizzle-orm";
import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aurionGlobalWorldStates, playerProfiles, users, weaponLoadouts } from "../drizzle/schema";
import { aurionGroupCoordinator, aurionGroupParties, aurionGroupPlayers, aurionGroupReceipts, aurionGroupTickets } from "../drizzle/groupInstanceSchema";
import { aurionScopedMasteryEvents } from "../drizzle/professionPersistenceSchema";
import type { GroupCommand, GroupRole } from "../shared/groupInstanceProtocol";
import { getDb } from "./db";
import { commandGroupForUser, readGroupForUser } from "./groupInstancePersistence";
import { groupHash } from "./groupInstanceRules";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";

const suite = process.env.AURION_GROUP_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const ids = Array.from({ length: 5 }, (_, index) => 9259501 + index);

suite("AIM-259 atomic group completion mastery", () => {
  let pool: Pool;
  let isolated = false;

  async function clean() {
    if (!isolated) throw new Error("ISOLATED_GROUP_TEST_DATABASE_REQUIRED");
    await pool.query("DROP TRIGGER IF EXISTS aim259_abort_group_mastery");
    await pool.query("DELETE FROM aurionScopedMasteryEvents WHERE userId IN (?)", [ids]);
    for (const table of ["aurionGroupReceipts", "aurionGroupTickets", "aurionGroupParties", "aurionGroupPlayers", "aurionGroupCoordinator"]) {
      await pool.query(`DELETE FROM \`${table}\``);
    }
    await pool.query("DELETE FROM aurionGlobalWorldStates WHERE worldId='aim259-completion-world'");
    for (const table of ["weaponLoadouts", "playerProfiles"]) await pool.query(`DELETE FROM \`${table}\` WHERE userId IN (?)`, [ids]);
    await pool.query("DELETE FROM users WHERE id IN (?)", [ids]);
  }

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query("SELECT DATABASE() AS name");
    if (!(rows as Array<{ name: string }>)[0]?.name.endsWith("_group_test")) throw new Error("ISOLATED_GROUP_TEST_DATABASE_REQUIRED");
    if (!/^[a-f0-9]{40}$/.test(process.env.AURION_RELEASE_SHA ?? "")) throw new Error("EXACT_TEST_REVISION_REQUIRED");
    isolated = true;
  });

  beforeEach(async () => {
    await clean();
    const db = (await getDb())!;
    await db.insert(users).values(ids.map(id => ({ id, openId: `local:aim259_completion_${id}`, name: `Completion ${id}`, loginMethod: "local" })));
    await db.insert(playerProfiles).values(ids.map((userId, index) => ({ userId, selectedClass: (["unbound", "warden", "seer", "vanguard"] as const)[index % 4] })));
    await db.insert(weaponLoadouts).values(ids.map((userId, index) => ({ userId, weaponTrack: (["blade", "staff", "spear", "focus"] as const)[index % 4] })));
    const world = buildGlobalWorldPlan({ worldSeed: "AIM259-completion-world-seed", epoch: 4, activePlayerCount: 5, highWaterPlayerCount: 5 });
    await db.insert(aurionGlobalWorldStates).values({ worldId: "aim259-completion-world", worldSeed: world.worldSeed, epoch: world.epoch, activePlayerCount: 5, highWaterPlayerCount: 5, snapshotJson: JSON.stringify(world), snapshotHash: world.deterministicHash });
  });

  afterAll(async () => {
    if (!pool) return;
    if (isolated) await clean();
    await pool.end();
  });

  async function command(userId: number, action: GroupCommand["action"]) {
    const state = await readGroupForUser(userId);
    return commandGroupForUser(userId, { expectedRevision: state.player.revision, action });
  }

  async function equip(userId: number, role: GroupRole) {
    return command(userId, { kind: "equip", skills: role === "tank" ? ["guardian_stance"] : role === "healer" ? ["mending_light"] : [] });
  }

  async function join(userId: number, role: GroupRole) {
    const state = await readGroupForUser(userId);
    return commandGroupForUser(userId, {
      expectedRevision: state.player.revision,
      action: { kind: "join", role, dungeonId: "dungeon_aschengewoelbe", variant: "normal", qualificationHash: state.qualification.hash },
    });
  }

  async function readyAndEnter() {
    const roles = ["tank", "healer", "dps", "dps", "dps"] as const;
    for (let index = 0; index < ids.length; index += 1) await equip(ids[index]!, roles[index]!);
    await Promise.all(ids.map((id, index) => join(id, roles[index]!)));
    const party = (await readGroupForUser(ids[0]!)).party!;
    await Promise.all(ids.map(id => command(id, { kind: "ready", partyId: party.id, rosterHash: party.rosterHash, ready: true })));
    const ticket = (await readGroupForUser(ids[0]!)).ticket!;
    for (const id of ids) await command(id, { kind: "enter", ticketId: ticket.id, ticketHash: ticket.hash });
    return ticket;
  }

  async function stageFinalStrike() {
    const ticket = await readyAndEnter();
    const db = (await getDb())!;
    const row = (await db.select().from(aurionGroupParties).where(eq(aurionGroupParties.id, ticket.partyId)))[0]!;
    const stored = JSON.parse(row.stateJson);
    const staged = {
      ...stored,
      phase: "active",
      ticketId: ticket.id,
      instanceRevision: 37,
      bossIndex: ticket.bosses.length - 1,
      bossHp: ticket.playerDamage,
      health: ticket.roster.map(member => ({ userId: member.userId, hp: ticket.playerMaxHp })),
      lastActionAtMs: 0,
    };
    await db.update(aurionGroupParties).set({ stateJson: JSON.stringify(staged), stateHash: groupHash(staged) }).where(eq(aurionGroupParties.id, ticket.partyId));
    const actorUserId = ids[2]!;
    const actor = await readGroupForUser(actorUserId);
    const request: GroupCommand = {
      expectedRevision: actor.player.revision,
      action: { kind: "strike", ticketId: ticket.id, expectedInstanceRevision: staged.instanceRevision },
    };
    return { ticket, actorUserId, request, staged };
  }

  it("commits the final boss clear and exactly two scoped mastery events per real party member, with replay unchanged", async () => {
    const { ticket, actorUserId, request } = await stageFinalStrike();
    const first = await commandGroupForUser(actorUserId, request);
    expect(first.applied).toBe(true);
    expect(first.result.party).toMatchObject({ phase: "cleared", bossHp: 0, bossIndex: ticket.bosses.length });

    const db = (await getDb())!;
    const masteryRows = await db.select().from(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.professionReceiptId, ticket.id));
    expect(masteryRows).toHaveLength(10);
    for (const userId of ids) {
      const owned = masteryRows.filter(row => row.userId === userId);
      expect(owned).toHaveLength(2);
      expect(owned.map(row => row.scopeKey).sort()).toEqual([
        `v1:action:dungeon_completion:${ticket.dungeonId}`,
        `v1:combat:${ticket.dungeonId}`,
      ]);
      owned.forEach(row => {
        const event = JSON.parse(row.eventJson);
        expect(event).toMatchObject({ receiptId: ticket.id, serverValidated: true, useCountExact: "1" });
        expect(row.eventHash).toBe(groupHash(event));
      });
    }

    const [profiles] = await pool.query<Array<{ totalXp: number; aurionPoints: number }>>("SELECT totalXp,aurionPoints FROM playerProfiles WHERE userId IN (?) ORDER BY userId", [ids]);
    expect(profiles).toEqual(Array(5).fill({ totalXp: 0, aurionPoints: 0 }));

    const replay = await commandGroupForUser(actorUserId, request);
    expect(replay.applied).toBe(false);
    expect(replay.result).toEqual(first.result);
    expect(await db.select().from(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.professionReceiptId, ticket.id))).toHaveLength(10);
  });

  it("rolls back the boss clear, command receipt and all mastery evidence when MariaDB rejects the first mastery insert", async () => {
    const { ticket, actorUserId, request, staged } = await stageFinalStrike();
    await pool.query("CREATE TRIGGER aim259_abort_group_mastery BEFORE INSERT ON aurionScopedMasteryEvents FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AIM259_FORCED_MASTERY_ROLLBACK'");

    await expect(commandGroupForUser(actorUserId, request)).rejects.toMatchObject({ cause: { code: "ER_SIGNAL_EXCEPTION" } });
    const afterFailure = await readGroupForUser(actorUserId);
    expect(afterFailure.party).toMatchObject({ phase: "active", bossHp: staged.bossHp, bossIndex: staged.bossIndex, instanceRevision: staged.instanceRevision });
    const db = (await getDb())!;
    expect(await db.select().from(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.professionReceiptId, ticket.id))).toHaveLength(0);
    expect(await db.select().from(aurionGroupReceipts).where(eq(aurionGroupReceipts.userId, actorUserId))).toEqual(expect.not.arrayContaining([expect.objectContaining({ expectedRevision: request.expectedRevision })]));

    await pool.query("DROP TRIGGER aim259_abort_group_mastery");
    const retry = await commandGroupForUser(actorUserId, request);
    expect(retry.result.party?.phase).toBe("cleared");
    expect(await db.select().from(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.professionReceiptId, ticket.id))).toHaveLength(10);
  });
});
