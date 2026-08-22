import { describe, expect, it } from "vitest";
import { integrateZoneMovement } from "./zoneRuntime";

describe("authoritative zone movement", () => {
  it("integrates cardinal and diagonal intents with fixed-point integer steps", () => {
    expect(integrateZoneMovement({ x: 0, z: 0 }, { x: 1, z: 0 })).toEqual({ x: 340, z: 0 });
    expect(integrateZoneMovement({ x: 0, z: 0 }, { x: 1, z: -1 })).toEqual({ x: 240, z: -240 });
    expect(integrateZoneMovement({ x: 340, z: -340 }, { x: 0, z: 0 })).toEqual({ x: 340, z: -340 });
  });

  it("clamps the authoritative position at the confirmed zone boundary", () => {
    expect(integrateZoneMovement({ x: 14_500, z: -14_500 }, { x: 1, z: -1 })).toEqual({ x: 14_500, z: -14_500 });
  });
});
