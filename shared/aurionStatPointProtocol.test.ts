import { describe, expect, it } from "vitest";
import { aurionStatAttributes, resolveAurionStatWallet, confirmAurionStatAllocation } from "./aurionStatPointProtocol";

const base = {
  userId: 7,
  character: { levelExact: "10", sourceReceiptId: "confirmed:char-level-10" },
  masteries: [
    { trackId: "blade_mastery", levelExact: "5", sourceReceiptId: "confirmed:blade-5" },
    { trackId: "smithing", levelExact: "20", sourceReceiptId: "confirmed:smithing-20" },
  ],
  allocations: [],
} as const;

describe("Aurion stat point wallet — confirmed-only and exact", () => {
  it("uses Wolfram cross-checked +2 per character level and +1 per weapon mastery level", () => {
    const state = resolveAurionStatWallet(base);
    expect(state.earnedExact).toBe("22");
    expect(state.availableExact).toBe("22");
    expect(state.spentExact).toBe("0");
    expect(state.unconfiguredProgressions).toEqual(["smithing"]);
    expect(state.attributes.find(x => x.key === "strength")).toMatchObject({ baselineExact: "10", allocatedExact: "0", totalExact: "10" });
    expect(aurionStatAttributes).toContain("stamina");
    expect(aurionStatAttributes).toContain("treatment");
  });
  it("never fabricates awards from a missing character receipt or unknown progression rates", () => {
    const state = resolveAurionStatWallet({ ...base, character: null, masteries: [{ trackId: "council", levelExact: "999", sourceReceiptId: "confirmed:council" }] });
    expect(state.earnedExact).toBe("0");
    expect(state.unconfiguredProgressions).toEqual(["council"]);
  });
  it("deduplicates multiple confirmed snapshots of the same weapon by highest exact level", () => {
    const state = resolveAurionStatWallet({
      ...base,
      masteries: [
        { trackId: "blade_mastery", levelExact: "4", sourceReceiptId: "a" },
        { trackId: "blade_mastery", levelExact: "5", sourceReceiptId: "b" },
        { trackId: "blade_mastery", levelExact: "5", sourceReceiptId: "b" },
        { trackId: "bow_mastery", levelExact: "2", sourceReceiptId: "c" },
      ],
    });
    expect(state.earnedExact).toBe("23");
  });
  it("spends exactly once and prevents overspend, even at arbitrary precision", () => {
    const original = resolveAurionStatWallet(base);
    const spend = confirmAurionStatAllocation(original, "strength", "point:001");
    expect(spend.key).toBe("strength");
    const after = resolveAurionStatWallet({ ...base, allocations: [spend] });
    expect(after.availableExact).toBe("21");
    expect(after.attributes.find(x => x.key === "strength")?.totalExact).toBe("11");
    expect(() => resolveAurionStatWallet({ ...base, allocations: [spend, spend] })).toThrow("AURION_STAT_DUPLICATE_ALLOCATION");
    expect(() => confirmAurionStatAllocation({ ...original, availableExact: "0" }, "strength", "point:002")).toThrow("AURION_STAT_NO_POINTS");
    expect(() => confirmAurionStatAllocation(original, "forged" as never, "point:003")).toThrow("AURION_STAT_ATTRIBUTE_INVALID");
    const huge = resolveAurionStatWallet({ userId: 7, character: { levelExact: "100000000000000000000000", sourceReceiptId: "large" }, masteries: [], allocations: [] });
    expect(huge.earnedExact).toBe("199999999999999999999998");
  });
  it("does not silently accept a negative balance or an untrusted source level", () => {
    expect(() => resolveAurionStatWallet({ ...base, character: { levelExact: "00", sourceReceiptId: "fake" } })).toThrow();
    expect(() => resolveAurionStatWallet({ ...base, allocations: Array.from({ length: 23 }, (_, index) => ({ key: "strength" as const, amountExact: "1", idempotencyKey: "spent:" + index })) })).toThrow("AURION_STAT_OVERSPEND");
  });
});
