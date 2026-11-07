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
 * GLTFLoader plugin: decodes every embedded image that exceeds the admitted edge
 * directly at the reduced size (`createImageBitmap` resize options), so the full
 * size never reaches the GPU. Stored GLB bytes, hashes and materials are unchanged.
 */
export class GlbTextureDownsamplePlugin implements GLTFLoaderPlugin {
  readonly name = "AURION_texture_downsample";
  constructor(private readonly parser: GLTFParser, private readonly sizes: readonly (GlbImageSize | null)[]) {}

  loadTexture(textureIndex: number): Promise<THREE.Texture> | null {
    const sourceIndex = this.parser.json.textures?.[textureIndex]?.source;
    const size = Number.isSafeInteger(sourceIndex) ? this.sizes[sourceIndex] : undefined;
    if (!size || (size.decodedWidth === size.width && size.decodedHeight === size.height)) return null;
    const loader = new THREE.ImageBitmapLoader();
    loader.setOptions({ premultiplyAlpha: "none", resizeWidth: size.decodedWidth, resizeHeight: size.decodedHeight, resizeQuality: "high" } as ImageBitmapOptions);
    return (this.parser as unknown as { loadTextureImage(t: number, s: number, l: THREE.Loader): Promise<THREE.Texture | null> })
      .loadTextureImage(textureIndex, sourceIndex, loader) as Promise<THREE.Texture>;
  }
}

/** Largest decoded edge per glTF image index, read from the textures GLTFLoader produced. */
export function decodedTextureEdges(gltf: GLTF): Map<number, number> {
  const edges = new Map<number, number>();
  gltf.scene.traverse(node => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        const textureIndex = gltf.parser.associations.get(value)?.textures;
        const source = textureIndex === undefined ? undefined : gltf.parser.json.textures?.[textureIndex]?.source;
        const image = value.image as { width?: number; height?: number } | undefined;
        if (source === undefined || !image?.width || !image?.height) continue;
        edges.set(source, Math.max(edges.get(source) ?? 0, image.width, image.height));
      }
    }
  });
  return edges;
}
