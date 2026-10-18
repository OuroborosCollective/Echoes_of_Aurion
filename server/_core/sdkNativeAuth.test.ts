import type { AxiosInstance } from "axios";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import type { getUserById } from "../db";
import { COOKIE_NAME } from "../../shared/const";
import { SDKServer, type SDKRequestAuthDependencies } from "./sdk";

const nativeAccessToken = "n".repeat(43);
const request = (authorization: string): Request => ({
  headers: { authorization },
} as Request);
const user = {
  id: 967,
  openId: "native:967",
  name: "Native tester",
  email: null,
  loginMethod: "native",
  role: "user",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: null,
} as Awaited<ReturnType<typeof getUserById>>;
function authDependencies(
  changes: Partial<SDKRequestAuthDependencies> = {},
): SDKRequestAuthDependencies {
  return {
    authenticateNativeAccess: vi.fn(async () => null),
    readUserById: vi.fn(async () => user),
    recordUserActivity: vi.fn(async () => undefined),
    ...changes,
  };
}

describe("native bearer authentication boundary", () => {
  it("resolves a confirmed native access token and records current Aurion user activity", async () => {
    const authenticateNativeAccess = vi.fn(async () => ({
      userId: user!.id,
      sessionId: "s".repeat(43),
    }));
    const readUserById = vi.fn(async () => user);
    const recordUserActivity = vi.fn(async () => undefined);
    const server = new SDKServer({} as AxiosInstance, undefined, authDependencies({
      authenticateNativeAccess,
      readUserById,
      recordUserActivity,
    }));

    await expect(server.authenticateRequest(request(`Bearer ${nativeAccessToken}`))).resolves.toBe(user);
    expect(authenticateNativeAccess).toHaveBeenCalledWith(nativeAccessToken);
    expect(readUserById).toHaveBeenCalledWith(user!.id);
    expect(recordUserActivity).toHaveBeenCalledWith({
      openId: user!.openId,
      lastSignedIn: expect.any(Date),
    });
  });

  it("returns a stable 401 and never reinterprets an invalid native bearer as Preview JWT", async () => {
    const dependencies = authDependencies();
    const server = new SDKServer({} as AxiosInstance, undefined, dependencies);
    const verifySession = vi.spyOn(server, "verifySession");

    await expect(server.authenticateRequest(request(`Bearer ${nativeAccessToken}`)))
      .rejects.toMatchObject({ statusCode: 401, message: "NATIVE_AUTH_SESSION_EXPIRED" });
    expect(verifySession).not.toHaveBeenCalled();
    expect(dependencies.readUserById).not.toHaveBeenCalled();
    expect(dependencies.recordUserActivity).not.toHaveBeenCalled();
  });

  it("preserves native database-unavailable errors without JWT fallback", async () => {
    const unavailable = new Error("NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
    const dependencies = authDependencies({
      authenticateNativeAccess: vi.fn(async () => { throw unavailable; }),
    });
    const server = new SDKServer({} as AxiosInstance, undefined, dependencies);
    const verifySession = vi.spyOn(server, "verifySession");

    await expect(server.authenticateRequest(request(`Bearer ${nativeAccessToken}`)))
      .rejects.toBe(unavailable);
    expect(verifySession).not.toHaveBeenCalled();
    expect(dependencies.readUserById).not.toHaveBeenCalled();
  });

  it("keeps Preview JWT bearers on the existing session verifier", async () => {
    const dependencies = authDependencies();
    const server = new SDKServer({} as AxiosInstance, undefined, dependencies);
    const verifySession = vi.spyOn(server, "verifySession").mockResolvedValue(null);

    await expect(server.authenticateRequest(request("Bearer preview.jwt.value")))
      .rejects.toThrow("Invalid session cookie");
    expect(verifySession).toHaveBeenCalledWith("preview.jwt.value");
    expect(dependencies.authenticateNativeAccess).not.toHaveBeenCalled();
  });

  it("keeps the browser session cookie ahead of a native bearer", async () => {
    const dependencies = authDependencies();
    const server = new SDKServer({} as AxiosInstance, undefined, dependencies);
    const verifySession = vi.spyOn(server, "verifySession").mockResolvedValue(null);
    const req = request(`Bearer ${nativeAccessToken}`);
    req.headers.cookie = `${COOKIE_NAME}=browser.jwt.value`;

    await expect(server.authenticateRequest(req)).rejects.toThrow("Invalid session cookie");
    expect(verifySession).toHaveBeenCalledWith("browser.jwt.value");
    expect(dependencies.authenticateNativeAccess).not.toHaveBeenCalled();
  });
});
