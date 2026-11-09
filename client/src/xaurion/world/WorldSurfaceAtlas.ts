import * as THREE from "three";
import atlasUrl from "./assets/aurion-surface-atlas.webp";

export type WorldSurface = "paving" | "forest" | "wood" | "rock";
export type SurfaceAtlasStatus =
  | "not_initialized"
  | "loading"
  | "ready"
  | "failed";
export const WORLD_SURFACE_ATLAS_SHA256 =
  "f329e8e1224416e38967f888d40d4459bf8b359001370a432cb270c13f1f3f35";
const kinds: WorldSurface[] = ["paving", "forest", "wood", "rock"];
const atlasDimension = 1024;
const tileDimension = atlasDimension / 2;

type AtlasFailureCode =
  | "NETWORK_ERROR"
  | "HTTP_STATUS"
  | "RESPONSE_BODY_ERROR"
  | "SHA256_UNAVAILABLE"
  | "SHA256_FAILED"
  | "SHA256_MISMATCH"
  | "IMAGE_DECODE_FAILED"
  | "DIMENSIONS_MISMATCH"
  | "CANVAS_CONTEXT_UNAVAILABLE"
  | "TILE_EXTRACTION_FAILED";
type AtlasLoadEvidence = {
  schemaVersion: 1;
  status: SurfaceAtlasStatus;
  sourceUrl: string;
  expectedSha256: string;
  actualSha256?: string;
  imageWidth?: number;
  imageHeight?: number;
  failureCode?: AtlasFailureCode;
};
export type WorldSurfaceAtlasEvidence = AtlasLoadEvidence & {
  tileCount: number;
  tileWidth: number;
  tileHeight: number;
  materialBindings: Readonly<Record<WorldSurface, number>>;
};
type AtlasEntry = {
  textures: THREE.Texture[];
  materials: Set<THREE.Material>;
  details: THREE.InstancedMesh[];
  materialBindings: Record<WorldSurface, number>;
  listeners: Set<(evidence: WorldSurfaceAtlasEvidence) => void>;
  disposed: boolean;
  evidence: AtlasLoadEvidence;
};
type DecodedAtlas = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};
const atlases = new WeakMap<THREE.Scene, AtlasEntry>();

function snapshotEvidence(entry: AtlasEntry): WorldSurfaceAtlasEvidence {
  return {
    ...entry.evidence,
    tileCount: kinds.length,
    tileWidth: tileDimension,
    tileHeight: tileDimension,
    materialBindings: { ...entry.materialBindings },
  };
}
function publishEvidence(entry: AtlasEntry): void {
  const evidence = snapshotEvidence(entry);
  for (const listener of entry.listeners) {
    try {
      listener(evidence);
    } catch {
      /* Diagnostics must never interrupt world rendering. */
    }
  }
}
function setFailure(entry: AtlasEntry, failureCode: AtlasFailureCode): void {
  if (entry.disposed) return;
  entry.evidence = { ...entry.evidence, status: "failed", failureCode };
  publishEvidence(entry);
}

async function decodeAtlas(bytes: ArrayBuffer): Promise<DecodedAtlas> {
  const blob = new Blob([bytes], { type: "image/webp" });
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("IMAGE_DECODE_FAILED"));
    };
    image.src = objectUrl;
  });
}

async function loadAtlas(entry: AtlasEntry): Promise<void> {
  let response: Response;
  try {
    response = await fetch(atlasUrl, { credentials: "same-origin" });
  } catch {
    setFailure(entry, "NETWORK_ERROR");
    return;
  }
  if (entry.disposed) return;
  if (!response.ok) {
    setFailure(entry, "HTTP_STATUS");
    return;
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch {
    setFailure(entry, "RESPONSE_BODY_ERROR");
    return;
  }
  if (entry.disposed) return;

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    setFailure(entry, "SHA256_UNAVAILABLE");
    return;
  }
  let actualSha256: string;
  try {
    const digest = await subtle.digest("SHA-256", bytes);
    actualSha256 = Array.from(new Uint8Array(digest), byte =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  } catch {
    setFailure(entry, "SHA256_FAILED");
    return;
  }
  if (entry.disposed) return;
  entry.evidence = { ...entry.evidence, actualSha256 };
  if (actualSha256 !== WORLD_SURFACE_ATLAS_SHA256) {
    setFailure(entry, "SHA256_MISMATCH");
    return;
  }

  let decoded: DecodedAtlas;
  try {
    decoded = await decodeAtlas(bytes);
  } catch {
    setFailure(entry, "IMAGE_DECODE_FAILED");
    return;
  }
  if (entry.disposed) {
    decoded.close?.();
    return;
  }
  entry.evidence = {
    ...entry.evidence,
    imageWidth: decoded.width,
    imageHeight: decoded.height,
  };
  if (decoded.width !== atlasDimension || decoded.height !== atlasDimension) {
    decoded.close?.();
    setFailure(entry, "DIMENSIONS_MISMATCH");
    return;
  }

  const tiles: HTMLCanvasElement[] = [];
  let failureCode: AtlasFailureCode = "TILE_EXTRACTION_FAILED";
  try {
    for (let index = 0; index < kinds.length; index++) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = tileDimension;
      const context = canvas.getContext("2d");
      if (!context) {
        failureCode = "CANVAS_CONTEXT_UNAVAILABLE";
        throw new Error(failureCode);
      }
      context.drawImage(
        decoded.source,
        (index % 2) * tileDimension,
        Math.floor(index / 2) * tileDimension,
        tileDimension,
        tileDimension,
        0,
        0,
        tileDimension,
        tileDimension
      );
      tiles.push(canvas);
    }
  } catch {
    decoded.close?.();
    setFailure(entry, failureCode);
    return;
  }
  decoded.close?.();
  if (entry.disposed) return;

  // Prepare all four tiles before swapping any material map away from the safe placeholder.
  tiles.forEach((canvas, index) => {
    const texture = entry.textures[index];
    texture.image = canvas;
    texture.flipY = true;
    texture.needsUpdate = true;
  });
  entry.evidence = {
    ...entry.evidence,
    status: "ready",
    failureCode: undefined,
  };
  publishEvidence(entry);
}

