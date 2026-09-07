import { describe, expect, it, vi } from "vitest";
import { createGlbSmartUploadHandler } from "./glbSmartUpload";
import { testAnimatedPlayerGlb, testGlb } from "./glbImportFixtures";

const weaponGlb = () => testGlb("Aurion_Spear_Weapon").toString("base64");
const characterGlb = () => testAnimatedPlayerGlb("Aurion_Player").toString("base64");

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
  it("derives the storage type from validated GLB bytes and ignores a conflicting client assetType", async () => {
    const uploadAsset = vi.fn(async input => ({ id: "glb_runtime_test", ...input, contentBase64: undefined }));
    const handler = createGlbSmartUploadHandler({
      authenticate: async () => ({ id: 17, role: "admin" }),
      uploadAsset,
    });
    const harness = responseHarness();
    await handler({ body: {
      displayName: "Sunward Spear",
      fileName: "sunward-spear.glb",
      assetType: "character",
      contentBase64: weaponGlb(),
    } } as any, harness.response);

    expect(harness.read().statusCode).toBe(201);
    expect(uploadAsset).toHaveBeenCalledTimes(1);
    expect(uploadAsset.mock.calls[0]?.[0]).toMatchObject({
      displayName: "Sunward Spear",
      fileName: "sunward-spear.glb",
      assetType: "weapon",
      createdByUserId: 17,
      purpose: "auto",
    });
    expect(harness.read().body).toMatchObject({
      accepted: true,
      purpose: "auto",
      classification: { assetType: "weapon", subcategory: "equipment-weapon", confidence: "medium", equipmentSlot: "weapon" },
    });
  });

  it("accepts an explicit character-only NPC fallback purpose without allowing the browser to author its type", async () => {
    const uploadAsset = vi.fn(async input => ({ receipt: { assetId: "glb_fallback", targetKey: null, status: "catalog" }, input }));
    const handler = createGlbSmartUploadHandler({ authenticate: async () => ({ id: 17, role: "admin" }), uploadAsset });
    const harness = responseHarness();
    await handler({ body: {
      displayName: "Aurion Public Rig",
      fileName: "aurion-player.glb",
      assetType: "enemy",
      purpose: "npc-fallback",
      contentBase64: characterGlb(),
    } } as any, harness.response);

    expect(harness.read().statusCode).toBe(201);
    expect(uploadAsset).toHaveBeenCalledWith(expect.objectContaining({
      displayName: "Aurion Public Rig",
      fileName: "aurion-player.glb",
      assetType: "character",
      purpose: "npc-fallback",
      createdByUserId: 17,
    }));
    expect(harness.read().body).toMatchObject({
      accepted: true,
      purpose: "npc-fallback",
      classification: { assetType: "character", subcategory: "rigged-character" },
      receipt: { targetKey: null, status: "catalog" },
    });
  });

  it("rejects non-character validated bytes when the protected purpose is NPC fallback", async () => {
    const uploadAsset = vi.fn();
    const handler = createGlbSmartUploadHandler({ authenticate: async () => ({ id: 17, role: "admin" }), uploadAsset });
    const harness = responseHarness();
    await handler({ body: { displayName: "Not an NPC", fileName: "spear.glb", purpose: "npc-fallback", contentBase64: weaponGlb() } } as any, harness.response);
    expect(harness.read()).toEqual({ statusCode: 422, body: { error: "GLB_NPC_FALLBACK_CHARACTER_REQUIRED" } });
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("rejects unknown import purposes instead of silently broadening authority", async () => {
    const uploadAsset = vi.fn();
    const handler = createGlbSmartUploadHandler({ authenticate: async () => ({ id: 17, role: "admin" }), uploadAsset });
    const harness = responseHarness();
    await handler({ body: { displayName: "Character", fileName: "character.glb", purpose: "replace-player", contentBase64: characterGlb() } } as any, harness.response);
    expect(harness.read().statusCode).toBe(400);
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin users before parsing or persisting bytes", async () => {
    const uploadAsset = vi.fn();
    const handler = createGlbSmartUploadHandler({ authenticate: async () => ({ id: 21, role: "user" }), uploadAsset });
    const harness = responseHarness();
    await handler({ body: { displayName: "Nope", fileName: "nope.glb", contentBase64: weaponGlb() } } as any, harness.response);
    expect(harness.read().statusCode).toBe(403);
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("fails closed with 422 when a renderable GLB has no safe category", async () => {
    const uploadAsset = vi.fn();
    const handler = createGlbSmartUploadHandler({ authenticate: async () => ({ id: 17, role: "admin" }), uploadAsset });
    const harness = responseHarness();
    await handler({ body: {
      displayName: "Unknown Object",
      fileName: "unknown.glb",
      contentBase64: testGlb("Unknown_Object").toString("base64"),
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
    await handler({ body: { displayName: "Sunward Spear", fileName: "sunward-spear.glb", contentBase64: weaponGlb() } } as any, harness.response);
    expect(harness.read()).toEqual({ statusCode: 502, body: { error: "GLB storage or metadata persistence failed" } });
  });
});
