import { describe, expect, it } from "vitest";
import { createZoneTicket, digestZoneTicket, isAllowedZoneOrigin, parseZoneHello } from "./zoneProtocol";

describe("zone protocol", () => {
  it("creates opaque tickets whose persisted representation is a stable digest", () => {
    const ticket = createZoneTicket();
    expect(ticket).toMatch(/^aurion_zone_[A-Za-z0-9_-]{40,}$/);
    expect(digestZoneTicket(ticket)).toMatch(/^[a-f0-9]{64}$/);
    expect(digestZoneTicket(ticket)).toBe(digestZoneTicket(ticket));
  });

  it("accepts only a versioned hello for the first read-only zone", () => {
    expect(parseZoneHello({ type: "hello", ticket: "x".repeat(24), zoneId: "observatory_threshold", protocolVersion: 1 })).not.toBeNull();
    expect(parseZoneHello({ type: "input", ticket: "x".repeat(24), zoneId: "observatory_threshold", protocolVersion: 1 })).toBeNull();
    expect(parseZoneHello({ type: "hello", ticket: "x".repeat(23), zoneId: "observatory_threshold", protocolVersion: 1 })).toBeNull();
  });

  it("allows only explicit production and local browser origins", () => {
    expect(isAllowedZoneOrigin("https://arelogic.space")).toBe(true);
    expect(isAllowedZoneOrigin("https://preview.manus.computer", "development")).toBe(true);
    expect(isAllowedZoneOrigin("https://preview.manus.computer", "production")).toBe(false);
    expect(isAllowedZoneOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedZoneOrigin("https://attacker.example")).toBe(false);
    expect(isAllowedZoneOrigin(undefined)).toBe(false);
  });
});
