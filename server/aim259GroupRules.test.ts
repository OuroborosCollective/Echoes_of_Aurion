import { describe, expect, it } from "vitest";
import { GROUP_RULESET, groupCommandSchema, groupReadmodelSchema, type GroupParty, type GroupRole, type RosterMember } from "../shared/groupInstanceProtocol";
import { assertGroupRoster, groupCatalog, groupHash, groupQualification, issueGroupTicket, oldestCompleteGroup, resolveGroupExchange, verifyGroupTicket } from "./groupInstanceRules";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";

const q = (skills: ("mending_light" | "guardian_stance")[], weaponTrack: string | null = "blade", selectedClass = "unbound") => groupQualification({ userId: 1, level: 1, selectedClass, weaponTrack, skills });
export function fixtureParty(): GroupParty {
  const roles: GroupRole[] = ["tank", "healer", "dps", "dps", "dps"];
  const roster: RosterMember[] = roles.map((role, i) => ({ userId: i + 1, name: `Fixture ${i + 1}`, role, ordinal: i + 1, qualificationHash: groupHash([i]), skills: role === "tank" ? ["guardian_stance"] : role === "healer" ? ["mending_light"] : [], weaponTrack: "blade" }));
  return { id: groupHash("fixture-party"), revision: 1, sourceRevision: "a".repeat(40), dungeonId: "dungeon_aschengewoelbe", variant: "normal", roster, rosterHash: groupHash(roster), leaderUserId: 1, phase: "ready", ticketId: null, instanceRevision: 0, bossIndex: 0, bossHp: 0, health: [], lastActionAtMs: 0 };
}
function ticketFor(party = fixtureParty()) {
  const world = buildGlobalWorldPlan({ worldSeed: "AIM259-explicit-isolated-world", epoch: 3, activePlayerCount: 5, highWaterPlayerCount: 5 });
  return issueGroupTicket(party, { snapshotJson: JSON.stringify(world), snapshotHash: world.deterministicHash });
}

