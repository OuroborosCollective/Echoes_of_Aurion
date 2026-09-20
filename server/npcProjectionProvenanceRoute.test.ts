import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("NPC projection provenance route", () => {
  it("rejects anonymous reads before any graph or provenance readback can run", async () => {
    const caller = appRouter.createCaller({
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
      user: null,
    });
    await expect(caller.gameplay.npcProjectionProvenance()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
