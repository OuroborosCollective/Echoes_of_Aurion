import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./gameDevelopmentStudioRuntime", () => ({
  resolveGameDevelopmentStudioRuntimeReadback: vi.fn(),
  inspectApprovedAsset: vi.fn(),
}));

import * as runtime from "./gameDevelopmentStudioRuntime";
import {
  executeGdsInspectApprovedAsset,
  executeGdsStatus,
  executeGdsValidateApprovedAsset,
} from "./devControlGdsBridge";

describe("Aurion dev-control ↔ Game Development Studio bridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("fails closed when production invokes the dev bridge", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(executeGdsStatus("CONFIRM_DEV_GDS_STATUS")).rejects.toThrow("DEV_CONTROL_CHANNEL_DISABLED");
    expect(runtime.resolveGameDevelopmentStudioRuntimeReadback).not.toHaveBeenCalled();
  });

  it("delegates status to the existing pinned GDS runtime boundary", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(runtime.resolveGameDevelopmentStudioRuntimeReadback).mockResolvedValue({
      available: true,
      required: false,
      version: "1.0.2",
      sourceRevision: "96a0b4f34b979279ab983e9547af43133e85f310",
      capabilitiesSchema: "game_dev.capabilities.v1",
      doctorSchema: "game_dev.doctor.v1",
      packageBuildAvailable: true,
      vendorAdmitAvailable: true,
      providerCalls: false,
      boundary: "human-confirmed-package-vendor-live-admission",
      error: null,
    });
    await expect(executeGdsStatus("CONFIRM_DEV_GDS_STATUS")).resolves.toMatchObject({
      available: true,
      version: "1.0.2",
      providerCalls: false,
    });
    expect(runtime.resolveGameDevelopmentStudioRuntimeReadback).toHaveBeenCalledOnce();
  });

  it("keeps approved-asset inspect and validate delegated to Aurion's existing GDS adapter", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(runtime.inspectApprovedAsset).mockResolvedValue({
      operation: "inspect",
      source: "approved-live-glb-catalog",
      providerCalls: false,
    });

    await expect(executeGdsInspectApprovedAsset("asset_lyra_01", "CONFIRM_DEV_GDS_INSPECT")).resolves.toMatchObject({
      operation: "inspect",
      source: "approved-live-glb-catalog",
    });
    await expect(executeGdsValidateApprovedAsset("asset_lyra_01", "CONFIRM_DEV_GDS_VALIDATE")).resolves.toMatchObject({
      operation: "inspect",
      source: "approved-live-glb-catalog",
    });

    expect(runtime.inspectApprovedAsset).toHaveBeenNthCalledWith(1, "inspect", "asset_lyra_01");
    expect(runtime.inspectApprovedAsset).toHaveBeenNthCalledWith(2, "validate", "asset_lyra_01");
  });

  it("requires the exact human confirmation phrase for every GDS execution surface", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(executeGdsStatus("bad" as never)).rejects.toThrow("DEV_CONTROL_CONFIRMATION_REQUIRED");
    await expect(executeGdsInspectApprovedAsset("asset_lyra_01", "bad" as never)).rejects.toThrow("DEV_CONTROL_CONFIRMATION_REQUIRED");
    await expect(executeGdsValidateApprovedAsset("asset_lyra_01", "bad" as never)).rejects.toThrow("DEV_CONTROL_CONFIRMATION_REQUIRED");
  });
});
