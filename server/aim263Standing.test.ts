import { describe, expect, it } from "vitest";
import { standingReadbackSchema, standingTier } from "../shared/npcStanding";
import { relationshipEvents } from "./npcStandingPersistence";
import { resolveCoupledMasteries } from "./scopedMasteryProtocol";

describe("receipt-derived NPC and faction standing", () => {
  it("uses all seven AX1 boundaries and rejects non-finite or fractional scores", () => {
    expect([-100,-76,-75,-41,-40,-11,-10,19,20,49,50,79,80,100].map(standingTier)).toEqual(["HOSTILE","HOSTILE","OUTCAST","OUTCAST","DISTRUSTED","DISTRUSTED","NEUTRAL","NEUTRAL","RESPECTED","RESPECTED","HONORED","HONORED","EXALTED","EXALTED"]);
    for (const score of [NaN,Infinity,100.1,101,-101]) expect(() => standingTier(score)).toThrow();
  });
  it("replays coupled social/relation mastery once and binds identities to owner and source", () => {
    const input = { userId: 1, receiptId: "confirmed-session", resolutionIndex: 8, kind: "npc_relation" as const, targetId: "lyra", sourceKind: "native_quest" as const };
    const events = relationshipEvents(input);
    expect(events).toEqual(relationshipEvents(input));
    const keys = events.map(e => e.key);
    const first = resolveCoupledMasteries({ actorId: "player:1", keys, events });
    const repeated = resolveCoupledMasteries({ actorId: "player:1", keys, events: [...events,...events] });
    expect(repeated).toEqual(first); expect(first.every(s => s.progression.totalXpExact === "4" && s.lifetimeUsesExact === "1")).toBe(true);
    expect(events.find(e => e.key.scopeType === "npc_relation")?.contextMetricsExact).toEqual({ standing_positive: "5" });
    expect(relationshipEvents({ ...input, userId: 2 })[0].idempotencyKey).not.toBe(events[0].idempotencyKey);
    expect(() => relationshipEvents({ ...input, targetId: "invented" })).toThrow();
    expect(() => relationshipEvents({ ...input, sourceKind: "faction_quest" })).toThrow();
  });
  it("does not accept inconsistent standing projections", () => {
    expect(standingReadbackSchema.safeParse({ userId: 1, social: [], entries: [{ kind: "npc_relation", id: "lyra", score: 0, tier: "EXALTED", sourceCount: 0, xpExact: "0", levelExact: "1" }] }).success).toBe(false);
  });
});
