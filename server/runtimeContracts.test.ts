import { describe, expect, it } from "vitest";
import { AURION_RELEASE_BUDGET, assertRuntimeBinaryLimit, assertRuntimeIntegerInRange, aurionRuntimeCommandSchema, runtimeIssueCode, validateRuntimeModelSource } from "../shared/runtimeContracts";

describe("runtime contracts", () => {
  it("accepts only normalized expedition commands", () => {
    expect(aurionRuntimeCommandSchema.safeParse("W").success).toBe(true);
    expect(aurionRuntimeCommandSchema.safeParse("9").success).toBe(true);
    expect(aurionRuntimeCommandSchema.safeParse("DROP TABLE").success).toBe(false);
  });

  it("allows Aurion storage and HTTPS GLBs but rejects unsafe sources", () => {
    expect(validateRuntimeModelSource("/manus-storage/wayfinder.glb").valid).toBe(true);
    expect(validateRuntimeModelSource("https://assets.example.test/veilguard.glb?version=2").valid).toBe(true);
    expect(validateRuntimeModelSource("http://assets.example.test/veilguard.glb").valid).toBe(false);
    expect(validateRuntimeModelSource("/manus-storage/readme.txt").valid).toBe(false);
  });

  it("creates a stable non-sensitive runtime issue code", () => {
    expect(runtimeIssueCode(new Error("scene unavailable"))).toBe(runtimeIssueCode(new Error("scene unavailable")));
    expect(runtimeIssueCode(new Error("scene unavailable"))).toMatch(/^AUR-[A-Z0-9]+$/);
  });

  it("enforces shared pricing, payload and release budgets", () => {
    expect(assertRuntimeIntegerInRange(100, 1, 1_000_000, "ungültig")).toBe(100);
    expect(() => assertRuntimeIntegerInRange(0, 1, 1_000_000, "ungültig")).toThrow("ungültig");
    expect(assertRuntimeBinaryLimit(AURION_RELEASE_BUDGET.maxCommunityGlbBytes, AURION_RELEASE_BUDGET.maxCommunityGlbBytes, "zu groß")).toBe(AURION_RELEASE_BUDGET.maxCommunityGlbBytes);
    expect(() => assertRuntimeBinaryLimit(AURION_RELEASE_BUDGET.maxCommunityGlbBytes + 1, AURION_RELEASE_BUDGET.maxCommunityGlbBytes, "zu groß")).toThrow("zu groß");
  });
});