/** One verified same-origin WebP fetch, split into four independent mipmapped tiles. */
export function texturesFor(scene: THREE.Scene): THREE.Texture[] {
  const existing = atlases.get(scene);
  if (existing) return existing.textures;
  const textures = kinds.map(() => {
    const placeholder = document.createElement("canvas");
    placeholder.width = placeholder.height = 1;
    const context = placeholder.getContext("2d");
    if (context) {
      context.fillStyle = "#b4aa96";
      context.fillRect(0, 0, 1, 1);
    }
    const texture = new THREE.CanvasTexture(placeholder);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  });
  const entry: AtlasEntry = {
    textures,
    materials: new Set<THREE.Material>(),
    details: [],
    materialBindings: { paving: 0, forest: 0, wood: 0, rock: 0 },
    listeners: new Set(),
    disposed: false,
    evidence: {
      schemaVersion: 1,
      status: "loading",
      sourceUrl: atlasUrl,
      expectedSha256: WORLD_SURFACE_ATLAS_SHA256,
    },
  };
  atlases.set(scene, entry);
  void loadAtlas(entry);
  return textures;
}

export function getWorldSurfaceAtlasEvidence(
  scene: THREE.Scene
): WorldSurfaceAtlasEvidence {
  const entry = atlases.get(scene);
  if (entry) return snapshotEvidence(entry);
  return {
    schemaVersion: 1,
    status: "not_initialized",
    sourceUrl: atlasUrl,
    expectedSha256: WORLD_SURFACE_ATLAS_SHA256,
    tileCount: kinds.length,
    tileWidth: tileDimension,
    tileHeight: tileDimension,
    materialBindings: { paving: 0, forest: 0, wood: 0, rock: 0 },
  };
}

export function subscribeWorldSurfaceAtlasEvidence(
  scene: THREE.Scene,
  listener: (evidence: WorldSurfaceAtlasEvidence) => void
): () => void {
  const entry = atlases.get(scene);
  if (!entry) {
    try {
      listener(getWorldSurfaceAtlasEvidence(scene));
    } catch {
      /* Diagnostics must never interrupt world rendering. */
    }
    return () => undefined;
  }
  entry.listeners.add(listener);
  publishEvidence(entry);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function worldSurfaceMaterial(
  scene: THREE.Scene,
  kind: WorldSurface
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: texturesFor(scene)[kinds.indexOf(kind)],
    color: 0xffffff,
    roughness: kind === "paving" ? 0.88 : 0.96,
    metalness: 0,
  });
  const entry = atlases.get(scene)!;
  entry.materials.add(material);
  entry.materialBindings[kind]++;
  publishEvidence(entry);
  return material;
}
/** Presentation UVs only. Vertex positions, normals, obstacle and simulation data are untouched. */
export function mapWorldGround(
  geometry: THREE.BufferGeometry,
  centerX = 0,
  centerZ = 0
): void {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    uv.setXY(
      i,
      (position.getX(i) + centerX) / 4,
      (position.getZ(i) + centerZ) / 4
    );
  }
  uv.needsUpdate = true;
}
export function disposeWorldSurfaceAtlas(scene: THREE.Scene): void {
  const entry = atlases.get(scene);
  if (!entry) return;
  entry.disposed = true;
  entry.textures.forEach(texture => texture.dispose());
  entry.materials.forEach(material => material.dispose());
  entry.details.forEach(mesh => {
    mesh.dispose();
    mesh.geometry.dispose();
  });
  atlases.delete(scene);
}
/** Small, fixed presentation dressing inside the existing flat hub; no colliders or RNG. */
export function addSanctumSurfaceDetails(
  scene: THREE.Scene,
  parent: THREE.Group
): void {
  const stones = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    worldSurfaceMaterial(scene, "rock"),
    48
  );
  stones.name = "AX1-weathered-plaza-edge-stones";
  const transform = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    const angle = (i * Math.PI * 2) / 48 + 0.025 * Math.sin(i * 7);
    const radius = 28 + Math.sin(i * 11) * 1.4;
    transform.position.set(
      Math.cos(angle) * radius,
      0.07,
      Math.sin(angle) * radius
    );
    transform.rotation.set(i * 0.4, i * 1.7, i * 0.2);
    transform.scale.set(0.16 + (i % 4) * 0.045, 0.09, 0.2 + (i % 3) * 0.055);
    transform.updateMatrix();
    stones.setMatrixAt(i, transform.matrix);
  }
  stones.receiveShadow = true;
  stones.computeBoundingSphere();
  parent.add(stones);
  atlases.get(scene)!.details.push(stones);
}
