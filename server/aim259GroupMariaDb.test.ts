import { and, eq } from "drizzle-orm";
import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aurionGlobalWorldStates, playerProfiles, users, weaponLoadouts } from "../drizzle/schema";
import { aurionGroupCoordinator, aurionGroupParties, aurionGroupPlayers, aurionGroupReceipts, aurionGroupTickets } from "../drizzle/groupInstanceSchema";
import { getDb } from "./db";
import { commandGroupForUser, readGroupForUser } from "./groupInstancePersistence";
import { groupHash } from "./groupInstanceRules";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import type { GroupCommand, GroupRole } from "../shared/groupInstanceProtocol";

const suite = process.env.AURION_GROUP_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const ids = Array.from({ length: 7 }, (_, i) => 9259001 + i);
suite("AIM-259 real MariaDB queue, readiness, admission and recovery", () => {
  let pool: Pool;
  let isolated = false;
  async function clean() {
    if (!isolated) throw new Error("ISOLATED_GROUP_TEST_DATABASE_REQUIRED");
    for (const table of ["aurionGroupReceipts", "aurionGroupTickets", "aurionGroupParties", "aurionGroupPlayers", "aurionGroupCoordinator"]) await pool.query(`DELETE FROM \`${table}\``);
    await pool.query("DROP TRIGGER IF EXISTS aim259_abort_ticket");
    await pool.query("DELETE FROM aurionGlobalWorldStates WHERE worldId='aim259-fixture-world'");
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
    await db.insert(users).values(ids.map(id => ({ id, openId: `local:aim259_fixture_${id}`, name: `AIM259 ${id}`, loginMethod: "local" })));
    await db.insert(playerProfiles).values(ids.map((userId, i) => ({ userId, selectedClass: (["unbound", "warden", "seer", "vanguard"] as const)[i % 4] })));
    await db.insert(weaponLoadouts).values(ids.map((userId, i) => ({ userId, weaponTrack: (["blade", "staff", "spear", "focus"] as const)[i % 4] })));
    const world = buildGlobalWorldPlan({ worldSeed: "AIM259-explicit-isolated-world", epoch: 0, activePlayerCount: 5, highWaterPlayerCount: 5 });
    await db.insert(aurionGlobalWorldStates).values({ worldId: "aim259-fixture-world", worldSeed: world.worldSeed, epoch: world.epoch, activePlayerCount: 5, highWaterPlayerCount: 5, snapshotJson: JSON.stringify(world), snapshotHash: world.deterministicHash });
  });
  afterAll(async () => { if (pool) { if (isolated) await clean(); await pool.end(); } });
  async function command(userId: number, action: GroupCommand["action"]) {
    return commandGroupForUser(userId, { expectedRevision: (await readGroupForUser(userId)).player.revision, action });
  }
  async function equip(userId: number, role: GroupRole) {
    return command(userId, { kind: "equip", skills: role === "tank" ? ["guardian_stance"] : role === "healer" ? ["mending_light"] : [] });
  }
  async function join(userId: number, role: GroupRole, variant: "normal" | "elite" = "normal") {
    const state = await readGroupForUser(userId);
    return commandGroupForUser(userId, { expectedRevision: state.player.revision, action: { kind: "join", role, dungeonId: "dungeon_aschengewoelbe", variant, qualificationHash: state.qualification.hash } });
  }
  async function form() {
    const roles = ["tank", "healer", "dps", "dps", "dps"] as const;
    for (let i = 0; i < 5; i++) await equip(ids[i]!, roles[i]!);
    await Promise.all(ids.slice(0, 5).map((id, i) => join(id, roles[i]!)));
    return (await readGroupForUser(ids[0]!)).party!;
  }
  async function readyAll() {
    const party = await form();
    await Promise.all(ids.slice(0, 5).map(id => command(id, { kind: "ready", partyId: party.id, rosterHash: party.rosterHash, ready: true })));
    return (await readGroupForUser(ids[0]!)).ticket!;
  }

  it("matches five concurrent real profiles exactly once, independently of class and weapon", async () => {
    const party = await form();
    const states = await Promise.all(ids.slice(0, 5).map(readGroupForUser));
    expect(new Set(states.map(s => s.party?.id))).toEqual(new Set([party.id]));
    expect(party.roster.map(m => m.role).sort()).toEqual(["dps", "dps", "dps", "healer", "tank"]);
    const db = (await getDb())!;
    expect(await db.select().from(aurionGroupParties)).toHaveLength(1);
    expect(await db.select().from(aurionGroupTickets)).toHaveLength(0);
    await expect(join(ids[0]!, "tank")).rejects.toThrow("ALREADY_QUEUED_OR_GROUPED");
  });
  it("replays a lost/parallel response unchanged and rejects a different command on the consumed revision", async () => {
    const request: GroupCommand = { expectedRevision: 0, action: { kind: "equip", skills: ["mending_light"] } };
    const results = await Promise.all([commandGroupForUser(ids[1]!, request), commandGroupForUser(ids[1]!, request)]);
    expect(results.map(r => r.applied).sort()).toEqual([false, true]);
    expect(results[0]!.result).toEqual(results[1]!.result);
    expect(results[0]!.receiptId).toBe(results[1]!.receiptId);
    await expect(commandGroupForUser(ids[1]!, { ...request, action: { kind: "equip", skills: [] } })).rejects.toThrow("REPLAY_CONFLICT");
    expect(await (await getDb())!.select().from(aurionGroupReceipts)).toHaveLength(1);
  });
  it("rejects a forged healer role and expires stale queue leases without filling missing roles", async () => {
    await expect(join(ids[1]!, "healer")).rejects.toThrow("ROLE_NOT_QUALIFIED");
    await equip(ids[0]!, "tank"); await join(ids[0]!, "tank");
    const db = (await getDb())!;
    const row = (await db.select().from(aurionGroupPlayers).where(eq(aurionGroupPlayers.userId, ids[0]!)))[0]!;
    const expiredFixture = { ...JSON.parse(row.stateJson), leaseUntilMs: 1 };
    await db.update(aurionGroupPlayers).set({ stateJson: JSON.stringify(expiredFixture), stateHash: groupHash(expiredFixture) }).where(eq(aurionGroupPlayers.userId, ids[0]!));
    await equip(ids[1]!, "healer"); await join(ids[1]!, "healer");
    for (const id of ids.slice(2, 5)) await join(id, "dps");
    expect((await readGroupForUser(ids[0]!)).player.status).toBe("idle");
    expect(await db.select().from(aurionGroupParties)).toHaveLength(0);
  });
  it("cancels queue membership on skill changes and rechecks an independently changed weapon before matching", async () => {
    await equip(ids[1]!, "healer"); await join(ids[1]!, "healer");
    await command(ids[1]!, { kind: "equip", skills: [] });
    expect((await readGroupForUser(ids[1]!)).player.status).toBe("idle");
    await equip(ids[0]!, "tank"); await join(ids[0]!, "tank");
    await (await getDb())!.update(weaponLoadouts).set({ weaponTrack: "focus" }).where(eq(weaponLoadouts.userId, ids[0]!));
    await join(ids[2]!, "dps");
    expect((await readGroupForUser(ids[0]!)).player.status).toBe("idle");
  });
  it("keeps dungeon variants isolated", async () => {
    await equip(ids[0]!, "tank"); await equip(ids[1]!, "healer");
    await join(ids[0]!, "tank", "elite"); await join(ids[1]!, "healer");
    for (const id of ids.slice(2, 5)) await join(id, "dps");
    expect(await (await getDb())!.select().from(aurionGroupParties)).toHaveLength(0);
  });
  it("binds five simultaneous ready consents to one immutable ticket and supports exit/rejoin", async () => {
    const ticket = await readyAll();
    expect(ticket.sourceRevision).toBe(process.env.AURION_RELEASE_SHA);
    for (const id of ids.slice(0, 5)) await command(id, { kind: "enter", ticketId: ticket.id, ticketHash: ticket.hash });
    const states = await Promise.all(ids.slice(0, 5).map(readGroupForUser));
    states.forEach(state => { expect(state.ticket).toEqual(ticket); expect(state.enteredUserIds).toEqual(ids.slice(0, 5)); });
    await command(ids[1]!, { kind: "exit" });
    expect((await readGroupForUser(ids[0]!)).enteredUserIds).not.toContain(ids[1]);
    await command(ids[1]!, { kind: "enter", ticketId: ticket.id, ticketHash: ticket.hash });
    expect((await readGroupForUser(ids[1]!)).ticket).toEqual(ticket);
    expect(await (await getDb())!.select().from(aurionGroupTickets)).toHaveLength(1);
    await expect(command(ids[5]!, { kind: "enter", ticketId: ticket.id, ticketHash: ticket.hash })).rejects.toThrow("MEMBERSHIP_REQUIRED");
  });
  it("rolls back final ready state, ticket and receipt together on a real SQL fault", async () => {
    const party = await form();
    for (const id of ids.slice(0, 4)) await command(id, { kind: "ready", partyId: party.id, rosterHash: party.rosterHash, ready: true });
    const before = await readGroupForUser(ids[4]!);
    await pool.query("CREATE TRIGGER aim259_abort_ticket BEFORE INSERT ON aurionGroupTickets FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AIM259_FORCED_ROLLBACK'");
    await expect(command(ids[4]!, { kind: "ready", partyId: party.id, rosterHash: party.rosterHash, ready: true })).rejects.toMatchObject({ cause: { code: "ER_SIGNAL_EXCEPTION" } });
    expect(await readGroupForUser(ids[4]!)).toEqual(before);
    expect(await (await getDb())!.select().from(aurionGroupTickets)).toHaveLength(0);
    await pool.query("DROP TRIGGER aim259_abort_ticket");
    await command(ids[4]!, { kind: "ready", partyId: party.id, rosterHash: party.rosterHash, ready: true });
    expect((await readGroupForUser(ids[4]!)).ticket).not.toBeNull();
  });
  it("blocks stale ready rosters and qualification changes, and releases all members on a confirmed leave", async () => {
    const party = await form();
    await expect(command(ids[0]!, { kind: "ready", partyId: party.id, rosterHash: "a".repeat(64), ready: true })).rejects.toThrow("ROSTER_CHANGED");
    await expect(command(ids[1]!, { kind: "equip", skills: [] })).rejects.toThrow("LEAVE_BEFORE_SKILL_CHANGE");
    await (await getDb())!.update(weaponLoadouts).set({ weaponTrack: "focus" }).where(eq(weaponLoadouts.userId, ids[0]!));
    await expect(command(ids[1]!, { kind: "ready", partyId: party.id, rosterHash: party.rosterHash, ready: true })).rejects.toThrow("QUALIFICATION_CHANGED");
    await command(ids[0]!, { kind: "leave", partyId: party.id, rosterHash: party.rosterHash });
    for (const id of ids.slice(0, 5)) expect((await readGroupForUser(id)).player).toMatchObject({ status: "idle", partyId: null, ready: false });
  });
  it("rejects modified ticket bytes and a changed runtime revision before admission", async () => {
    const ticket = await readyAll();
    const db = (await getDb())!;
    await db.update(aurionGroupTickets).set({ ticketJson: JSON.stringify({ ...ticket, playerDamage: ticket.playerDamage + 1 }) }).where(eq(aurionGroupTickets.id, ticket.id));
    await expect(readGroupForUser(ids[0]!)).rejects.toThrow("CORRUPT");
    await db.update(aurionGroupTickets).set({ ticketJson: JSON.stringify(ticket) }).where(eq(aurionGroupTickets.id, ticket.id));
    const originalRevision = process.env.AURION_RELEASE_SHA;
    try {
      process.env.AURION_RELEASE_SHA = "f".repeat(40);
      await expect(command(ids[0]!, { kind: "enter", ticketId: ticket.id, ticketHash: ticket.hash })).rejects.toThrow("RUNTIME_REVISION_CHANGED");
    } finally { process.env.AURION_RELEASE_SHA = originalRevision; }
  });
  it("persists actual group damage and healing once without touching existing rewards", async () => {
    const ticket = await readyAll();
    for (const id of ids.slice(0, 5)) await command(id, { kind: "enter", ticketId: ticket.id, ticketHash: ticket.hash });
    const attack = await command(ids[2]!, { kind: "strike", ticketId: ticket.id, expectedInstanceRevision: 0 });
    const damagedHp = attack.result.party!.health.find(m => m.userId === ids[0])!.hp;
    expect(damagedHp).toBeLessThan(ticket.playerMaxHp);
    // Real time is an admission boundary, not a fabricated simulation clock.
    await new Promise(resolve => setTimeout(resolve, 1_010));
    const state = await readGroupForUser(ids[1]!);
    const request: GroupCommand = { expectedRevision: state.player.revision, action: { kind: "heal", targetUserId: ids[0]!, ticketId: ticket.id, expectedInstanceRevision: 1 } };
    const healed = await commandGroupForUser(ids[1]!, request);
    expect(healed.result.party!.health.find(m => m.userId === ids[0])!.hp).toBe(Math.min(ticket.playerMaxHp, damagedHp + ticket.healAmount));
    expect((await commandGroupForUser(ids[1]!, request)).applied).toBe(false);
    await expect(command(ids[2]!, { kind: "strike", ticketId: ticket.id, expectedInstanceRevision: 0 })).rejects.toThrow("STALE_INSTANCE");
    const [rewards] = await pool.query("SELECT totalXp,aurionPoints FROM playerProfiles WHERE userId IN (?)", [ids.slice(0, 5)]);
    expect(rewards).toEqual(Array(5).fill({ totalXp: 0, aurionPoints: 0 }));
  });
});
