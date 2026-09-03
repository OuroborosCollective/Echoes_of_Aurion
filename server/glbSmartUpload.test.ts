import { describe, expect, it, vi } from "vitest";
import { createGlbSmartUploadHandler } from "./glbSmartUpload";

function glbBase64(json: Record<string, unknown>): string {
  const raw = Buffer.from(JSON.stringify(json), "utf8");
  const paddedLength = Math.ceil(raw.length / 4) * 4;
  const jsonChunk = Buffer.alloc(paddedLength, 0x20);
  raw.copy(jsonChunk);
  const totalLength = 12 + 8 + jsonChunk.length;
  const bytes = Buffer.alloc(totalLength);
  bytes.write("glTF", 0, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(totalLength, 8);
  bytes.writeUInt32LE(jsonChunk.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(bytes, 20);
  return bytes.toString("base64");
}

function spiderGlb(): string {
  const legs = Array.from({ length: 4 }, (_, index) => index + 1).flatMap(index => [
    { name: `Leg_L${index}_Upper` }, { name: `Leg_R${index}_Upper` },
  ]);
  return glbBase64({
    asset: { version: "2.0" },
    nodes: [{ name: "Spider_Monster_Rig" }, { name: "Body" }, ...legs],
    meshes: [{ name: "Spider_Mesh", primitives: [] }],
    skins: [{ name: "Spider_Monster_Rig", joints: [0] }],
    animations: ["Idle", "Walk", "Attack", "Death"].map(name => ({ name, channels: [], samplers: [] })),
  });
}

function responseHarness() {
  let statusCode = 200;
  let body: unknown;
  const response = {
    status(code: number) { statusCode = code; return response; },
    json(value: unknown) { body = value; return response; },
  };
  return { response: response as any, read: () => ({ statusCode, body }) };
}

describe("smart GLB upload runtime", () => {
  it("derives the storage type from the GLB bytes and ignores a conflicting client assetType", async () => {
    const uploadAsset = vi.fn(async input => ({ id: "glb_runtime_test", ...input, contentBase64: undefined }));
    const handler = createGlbSmartUploadHandler({
      authenticate: async () => ({ id: 17, role: "admin" }),
      uploadAsset,
    });
    const harness = responseHarness();
    await handler({ body: {
      displayName: "Starter Spider",
      fileName: "starter-spider.glb",
      assetType: "character",
      contentBase64: spiderGlb(),
    } } as any, harness.response);

    expect(harness.read().statusCode).toBe(201);
    expect(uploadAsset).toHaveBeenCalledTimes(1);
    expect(uploadAsset.mock.calls[0]?.[0]).toMatchObject({
      displayName: "Starter Spider",
      assetType: "enemy",
      createdByUserId: 17,
    });
    expect(harness.read().body).toMatchObject({
      accepted: true,
      classification: { assetType: "enemy", subcategory: "spider", confidence: "high" },
    });
  });

  it("rejects authenticated non-admin users before parsing or persisting bytes", async () => {
    const uploadAsset = vi.fn();
    const handler = createGlbSmartUploadHandler({ authenticate: async () => ({ id: 21, role: "user" }), uploadAsset });
    const harness = responseHarness();
    await handler({ body: { displayName: "Nope", fileName: "nope.glb", contentBase64: spiderGlb() } } as any, harness.response);
    expect(harness.read().statusCode).toBe(403);
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("fails closed with 422 when a valid GLB has no safe category", async () => {
    const uploadAsset = vi.fn();
    const handler = createGlbSmartUploadHandler({ authenticate: async () => ({ id: 17, role: "admin" }), uploadAsset });
    const harness = responseHarness();
    await handler({ body: {
      displayName: "Unknown Object",
      fileName: "unknown.glb",
      contentBase64: glbBase64({ asset: { version: "2.0" }, nodes: [{ name: "Cube" }], meshes: [{ name: "Mesh" }] }),
    } } as any, harness.response);
    expect(harness.read().statusCode).toBe(422);
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("maps persistence failures to a bounded gateway error instead of claiming success", async () => {
    const handler = createGlbSmartUploadHandler({
      authenticate: async () => ({ id: 17, role: "admin" }),
      uploadAsset: async () => { throw new Error("synthetic-storage-failure"); },
    });
    const harness = responseHarness();
    await handler({ body: { displayName: "Starter Spider", fileName: "starter-spider.glb", contentBase64: spiderGlb() } } as any, harness.response);
    expect(harness.read()).toEqual({ statusCode: 502, body: { error: "GLB storage or metadata persistence failed" } });
  });
});
