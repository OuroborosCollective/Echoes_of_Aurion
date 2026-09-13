import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { worldSurfaceMaterial, disposeWorldSurfaceAtlas, mapWorldGround, addSanctumSurfaceDetails } from './WorldSurfaceAtlas';

afterEach(() => vi.restoreAllMocks());
function imageHarness() {
  const images: { onload?: () => void; src?: string; width: number; height: number }[] = [];
  vi.stubGlobal('Image', class { width = 1024; height = 1024; constructor() { images.push(this); } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  return images;
}

describe('AX1 surface atlas lifetime and geometry boundaries', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shares one fetch and tile between materials, isolates mipmaps and releases all tiles', () => {
    const images = imageHarness(); const scene = new THREE.Scene();
    const a = worldSurfaceMaterial(scene, 'wood'), b = worldSurfaceMaterial(scene, 'wood');
    const c = worldSurfaceMaterial(scene, 'rock');
    expect(a.map).toBe(b.map); expect(a.map).not.toBe(c.map); expect(images).toHaveLength(1);
    images[0].onload!();
    expect(a.map!.image.width).toBe(512); expect(a.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    const release = vi.fn(); a.map!.addEventListener('dispose', release);
    disposeWorldSurfaceAtlas(scene); disposeWorldSurfaceAtlas(scene); expect(release).toHaveBeenCalledTimes(1);
    expect(worldSurfaceMaterial(scene, 'wood').map).not.toBe(a.map);
    disposeWorldSurfaceAtlas(scene);
  });
  it('does not resurrect a texture after engine disposal while its atlas is loading', () => {
    const images = imageHarness(); const scene = new THREE.Scene();
    const mat = worldSurfaceMaterial(scene, 'forest'); const placeholder = mat.map!.image;
    disposeWorldSurfaceAtlas(scene); images[0].onload!(); expect(mat.map!.image).toBe(placeholder);
  });
  it('keeps positions intact and gives adjoining chunks identical border UVs', () => {
    const a = new THREE.PlaneGeometry(80, 80, 2, 2).rotateX(-Math.PI / 2);
    const b = a.clone(); const positions = Array.from(a.attributes.position.array);
    mapWorldGround(a); mapWorldGround(b, 80, 0);
    expect(Array.from(a.attributes.position.array)).toEqual(positions);
    expect(a.attributes.uv.getX(2)).toBe(b.attributes.uv.getX(0));
    expect(a.attributes.uv.getY(2)).toBe(b.attributes.uv.getY(0));
  });
  it('bounds decorative geometry to one instanced draw and 960 triangles', () => {
    imageHarness(); const scene = new THREE.Scene(), group = new THREE.Group();
    addSanctumSurfaceDetails(scene, group);
    expect(group.children).toHaveLength(1);
    const mesh = group.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(48); expect(mesh.geometry.attributes.position.count / 3 * mesh.count).toBe(960);
    disposeWorldSurfaceAtlas(scene);
  });
});
