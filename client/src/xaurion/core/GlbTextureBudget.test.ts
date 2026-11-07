// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { resolveObjectURL } from "node:buffer";
import * as THREE from "three";
import { testGlb } from "../../../../server/glbImportFixtures";
import { buildGlbImportPlan } from "../../../../server/glbImportPlan";
import { assetBudgets, assetTier, cappedTextureSize, inspectGlbAllocation, MIN_TEXTURE_DIMENSION } from "@shared/glbPresentationBudget";
import { glbResourcePool, isTouchMobileOs } from "./GlbResourceBudget";
import { canDownsampleGlbTextures } from "./GlbTextureDownsample";
import { glbManager } from "./GLBModelManager";
import { glbSharedTextures } from "./GlbSharedTextures";
import { releaseGlbTree } from "./GlbModelLease";

afterEach(() => {
  glbManager.setAuthoritativeCatalog([]);
  glbManager.trimIdle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** PNG signature + IHDR: enough for the allocation inspector; pixels come from the stubbed decoder. */
let imageSalt = 0;
/** `salt` makes image bytes distinct (identical bytes are deliberately shared). */
function pngHeader(width: number, height: number, salt = ++imageSalt): Buffer {
  const png = Buffer.alloc(33);
  png.writeUInt32BE(salt >>> 0, 29);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.writeUInt32BE(13, 8); png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(width, 16); png.writeUInt32BE(height, 20); png[24] = 8; png[25] = 6;
  return png;
}

/** One triangle with `count` embedded base-colour PNG textures of the given size. */
function texturedGlb(edge: number, count = 3, mimeType = "image/png", salts?: readonly number[], name = "Textured"): Buffer {
  const positions = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const parts: Buffer[] = [positions];
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [{ buffer: 0, byteOffset: 0, byteLength: 36 }];
  let offset = 36;
  for (let index = 0; index < count; index++) {
    const image = mimeType === "image/ktx2" ? ktx2Header(edge, edge) : pngHeader(edge, edge, salts?.[index]);
    const padded = Buffer.concat([image, Buffer.alloc((4 - image.length % 4) % 4)]);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: image.length });
    parts.push(padded); offset += padded.length;
  }
  const bin = Buffer.concat(parts);
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: count > 1 ? { index: 1 } : undefined }, normalTexture: count > 2 ? { index: 2 } : undefined }],
    textures: Array.from({ length: count }, (_, index) => ({ source: index })),
    images: Array.from({ length: count }, (_, index) => ({ bufferView: index + 1, mimeType })),
    buffers: [{ byteLength: bin.length }], bufferViews,
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
  };
  const text = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonChunk.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, bin]);
}

function ktx2Header(width: number, height: number): Buffer {
  const ktx = Buffer.alloc(80);
  ktx.writeUInt32LE(0x58544bab, 0); ktx.writeUInt32LE(width, 20); ktx.writeUInt32LE(height, 24);
  return ktx;
}

const mipBytes = (edge: number) => { let sum = 0; for (let w = edge; ; w = Math.max(1, Math.floor(w / 2))) { sum += w * w * 4; if (w === 1) break; } return sum; };
const arrayBuffer = (bytes: Buffer) => Uint8Array.from(bytes).buffer;

/** Serve the GLBs and the loader's blob: image URLs; decode images as sized stubs. */
async function stubBrowser(bytes: Buffer, honourResize = true, extra: readonly Buffer[] = []) {
  vi.stubGlobal("crypto", webcrypto);
  const urlOf = (glb: Buffer) => `/api/assets/glb/${createHash("sha256").update(glb).digest("hex")}.glb`;
  const url = urlOf(bytes);
  const served = new Map([bytes, ...extra].map(glb => [urlOf(glb), glb] as const));
  vi.stubGlobal("fetch", vi.fn(async (target: string) => {
    if (served.has(target)) return new Response(served.get(target)!);
    const blob = resolveObjectURL(target);
    return blob ? new Response(blob as unknown as Blob) : new Response(null, { status: 404 });
  }));
  const decoded: { width: number; height: number }[] = [];
  const bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];
  const createImageBitmap = vi.fn(async (blob: Blob, options: ImageBitmapOptions = {}) => {
    // Natural size from the PNG header, as a real decoder would produce it.
    const header = Buffer.from(await blob.arrayBuffer());
    const natural = { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
    const size = honourResize ? { width: options.resizeWidth ?? natural.width, height: options.resizeHeight ?? natural.height } : natural;
    decoded.push(size);
    const bitmap = { ...size, close: vi.fn() };
    bitmaps.push(bitmap);
    return bitmap;
  });
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  // GLTFLoader builds image blob URLs through self.URL, as in a browser.
  vi.stubGlobal("self", globalThis);
  const plan = await buildGlbImportPlan(testGlb("Aurion_Wall_LOD0").toString("base64"), "world-environment", "Aurion_Wall_LOD0.glb");
  const normalization = { ...plan.normalization, sourceSha256: url.slice(16, 80) };
  const target = (glb: Buffer) => ({ url: urlOf(glb), normalization: { ...plan.normalization, sourceSha256: urlOf(glb).slice(16, 80) } });
  return { url, normalization, decoded, createImageBitmap, bitmaps, target };
}

