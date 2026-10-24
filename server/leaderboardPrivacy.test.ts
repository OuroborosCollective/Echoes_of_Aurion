import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { toPublicLeaderboard } from "./leaderboardPublicProjection";
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
      loginMethod: "local",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } : null,
  };
}

describe("leaderboard public data boundary", () => {
  it("does not expose account-bearing leaderboard rows to a guest or non-admin", async () => {
    await expect(appRouter.createCaller(contextFor(null)).leaderboard.list({ limit: 2 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(contextFor("user")).leaderboard.list({ limit: 2 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("projects only anonymous rank and canonical season scores", () => {
    const rows = [
      { userId: 51, name: "Private account", points: 91, selectedClass: "seer", level: 7, victories: 4, seasonPoints: 280 },
      { userId: 99, name: "Do not publish", points: 75, selectedClass: "warden", level: 5, victories: 2, seasonPoints: 120 },
    ];
    const projection = toPublicLeaderboard(rows);
    expect(projection).toEqual([
      { rank: 1, level: 7, victories: 4, seasonPoints: 280 },
      { rank: 2, level: 5, victories: 2, seasonPoints: 120 },
    ]);
    expect(JSON.stringify(projection)).not.toMatch(/Private account|Do not publish|userId|selectedClass|points":91/);
  });

  it("allows guests only the anonymous public readmodel", async () => {
    const rows = await appRouter.createCaller(contextFor(null)).leaderboard.publicList({ limit: 2 });
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["level", "rank", "seasonPoints", "victories"]);
    }
  });

  it("prevents logging a literal database URL and protects production environment files", () => {
    const serverSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
    expect(serverSource).not.toMatch(/console\.warn\([^\n]*process\.env\.DATABASE_URL/);
    expect(gitignore.split(/\r?\n/)).toContain(".env.production");
  });

  it("uses an isolated non-root CI database identity", () => {
    const workflow = readFileSync(new URL("../.github/workflows/aurion-home-community-entrypoint.yml", import.meta.url), "utf8");
    expect(workflow).toMatch(/MARIADB_USER:\s*aurion_ci/);
    expect(workflow).toMatch(/MARIADB_DATABASE:\s*aurion_ci_test/);
    expect(workflow).toMatch(/DATABASE_URL:\s*["']mysql:\/\/aurion_ci:/);
  });
});
