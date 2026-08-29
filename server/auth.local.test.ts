import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { hashLocalPassword } from "./localAuth";

const database = vi.hoisted(() => ({
  clearLocalAuthFailures: vi.fn(),
  createLocalUser: vi.fn(),
  getLocalCredential: vi.fn(),
  recordLocalAuthFailure: vi.fn(),
  upsertUser: vi.fn(),
}));

const session = vi.hoisted(() => ({ createSessionToken: vi.fn() }));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  ...database,
}));
vi.mock("./_core/sdk", () => ({ sdk: session }));

import { appRouter } from "./routers";

const localUser = {
  id: 41,
  openId: "local:lyra",
  name: "lyra",
  email: null,
  loginMethod: "aurion-local",
  role: "user",
  createdAt: new Date("2026-08-29T00:00:00Z"),
  updatedAt: new Date("2026-08-29T00:00:00Z"),
  lastSignedIn: new Date("2026-08-29T00:00:00Z"),
};

function contextForLocalAuth() {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const context: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
    } as TrpcContext["res"],
  };
  return { caller: appRouter.createCaller(context), cookies };
}

describe("Aurion local account router", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    session.createSessionToken.mockResolvedValue("signed-session-token");
  });

  it("creates a local account and writes only a protected session cookie", async () => {
    database.createLocalUser.mockResolvedValue(localUser);
    const { caller, cookies } = contextForLocalAuth();

    await expect(caller.auth.registerLocal({ handle: "Lyra", password: "Sternwarte-2026!" })).resolves.toEqual(localUser);

    expect(database.createLocalUser).toHaveBeenCalledWith(expect.objectContaining({
      handle: "lyra",
      passwordHash: expect.stringMatching(/^scrypt\$16384\$/),
    }));
    expect(cookies).toEqual([expect.objectContaining({
      name: COOKIE_NAME,
      value: "signed-session-token",
      options: expect.objectContaining({ httpOnly: true, path: "/", secure: true }),
    })]);
  });

  it("keeps an unknown local handle on the controlled JSON authentication error path", async () => {
    database.getLocalCredential.mockResolvedValue(undefined);
    const { caller } = contextForLocalAuth();

    await expect(caller.auth.loginLocal({ handle: "missing", password: "irrelevant" })).rejects.toThrow("Rufname oder Passwort stimmen nicht.");
    expect(database.recordLocalAuthFailure).not.toHaveBeenCalled();
  });

  it("logs a known account in and clears prior failures", async () => {
    database.getLocalCredential.mockResolvedValue({
      user: localUser,
      credential: {
        handle: "lyra",
        passwordHash: await hashLocalPassword("Sternwarte-2026!"),
        failedAttempts: 2,
        lockedUntil: null,
      },
    });
    const { caller, cookies } = contextForLocalAuth();

    await expect(caller.auth.loginLocal({ handle: "LYRA", password: "Sternwarte-2026!" })).resolves.toEqual(localUser);

    expect(database.clearLocalAuthFailures).toHaveBeenCalledWith("lyra");
    expect(database.upsertUser).toHaveBeenCalledWith({ openId: localUser.openId, lastSignedIn: expect.any(Date) });
    expect(cookies).toHaveLength(1);
  });
});
