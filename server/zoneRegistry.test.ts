import { describe, expect, it } from "vitest";
import { ZoneRegistry } from "./zoneRuntime";

describe("ZoneRegistry observational lookup", () => {
  it("does not instantiate or schedule a zone while a production readback only looks", () => {
    const registry = new ZoneRegistry();
    expect(registry.find("observatory_threshold")).toBeUndefined();
    registry.tick();
    expect(registry.find("observatory_threshold")).toBeUndefined();
    const started = registry.get("observatory_threshold");
    expect(registry.find("observatory_threshold")).toBe(started);
  });
});
