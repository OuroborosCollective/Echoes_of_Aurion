import { describe, expect, it } from "vitest";
import { allowGatewayCommand, createPairingToken, defaultGatewayCommands, digestPairingToken, isGatewayGrantActive, isStrictlyIncreasingSequence, normalizeAurionCommand, parseAllowedCommands } from "./gatewayProtocol";

describe("Aurion gateway protocol", () => {
  it("normalizes only explicit game commands", () => {
    expect(normalizeAurionCommand(" w ")).toBe("W");
    expect(normalizeAurionCommand("9")).toBe("9");
    expect(normalizeAurionCommand("attack now")).toBeNull();
  });

  it("keeps a deduplicated allowlist and rejects malformed storage", () => {
    expect(parseAllowedCommands(JSON.stringify(["w", "9", "W", "invalid"]))).toEqual(["W", "9"]);
    expect(parseAllowedCommands("not-json")).toEqual([]);
    expect(defaultGatewayCommands()).toEqual(["W", "A", "S", "D", "1", "2", "9"]);
  });

  it("rejects well-formed commands outside of the paired session allowlist", () => {
    const allowed = ["W", "A", "1"];
    expect(allowGatewayCommand(" w ", allowed)).toBe("W");
    expect(allowGatewayCommand("9", allowed)).toBeNull();
    expect(allowGatewayCommand("attack", allowed)).toBeNull();
  });

  it("accepts only a strict positive command sequence", () => {
    expect(isStrictlyIncreasingSequence(1, undefined)).toBe(true);
    expect(isStrictlyIncreasingSequence(2, 1)).toBe(true);
    expect(isStrictlyIncreasingSequence(1, 1)).toBe(false);
    expect(isStrictlyIncreasingSequence(1, 2)).toBe(false);
    expect(isStrictlyIncreasingSequence(0, undefined)).toBe(false);
    expect(isStrictlyIncreasingSequence(1.5, undefined)).toBe(false);
  });

  it("rejects revoked and expired pairing grants before transport creation", () => {
    const now = new Date("2026-08-13T10:00:00.000Z");
    expect(isGatewayGrantActive("active", new Date("2026-08-13T10:00:01.000Z"), now)).toBe(true);
    expect(isGatewayGrantActive("revoked", new Date("2026-08-13T10:00:01.000Z"), now)).toBe(false);
    expect(isGatewayGrantActive("active", new Date("2026-08-13T10:00:00.000Z"), now)).toBe(false);
  });

  it("creates non-empty opaque pairing secrets and stable digests", () => {
    const token = createPairingToken();
    expect(token).toMatch(/^aurion_/);
    expect(digestPairingToken(token)).toHaveLength(64);
    expect(digestPairingToken(token)).toBe(digestPairingToken(token));
  });
});