describe("tier texture edge", () => {
  it("budgets textures at the decoded edge, keeps aspect ratio and never caps compressed KTX2", () => {
    expect(assetBudgets.phone.textureDimension).toBe(1024);
    expect(assetBudgets.tablet.textureDimension).toBe(2048);
    expect(assetBudgets.desktop.textureDimension).toBe(4096);
    const glb = arrayBuffer(texturedGlb(2048, 3));
    expect(inspectGlbAllocation(glb).allocation.textureBytes).toBe(3 * mipBytes(2048));
    const phone = inspectGlbAllocation(glb, 1024);
    expect(phone.allocation.textureBytes).toBe(3 * mipBytes(1024));
    expect(phone.images[0]).toEqual({ width: 2048, height: 2048, decodedWidth: 1024, decodedHeight: 1024 });
    expect(cappedTextureSize(2048, 512, 1024)).toEqual({ width: 1024, height: 256 });
    expect(cappedTextureSize(300, 200, 1024)).toEqual({ width: 300, height: 200 });
    const ktx = inspectGlbAllocation(arrayBuffer(texturedGlb(2048, 1, "image/ktx2")), 1024);
    expect(ktx.images[0]).toMatchObject({ decodedWidth: 2048, decodedHeight: 2048 });
  });

  // Production readback 2026-11-07: three 2048 px textures make one return stone
  // 64 MiB of texture memory; at the phone edge it is 16 MiB.
  it("cuts a production-sized 3 × 2048 px model to a quarter on phones", () => {
    const glb = arrayBuffer(texturedGlb(2048, 3));
    const full = inspectGlbAllocation(glb).allocation.textureBytes;
    const phone = inspectGlbAllocation(glb, assetBudgets.phone.textureDimension).allocation.textureBytes;
    // A quarter, up to the 1×1 tail of the mip chain.
    expect(Math.abs(phone * 4 - full)).toBeLessThanOrEqual(3 * 4 * 4);
  });
});

describe("device tier for the owner's devices", () => {
  const tabA9 = "Mozilla/5.0 (Linux; Android 14; SM-X110) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  const p9 = "Mozilla/5.0 (Linux; Android 8.0.0; VIE-L09) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
  const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

  it("never gives a touch tablet the desktop profile", () => {
    expect(assetTier(1340, isTouchMobileOs({ userAgent: tabA9, maxTouchPoints: 10 }))).toBe("tablet");
    expect(assetTier(800, isTouchMobileOs({ userAgent: tabA9, maxTouchPoints: 10 }))).toBe("tablet");
    expect(assetTier(360, isTouchMobileOs({ userAgent: p9, maxTouchPoints: 10 }))).toBe("phone");
    expect(assetTier(1920, isTouchMobileOs({ userAgent: windows, maxTouchPoints: 0 }))).toBe("desktop");
    expect(assetTier(1366, isTouchMobileOs({ userAgent: ipad, maxTouchPoints: 5 }))).toBe("tablet");
    expect(assetTier(1440, isTouchMobileOs({ userAgent: ipad, maxTouchPoints: 0 }))).toBe("desktop");
  });

  it("downsamples only where GLTFLoader decodes through createImageBitmap", () => {
    const bitmap = () => undefined;
    expect(canDownsampleGlbTextures({ createImageBitmap: bitmap, userAgent: p9 })).toBe(true);
    expect(canDownsampleGlbTextures({ createImageBitmap: bitmap, userAgent: tabA9 })).toBe(true);
    expect(canDownsampleGlbTextures({ createImageBitmap: undefined, userAgent: tabA9 })).toBe(false);
    expect(canDownsampleGlbTextures({ createImageBitmap: bitmap, userAgent: "Mozilla/5.0 (Macintosh) Version/16.4 Safari/605.1.15" })).toBe(false);
    expect(canDownsampleGlbTextures({ createImageBitmap: bitmap, userAgent: ipad })).toBe(true);
    expect(canDownsampleGlbTextures({ createImageBitmap: bitmap, userAgent: "Mozilla/5.0 Firefox/97.0" })).toBe(false);
  });
});

