import * as THREE from "three";

/**
 * Content-addressed decoded textures shared by every GLB that embeds the same
 * image bytes. Production NPC fallbacks reuse the same 2048 px textures across
 * up to 28 models and LOD levels repeat their texture sets: 623 embedded images,
 * 172 distinct (2026-11-07 readback).
 *
 * An entry is one GPU upload: image bytes (SHA-256) plus the renderer upload
 * configuration (sampler and colour space). Three.js uploads the same image
 * separately for different configurations, so each one is budgeted on its own
 * (review: Devin on #1342). The decoded CPU image itself is shared by every
 * entry of the same bytes and closed when the last entry using it goes.
 *
 * Each entry keeps the pool reservation of the decode that created it until the
 * last model referencing it is released. Presentation only; no gameplay state.
 */
type SharedTexture = {
  readonly key: string;
  readonly hash: string;
  readonly source: THREE.Source<unknown>;
  readonly textureBytes: number;
  refs: number;
  readonly release: () => void;
};

/** Upload key: image bytes plus the parameters Three.js keys its GPU textures by. */
export function sharedTextureKey(hash: string, texture: Pick<THREE.Texture, "wrapS" | "wrapT" | "magFilter" | "minFilter" | "colorSpace" | "generateMipmaps" | "flipY">): string {
  return `${hash}|${texture.wrapS},${texture.wrapT},${texture.magFilter},${texture.minFilter},${texture.generateMipmaps ? 1 : 0},${texture.flipY ? 1 : 0}|${texture.colorSpace}`;
}

export function sharedTextureHash(key: string): string {
  return key.slice(0, key.indexOf("|"));
}

export class GlbSharedTextureCache {
  private readonly entries = new Map<string, SharedTexture>();
  /** Decoded image -> number of entries using it. */
  private readonly dataUsers = new Map<unknown, number>();
  /** Image hash -> decodes that reserved fresh uploads of it and have not finished. */
  private readonly inflight = new Map<string, Set<Promise<void>>>();

  /** Resident upload, without taking a reference. */
  peek(key: string): Readonly<{ source: THREE.Source<unknown> }> | undefined {
    return this.entries.get(key);
  }

  /** Decoded image of these bytes held by any resident entry (reused instead of decoding again). */
  imageData(hash: string): unknown {
    for (const entry of this.entries.values()) if (entry.hash === hash) return entry.source.data;
    return undefined;
  }

  /**
   * Borrow the decoded image of these bytes from a resident upload, holding a
   * reference on that upload until `release`, so the image cannot be closed
   * while another model's decode is still using it.
   */
  borrowImage(hash: string): { data: unknown; release: () => void } | undefined {
    for (const entry of this.entries.values()) {
      if (entry.hash !== hash) continue;
      entry.refs++;
      let released = false;
      return { data: entry.source.data, release: () => { if (released) return; released = true; this.releaseRef(entry.key); } };
    }
    return undefined;
  }

  /** Whether this decoded image object belongs to the cache (never closed by a model). */
  owns(data: unknown): boolean {
    return this.dataUsers.has(data);
  }

  /** Take a reference on a resident upload (before a decode that will reuse it). */
  acquire(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    entry.refs++;
    return true;
  }

  /**
   * Register an upload with one reference for its model. If another decode
   * registered the same upload meanwhile, that one is reused and the new
   * reservation is released (`adopted: false`).
   */
  adopt(key: string, source: THREE.Source<unknown>, textureBytes: number, release: () => void): { source: THREE.Source<unknown>; adopted: boolean } {
    const existing = this.entries.get(key);
    if (existing) {
      existing.refs++;
      release();
      return { source: existing.source, adopted: false };
    }
    this.entries.set(key, { key, hash: sharedTextureHash(key), source, textureBytes, refs: 1, release });
    this.dataUsers.set(source.data, (this.dataUsers.get(source.data) ?? 0) + 1);
    return { source, adopted: true };
  }

  /** Drop one reference; the last one frees the upload's reservation and, if unused elsewhere, the image. */
  releaseRef(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs--;
    if (entry.refs > 0) return;
    this.entries.delete(key);
    const users = (this.dataUsers.get(entry.source.data) ?? 1) - 1;
    if (users > 0) this.dataUsers.set(entry.source.data, users);
    else {
      this.dataUsers.delete(entry.source.data);
      const data = entry.source.data as { close?: () => void } | null;
      if (typeof data?.close === "function") data.close();
    }
    entry.release();
  }

  /**
   * Mark these image hashes as being decoded by a model that already reserved
   * their uploads. Others wait (`settled`) instead of reserving the same bytes
   * twice. Returns the function that ends the mark.
   */
  markInflight(hashes: Iterable<string>): () => void {
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    const marked = [...new Set(hashes)];
    for (const hash of marked) {
      const set = this.inflight.get(hash) ?? new Set();
      set.add(done);
      this.inflight.set(hash, set);
    }
    return () => {
      for (const hash of marked) {
        const set = this.inflight.get(hash);
        set?.delete(done);
        if (set && set.size === 0) this.inflight.delete(hash);
      }
      finish();
    };
  }

  /** Resolves once no decode holds any of these image hashes in flight. */
  async settled(hashes: Iterable<string>): Promise<void> {
    const wanted = [...new Set(hashes)];
    for (;;) {
      const pending = wanted.flatMap(hash => [...(this.inflight.get(hash) ?? [])]);
      if (!pending.length) return;
      await Promise.all(pending);
    }
  }

  evidence() {
    let textureBytes = 0, references = 0;
    for (const entry of this.entries.values()) { textureBytes += entry.textureBytes; references += entry.refs; }
    return Object.freeze({ uploads: this.entries.size, images: this.dataUsers.size, references, textureBytes });
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
