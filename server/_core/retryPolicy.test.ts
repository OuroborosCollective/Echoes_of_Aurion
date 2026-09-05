import { describe, expect, it, vi } from "vitest";
import { computeBackoffDelay, parseRetryAfter } from "./retryPolicy";
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

it("resolves provider dates only from the recorded response timestamp", () => {
  const at = Date.parse("Mon, 01 Jan 2024 00:00:00 GMT");
  expect(parseRetryAfter("Mon, 01 Jan 2024 00:00:05 GMT", at)).toBe(5000);
  expect(parseRetryAfter("Mon, 01 Jan 2024 00:00:05 GMT", at + 6000)).toBe(0);
  expect(parseRetryAfter("5", at)).toBe(5000);
  for (const value of ["1e9", "-1", "1.5", "01/02/2024", "99999999999999999999999999", " "]) expect(parseRetryAfter(value, at)).toBeUndefined();
  expect(() => parseRetryAfter("5", Infinity)).toThrow("OPERATIONAL_TIME_INVALID");
});
