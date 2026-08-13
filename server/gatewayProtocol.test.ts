import { describe, expect, it } from "vitest";
import { createPairingToken, defaultGatewayCommands, digestPairingToken, normalizeAurionCommand, parseAllowedCommands } from "./gatewayProtocol";

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

  it("creates non-empty opaque pairing secrets and stable digests", () => {
    const token = createPairingToken();
    expect(token).toMatch(/^aurion_/);
    expect(digestPairingToken(token)).toHaveLength(64);
    expect(digestPairingToken(token)).toBe(digestPairingToken(token));
  });
});
