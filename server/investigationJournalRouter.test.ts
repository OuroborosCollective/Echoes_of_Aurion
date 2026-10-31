import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"]): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user,
  };
}

const deductionRequest = {
  selectedClaimIds: ["claim-a", "claim-b"],
  deductionType: "affirm" as const,
  sourceProjectionHash: "sha256:" + "0".repeat(64),
};

describe("authenticated investigation journal routes", () => {
  it("rejects anonymous reads and deductions before touching persistence", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.investigationJournal.read({ viewerUserId: 12, guidance: "plot" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.investigationJournal.submitDeduction(deductionRequest))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("binds the journal viewer and derives the deduction actor from authentication", async () => {
    const caller = appRouter.createCaller(context({ id: 12, role: "user" } as NonNullable<TrpcContext["user"]>));
    await expect(caller.investigationJournal.read({ viewerUserId: 13, guidance: "plot" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "INVESTIGATION_VIEWER_MISMATCH" });
    const spoofedRequest = { ...deductionRequest, actorId: "player:13" };
    await expect(caller.investigationJournal.submitDeduction(spoofedRequest))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
