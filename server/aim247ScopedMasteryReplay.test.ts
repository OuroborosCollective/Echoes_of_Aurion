import { describe, expect, it } from "vitest";
import {
  SCOPED_MASTERY_RULESET_VERSION,
  canonicalScopedMasteryKey,
  masteryKeys,
  resolveScopedMastery,
  type ScopedMasteryEvent,
  type ScopedMasteryKey,
} from "./scopedMasteryProtocol";

const confirmedEvent = (overrides: Partial<ScopedMasteryEvent> = {}): ScopedMasteryEvent => ({
  receiptId: "combat_receipt_42",
  idempotencyKey: "combat_action_42",
  resolutionIndex: 42,
  key: masteryKeys.combat("perfect_parry"),
  amountExact: "25",
  useCountExact: "1",
  qualityDeltaExact: "2",
  contextMetricsExact: { successful_parries: "1" },
  serverValidated: true,
  activeDurationTicks: 1,
  repetitionStreak: 0,
  distinctContextCount: 1,
  ruleSetVersion: SCOPED_MASTERY_RULESET_VERSION,
  contentVersion: "aim247-content.v1",
  ...overrides,
});

describe("AIM-247 persisted mastery replay boundary", () => {
  it("rejects an unsupported scoped-key version at the canonical boundary", () => {
    const unsupported = { version: 2, scopeType: "combat", scopeId: "perfect_parry" } as unknown as ScopedMasteryKey;
    expect(() => canonicalScopedMasteryKey(unsupported)).toThrow("unsupported mastery key version");
  });

  it("replays an identical persisted event without granting XP or uses twice", () => {
    const event = confirmedEvent();
    const first = resolveScopedMastery({ actorId: "user:42", key: event.key, events: [event] });
    const replay = resolveScopedMastery({ actorId: "user:42", key: event.key, current: first, events: [event] });
    expect(replay).toEqual(first);
    expect(replay.progression.totalXpExact).toBe("25");
    expect(replay.lifetimeUsesExact).toBe("1");
    expect(replay.appliedEvents).toHaveLength(1);
  });

  it("fails closed when one idempotency key is rebound to another receipt", () => {
    const event = confirmedEvent();
    const first = resolveScopedMastery({ actorId: "user:42", key: event.key, events: [event] });
    expect(() => resolveScopedMastery({
      actorId: "user:42",
      key: event.key,
      current: first,
      events: [confirmedEvent({ receiptId: "combat_receipt_43" })],
    })).toThrow("MASTERY_IDEMPOTENCY_CONFLICT");
  });

  it("fails closed when one receipt is replayed under another idempotency key", () => {
    const event = confirmedEvent();
    const first = resolveScopedMastery({ actorId: "user:42", key: event.key, events: [event] });
    expect(() => resolveScopedMastery({
      actorId: "user:42",
      key: event.key,
      current: first,
      events: [confirmedEvent({ idempotencyKey: "combat_action_43" })],
    })).toThrow("MASTERY_IDEMPOTENCY_CONFLICT");
  });

  it("does not allow a persisted state to move between actors or scopes", () => {
    const event = confirmedEvent();
    const first = resolveScopedMastery({ actorId: "user:42", key: event.key, events: [event] });
    expect(() => resolveScopedMastery({ actorId: "user:43", key: event.key, current: first, events: [] })).toThrow("mastery current actor mismatch");
    expect(() => resolveScopedMastery({ actorId: "user:42", key: masteryKeys.combat("shield_block"), current: first, events: [] })).toThrow("mastery current scope mismatch");
  });
});
