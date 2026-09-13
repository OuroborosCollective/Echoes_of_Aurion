import { describe, expect, it, vi } from "vitest";
import { createApprovedGlbAssetHandler } from "./glbAssetRoutes";

function responseHarness() {
  let statusCode = 200;
  let body: unknown;
  const headers = new Map<string, string>();
  const response = {
    status(code: number) { statusCode = code; return response; },
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); return response; },
    send(value: unknown) { body = value; return response; },
    json(value: unknown) { body = value; return response; },
    end() { return response; },
  };
  return { response: response as any, read: () => ({ statusCode, body, headers }) };
}

describe("approved GLB asset delivery", () => {
  it("returns exact approved bytes with immutable binary headers", async () => {
    const sha256 = "a".repeat(64);
    const bytes = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
    const readApproved = vi.fn(async () => bytes);
    const harness = responseHarness();

    await createApprovedGlbAssetHandler(readApproved)({ params: { sha256 } } as any, harness.response);

    const result = harness.read();
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(bytes);
    expect(result.headers.get("content-type")).toBe("model/gltf-binary");
    expect(result.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(result.headers.get("content-length")).toBe(String(bytes.length));
    expect(readApproved).toHaveBeenCalledWith(sha256);
  });

  it("fails closed for invalid or unapproved digests", async () => {
    const readApproved = vi.fn(async () => null);
    const invalid = responseHarness();
    await createApprovedGlbAssetHandler(readApproved)({ params: { sha256: "not-a-digest" } } as any, invalid.response);
    expect(invalid.read().statusCode).toBe(404);
    expect(readApproved).not.toHaveBeenCalled();

    const missing = responseHarness();
    await createApprovedGlbAssetHandler(readApproved)({ params: { sha256: "b".repeat(64) } } as any, missing.response);
    expect(missing.read().statusCode).toBe(404);
    expect(readApproved).toHaveBeenCalledTimes(1);
  });

  it("does not fall through to the SPA when storage readback fails", async () => {
    const harness = responseHarness();
    const handler = createApprovedGlbAssetHandler(async () => { throw new Error("storage unavailable"); });
    await handler({ params: { sha256: "c".repeat(64) } } as any, harness.response);
    expect(harness.read().statusCode).toBe(503);
    expect(harness.read().body).toEqual({ error: "GLB_ASSET_UNAVAILABLE" });
  });
});