describe("AIM-259 real role and instance contracts", () => {
  it("requires the equipped heal skill across every class and weapon, including unarmed", () => {
    for (const selectedClass of ["unbound", "vanguard", "seer", "warden"]) for (const weapon of ["blade", "staff", "spear", "focus", null]) {
      expect(q([], weapon, selectedClass).roles).not.toContain("healer");
      expect(q(["mending_light"], weapon, selectedClass).roles).toContain("healer");
      expect(q(["guardian_stance"], weapon, selectedClass).roles).toContain("tank");
    }
    expect(q(["mending_light"]).hash).not.toBe(q([]).hash);
    expect(q([], "staff").hash).not.toBe(q([], "blade").hash);
  });
  it("forms exactly min(T,H,floor(D/3)) disjoint complete parties, exhaustively", () => {
    for (let tanks = 0; tanks <= 5; tanks++) for (let healers = 0; healers <= 5; healers++) for (let damage = 0; damage <= 15; damage++) {
      let entries = ([...Array(tanks).fill("tank"), ...Array(healers).fill("healer"), ...Array(damage).fill("dps")] as GroupRole[]).map((role, i) => ({ userId: i + 1, ordinal: i + 1, role }));
      let formed = 0;
      const used = new Set<number>();
      for (;;) {
        const group = oldestCompleteGroup([...entries].reverse());
        if (!group.length) break;
        expect(group).toHaveLength(5);
        group.forEach(m => { expect(used.has(m.userId)).toBe(false); used.add(m.userId); });
        entries = entries.filter(m => !used.has(m.userId)); formed++;
      }
      expect(formed).toBe(Math.min(tanks, healers, Math.floor(damage / 3)));
    }
  });
  it("keeps oldest eligible players and refuses duplicate identities or ordinals", () => {
    const entries = ["tank", "tank", "healer", "dps", "dps", "dps", "dps"].map((role, i) => ({ userId: i + 1, ordinal: i + 1, role: role as GroupRole }));
    expect(oldestCompleteGroup(entries).map(m => m.userId)).toEqual([1, 3, 4, 5, 6]);
    expect(() => oldestCompleteGroup([...entries, entries[0]!])).toThrow("CORRUPT");
    expect(() => oldestCompleteGroup(entries.map(m => ({ ...m, ordinal: 1 })))).toThrow("CORRUPT");
    expect(() => oldestCompleteGroup(Array.from({ length: 501 }, (_, i) => ({ userId: i + 1, ordinal: i + 1, role: "dps" as const })))).toThrow("BUDGET");
  });
  it("issues identical ticket bytes from a real deterministic world and frozen roster", () => {
    const ticket = ticketFor();
    expect(ticketFor()).toEqual(ticket);
    expect(verifyGroupTicket(JSON.parse(JSON.stringify(ticket)))).toEqual(ticket);
    expect(ticket.roster).toHaveLength(5);
    expect(new Set(ticket.rooms.map(r => r.hash)).size).toBe(ticket.rooms.length);
    expect(() => verifyGroupTicket({ ...ticket, sourceRevision: "b".repeat(40) })).toThrow("CORRUPT");
    expect(() => verifyGroupTicket({ ...ticket, bosses: [{ ...ticket.bosses[0], hp: 1 }, ...ticket.bosses.slice(1)] })).toThrow("CORRUPT");
    expect(() => assertGroupRoster([...ticket.roster.slice(0, 4), ticket.roster[0]!], ticket.rosterHash)).toThrow("CORRUPT");
    expect(() => issueGroupTicket(fixtureParty(), { snapshotJson: "{}", snapshotHash: "0".repeat(64) })).toThrow();
  });
  it("heals actual shared damage only with an equipped skill, clamps HP and rejects foreign/dead/full targets", () => {
    const party = fixtureParty(), ticket = ticketFor(party);
    const active: GroupParty = { ...party, phase: "active", ticketId: ticket.id, bossHp: ticket.bosses[0]!.hp, health: party.roster.map(m => ({ userId: m.userId, hp: ticket.playerMaxHp })) };
    const ids = party.roster.map(m => m.userId);
    const damaged = resolveGroupExchange(active, ticket, 3, { kind: "strike" }, ids);
    expect(damaged.health[0]!.hp).toBeLessThan(ticket.playerMaxHp);
    const healed = resolveGroupExchange(damaged, ticket, 2, { kind: "heal", targetUserId: 1 }, ids);
    expect(healed.health[0]!.hp).toBe(Math.min(ticket.playerMaxHp, damaged.health[0]!.hp + ticket.healAmount));
    expect(() => resolveGroupExchange(damaged, ticket, 3, { kind: "heal", targetUserId: 1 }, ids)).toThrow("SKILL_REQUIRED");
    expect(() => resolveGroupExchange(damaged, ticket, 2, { kind: "heal", targetUserId: 999 }, ids)).toThrow("TARGET_INVALID");
    expect(() => resolveGroupExchange(active, ticket, 2, { kind: "heal", targetUserId: 1 }, ids)).toThrow("TARGET_FULL");
    expect(() => resolveGroupExchange(damaged, ticket, 2, { kind: "heal", targetUserId: 1 }, [2, 3])).toThrow("TARGET_INVALID");
    expect(active.health[0]!.hp).toBe(ticket.playerMaxHp);
  });
  it("rejects client rewards, fabricated roles and user substitution at the input boundary", () => {
    expect(groupCommandSchema.safeParse({ expectedRevision: 0, userId: 42, action: { kind: "equip", skills: ["mending_light"] } }).success).toBe(false);
    expect(groupCommandSchema.safeParse({ expectedRevision: 0, action: { kind: "strike", ticketId: "a".repeat(64), expectedInstanceRevision: 0, rewardXP: 1000 } }).success).toBe(false);
    expect(groupCommandSchema.safeParse({ expectedRevision: 0, action: { kind: "equip", skills: ["mending_light", "mending_light"] } }).success).toBe(false);
    expect(groupReadmodelSchema.safeParse({ player: { userId: 1 }, party: { roster: [] } }).success).toBe(false);
  });
  it("rejects foreign, duplicated or contradictory membership before the client can render it", () => {
    const party = fixtureParty(), ticket = ticketFor(party), member = party.roster[0]!;
    const state = {
      ruleset: GROUP_RULESET, sourceRevision: party.sourceRevision,
      player: { userId: 1, revision: 4, skills: member.skills, status: "entered", queueKey: null, ordinal: 1, role: member.role, qualificationHash: member.qualificationHash, leaseUntilMs: 0, partyId: party.id, ready: true },
      qualification: { hash: member.qualificationHash, roles: ["tank", "dps"], weaponTrack: "blade" },
      catalog: groupCatalog.dungeons.map(d => ({ id: d.id, label: d.label })),
      party: { ...party, phase: "active", ticketId: ticket.id, bossHp: ticket.bosses[0]!.hp, health: party.roster.map(m => ({ userId: m.userId, hp: ticket.playerMaxHp })) },
      readyUserIds: [1, 2, 3, 4, 5], enteredUserIds: [1], ticket,
    };
    expect(groupReadmodelSchema.safeParse(state).success).toBe(true);
    for (const malformed of [
      { ...state, player: { ...state.player, userId: 999 } },
      { ...state, ticket: { ...ticket, partyId: "b".repeat(64) } },
      { ...state, readyUserIds: [1, 1, 3, 4, 5] },
      { ...state, enteredUserIds: [999] },
      { ...state, party: { ...state.party, health: Array(5).fill(state.party.health[0]) } },
      { ...state, ticket: null },
    ]) expect(groupReadmodelSchema.safeParse(malformed).success).toBe(false);
    // A changed deployment must remain readable so the party can be left;
    // server admission and the UI action gate reject that obsolete runtime.
    expect(groupReadmodelSchema.safeParse({ ...state, sourceRevision: "b".repeat(40) }).success).toBe(true);
  });
});
