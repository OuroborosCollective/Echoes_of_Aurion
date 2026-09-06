import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { RETIRED_AURION_GAMEPLAY_WRITE_PATHS } from "./_core/trpc";

function contextFor(user: TrpcContext["user"]): TrpcContext {
  return { req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"], user };
}

const authenticatedUser = {
  id: 270,
  openId: "aim270-legacy-encounter-retirement",
  name: "AIM 270",
  email: "aim270@example.test",
  loginMethod: "test",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const retiredError = {
  code: "PRECONDITION_FAILED",
  message: "LEGACY_AURION_GAMEPLAY_WRITE_RETIRED",
};

describe("AIM-270 legacy Aurion encounter reachability", () => {
  it("blocks authenticated legacy encounter mutations before their database resolvers run", async () => {
    const caller = appRouter.createCaller(contextFor(authenticatedUser));

    await expect(caller.gameplay.startEncounter({ encounterKey: "asterion" })).rejects.toMatchObject(retiredError);
    await expect(caller.gameplay.act({
      sessionId: "legacy-session-0001",
      sequence: 1,
      command: "F",
      source: "human",
    })).rejects.toMatchObject(retiredError);
  });

  it("keeps the retirement list explicit and bounded to the migrated encounter slice", () => {
    expect(RETIRED_AURION_GAMEPLAY_WRITE_PATHS).toEqual([
      "gameplay.startEncounter",
      "gameplay.act",
    ]);
  });

  it("binds active AX1 combat to the WASD zone path without an Aurion fallback", () => {
    const request = readFileSync("client/src/xaurion/integration/confirmedActionRequest.ts", "utf8");
    const zone = readFileSync("server/zoneRuntime.ts", "utf8");

    expect(request).toContain("requestZoneBasicAttack");
    expect(request).toContain("kein Aurion-Gameplay-Fallback");
    expect(zone).toContain('from "./wasdCombatDeltaProtocol"');
    expect(zone).toContain("WASD_GAMEPLAY_SOURCE_REVISION");
  });

  it("does not retain the legacy encounter UI as a callable product surface", () => {
    expect(existsSync("client/src/xaurion/integration/AurionEncounterPanel.tsx")).toBe(false);
  });
});
