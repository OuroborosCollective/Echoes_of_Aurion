import type { AxiosInstance } from "axios";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import type { getUserById } from "../db";
import { SDKServer } from "./sdk";

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

describe("native bearer authentication boundary", () => {
  it("resolves a confirmed native access token to the current Aurion user", async () => {
    const authenticateNativeAccess = vi.fn(async () => ({
      userId: user!.id,
      sessionId: "s".repeat(43),
    }));
    const readUserById = vi.fn(async () => user);
    const server = new SDKServer({} as AxiosInstance, undefined, {
      authenticateNativeAccess,
      readUserById,
    });

    await expect(server.authenticateRequest(request(`Bearer ${nativeAccessToken}`))).resolves.toBe(user);
    expect(authenticateNativeAccess).toHaveBeenCalledWith(nativeAccessToken);
    expect(readUserById).toHaveBeenCalledWith(user!.id);
  });

  it("never reinterprets an invalid native-shaped bearer as a preview JWT", async () => {
    const authenticateNativeAccess = vi.fn(async () => null);
    const readUserById = vi.fn(async () => user);
    const server = new SDKServer({} as AxiosInstance, undefined, {
      authenticateNativeAccess,
      readUserById,
    });
    const verifySession = vi.spyOn(server, "verifySession");

    await expect(server.authenticateRequest(request(`Bearer ${nativeAccessToken}`)))
      .rejects.toThrow("Invalid native access token");
    expect(verifySession).not.toHaveBeenCalled();
    expect(readUserById).not.toHaveBeenCalled();
  });
});
