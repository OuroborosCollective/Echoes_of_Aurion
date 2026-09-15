import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TextureAtlasPipeline } from './TextureAtlasPipeline';

describe('TextureAtlasPipeline (AIM-276)', () => {
  it('registers atlas descriptors deterministically with correct UV offsets', () => {
    const atlas = TextureAtlasPipeline.registerAtlas(
      'test-surface-atlas',
      2,
      2,
      ['paving', 'forest', 'wood', 'rock'],
      1024,
      1024
    );

    expect(atlas.cols).toBe(2);
    expect(atlas.rows).toBe(2);
    expect(atlas.subRegions.size).toBe(4);

    const paving = atlas.subRegions.get('paving');
    expect(paving).toBeDefined();
    expect(paving?.offsetX).toBe(0);
    expect(paving?.offsetY).toBe(0.5); // Row 0 is top half (0.5 .. 1.0)
    expect(paving?.repeatX).toBe(0.5);
    expect(paving?.repeatY).toBe(0.5);

    const rock = atlas.subRegions.get('rock');
    expect(rock).toBeDefined();
    expect(rock?.offsetX).toBe(0.5); // Col 1
    expect(rock?.offsetY).toBe(0.0); // Row 1 is bottom half (0.0 .. 0.5)
  });

  it('remaps BufferGeometry UVs directly without affecting vertex positions', () => {
    TextureAtlasPipeline.registerAtlas('test-atlas-2', 2, 2, ['tile0', 'tile1', 'tile2', 'tile3']);

    const geo = new THREE.PlaneGeometry(10, 10, 1, 1);
    const posOriginal = Array.from(geo.attributes.position.array);

    const success = TextureAtlasPipeline.remapGeometryUVs(geo, 'tile1', 'test-atlas-2');
    expect(success).toBe(true);

    // Positions must be completely untouched
    expect(Array.from(geo.attributes.position.array)).toEqual(posOriginal);

    // UVs should be mapped inside tile1 (Col 1, Row 0 -> X: 0.5..1.0, Y: 0.5..1.0)
    const uvs = geo.getAttribute('uv');
    expect(uvs.getX(0)).toBeGreaterThanOrEqual(0.5);
    expect(uvs.getX(0)).toBeLessThanOrEqual(1.0);
    expect(uvs.getY(0)).toBeGreaterThanOrEqual(0.5);
    expect(uvs.getY(0)).toBeLessThanOrEqual(1.0);
  });

  it('applies sub-region offset and repeat to Three.js textures cleanly', () => {
    const atlas = TextureAtlasPipeline.registerAtlas('test-atlas-3', 2, 2, ['a', 'b', 'c', 'd']);
    const sub = atlas.subRegions.get('c')!;

    const texture = new THREE.Texture();
    TextureAtlasPipeline.applyTextureSubRegion(texture, sub);

    expect(texture.offset.x).toBe(0);
    expect(texture.offset.y).toBe(0);
    expect(texture.repeat.x).toBe(0.5);
    expect(texture.repeat.y).toBe(0.5);
  });
});
