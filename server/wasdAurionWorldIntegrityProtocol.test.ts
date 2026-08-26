import { describe, expect, it } from "vitest";
import { resolveCityLayout, resolveWorldIntegrity } from "./wasdAurionWorldIntegrityProtocol";

describe("wasdAurionWorldIntegrityProtocol", () => {
  it("accepts only explicit kappa, seed and resolution invariants", () => {
    const valid = resolveWorldIntegrity({ kappa: 1000, deterministicSeed: "echoes:aurion:v1", resolutionIndex: 7, receiptId: "world-1" });
    expect(valid.ok).toBe(true);
    const invalid = resolveWorldIntegrity({ kappa: 999, deterministicSeed: "random", resolutionIndex: -1, sourceFragments: ["Math.random()"], receiptId: "world-2" });
    expect(invalid.ok).toBe(false);
    expect(invalid.violations.map(violation => violation.code)).toContain("KAPPA_INVARIANT");
    expect(invalid.violations.map(violation => violation.code)).toContain("FORBIDDEN_NONDETERMINISM");
  });

  it("spaces overlapping settlement structures deterministically without a tick loop", () => {
    const input = { sector: 0, receiptId: "layout-1", entities: [{ id: "hall", type: "building", position: { x: 0, y: 0, z: 0 } }, { id: "forge", type: "forge", position: { x: 0, y: 0, z: 0 } }, { id: "road", type: "road", position: { x: 4, y: 0, z: 0 } }] };
    const first = resolveCityLayout(input);
    const second = resolveCityLayout(input);
    expect(first).toEqual(second);
    expect(first.entities.find(entity => entity.id === "hall")?.position).not.toEqual({ x: 0, y: 0, z: 0 });
  });
});