describe("decoding under the phone texture edge", () => {
  it("decodes a 2048 px texture at 1024 px and reserves only that", async () => {
    const bytes = texturedGlb(2048, 1);
    const { url, normalization, decoded, createImageBitmap } = await stubBrowser(bytes);
    expect(glbResourcePool.tier).toBe("phone");
    const before = glbResourcePool.evidence().reservedTextureBytes;
    const loaded = await glbManager.loadModel(url, normalization);
    try {
      expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ resizeWidth: 1024, resizeHeight: 1024 }));
      expect(decoded.every(size => size.width === 1024)).toBe(true);
      const textures: THREE.Texture[] = [];
      loaded.scene.traverse(node => { const material = (node as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (material?.map) textures.push(material.map); });
      expect((textures[0]!.image as { width: number }).width).toBe(1024);
      expect(glbResourcePool.evidence().reservedTextureBytes - before).toBe(mipBytes(1024));
    } finally {
      releaseGlbTree(loaded.scene);
    }
  });

  // Fair share: a production-like 3 × 2048 px model may not claim more than
  // textureBytes / textureShareModels (12 MiB on phones), even with free memory.
  it("keeps every model within its fair texture share regardless of free memory", async () => {
    const bytes = texturedGlb(2048, 3);
    const { url, normalization, decoded } = await stubBrowser(bytes);
    const share = glbResourcePool.limits.textureBytes / glbResourcePool.limits.textureShareModels;
    const before = glbResourcePool.evidence().reservedTextureBytes;
    const reducedBefore = glbResourcePool.evidence().reducedTextureModels;
    const loaded = await glbManager.loadModel(url, normalization);
    try {
      expect(decoded.every(size => size.width === 512)).toBe(true);
      const reserved = glbResourcePool.evidence().reservedTextureBytes - before;
      expect(reserved).toBe(3 * mipBytes(512));
      // Review (Devin on 356f0330): fair-share reductions must show in diagnostics too.
      expect(glbResourcePool.evidence().reducedTextureModels).toBe(reducedBefore + 1);
      expect(reserved).toBeLessThanOrEqual(share);
    } finally {
      releaseGlbTree(loaded.scene);
    }
  });

  it("shows a model with smaller textures instead of dropping it when memory is short", async () => {
    const bytes = texturedGlb(2048, 1);
    const { url, normalization, decoded } = await stubBrowser(bytes);
    const limits = glbResourcePool.limits;
    // Leave room for the model at 512 px but not at its 1024 px phone edge.
    const filler = glbResourcePool.reserve({ decodedBytes: 1, textureBytes: limits.textureBytes - mipBytes(512), animations: 0 });
    expect(filler).not.toBeNull();
    const reducedBefore = glbResourcePool.evidence().reducedTextureModels;
    let scene: THREE.Group | undefined;
    try {
      scene = (await glbManager.loadModel(url, normalization)).scene;
      expect(decoded.every(size => size.width === 512)).toBe(true);
      expect(glbResourcePool.evidence().reducedTextureModels).toBe(reducedBefore + 1);
      expect(glbResourcePool.evidence().reservedTextureBytes).toBeLessThanOrEqual(limits.textureBytes);
    } finally {
      if (scene) releaseGlbTree(scene);
      glbManager.trimIdle();
      filler!();
    }
  });

  it("still reports a budget failure when even the minimum edge does not fit", async () => {
    const bytes = texturedGlb(2048, 3);
    const { url, normalization } = await stubBrowser(bytes);
    const limits = glbResourcePool.limits;
    const filler = glbResourcePool.reserve({ decodedBytes: 1, textureBytes: limits.textureBytes - 3 * mipBytes(MIN_TEXTURE_DIMENSION) + 1, animations: 0 });
    try {
      await expect(glbManager.loadModel(url, normalization)).rejects.toThrow("GLB_DECODED_BUDGET");
    } finally {
      filler!();
    }
  });

  it("fails closed when the browser ignores the downsampling request", async () => {
    const bytes = texturedGlb(2048, 3);
    const { url, normalization } = await stubBrowser(bytes, false);
    const before = glbResourcePool.evidence().reservedTextureBytes;
    await expect(glbManager.loadModel(url, normalization)).rejects.toThrow("GLB_TEXTURE_DOWNSAMPLE_UNAVAILABLE");
    expect(glbResourcePool.evidence().reservedTextureBytes).toBe(before);
  });
});

