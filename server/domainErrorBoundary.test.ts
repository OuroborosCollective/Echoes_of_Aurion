import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withDomainErrors } from "./domainErrorBoundary";

afterEach(() => vi.restoreAllMocks());

// Review (CodeRabbit, CWE-209): unexpected failures reached the admin client with SQL text.
describe("domain error boundary", () => {
  it("passes stable domain codes through with a fitting status", async () => {
    await expect(withDomainErrors("WORLD_VISUAL_WRITE", ["WORLD_VISUAL_"], async () => { throw new Error("WORLD_VISUAL_ASSET_NOT_A_WORLD_ASSET"); }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: "WORLD_VISUAL_ASSET_NOT_A_WORLD_ASSET" });
    await expect(withDomainErrors("WORLD_VISUAL_WRITE", ["WORLD_VISUAL_"], async () => { throw new Error("WORLD_VISUAL_REVISION_CONFLICT"); }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    const forbidden = new TRPCError({ code: "FORBIDDEN", message: "not admin" });
    await expect(withDomainErrors("X", ["X_"], async () => { throw forbidden; })).rejects.toBe(forbidden);
  });

  it("hides driver errors and foreign codes behind a fixed code and logs them server-side", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const driver = Object.assign(new Error("Failed query: insert into `aurionWorldVisualOverrides` (`id`, ...) values (?, ?) params: wvo_abc,secret"), { code: "ER_DUP_ENTRY" });
    const hidden = await withDomainErrors("WORLD_VISUAL_WRITE", ["WORLD_VISUAL_"], async () => { throw driver; }).catch(error => error as TRPCError);
    expect(hidden).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "WORLD_VISUAL_WRITE_FAILED" });
    expect(JSON.stringify(hidden)).not.toContain("aurionWorldVisualOverrides");
    expect(log).toHaveBeenCalledWith("[WORLD_VISUAL_WRITE] unexpected failure", driver);
    await expect(withDomainErrors("WORLD_VISUAL_WRITE", ["WORLD_VISUAL_"], async () => { throw new Error("ER_LOCK_WAIT_TIMEOUT"); }))
      .rejects.toMatchObject({ message: "WORLD_VISUAL_WRITE_FAILED" });
  });
});
