import { afterEach, describe, expect, it, vi } from "vitest";
import {
  devControlCapabilities,
  isAllowedDevControlHost,
  isDevControlChannelEnabled,
  isLoopbackRemoteAddress,
  isLocalDevHostname,
  resolveDevAdminToken,
  verifyDevControlAuthorization,
} from "./devControlProtocol";
import { executeReset, executeSeed } from "./devControlChannel";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";
import { AuthoritativeMovementZone } from "./zoneRuntime";

describe("Aurion dev control protocol", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is impossible to enable in production and requires an explicit configured token", () => {
    expect(isDevControlChannelEnabled({ NODE_ENV: "production", AURION_DEV_CONTROL_CHANNEL: "true" })).toBe(false);
    expect(isDevControlChannelEnabled({ NODE_ENV: "production", AURION_DEV_CONTROL_ENABLED: "1" })).toBe(false);
    expect(resolveDevAdminToken({ NODE_ENV: "development" })).toBeNull();

    const env = { NODE_ENV: "development", AURION_DEV_ADMIN_TOKEN: "0123456789abcdef0123456789abcdef" };
    expect(resolveDevAdminToken(env)).toBe(env.AURION_DEV_ADMIN_TOKEN);
    expect(verifyDevControlAuthorization(undefined, undefined, env)).toEqual({
      authorized: false,
      reason: "missing_dev_authorization",
    });
    expect(verifyDevControlAuthorization("Bearer wrong", undefined, env)).toEqual({
      authorized: false,
      reason: "invalid_dev_token",
    });
    expect(verifyDevControlAuthorization(`Bearer ${env.AURION_DEV_ADMIN_TOKEN}`, undefined, env)).toEqual({ authorized: true });
  });

  it("accepts only loopback host values and rejects public forwarded hosts", () => {
    expect(isLocalDevHostname("localhost:3000")).toBe(true);
    expect(isLocalDevHostname("127.0.0.1")).toBe(true);
    expect(isLocalDevHostname("[::1]:3000")).toBe(true);
    expect(isLocalDevHostname("arelogic.space")).toBe(false);
    expect(isAllowedDevControlHost("localhost:3000", "localhost")).toBe(true);
    expect(isAllowedDevControlHost("localhost:3000", "arelogic.space")).toBe(false);
    expect(isAllowedDevControlHost("localhost:3000", "127.0.0.1, arelogic.space")).toBe(false);
    expect(isLoopbackRemoteAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("::1")).toBe(true);
    expect(isLoopbackRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("10.0.0.8")).toBe(false);
  });

  it("advertises only typed bounded development authority", () => {
    const caps = devControlCapabilities();
    expect(caps.protocol).toBe("aurion.dev-control.v1");
    expect(caps.channel).toBe("dev/prealpha");
    expect(caps.tools.map(tool => tool.name)).toEqual([
      "aurion_dev_inspect_environment",
      "aurion_dev_test_zone_reset",
      "aurion_dev_seed_test_encounter",
    ]);
    expect(caps.unavailable).toEqual(expect.arrayContaining([
      "raw_sql_execution",
      "raw_shell_execution",
      "git_mutation",
      "vps_access",
      "production_asset_write",
      "production_authoring_write",
      "quest_publish",
    ]));
  });
});

describe("Aurion dev control fixture runtime", () => {
  it("executes reset against the isolated authoritative zone implementation and reads its canonical hash back", () => {
    const first = executeReset("observatory_threshold", "dev-reset-key-00000001", "CONFIRM_DEV_ZONE_RESET");
    const retry = executeReset("observatory_threshold", "dev-reset-key-00000001", "CONFIRM_DEV_ZONE_RESET");
    expect(first).toEqual(retry);
    expect(first.status).toBe("RESET_COMPLETED");
    expect(first.authoritativeRuntime).toBe("AuthoritativeMovementZone");
    expect(first.persistenceMutation).toBe("none");
    expect(first.tick).toBe(0);
    expect(first.stateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("executes a deterministic encounter seed and rejects idempotency reuse with different arguments", () => {
    const reset = executeReset("observatory_threshold", "dev-reset-key-00000002", "CONFIRM_DEV_ZONE_RESET");
    const first = executeSeed("observatory_threshold", "boss_encounter", "dev-seed-key-00000001");
    const retry = executeSeed("observatory_threshold", "boss_encounter", "dev-seed-key-00000001");
    expect(first).toEqual(retry);
    expect(first.stateHash).not.toBe(reset.stateHash);
    expect(first.status).toBe("SEEDED");
    expect(first.selectedEntityIds).toEqual(["mob_6"]);
    expect(() => executeSeed("observatory_threshold", "starter_encounter", "dev-seed-key-00000001"))
      .toThrow("DEV_CONTROL_IDEMPOTENCY_REUSE_MISMATCH");
  });

  it("uses the same canonical state hashing as live movement runtime", () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    zone.resetDevelopmentFixture();
    const state = zone.getCanonicalZoneState();
    expect(hashCanonicalZoneState(state)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(state.worldId).toBeDefined();
    expect(state.players).toHaveLength(0);
  });
});
