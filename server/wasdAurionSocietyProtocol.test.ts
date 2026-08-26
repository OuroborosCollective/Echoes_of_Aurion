import { describe, expect, it } from "vitest";
import { resolveAchievements, resolveAge, resolveFamilyRecord, resolvePartyAction, resolveRelationship } from "./wasdAurionSocietyProtocol";

describe("wasdAurionSocietyProtocol", () => {
  it("ages entities only from a receipt-bound resolution", () => {
    expect(resolveAge({ entityId: "lyra", currentAge: 31, years: 2, receiptId: "age-1", resolutionIndex: 9 })).toMatchObject({ age: 33 });
  });

  it("clamps relationships and derives stable social tiers", () => {
    const relationship = resolveRelationship({ sourceId: "lyra", targetId: "player", currentValue: 0.6, delta: 0.3, receiptId: "relationship-1" });
    expect(relationship).toMatchObject({ value: 0.9, tier: "devoted" });
  });

  it("creates deterministic family records from sorted parents, house and resolution", () => {
    const first = resolveFamilyRecord({ parents: ["orun", "lyra"], houseId: "windhollow-7", resolutionIndex: 12, receiptId: "family-1" });
    const second = resolveFamilyRecord({ parents: ["lyra", "orun"], houseId: "windhollow-7", resolutionIndex: 12, receiptId: "family-1" });
    expect(first).toEqual(second);
  });

  it("unlocks eligible achievements idempotently", () => {
    const state = resolveAchievements({ playerId: "player", current: ["first_blood"], candidates: [{ id: "first_blood", eligible: true }, { id: "master_smith", eligible: true }], receiptId: "achievement-1" });
    expect(state.unlocked).toEqual(["first_blood", "master_smith"]);
    expect(state.newlyUnlocked).toEqual(["master_smith"]);
  });

  it("enforces Wasd party leadership and capacity without mutable module state", () => {
    const created = resolvePartyAction({ action: "create", actorId: "lyra", receiptId: "party-1", resolutionIndex: 3 });
    expect(created.state).toBe("resolved");
    const party = created.party!;
    const invited = resolvePartyAction({ action: "invite", actorId: "lyra", targetId: "orun", party, receiptId: "party-2", resolutionIndex: 4 });
    expect(invited.party?.members).toEqual(["lyra", "orun"]);
    expect(resolvePartyAction({ action: "invite", actorId: "orun", targetId: "player", party: invited.party!, receiptId: "party-3", resolutionIndex: 5 })).toMatchObject({ state: "rejected", reason: "not_leader" });
    const leave = resolvePartyAction({ action: "leave", actorId: "lyra", party: invited.party!, receiptId: "party-4", resolutionIndex: 6 });
    expect(leave.party).toMatchObject({ leaderId: "orun", members: ["orun"] });
  });
});
