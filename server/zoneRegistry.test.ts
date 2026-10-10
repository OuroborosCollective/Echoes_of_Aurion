import { describe, expect, it } from "vitest";
import { AuthoritativeMovementZone, ZoneRegistry } from "./zoneRuntime";
import { AurionTickRecorder } from "./causality/tickRecorder";

describe("ZoneRegistry observational lookup", () => {
  it("does not instantiate or schedule a zone while a production readback only looks", () => {
    const registry = new ZoneRegistry();
    expect(registry.find("observatory_threshold")).toBeUndefined();
    registry.tick();
    expect(registry.find("observatory_threshold")).toBeUndefined();
    const started = registry.get("observatory_threshold");
    expect(registry.find("observatory_threshold")).toBe(started);
  });
  it("stops a probe-owned zone but keeps a zone adopted by a normal consumer", () => {
    const registry = new ZoneRegistry();
    const zone = new AuthoritativeMovementZone("observatory_threshold", new AurionTickRecorder());
    registry.installProbeZone(zone);
    registry.tick();
    registry.releaseProbeZone(zone);
    const tick = zone.getTickNumber();
    registry.tick();
    expect(zone.getTickNumber()).toBe(tick);
    expect(registry.find(zone.zoneId)).toBeUndefined();
    registry.installProbeZone(zone);
    expect(registry.get(zone.zoneId)).toBe(zone);
    registry.releaseProbeZone(zone);
    registry.tick();
    expect(zone.getTickNumber()).toBe(tick + 1);
  });
});
