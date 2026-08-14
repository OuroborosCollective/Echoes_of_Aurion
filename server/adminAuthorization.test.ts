import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "admin" | "user" | null): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: role ? {
      id: 7,
      openId: `${role}-open-id`,
      name: `${role} user`,
      email: `${role}@aurion.example`,
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } : null,
  };
}

describe("admin routes", () => {
  it("rejects an authenticated non-admin before player, asset, or monetization access", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.admin.players.list({ limit: 25 })).rejects.toMatchObject({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
    await expect(caller.admin.assets.list()).rejects.toMatchObject({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
    await expect(caller.admin.monetization.list()).rejects.toMatchObject({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
    await expect(caller.admin.community.updateForumThread({ threadId: "thread_12345678", category: "announcements", title: "Testtitel", body: "Ein ausreichend langer redaktioneller Testbeitrag.", pinned: false })).rejects.toMatchObject({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
  });

  it("rejects anonymous access to new administrative operations", async () => {
    const caller = appRouter.createCaller(contextFor(null));
    await expect(caller.admin.assets.listAssignments()).rejects.toMatchObject({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
    await expect(caller.admin.monetization.upsert({ placementKey: "mission_banner", kind: "banner", providerLabel: "provider", active: false, consentRequired: true, configurationJson: "{}" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
    await expect(caller.admin.community.listEditorialThreads()).rejects.toMatchObject({ code: "FORBIDDEN", message: "You do not have required permission (10002)" });
  });

  it("validates role and season inputs before a database mutation is reached", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(caller.admin.players.setRole({ userId: 0, role: "admin" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.admin.rankings.startSeason({ seasonKey: "invalid key", displayName: "Season One", idempotencyKey: "season-start-0001" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.admin.rankings.rotateSeason({ confirmedSeasonKey: "season-one", nextSeasonKey: "season two", nextDisplayName: "Season Two", idempotencyKey: "season-rotate-001" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
