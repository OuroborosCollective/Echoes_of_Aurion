import { describe, expect, it, vi } from "vitest";
vi.mock("./env", () => ({
  ENV: {
    appId: "aurion-clock-fixture",
    cookieSecret: "isolated-clock-regression-signing-key-never-production",
    oAuthServerUrl: "https://oauth.example.test",
  },
}));
import { SDKServer } from "./sdk";
describe("session signing and verification with an explicit clock", () => {
  it("replays the same token and rejects it at the exact deadline without disabling signature checks", async () => {
    let observedAtMs = 1_800_000_000_000;
    const server = new SDKServer(undefined, { now: () => observedAtMs });
    const payload = {
      openId: "clock-user",
      appId: "aurion-clock-fixture",
      name: "Clock User",
    };
    const token = await server.signSession(payload, { expiresInMs: 600_000 });
    expect(await server.signSession(payload, { expiresInMs: 600_000 })).toBe(
      token
    );
    observedAtMs += 599_999;
    expect(await server.verifySession(token)).toEqual(payload);
    const parts = token.split(".");
    parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
    expect(await server.verifySession(parts.join("."))).toBeNull();
    observedAtMs += 1;
    expect(await server.verifySession(token)).toBeNull();
  });
  it("rejects malformed expiry durations before signing", async () => {
    const server = new SDKServer(undefined, { now: () => 1_800_000_000_000 });
    for (const expiresInMs of [NaN, Infinity, -1, 0.5])
      await expect(
        server.signSession(
          { openId: "clock-user", appId: "fixture", name: "Clock" },
          { expiresInMs }
        )
      ).rejects.toThrow();
  });
});
