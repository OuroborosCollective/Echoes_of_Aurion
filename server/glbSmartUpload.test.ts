import { describe, expect, it, vi } from "vitest";
import { createGlbSmartUploadHandler, parseRequestedPresenceUserIds, publicPlayerCharacterEntries } from "./glbSmartUpload";
import { testAnimatedPlayerGlb, testGlb } from "./glbImportFixtures";
import type { GlbRuntimeCatalog } from "../shared/glbImportContract";

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

  it("exposes only unassigned character assets explicitly approved for the public player lane", () => {
    const source: GlbRuntimeCatalog = {
      version: "aurion.glb-import.v1",
      revision: "f".repeat(64),
      entries: [
        { assetId: "glb_public_b", sha256: "b".repeat(64), displayName: "B", assetType: "character", storageUrl: `/api/assets/glb/${"b".repeat(64)}.glb`, targetKey: null, purpose: "player-public", subcategory: "rigged-character", equipmentSlot: null },
        { assetId: "glb_npc", sha256: "c".repeat(64), displayName: "NPC", assetType: "character", storageUrl: `/api/assets/glb/${"c".repeat(64)}.glb`, targetKey: null, purpose: "npc-fallback", subcategory: "rigged-character", equipmentSlot: null },
        { assetId: "glb_public_a", sha256: "a".repeat(64), displayName: "A", assetType: "character", storageUrl: `/api/assets/glb/${"a".repeat(64)}.glb`, targetKey: null, purpose: "player-public", subcategory: "rigged-character", equipmentSlot: null },
        { assetId: "glb_targeted", sha256: "d".repeat(64), displayName: "Targeted", assetType: "character", storageUrl: `/api/assets/glb/${"d".repeat(64)}.glb`, targetKey: "starter_player", purpose: "player-public", subcategory: "rigged-character", equipmentSlot: null },
      ],
    };
    expect(publicPlayerCharacterEntries(source).map(entry => entry.assetId)).toEqual(["glb_public_a", "glb_public_b"]);
  });

  it("bounds and canonicalizes requested remote presence identities", () => {
    expect(parseRequestedPresenceUserIds("9,2,9,not-a-user,3")).toEqual([2, 3, 9]);
    expect(parseRequestedPresenceUserIds(undefined)).toEqual([]);
    const tooMany = Array.from({ length: 129 }, (_, index) => index + 1).join(",");
    expect(() => parseRequestedPresenceUserIds(tooMany)).toThrow("GLB_PRESENCE_QUERY_LIMIT");
  });
});
