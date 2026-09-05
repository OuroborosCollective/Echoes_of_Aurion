import { describe, expect, it, vi } from "vitest";
import { computeBackoffDelay } from "./retryPolicy";
describe("deterministic retry scheduling", () => {
  it("uses a bounded fixed schedule and an explicit provider floor", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("implicit random"); });
    try { expect([0, 1, 2, 3, 4].map(value => computeBackoffDelay(value))).toEqual([500, 1000, 2000, 4000, 8000]); expect(computeBackoffDelay(0, 4500)).toBe(4500); expect(computeBackoffDelay(4, 60000)).toBe(30000); }
    finally { random.mockRestore(); }
  });
  it("rejects nonfinite and invalid scheduling inputs", () => {
    for (const value of [-1, 1.5, 5, Number.NaN]) expect(() => computeBackoffDelay(value)).toThrow();
    for (const value of [-1, Number.NaN, Infinity]) expect(() => computeBackoffDelay(0, value)).toThrow();
  });
});
