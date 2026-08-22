import { describe, expect, it } from "vitest";
import { createZoneTicket, digestZoneTicket, isAllowedZoneOrigin, parseZoneHello, parseZoneMove } from "./zoneProtocol";

describe("zone protocol", () => {
  it("creates opaque tickets whose persisted representation is a stable digest", () => {
    const ticket = createZoneTicket();
    expect(ticket).toMatch(/^aurion_zone_[A-Za-z0-9_-]{40,}$/);
    expect(digestZoneTicket(ticket)).toMatch(/^[a-f0-9]{64}$/);
    expect(digestZoneTicket(ticket)).toBe(digestZoneTicket(ticket));
  });

  it("accepts only a versioned hello before a zone connection is authenticated", () => {
    expect(parseZoneHello({ type: "hello", ticket: "x".repeat(24), zoneId: "observatory_threshold", protocolVersion: 1 })).not.toBeNull();
    expect(parseZoneHello({ type: "input", ticket: "x".repeat(24), zoneId: "observatory_threshold", protocolVersion: 1 })).toBeNull();
    expect(parseZoneHello({ type: "hello", ticket: "x".repeat(23), zoneId: "observatory_threshold", protocolVersion: 1 })).toBeNull();
  });

  it("accepts bounded integer movement intents and rejects invalid sequences or vectors", () => {
    expect(parseZoneMove({ type: "move", clientSeq: 1, input: { x: 1, z: -1 } })).toEqual({ type: "move", clientSeq: 1, input: { x: 1, z: -1 } });
    expect(parseZoneMove({ type: "move", clientSeq: 0, input: { x: 1, z: 0 } })).toBeNull();
    expect(parseZoneMove({ type: "move", clientSeq: 2, input: { x: 2, z: 0 } })).toBeNull();
    expect(parseZoneMove({ type: "attack", clientSeq: 2, input: { x: 1, z: 0 } })).toBeNull();
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
