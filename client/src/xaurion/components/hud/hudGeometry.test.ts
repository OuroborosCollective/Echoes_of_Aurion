import { describe, expect, it } from "vitest";
import {
  arcSlots,
  minRingRadiusInDiameters,
  SKILL_ARC,
  UTILITY_ANGLES_DEG,
} from "./hudGeometry";

// Mirrors the CSS constants in hud.css (--ax-skill-ring = 2.72 x skill, --ax-util-ring from attack/util sizes).
const SKILL_RING_IN_DIAMETERS = 2.72;

describe("hudGeometry.arcSlots", () => {
  it("is deterministic and returns unit vectors in screen space", () => {
    const a = arcSlots(5, SKILL_ARC.fromDeg, SKILL_ARC.toDeg);
    expect(arcSlots(5, SKILL_ARC.fromDeg, SKILL_ARC.toDeg)).toEqual(a);
    for (const slot of a) expect(Math.hypot(slot.x, slot.y)).toBeCloseTo(1, 3);
  });

  it("fans the five hotbar slots from the left of the attack button up to its top", () => {
    const slots = arcSlots(5, SKILL_ARC.fromDeg, SKILL_ARC.toDeg);
    expect(slots).toHaveLength(5);
    expect(slots[0]!.x).toBeLessThan(-0.99); // first skill: left of the attack button
    expect(slots[4]!.y).toBeLessThan(-0.99); // last skill: above it (screen y points down)
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i]!.x).toBeGreaterThan(slots[i - 1]!.x); // moves right...
      expect(slots[i]!.y).toBeLessThan(slots[i - 1]!.y); // ...and up
    }
  });

  it("keeps skills inside the screen quadrant above/left of the anchor (never right of it)", () => {
    for (const slot of arcSlots(5, SKILL_ARC.fromDeg, SKILL_ARC.toDeg)) {
      expect(slot.x).toBeLessThan(0.12); // the anchor sits ~50px from the right edge
      expect(slot.y).toBeLessThanOrEqual(0.12);
    }
  });

  it("places a single slot in the middle of the arc and handles an empty hotbar", () => {
    expect(arcSlots(1, 100, 100)[0]!.angleDeg).toBe(100);
    expect(arcSlots(1, 180, 90)[0]!.angleDeg).toBe(135);
    expect(arcSlots(0, 180, 90)).toEqual([]);
  });

  it("rejects invalid input instead of producing NaN layout", () => {
    expect(() => arcSlots(-1, 0, 90)).toThrow(RangeError);
    expect(() => arcSlots(2.5, 0, 90)).toThrow(RangeError);
    expect(() => arcSlots(3, Number.NaN, 90)).toThrow(RangeError);
  });
});

describe("hud.css ring constants stay overlap-free", () => {
  it("the skill ring keeps >= 8% clear space between adjacent skills", () => {
    const span = Math.abs(SKILL_ARC.fromDeg - SKILL_ARC.toDeg);
    expect(SKILL_RING_IN_DIAMETERS).toBeGreaterThanOrEqual(
      minRingRadiusInDiameters(5, span, 1.08),
    );
  });

  it.each([
    { name: "smallest sizes", attack: 76, util: 46, gap: 6 },
    { name: "largest sizes", attack: 112, util: 74, gap: 12 },
  ])(
    "utility buttons on the inner ring (45 degree steps) do not touch each other at the $name",
    ({ attack, util, gap }) => {
      const ring = attack / 2 + util / 2 + gap;
      const angles = Object.values(UTILITY_ANGLES_DEG).sort((a, b) => a - b);
      for (let i = 1; i < angles.length; i++) {
        const chord =
          2 * ring * Math.sin(((angles[i]! - angles[i - 1]!) * Math.PI) / 360);
        expect(chord).toBeGreaterThan(util);
      }
    },
  );

  it("minRingRadiusInDiameters scales with count and returns 0 for fewer than two buttons", () => {
    expect(minRingRadiusInDiameters(1, 90)).toBe(0);
    expect(minRingRadiusInDiameters(5, 92)).toBeGreaterThan(
      minRingRadiusInDiameters(3, 92),
    );
  });
});
