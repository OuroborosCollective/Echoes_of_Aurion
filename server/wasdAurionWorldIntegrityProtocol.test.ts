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

  it("uses the X/Z ground plane and preserves each building's elevation", () => {
    const input = { sector: 0, receiptId: "ground-layout", entities: [
      { id: "a_hall", type: "hall", position: { x: 0, y: 12, z: 0 } },
      { id: "b_forge", type: "forge", position: { x: 0, y: 18, z: 0 } },
      { id: "c_house", type: "house", position: { x: 0, y: 12, z: 8 } },
      { id: "d_path", type: "path", position: { x: 4, y: 12, z: 0 } },
    ] };
    const first = resolveCityLayout(input);
    expect(first).toEqual(resolveCityLayout({ ...input, entities: [...input.entities].reverse() }));
    expect(first.entities.find(entity => entity.id === "b_forge")?.position?.y).toBe(18);
    expect(first.entities.find(entity => entity.id === "c_house")?.position).toEqual(input.entities[2]!.position);
    const buildings = first.entities.filter(entity => entity.type !== "path");
    for (let i = 0; i < buildings.length; i++) for (let j = 0; j < i; j++) {
      const a = buildings[i]!.position!, b = buildings[j]!.position!;
      expect(Math.hypot(a.x! - b.x!, a.z! - b.z!)).toBeGreaterThanOrEqual(2);
    }
    expect(first.entities.some(entity => entity.state === "needs_road_anchor")).toBe(false);
    expect(input.entities[1]!.position).toEqual({ x: 0, y: 18, z: 0 });
  });

  it("selects sectors by ground coordinates, including negative Z, independently of altitude", () => {
    const entity = { id: "hall", type: "hall", position: { x: 0, y: 0, z: -65 } };
    expect(resolveCityLayout({ sector: 34, receiptId: "sector-ground", entities: [entity] }).entities).toHaveLength(1);
    expect(resolveCityLayout({ sector: 34, receiptId: "sector-ground", entities: [{ ...entity, position: { ...entity.position, y: 300 } }] }).entities).toHaveLength(1);
  });

  it("rejects ambiguous identities and non-finite coordinates before returning a layout", () => {
    const entity = { id: "hall", type: "hall", position: { x: 0, y: 0, z: 0 } };
    expect(() => resolveCityLayout({ sector: 0, receiptId: "bad", entities: [entity, entity] })).toThrow(/duplicate/);
    expect(() => resolveCityLayout({ sector: 0, receiptId: "bad", entities: [{ ...entity, position: { x: 0, y: NaN, z: 0 } }] })).toThrow(/finite/);
  });
});
