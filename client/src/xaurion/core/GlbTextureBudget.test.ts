// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { resolveObjectURL } from "node:buffer";
import * as THREE from "three";
import { testGlb } from "../../../../server/glbImportFixtures";
import { buildGlbImportPlan } from "../../../../server/glbImportPlan";
import { assetBudgets, assetTier, cappedTextureSize, inspectGlbAllocation, MIN_TEXTURE_DIMENSION } from "@shared/glbPresentationBudget";
import { glbResourcePool, isTouchMobileOs } from "./GlbResourceBudget";
import { canDownsampleGlbTextures } from "../../game/glbTextureDownsample";
import { glbManager } from "./GLBModelManager";
import { releaseGlbTree } from "./GlbModelLease";

afterEach(() => {
  glbManager.setAuthoritativeCatalog([]);
  glbManager.trimIdle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** PNG signature + IHDR: enough for the allocation inspector; pixels come from the stubbed decoder. */
function pngHeader(width: number, height: number): Buffer {
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.writeUInt32BE(13, 8); png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(width, 16); png.writeUInt32BE(height, 20); png[24] = 8; png[25] = 6;
  return png;
}

/** One triangle with `count` embedded base-colour PNG textures of the given size. */
function texturedGlb(edge: number, count = 3, mimeType = "image/png"): Buffer {
  const positions = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const parts: Buffer[] = [positions];
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [{ buffer: 0, byteOffset: 0, byteLength: 36 }];
  let offset = 36;
  for (let index = 0; index < count; index++) {
    const image = mimeType === "image/ktx2" ? ktx2Header(edge, edge) : pngHeader(edge, edge);
    const padded = Buffer.concat([image, Buffer.alloc((4 - image.length % 4) % 4)]);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: image.length });
    parts.push(padded); offset += padded.length;
  }
  const bin = Buffer.concat(parts);
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Textured", mesh: 0 }],
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

/** Re-encode a GLB after editing its JSON chunk (binary chunk unchanged). */
function rewriteGlbJson(glb: Buffer, edit: (json: any) => void): Buffer {
  const length = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + length).toString());
  edit(json);
  const bin = glb.subarray(20 + length);
  const text = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + bin.length, 8);
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonChunk.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, jsonHeader, jsonChunk, bin]);
}

function ktx2Header(width: number, height: number): Buffer {
  const ktx = Buffer.alloc(80);
  ktx.writeUInt32LE(0x58544bab, 0); ktx.writeUInt32LE(width, 20); ktx.writeUInt32LE(height, 24);
  return ktx;
}

const mipBytes = (edge: number) => { let sum = 0; for (let w = edge; ; w = Math.max(1, Math.floor(w / 2))) { sum += w * w * 4; if (w === 1) break; } return sum; };
const arrayBuffer = (bytes: Buffer) => Uint8Array.from(bytes).buffer;

/** Serve the GLB and the loader's blob: image URLs; decode images as sized stubs. */
async function stubBrowser(bytes: Buffer, honourResize = true) {
  vi.stubGlobal("crypto", webcrypto);
  const url = `/api/assets/glb/${createHash("sha256").update(bytes).digest("hex")}.glb`;
  vi.stubGlobal("fetch", vi.fn(async (target: string) => {
    if (target === url) return new Response(bytes);
    const blob = resolveObjectURL(target);
    return blob ? new Response(blob as unknown as Blob) : new Response(null, { status: 404 });
  }));
  const decoded: { width: number; height: number }[] = [];
  const createImageBitmap = vi.fn(async (_blob: Blob, options: ImageBitmapOptions = {}) => {
    const size = { width: honourResize ? options.resizeWidth ?? 2048 : 2048, height: honourResize ? options.resizeHeight ?? 2048 : 2048 };
    decoded.push(size);
    return { ...size, close: vi.fn() };
  });
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  // GLTFLoader builds image blob URLs through self.URL, as in a browser.
  vi.stubGlobal("self", globalThis);
  const plan = await buildGlbImportPlan(testGlb("Aurion_Wall_LOD0").toString("base64"), "world-environment", "Aurion_Wall_LOD0.glb");
  const normalization = { ...plan.normalization, sourceSha256: url.slice(16, 80) };
  return { url, normalization, decoded, createImageBitmap };
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

  // Review (CodeRabbit on 554e6e6a): GLTFLoader decodes EXT_texture_webp images with
  // its built-in handler at stored size, so they (and their core fallback) are not capped.
  it("budgets images behind an image extension at stored size", () => {
    const glb = rewriteGlbJson(texturedGlb(2048, 2), json => {
      json.textures = [{ source: 0, extensions: { EXT_texture_webp: { source: 1 } } }];
      json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
      json.extensionsUsed = ["EXT_texture_webp"];
    });
    const phone = inspectGlbAllocation(arrayBuffer(glb), 1024);
    expect(phone.images.map(size => size!.decodedWidth)).toEqual([2048, 2048]);
    expect(phone.allocation.textureBytes).toBe(2 * mipBytes(2048));
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
  // textureBytes / textureShareModels (6 MiB on phones), even with free memory.
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
