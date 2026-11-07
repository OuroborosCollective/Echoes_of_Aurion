import * as THREE from "three";

/**
 * Content-addressed decoded images shared by every GLB that embeds the same
 * image bytes. Production NPC fallbacks reuse the same 2048 px textures across
 * up to 28 models and LOD levels repeat their texture sets: 623 embedded images,
 * 172 distinct (2026-11-07 readback). One decode and one GPU upload per image.
 *
 * Each image keeps the pool reservation of the decode that created it until the
 * last model referencing it is released. Presentation only; no gameplay state.
 */
type SharedImage = {
  readonly hash: string;
  readonly source: THREE.Source<unknown>;
  readonly width: number;
  readonly height: number;
  readonly textureBytes: number;
  refs: number;
  readonly release: () => void;
};

export class GlbSharedTextureCache {
  private readonly images = new Map<string, SharedImage>();

  /** Resident decode of these image bytes, without taking a reference. */
  peek(hash: string): Readonly<{ source: THREE.Source<unknown>; width: number; height: number }> | undefined {
    return this.images.get(hash);
  }

  /** Take a reference on a resident image (before a decode that will reuse it). */
  acquire(hash: string): boolean {
    const image = this.images.get(hash);
    if (!image) return false;
    image.refs++;
    return true;
  }

  /**
   * Register a freshly decoded image with one reference for its model. If another
   * decode registered the same bytes meanwhile, that one is reused: the new
   * reservation is released and the caller must drop its own decoded data.
   */
  adopt(hash: string, source: THREE.Source<unknown>, size: { width: number; height: number }, textureBytes: number, release: () => void): { source: THREE.Source<unknown>; adopted: boolean } {
    const existing = this.images.get(hash);
    if (existing) {
      existing.refs++;
      release();
      return { source: existing.source, adopted: false };
    }
    this.images.set(hash, { hash, source, width: size.width, height: size.height, textureBytes, refs: 1, release });
    return { source, adopted: true };
  }

  /** Drop one reference; the last one frees the decoded image and its reservation. */
  releaseRef(hash: string): void {
    const image = this.images.get(hash);
    if (!image) return;
    image.refs--;
    if (image.refs > 0) return;
    this.images.delete(hash);
    const data = image.source.data as { close?: () => void } | null;
    if (typeof data?.close === "function") data.close();
    image.release();
  }

  evidence() {
    let textureBytes = 0, references = 0;
    for (const image of this.images.values()) { textureBytes += image.textureBytes; references += image.refs; }
    return Object.freeze({ images: this.images.size, references, textureBytes });
  }
}

export const glbSharedTextures = new GlbSharedTextureCache();

/** SHA-256 (hex) of each embedded image's bytes, by glTF image index. */
export async function embeddedImageHashes(bytes: ArrayBuffer, json: { images?: { bufferView?: number }[]; bufferViews?: { byteOffset?: number; byteLength: number }[] }): Promise<string[]> {
  const view = new DataView(bytes);
  const binaryStart = 20 + view.getUint32(12, true) + 8;
  return Promise.all((json.images ?? []).map(async image => {
    const bufferView = json.bufferViews?.[image.bufferView ?? -1];
    if (!bufferView) throw Error("GLB_IMAGE_VIEW");
    const start = binaryStart + (bufferView.byteOffset ?? 0);
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes, start, bufferView.byteLength));
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  }));
}
