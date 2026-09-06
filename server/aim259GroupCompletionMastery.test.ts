import { describe, expect, it } from "vitest";
import { GROUP_RULESET, type GroupParty, type GroupRole, type RosterMember } from "../shared/groupInstanceProtocol";
import { activityXpAwardExact } from "./aurionBalancingProtocol";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import { buildGroupCompletionMasteryPlan } from "./groupCompletionMastery";
import { groupHash, issueGroupTicket } from "./groupInstanceRules";
import {
  SCOPED_MASTERY_RULESET_VERSION,
  canonicalScopedMasteryKey,
  masteryKeys,
  resolveCoupledMasteries,
  type ScopedMasteryEvent,
  type ScopedMasteryKey,
  type ScopedMasteryState,
} from "./scopedMasteryProtocol";

function fixtureParty(): GroupParty {
  const roles: GroupRole[] = ["tank", "healer", "dps", "dps", "dps"];
  const roster: RosterMember[] = roles.map((role, index) => ({
    userId: index + 1,
    name: `Completion ${index + 1}`,
    role,
    ordinal: index + 1,
    qualificationHash: groupHash(["completion", index]),
    skills: role === "tank" ? ["guardian_stance"] : role === "healer" ? ["mending_light"] : [],
    weaponTrack: "blade",
  }));
  return {
    id: groupHash("aim259-completion-party"),
    revision: 10,
    sourceRevision: "a".repeat(40),
    dungeonId: "dungeon_aschengewoelbe",
    variant: "normal",
    roster,
    rosterHash: groupHash(roster),
    leaderUserId: roster[0]!.userId,
    phase: "ready",
    ticketId: null,
    instanceRevision: 0,
    bossIndex: 0,
    bossHp: 0,
    health: [],
    lastActionAtMs: 0,
  };
}

function clearedFixture() {
  const party = fixtureParty();
  const world = buildGlobalWorldPlan({ worldSeed: "AIM259-completion-world", epoch: 7, activePlayerCount: 5, highWaterPlayerCount: 5 });
  const ticket = issueGroupTicket(party, { snapshotJson: JSON.stringify(world), snapshotHash: world.deterministicHash });
  const cleared: GroupParty = {
    ...party,
    phase: "cleared",
    ticketId: ticket.id,
    instanceRevision: 17,
    bossIndex: ticket.bosses.length,
    bossHp: 0,
    health: party.roster.map(member => ({ userId: member.userId, hp: ticket.playerMaxHp })),
  };
  return { party: cleared, ticket };
}

function completionKeys(dungeonId: string): readonly ScopedMasteryKey[] {
  return [masteryKeys.combat(dungeonId), masteryKeys.action(`dungeon_completion:${dungeonId}`)];
}

function historicalState(userId: number, dungeonId: string, completions: number): readonly ScopedMasteryState[] {
  const keys = completionKeys(dungeonId);
  const events: ScopedMasteryEvent[] = [];
  for (let index = 0; index < completions; index += 1) {
    for (const key of keys) {
      events.push({
        receiptId: `history_${userId}_${index}_${key.scopeType}`,
        idempotencyKey: `history_event_${userId}_${index}_${key.scopeType}`,
        resolutionIndex: index + 1,
        key,
        amountExact: "250",
        useCountExact: "1",
        serverValidated: true,
        activeDurationTicks: 1,
        repetitionStreak: 0,
        distinctContextCount: 1,
        ruleSetVersion: SCOPED_MASTERY_RULESET_VERSION,
        contentVersion: GROUP_RULESET,
      });
    }
  }
  return resolveCoupledMasteries({ actorId: `player:${userId}`, keys, events });
}

describe("AIM-259 group completion mastery", () => {
  it("creates exactly two server-validated mastery events for each of the five confirmed members", () => {
    const { party, ticket } = clearedFixture();
    const plan = buildGroupCompletionMasteryPlan(party, ticket);
    expect(plan).toHaveLength(5);
    expect(plan.flatMap(member => member.events)).toHaveLength(10);
    for (const member of plan) {
      expect(member.keys.map(canonicalScopedMasteryKey)).toEqual([
        canonicalScopedMasteryKey(masteryKeys.combat(ticket.dungeonId)),
        canonicalScopedMasteryKey(masteryKeys.action(`dungeon_completion:${ticket.dungeonId}`)),
      ]);
      expect(new Set(member.events.map(event => event.idempotencyKey)).size).toBe(2);
      for (const event of member.events) {
        expect(event).toMatchObject({
          receiptId: ticket.id,
          serverValidated: true,
          activeDurationTicks: party.instanceRevision,
          repetitionStreak: 0,
          ruleSetVersion: SCOPED_MASTERY_RULESET_VERSION,
          contentVersion: GROUP_RULESET,
        });
        expect(event.contextMetricsExact).toMatchObject({ completions: "1", bosses: String(ticket.bosses.length), affixes: String(ticket.affixes.length), variant_normal: "1" });
      }
    }
  });

  it("derives awards from each persisted exact scope level instead of mutable profile level or the normalized ticket budget", () => {
    const { party, ticket } = clearedFixture();
    const userId = ticket.roster[0]!.userId;
    const prior = historicalState(userId, ticket.dungeonId, 6);
    const currentByUser = { [String(userId)]: prior };
    for (const member of ticket.roster.slice(1)) currentByUser[String(member.userId)] = historicalState(member.userId, ticket.dungeonId, 0);

    const plan = buildGroupCompletionMasteryPlan(party, ticket, currentByUser);
    const member = plan.find(entry => entry.userId === userId)!;
    const states = new Map(prior.map(state => [canonicalScopedMasteryKey(state.key), state]));
    for (const event of member.events) {
      const state = states.get(canonicalScopedMasteryKey(event.key))!;
      expect(event.amountExact).toBe(activityXpAwardExact({
        levelExact: state.progression.levelExact,
        scope: "combat_action",
        activity: "dungeon_completion",
        repetitionStreak: 6,
      }));
      expect(event.contextMetricsExact?.prior_completions).toBe("6");
    }
  });

  it("applies the versioned repetition curve from prior confirmed completions without double-penalizing the scoped event", () => {
    const { party, ticket } = clearedFixture();
    const fresh: Record<string, readonly ScopedMasteryState[]> = {};
    const repeated: Record<string, readonly ScopedMasteryState[]> = {};
    for (const member of ticket.roster) {
      fresh[String(member.userId)] = historicalState(member.userId, ticket.dungeonId, 0);
      repeated[String(member.userId)] = historicalState(member.userId, ticket.dungeonId, 20);
    }
    const first = buildGroupCompletionMasteryPlan(party, ticket, fresh)[0]!.events[0]!;
    const later = buildGroupCompletionMasteryPlan(party, ticket, repeated)[0]!.events[0]!;
    expect(BigInt(later.amountExact)).toBeLessThan(BigInt(first.amountExact));
    expect(later.repetitionStreak).toBe(0);
    expect(later.contextMetricsExact?.prior_completions).toBe("20");
  });

  it("fails closed unless the frozen ticket and persisted party prove a final cleared boss state", () => {
    const { party, ticket } = clearedFixture();
    for (const invalid of [
      { ...party, phase: "active" as const },
      { ...party, ticketId: "b".repeat(64) },
      { ...party, bossIndex: ticket.bosses.length - 1 },
      { ...party, bossHp: 1 },
      { ...party, instanceRevision: 0 },
    ]) expect(() => buildGroupCompletionMasteryPlan(invalid, ticket)).toThrow("GROUP_COMPLETION_EVIDENCE_REQUIRED");
  });
});
