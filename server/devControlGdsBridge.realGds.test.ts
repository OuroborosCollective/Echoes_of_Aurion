import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeGdsStatus,
} from "./devControlGdsBridge";
import {
  GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
  GAME_DEVELOPMENT_STUDIO_VERSION,
} from "./gameDevelopmentStudioRuntime";

describe("Aurion dev-control ↔ pinned Game Development Studio integration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("delegates to the installed pinned game-dev binary and returns real readiness evidence", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AURION_GAME_DEV_REQUIRED", "true");
    vi.stubEnv("AURION_GAME_DEV_SOURCE_REVISION", GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION);
    const binary = process.env.AURION_GAME_DEV_BIN?.trim() || ".game-dev/runtime/node_modules/.bin/game-dev";
    vi.stubEnv("AURION_GAME_DEV_BIN", binary);
    vi.stubEnv("AURION_GAME_DEV_WORKSPACE", ".game-dev/workspace");

    const result = await executeGdsStatus("CONFIRM_DEV_GDS_STATUS");
    expect(result).toMatchObject({
      available: true,
      required: true,
      version: GAME_DEVELOPMENT_STUDIO_VERSION,
      sourceRevision: GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
      capabilitiesSchema: "game_dev.capabilities.v1",
      doctorSchema: "game_dev.doctor.v1",
      packageBuildAvailable: true,
      vendorAdmitAvailable: true,
      providerCalls: false,
      error: null,
    });
  });
});
