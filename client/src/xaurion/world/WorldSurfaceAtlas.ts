import * as THREE from 'three';
import atlasUrl from './assets/aurion-surface-atlas.webp';

export type WorldSurface = 'paving' | 'forest' | 'wood' | 'rock';
const kinds: WorldSurface[] = ['paving', 'forest', 'wood', 'rock'];
type SurfaceAtlasEntry = {
  textures: THREE.Texture[];
  materials: Set<THREE.Material>;
  details: THREE.InstancedMesh[];
  disposed: boolean;
  state: 'loading' | 'ready' | 'failed';
  failureCode: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
};
const atlases = new WeakMap<THREE.Scene, SurfaceAtlasEntry>();

/** Observable presentation evidence; does not decide gameplay or world state. */
export function worldSurfaceAtlasReadback(scene: THREE.Scene) {
  const entry = atlases.get(scene);
  return Object.freeze({
    protocol: 'aurion.surface-atlas-readback.v1' as const,
    state: entry?.state ?? 'uninitialized',
    source: 'aurion-surface-atlas.webp' as const,
    sourceWidth: entry?.sourceWidth ?? null,
    sourceHeight: entry?.sourceHeight ?? null,
    tileCount: entry?.state === 'ready' ? kinds.length : 0,
    failureCode: entry?.failureCode ?? null,
  });
}

/** One fetched atlas, four isolated 512px tiles: independent mipmaps prevent quadrant bleed. */
export function texturesFor(scene: THREE.Scene): THREE.Texture[] {
  const existing = atlases.get(scene);
  if (existing) return existing.textures;
  const textures = kinds.map(() => {
    const placeholder = document.createElement('canvas');
    placeholder.width = placeholder.height = 1;
    const context = placeholder.getContext('2d');
    if (context) { context.fillStyle = '#b4aa96'; context.fillRect(0, 0, 1, 1); }
    const t = new THREE.CanvasTexture(placeholder);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t as THREE.Texture;
  });
  const entry: SurfaceAtlasEntry = {
    textures,
    materials: new Set<THREE.Material>(),
    details: [],
    disposed: false,
    state: 'loading',
    failureCode: null,
    sourceWidth: null,
    sourceHeight: null,
  };
  atlases.set(scene, entry);
  const image = new Image();
  image.onload = () => {
    if (entry.disposed) return;
    entry.sourceWidth = image.naturalWidth || image.width;
    entry.sourceHeight = image.naturalHeight || image.height;
    if (entry.sourceWidth !== 1024 || entry.sourceHeight !== 1024) {
      entry.state = 'failed';
      entry.failureCode = 'SURFACE_ATLAS_DIMENSIONS_INVALID';
      return;
    }
    try {
      // Draw all four tiles before updating any live material reference.
      const tiles = kinds.map((_, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('SURFACE_ATLAS_CANVAS_UNAVAILABLE');
        ctx.drawImage(image, (i % 2) * image.width / 2, Math.floor(i / 2) * image.height / 2,
          image.width / 2, image.height / 2, 0, 0, 512, 512);
        return canvas;
      });
      tiles.forEach((canvas, i) => {
        const texture = textures[i]!;
        texture.image = canvas;
        texture.flipY = true;
        texture.needsUpdate = true;
      });
      entry.state = 'ready';
      entry.failureCode = null;
    } catch {
      entry.state = 'failed';
      entry.failureCode = 'SURFACE_ATLAS_DECODE_FAILED';
    }
  };
  image.onerror = () => {
    if (entry.disposed) return;
    entry.state = 'failed';
    entry.failureCode = 'SURFACE_ATLAS_IMAGE_LOAD_FAILED';
  };
  image.src = atlasUrl;
  return textures;
}

export function worldSurfaceMaterial(scene: THREE.Scene, kind: WorldSurface): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: texturesFor(scene)[kinds.indexOf(kind)], color: 0xffffff,
    roughness: kind === 'paving' ? 0.88 : 0.96, metalness: 0,
  });
  atlases.get(scene)!.materials.add(material);
  return material;
}

/** Presentation UVs only. Vertex positions, normals, obstacle and simulation data are untouched. */
export function mapWorldGround(geometry: THREE.BufferGeometry, centerX = 0, centerZ = 0): void {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, (position.getX(i) + centerX) / 4, (position.getZ(i) + centerZ) / 4);
  }
  uv.needsUpdate = true;
}

export function disposeWorldSurfaceAtlas(scene: THREE.Scene): void {
  const entry = atlases.get(scene);
  if (!entry) return;
  entry.disposed = true;
  entry.textures.forEach(texture => texture.dispose());
  entry.materials.forEach(material => material.dispose());
  entry.details.forEach(mesh => { mesh.dispose(); mesh.geometry.dispose(); });
  atlases.delete(scene);
}

/** Small, fixed presentation dressing inside the existing flat hub; no colliders or RNG. */
export function addSanctumSurfaceDetails(scene: THREE.Scene, parent: THREE.Group): void {
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), worldSurfaceMaterial(scene, 'rock'), 48);
  stones.name = 'AX1-weathered-plaza-edge-stones';
  const transform = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    const angle = i * Math.PI * 2 / 48 + 0.025 * Math.sin(i * 7);
    const radius = 28 + Math.sin(i * 11) * 1.4;
    transform.position.set(Math.cos(angle) * radius, 0.07, Math.sin(angle) * radius);
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
