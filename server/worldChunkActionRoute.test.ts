import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(user: TrpcContext["user"]): TrpcContext {
  return { req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"], user };
}

const authenticatedUser = {
  id: 83,
  openId: "world-action-test-user",
  name: "World Action Test",
  email: "world-action@example.test",
  loginMethod: "test",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const validHarvestShape = {
  kind: "harvest_resource" as const,
  coordinate: { x: 0, z: 0 },
  expectedBaseRevision: 1 as const,
  expectedBaseHash: "fnv1a-0123abcd",
  resourceId: "base:0:0:resource:0",
  idempotencyKey: "route:world-action:0001",
};

describe("world chunk action route", () => {
  it("rejects anonymous mutation calls before they can reach the presence or receipt adapter", async () => {
    const caller = appRouter.createCaller(contextFor(null));
    await expect(caller.gameplay.applyWorldChunkAction(validHarvestShape)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects anonymous and noncanonical tiered chunk-window reads before a server readmodel is exposed", async () => {
    const anonymous = appRouter.createCaller(contextFor(null));
    await expect(anonymous.gameplay.worldChunkWindow({ worldVersion: "aurion-global-world.v1", expectedBaseRevision: 1, chunkX: 0, chunkZ: 0, tier: "phone" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const caller = appRouter.createCaller(contextFor(authenticatedUser));
    await expect(caller.gameplay.worldChunkWindow({ worldVersion: "aurion-global-world.v1", expectedBaseRevision: 1, chunkX: 0, chunkZ: 0, tier: "ultra" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects noncanonical hashes, unapproved asset keys and invalid structure IDs before database access", async () => {
    const caller = appRouter.createCaller(contextFor(authenticatedUser));
    await expect(caller.gameplay.applyWorldChunkAction({ ...validHarvestShape, expectedBaseHash: "incorrect" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.gameplay.applyWorldChunkAction({
      kind: "place_structure", coordinate: { x: 0, z: 0 }, expectedBaseRevision: 1, expectedBaseHash: validHarvestShape.expectedBaseHash, assetKey: "unreviewed_glb", xMm: 32_000, zMm: 32_000, idempotencyKey: "route:world-action:0002",
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.gameplay.applyWorldChunkAction({
      kind: "remove_structure", coordinate: { x: 0, z: 0 }, expectedBaseRevision: 1, expectedBaseHash: validHarvestShape.expectedBaseHash, structureId: "structure:83:not-a-token", xMm: 32_000, zMm: 32_000, idempotencyKey: "route:world-action:0003",
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
