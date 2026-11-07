import * as THREE from "three";
import type { GLTF, GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GlbImageSize } from "@shared/glbPresentationBudget";

/**
 * Whether this browser decodes glTF images through `createImageBitmap`, the only
 * path that can downsample while decoding. Mirrors GLTFLoader's own choice of
 * ImageBitmapLoader; elsewhere images keep their stored size and are budgeted so.
 */
export function canDownsampleGlbTextures(
  env: { createImageBitmap?: unknown; userAgent?: string } = {
    createImageBitmap: typeof createImageBitmap === "undefined" ? undefined : createImageBitmap,
    userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
  },
): boolean {
  if (typeof env.createImageBitmap !== "function") return false;
  const agent = env.userAgent ?? "";
  const safari = /^((?!chrome|android).)*safari/i.test(agent);
  const safariVersion = safari ? Number(/Version\/(\d+)/.exec(agent)?.[1] ?? -1) : -1;
  const firefoxVersion = agent.includes("Firefox") ? Number(/Firefox\/([0-9]+)\./.exec(agent)?.[1] ?? -1) : -1;
  return !(safari && safariVersion < 17) && !(agent.includes("Firefox") && firefoxVersion < 98);
}

/**
 * GLTFLoader plugin for embedded images:
 * - an image whose bytes are already decoded (shared texture cache) is handed
 *   over without decoding it again;
 * - an image larger than the admitted edge is decoded directly at the reduced
 *   size (`createImageBitmap` resize options), so the full size never reaches
 *   the GPU. Stored GLB bytes, hashes and materials are unchanged.
 */
export class GlbTextureDownsamplePlugin implements GLTFLoaderPlugin {
  readonly name = "AURION_texture_downsample";
  constructor(
    private readonly parser: GLTFParser,
    private readonly sizes: readonly (GlbImageSize | null)[],
    private readonly resident: ReadonlyMap<number, unknown> = new Map(),
  ) {}

  loadTexture(textureIndex: number): Promise<THREE.Texture> | null {
    const sourceIndex = this.parser.json.textures?.[textureIndex]?.source;
    if (!Number.isSafeInteger(sourceIndex)) return null;
    const load = (loader: unknown) => (this.parser as unknown as { loadTextureImage(t: number, s: number, l: unknown): Promise<THREE.Texture | null> })
      .loadTextureImage(textureIndex, sourceIndex, loader) as Promise<THREE.Texture>;
    if (this.resident.has(sourceIndex)) {
      const data = this.resident.get(sourceIndex);
      // Same contract GLTFParser uses for ImageBitmapLoader results.
      return load({ isImageBitmapLoader: true, load: (_url: string, onLoad: (value: unknown) => void) => onLoad(data) });
    }
    const size = this.sizes[sourceIndex];
    if (!size || (size.decodedWidth === size.width && size.decodedHeight === size.height)) return null;
    const loader = new THREE.ImageBitmapLoader();
    loader.setOptions({ premultiplyAlpha: "none", resizeWidth: size.decodedWidth, resizeHeight: size.decodedHeight, resizeQuality: "high" } as ImageBitmapOptions);
    return load(loader);
  }
}

/** Image a texture actually decodes: an extension source (e.g. EXT_texture_webp) wins over the core fallback. */
export function textureImageSource(textureDef: { source?: number; extensions?: Record<string, { source?: number }> } | undefined): number | undefined {
  for (const extension of Object.values(textureDef?.extensions ?? {})) if (Number.isSafeInteger(extension?.source)) return extension!.source;
  return Number.isSafeInteger(textureDef?.source) ? textureDef!.source : undefined;
}

/** Every texture GLTFLoader produced, grouped by the glTF image it decodes. */
export function texturesByImage(gltf: GLTF): Map<number, THREE.Texture[]> {
  const result = new Map<number, THREE.Texture[]>();
  const seen = new Set<THREE.Texture>();
  gltf.scene.traverse(node => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture) || seen.has(value)) continue;
        seen.add(value);
        const textureIndex = gltf.parser.associations.get(value)?.textures;
        const source = textureIndex === undefined ? undefined : textureImageSource(gltf.parser.json.textures?.[textureIndex]);
        if (source === undefined) continue;
        result.set(source, [...(result.get(source) ?? []), value]);
      }
    }
  });
  return result;
}
