import { describe, expect, it } from "vitest";
import { computeBackoffDelay, parseRetryAfter } from "./retryPolicy";

describe("retryPolicy", () => {
  it("calculates exponential backoff delay", () => {
    const delay0 = computeBackoffDelay(0);
    expect(delay0).toBeGreaterThanOrEqual(500);
    expect(delay0).toBeLessThan(1000);

    const delayCustom = computeBackoffDelay(0, 2500);
    expect(delayCustom).toBe(2500);
  });

  it("parses retry-after header", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter(null)).toBeNull();
  });
});
