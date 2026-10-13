import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  attachOwnerArtPavingPreview,
  disposeOwnerArtPavingPreview,
  ownerArtPavingPreviewEnabled,
  ownerArtPavingPreviewReadback,
  ownerArtPavingTile,
} from './OwnerArtPavingPreview';

type FakeImage = { width: number; height: number; onload: (() => void) | null; onerror: (() => void) | null; src: string };
const images: FakeImage[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  images.length = 0;
});
function harness() {
  vi.stubGlobal('Image', class {
    width = 256;
    height = 256;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = '';
    constructor() { images.push(this); }
  });
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  return drawImage;
}

describe('Aurion owner art paving preview (non-authoritative)', () => {
  it('exposes a bounded, deterministic first paving tile from the actual manifest', () => {
    expect(ownerArtPavingTile()).toEqual({ id: 'city.paving.grey', x: 0, y: 0, width: 64, height: 64 });
    expect(ownerArtPavingPreviewEnabled('?aurionAtlasPreview=owner-20261013')).toBe(true);
    expect(ownerArtPavingPreviewEnabled('?aurionAtlasPreview=legacy')).toBe(false);
  });
  it('does not load anything or mutate a material unless specifically requested', () => {
    harness();
    const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial();
    const map = material.map;
    expect(attachOwnerArtPavingPreview(scene, material, '')).toBe(false);
    expect(material.map).toBe(map);
    expect(images).toHaveLength(0);
    expect(ownerArtPavingPreviewReadback(scene)).toMatchObject({ state: 'disabled', gameplayAuthority: false });
    disposeOwnerArtPavingPreview(scene);
    material.dispose();
  });
  it('keeps the original texture until image load, then binds only the selected 64px swatch', () => {
    const draw = harness();
    const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial();
    const original = new THREE.Texture();
    material.map = original;
    expect(attachOwnerArtPavingPreview(scene, material, '?aurionAtlasPreview=owner-20261013')).toBe(true);
    expect(ownerArtPavingPreviewReadback(scene)).toMatchObject({ state: 'loading', boundMaterials: 0, gameplayAuthority: false });
    expect(material.map).toBe(original);
    expect(images).toHaveLength(1);
    images[0].onload?.();
    expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 64, 64, 0, 0, 64, 64);
    expect(material.map).not.toBe(original);
    expect((material.map as THREE.CanvasTexture).image.width).toBe(64);
    expect(ownerArtPavingPreviewReadback(scene)).toMatchObject({ state: 'ready', boundMaterials: 1, tileId: 'city.paving.grey' });
    disposeOwnerArtPavingPreview(scene);
    material.dispose();
    original.dispose();
  });
  it('fails without changing the existing paving material on image errors or invalid dimensions', () => {
    harness();
    const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial();
    const original = new THREE.Texture();
    material.map = original;
    attachOwnerArtPavingPreview(scene, material, '?aurionAtlasPreview=owner-20261013');
    images[0].onerror?.();
    expect(ownerArtPavingPreviewReadback(scene)).toMatchObject({ state: 'failed', failureCode: 'AURION_OWNER_ART_LOAD_FAILED' });
    expect(material.map).toBe(original);
    disposeOwnerArtPavingPreview(scene);
    attachOwnerArtPavingPreview(scene, material, '?aurionAtlasPreview=owner-20261013');
    images[1].width = 512;
    images[1].onload?.();
    expect(ownerArtPavingPreviewReadback(scene)).toMatchObject({ state: 'failed', failureCode: 'AURION_OWNER_ART_DIMENSIONS_MISMATCH' });
    expect(material.map).toBe(original);
    disposeOwnerArtPavingPreview(scene);
    material.dispose();
    original.dispose();
  });
  it('will not bind a late image after scene disposal', () => {
    harness();
    const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial();
    attachOwnerArtPavingPreview(scene, material, '?aurionAtlasPreview=owner-20261013');
    disposeOwnerArtPavingPreview(scene);
    images[0].onload?.();
    expect(ownerArtPavingPreviewReadback(scene).state).toBe('disabled');
    expect(material.map).toBe(null);
    material.dispose();
  });
});
