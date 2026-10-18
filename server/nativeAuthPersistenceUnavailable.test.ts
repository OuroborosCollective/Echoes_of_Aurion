import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(async () => null),
}));

import { authenticateNativeAuthAccess } from "./nativeAuthPersistence";

describe("native access persistence availability", () => {
  it("distinguishes missing database configuration from an invalid token", async () => {
    await expect(authenticateNativeAuthAccess("n".repeat(43)))
      .rejects.toThrow("NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
  });
});
