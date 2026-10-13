import * as THREE from 'three';
import ownerAtlasUrl from './assets/owner-art-atlas-preview.webp';
import manifest from './assets/owner-art-atlas.v1.json';

const REQUESTED_PREVIEW = 'owner-20261013';
const PAVING_TILE = 'city.paving.grey';

type PreviewState = 'loading' | 'ready' | 'failed';
type PreviewEntry = {
  state: PreviewState;
  disposed: boolean;
  failureCode: string | null;
  texture: THREE.Texture | null;
  materials: Set<THREE.MeshStandardMaterial>;
};
const previews = new WeakMap<THREE.Scene, PreviewEntry>();

/** An opt-in *presentation preview* only, never a new world or material authority. */
export function ownerArtPavingPreviewEnabled(search: string): boolean {
  return new URLSearchParams(search).get('aurionAtlasPreview') === REQUESTED_PREVIEW;
}

export function ownerArtPavingTile() {
  const tile = manifest.tiles.find(entry => entry.id === PAVING_TILE);
  if (
    manifest.schemaVersion !== 'aurion.owner-art-atlas.v1' ||
    manifest.status !== 'candidate-unverified-in-production' ||
    manifest.intendedUse !== 'visual-preview-only' ||
    manifest.authoritativeGameplay !== false ||
    manifest.width !== 256 || manifest.height !== 256 ||
    manifest.cols !== 4 || manifest.rows !== 4 || manifest.tileSize !== 64 ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    !tile || tile.index !== 0 ||
    !Number.isInteger(tile.x) || !Number.isInteger(tile.y) ||
    tile.x < 0 || tile.y < 0 || tile.width !== 64 || tile.height !== 64 ||
    tile.x + tile.width > manifest.width || tile.y + tile.height > manifest.height
  ) throw new Error('AURION_OWNER_ART_PREVIEW_MANIFEST_INVALID');
  return Object.freeze({ id: tile.id, x: tile.x, y: tile.y, width: tile.width, height: tile.height });
}

export function ownerArtPavingPreviewReadback(scene: THREE.Scene) {
  const preview = previews.get(scene);
  return Object.freeze({
    protocol: 'aurion.owner-art-paving-preview.v1' as const,
    state: preview?.state ?? 'disabled',
    tileId: preview ? PAVING_TILE : null,
    tileSize: preview ? manifest.tileSize : null,
    sourceSha256: preview ? manifest.sha256 : null,
    boundMaterials: preview?.texture ? [...preview.materials].filter(material => material.map === preview.texture).length : 0,
    failureCode: preview?.failureCode ?? null,
    gameplayAuthority: false,
  });
}

/** Preserve the existing Aurion paving texture until the opt-in sample has decoded. */
export function attachOwnerArtPavingPreview(
  scene: THREE.Scene,
  material: THREE.MeshStandardMaterial,
  search: string,
): boolean {
  if (!ownerArtPavingPreviewEnabled(search)) return false;
  const tile = ownerArtPavingTile();
  let entry = previews.get(scene);
  if (entry) {
    entry.materials.add(material);
    if (entry.texture && !entry.disposed) {
      material.map = entry.texture;
      material.needsUpdate = true;
    }
    return !entry.disposed;
  }
  entry = { state: 'loading', disposed: false, failureCode: null, texture: null, materials: new Set([material]) };
  previews.set(scene, entry);
  const preview = entry;
  const image = new Image();
  image.onload = () => {
    if (preview.disposed) return;
    if (image.width !== manifest.width || image.height !== manifest.height) {
      preview.state = 'failed';
      preview.failureCode = 'AURION_OWNER_ART_DIMENSIONS_MISMATCH';
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = tile.width;
    canvas.height = tile.height;
    const context = canvas.getContext('2d');
    if (!context) {
      preview.state = 'failed';
      preview.failureCode = 'AURION_OWNER_ART_CANVAS_UNAVAILABLE';
      return;
    }
    try {
      context.drawImage(image, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
    } catch {
      preview.state = 'failed';
      preview.failureCode = 'AURION_OWNER_ART_DECODE_FAILED';
      return;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    preview.texture = texture;
    preview.state = 'ready';
    for (const target of preview.materials) {
      target.map = texture;
      target.needsUpdate = true;
    }
  };
  image.onerror = () => {
    if (!preview.disposed) {
      preview.state = 'failed';
      preview.failureCode = 'AURION_OWNER_ART_LOAD_FAILED';
    }
  };
  image.src = ownerAtlasUrl;
  return true;
}

export function disposeOwnerArtPavingPreview(scene: THREE.Scene): void {
  const preview = previews.get(scene);
  if (!preview) return;
  preview.disposed = true;
  preview.texture?.dispose();
  preview.materials.clear();
  previews.delete(scene);
}