describe("textures shared by content across models and LOD levels", () => {
  // Production 2026-11-07: 623 embedded images, 172 distinct; NPC fallbacks reuse
  // the same 2048 px textures in up to 28 models.
  it("decodes, uploads and budgets identical image bytes once for every model using them", async () => {
    const salts = [9_001, 9_002, 9_003];
    // 3 × 512 px stays within the phone's fair share, so the stored size is decoded.
    const first = texturedGlb(512, 3, "image/png", salts, "NpcA");
    const second = texturedGlb(512, 3, "image/png", salts, "NpcB");
    const { createImageBitmap, bitmaps, target } = await stubBrowser(first, true, [second]);
    const before = glbResourcePool.evidence();
    const a = await glbManager.loadModel(target(first).url, target(first).normalization);
    const b = await glbManager.loadModel(target(second).url, target(second).normalization);
    const maps = [a.scene, b.scene].map(scene => { let map: THREE.Texture | undefined; scene.traverse(node => { map ??= ((node as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined)?.map ?? undefined; }); return map!; });
    try {
      expect(createImageBitmap).toHaveBeenCalledTimes(3);
      expect(maps[0]!.source).toBe(maps[1]!.source);
      expect(glbResourcePool.evidence().reservedTextureBytes - before.reservedTextureBytes).toBe(3 * mipBytes(512));
      expect(glbSharedTextures.evidence()).toMatchObject({ images: 3, references: 6 });
    } finally {
      releaseGlbTree(a.scene);
    }
    // The first model leaves; the second keeps the images alive.
    glbManager.trimIdle();
    expect(bitmaps.some(bitmap => bitmap.close.mock.calls.length)).toBe(false);
    expect(glbSharedTextures.evidence()).toMatchObject({ images: 3, references: 3 });
    releaseGlbTree(b.scene);
    glbManager.trimIdle();
    expect(bitmaps.every(bitmap => bitmap.close.mock.calls.length === 1)).toBe(true);
    expect(glbSharedTextures.evidence()).toMatchObject({ images: 0, references: 0 });
    expect(glbResourcePool.evidence().reservedTextureBytes).toBe(before.reservedTextureBytes);
    expect(glbResourcePool.evidence().reservedDecodedBytes).toBe(before.reservedDecodedBytes);
  });

  it("charges a model's fair share only for images that are not resident yet", async () => {
    const shared = 9_101;
    // First model: one 2048 px image, decoded at the phone edge (1024 px, 5.6 MB < 12 MiB share).
    const first = texturedGlb(2048, 1, "image/png", [shared], "HouseA");
    // Second model: the same image plus two new ones. All three at 1024 px (16.8 MB)
    // would exceed the share; the two new ones (11.2 MB) do not.
    const second = texturedGlb(2048, 3, "image/png", [shared, 9_102, 9_103], "HouseB");
    const { decoded, target } = await stubBrowser(first, true, [second]);
    const a = await glbManager.loadModel(target(first).url, target(first).normalization);
    const b = await glbManager.loadModel(target(second).url, target(second).normalization);
    try {
      expect(decoded).toEqual(Array.from({ length: 3 }, () => ({ width: 1024, height: 1024 })));
    } finally {
      releaseGlbTree(a.scene);
      releaseGlbTree(b.scene);
    }
  });

  // GLTFLoader decodes each image index; a duplicate inside one GLB is decoded
  // transiently, then closed — only one copy stays resident and budgeted.
  it("keeps and budgets an image used twice inside one GLB once", async () => {
    const bytes = texturedGlb(512, 3, "image/png", [9_201, 9_201, 9_202], "Twice");
    const { bitmaps, url, normalization } = await stubBrowser(bytes);
    const before = glbResourcePool.evidence().reservedTextureBytes;
    const loaded = await glbManager.loadModel(url, normalization);
    try {
      expect(glbSharedTextures.evidence()).toMatchObject({ images: 2, references: 2 });
      expect(bitmaps.filter(bitmap => bitmap.close.mock.calls.length === 1)).toHaveLength(bitmaps.length - 2);
      expect(glbResourcePool.evidence().reservedTextureBytes - before).toBe(2 * mipBytes(512));
    } finally {
      releaseGlbTree(loaded.scene);
    }
  });

  it("returns shared references and reservations when a model reusing them fails", async () => {
    const first = texturedGlb(1024, 1, "image/png", [9_301], "Good");
    const failing = texturedGlb(2048, 2, "image/png", [9_301, 9_302], "Bad");
    const { target } = await stubBrowser(first, true, [failing]);
    const a = await glbManager.loadModel(target(first).url, target(first).normalization);
    const after = { pool: glbResourcePool.evidence(), shared: glbSharedTextures.evidence() };
    // The browser now ignores downsampling: the new 2048 px image must fail closed.
    vi.stubGlobal("createImageBitmap", vi.fn(async (blob: Blob) => { const header = Buffer.from(await blob.arrayBuffer()); return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), close: vi.fn() }; }));
    try {
      await expect(glbManager.loadModel(target(failing).url, target(failing).normalization)).rejects.toThrow("GLB_TEXTURE_DOWNSAMPLE_UNAVAILABLE");
      expect(glbSharedTextures.evidence()).toEqual(after.shared);
      expect(glbResourcePool.evidence().reservedTextureBytes).toBe(after.pool.reservedTextureBytes);
      expect(glbResourcePool.evidence().reservedDecodedBytes).toBe(after.pool.reservedDecodedBytes);
    } finally {
      releaseGlbTree(a.scene);
    }
  });
});
